import type { TokenMetadata } from '@/lib/api';

export const LAUNCH_METADATA_SAVE_ATTEMPTS = 8;

type LaunchMetadataFields = Pick<
  TokenMetadata,
  'banner' | 'website' | 'twitter' | 'telegram' | 'discord' | 'description'
>;

export interface LaunchMetadataValidation {
  metadata: Partial<LaunchMetadataFields>;
  error: string | null;
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function normalizeTwitterHandle(value: string): string | null {
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
  if (!handle || handle.length > 50 || !/^[a-zA-Z0-9_]+$/.test(handle)) {
    return null;
  }
  return handle;
}

export function validateLaunchMetadata(
  input: Partial<LaunchMetadataFields>,
): LaunchMetadataValidation {
  const description = input.description?.trim() || '';
  const website = input.website?.trim() || '';
  const twitterInput = input.twitter?.trim() || '';
  const telegram = input.telegram?.trim() || '';
  const discord = input.discord?.trim() || '';
  const banner = input.banner?.trim() || '';

  if (description.length > 500) {
    return { metadata: {}, error: 'Description must be 500 characters or less' };
  }
  if (website && (website.length > 200 || !isHttpUrl(website))) {
    return { metadata: {}, error: 'Website must be a valid http:// or https:// URL' };
  }

  const twitter = twitterInput ? normalizeTwitterHandle(twitterInput) : null;
  if (twitterInput && !twitter) {
    return {
      metadata: {},
      error: 'X / Twitter must be a handle, @handle, or an x.com/twitter.com profile URL',
    };
  }

  if (telegram) {
    const isHandle = /^[a-zA-Z0-9_-]+$/.test(telegram);
    if (telegram.length > 200 || (!isHandle && !isHttpUrl(telegram))) {
      return {
        metadata: {},
        error: 'Telegram must be a valid http(s) URL or handle (letters, numbers, _, -)',
      };
    }
  }
  if (discord && (discord.length > 200 || !isHttpUrl(discord))) {
    return { metadata: {}, error: 'Discord must be a valid http:// or https:// URL' };
  }
  if (
    banner &&
    (banner.length > 200 || (!banner.startsWith('ipfs://') && !isHttpUrl(banner)))
  ) {
    return { metadata: {}, error: 'Banner must be a valid ipfs:// or http(s) URL' };
  }

  return {
    metadata: {
      description: description || undefined,
      banner: banner || undefined,
      website: website || undefined,
      twitter: twitter || undefined,
      telegram: telegram || undefined,
      discord: discord || undefined,
    },
    error: null,
  };
}

function shouldRetryMetadataSave(error: unknown): boolean {
  if (!error || typeof error !== 'object' || !('status' in error)) return true;
  const status = Number((error as { status: unknown }).status);
  return status === 404 || status === 408 || status === 409 || status === 425 ||
    status === 429 || status >= 500;
}

export async function saveLaunchMetadataWithRetry<T>(
  save: () => Promise<T>,
  waitFor: (milliseconds: number) => Promise<unknown>,
  attempts = LAUNCH_METADATA_SAVE_ATTEMPTS,
): Promise<T> {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await save();
    } catch (error) {
      if (attempt === attempts || !shouldRetryMetadataSave(error)) throw error;
      await waitFor(Math.min(attempt * 1_500, 5_000));
    }
  }
  throw new Error('Token metadata was not saved');
}

export async function recoverLaunchMetadataAuth(
  getAuthToken: () => string | null,
  authenticate: () => Promise<unknown>,
): Promise<string> {
  let authToken = getAuthToken();
  if (!authToken) {
    await authenticate();
    authToken = getAuthToken();
  }
  if (!authToken) throw new Error('Wallet authentication did not complete');
  return authToken;
}
