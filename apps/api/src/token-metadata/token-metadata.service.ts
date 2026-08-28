import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

export interface TokenMetadata {
  token_address: string;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  discord: string | null;
  banner: string | null;
  updated_at: string;
}

export interface TokenMetadataInput {
  website?: string;
  twitter?: string;
  telegram?: string;
  discord?: string;
  banner?: string;
}

const MAX_URL_LENGTH = 200;
const MAX_BANNER_LENGTH = 200;

/**
 * Validate that a URL uses a safe scheme (http/https only).
 * Rejects javascript:, data:, vbscript:, and other dangerous schemes.
 */
function isValidHttpUrl(value: string): boolean {
  if (!value || value.length > MAX_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Sanitize a Telegram handle/URL. Accepts either a t.me URL or a bare handle.
 */
function sanitizeTelegram(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > MAX_URL_LENGTH) return null;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return trimmed;
    } catch {
      return null;
    }
  }
  // Bare handle — only allow alphanumeric, underscores, and hyphens.
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) return trimmed;
  return null;
}

/** Accept a handle, @handle, or a profile URL and return the canonical handle. */
function sanitizeTwitter(value: string): string | null {
  let handle = value.trim();
  if (!handle) return null;

  if (/^https?:\/\//i.test(handle)) {
    try {
      const url = new URL(handle);
      const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
      const pathParts = url.pathname.split('/').filter(Boolean);
      if (
        (url.protocol !== 'http:' && url.protocol !== 'https:') ||
        (hostname !== 'x.com' && hostname !== 'twitter.com') ||
        url.port ||
        url.username ||
        url.password ||
        url.search ||
        url.hash ||
        pathParts.length !== 1
      ) {
        return null;
      }
      handle = decodeURIComponent(pathParts[0]);
    } catch {
      return null;
    }
  }

  handle = handle.replace(/^@/, '');
  if (!handle || handle.length > 50) return null;
  return /^[a-zA-Z0-9_]+$/.test(handle) ? handle : null;
}

/**
 * Sanitize a banner image URI. Accepts ipfs:// URIs or http(s):// URLs.
 * Rejects other schemes (javascript:, data:, etc.) and overly long strings.
 */
function sanitizeImageUri(value: string, maxLength: number): string | null {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > maxLength) return null;
  if (trimmed.startsWith('ipfs://')) return trimmed;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
      return trimmed;
    } catch {
      return null;
    }
  }
  return null;
}

@Injectable()
export class TokenMetadataService {
  private readonly logger = new Logger(TokenMetadataService.name);

  constructor(private db: DatabaseService) {}

  async isVisibleToken(tokenAddress: string): Promise<boolean> {
    const row = await this.db.queryOne<{ visible: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM tokens t
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
       ) AS visible`,
      [tokenAddress.toLowerCase(), getPublicFactoryAddresses()],
    );
    return row?.visible ?? false;
  }

  /** Get metadata for a token. Returns empty object if none exists. */
  async getMetadata(tokenAddress: string): Promise<TokenMetadata | null> {
    const addr = tokenAddress.toLowerCase();
    const row = await this.db.queryOne<TokenMetadata>(
      `SELECT tm.token_address, tm.website, tm.twitter, tm.telegram, tm.discord,
              tm.banner, tm.updated_at
       FROM token_metadata tm
       JOIN tokens t ON t.contract_address = tm.token_address
       WHERE tm.token_address = $1 AND ${publicFactoryClause('t', 2)}`,
      [addr, getPublicFactoryAddresses()],
    );
    return row || null;
  }

  /** Set or update metadata for a token. Only the creator can set it. */
  async setMetadata(
    tokenAddress: string,
    creatorWallet: string,
    input: TokenMetadataInput,
  ): Promise<TokenMetadata> {
    const addr = tokenAddress.toLowerCase();
    const creator = creatorWallet.toLowerCase();

    // Verify the caller is the token creator.
    const token = await this.db.queryOne<{ creator_wallet: string }>(
      `SELECT t.creator_wallet FROM tokens t
       WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}`,
      [addr, getPublicFactoryAddresses()],
    );
    if (!token) {
      throw new NotFoundException('Token not found');
    }
    if (token.creator_wallet.toLowerCase() !== creator) {
      throw new Error('Only the token creator can update metadata');
    }
    if (Object.prototype.hasOwnProperty.call(input, 'description')) {
      throw new Error('The original launch description is immutable');
    }

    // Validate and sanitize all fields.
    const website = input.website?.trim() || null;
    if (website && !isValidHttpUrl(website)) {
      throw new Error('Website must be a valid http:// or https:// URL');
    }

    const twitter = input.twitter ? sanitizeTwitter(input.twitter) : null;
    if (input.twitter && !twitter) {
      throw new Error(
        'Twitter must be a handle, @handle, or an x.com/twitter.com profile URL',
      );
    }

    const telegram = input.telegram ? sanitizeTelegram(input.telegram) : null;
    if (input.telegram && !telegram) {
      throw new Error('Telegram must be a valid https://t.me/ URL or a handle (alphanumeric, _, -)');
    }

    const discord = input.discord?.trim() || null;
    if (discord && !isValidHttpUrl(discord)) {
      throw new Error('Discord must be a valid http:// or https:// URL');
    }

    const banner = input.banner ? sanitizeImageUri(input.banner, MAX_BANNER_LENGTH) : null;
    if (input.banner && !banner) {
      throw new Error('Banner must be a valid ipfs:// URI or http(s):// URL');
    }

    // Upsert.
    const result = await this.db.queryOne<TokenMetadata>(
      `INSERT INTO token_metadata (token_address, website, twitter, telegram, discord, banner, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (token_address)
       DO UPDATE SET
         website = EXCLUDED.website,
         twitter = EXCLUDED.twitter,
         telegram = EXCLUDED.telegram,
         discord = EXCLUDED.discord,
         banner = EXCLUDED.banner,
         updated_at = NOW()
       RETURNING token_address, website, twitter, telegram, discord, banner, updated_at`,
      [addr, website, twitter, telegram, discord, banner],
    );
    return result!;
  }
}
