import {
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHmac, randomBytes } from 'crypto';
import {
  recoverMessageAddress,
} from 'viem';
import { parseSiweMessage, validateSiweMessage } from 'viem/siwe';
import { RedisService } from '../redis/redis.service';

/**
 * AuthService — wallet signature authentication (SIWE-style).
 *
 * Flow:
 *   1. Client calls GET /auth/nonce → receives a random nonce
 *   2. Client constructs a SIWE-like message and signs it with their wallet
 *   3. Client calls POST /auth/verify with { message, signature }
 *   4. Server verifies the signature using viem.verifyMessage
 *   5. Server returns a stateless HMAC-signed token: base64({ wallet, expires, hmac })
 *   6. Client includes the token in the x-auth-token header for write requests
 *   7. Server verifies the HMAC and extracts the wallet address
 *
 * The token is stateless — no Redis/session store needed. The HMAC ensures
 * the token cannot be forged. Tokens expire after AUTH_TOKEN_TTL_HOURS (default 24h).
 *
 * Security:
 *   - AUTH_SECRET (env, required): HMAC signing key. Must be set in production.
 *   - Nonces are random 32-byte hex strings, single-use (tracked in-memory with TTL).
 *   - The signed message includes the nonce, domain, and expiry to prevent replay.
 */

const NONCE_TTL_MS = 5 * 60 * 1000; // 5 minutes to sign after requesting nonce
const TOKEN_TTL_HOURS = 1;
const ARC_TESTNET_CHAIN_ID = 5_042_002;
const NONCE_KEY_PREFIX = 'auth:nonce:';

interface AuthToken {
  wallet: string;
  expires: number; // unix timestamp (ms)
  hmac: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly authSecret: string;

  constructor(private readonly redis: RedisService) {
    this.authSecret = process.env.AUTH_SECRET || '';
    if (!this.authSecret) {
      this.logger.warn(
        'AUTH_SECRET not set — auth endpoints will return 503. Set AUTH_SECRET in .env for production.',
      );
    }
  }

  /** Generate a random nonce for the client to sign. */
  async generateNonce(): Promise<{ nonce: string }> {
    if (!this.redis.isAvailable()) {
      throw new ServiceUnavailableException('Authentication nonce store unavailable');
    }
    const nonce = randomBytes(32).toString('hex');
    const stored = await this.redis.setIfAbsent(
      `${NONCE_KEY_PREFIX}${nonce}`,
      '1',
      NONCE_TTL_MS / 1000,
    );
    if (!stored) {
      throw new ServiceUnavailableException('Failed to issue authentication nonce');
    }
    return { nonce };
  }

  /**
   * Verify a signed message and issue an auth token.
   * The message must contain the nonce (issued by generateNonce) and the
   * wallet address that signed it.
   */
  async verify(
    message: string,
    signature: `0x${string}`,
  ): Promise<{ token: string; wallet: string; expires: number }> {
    if (!this.authSecret) {
      throw new UnauthorizedException('Auth not configured (AUTH_SECRET missing)');
    }

    // Extract nonce from the message — it should appear as "Nonce: <hex>" or
    // be part of a SIWE message. We search for the nonce we issued.
    const parsed = parseSiweMessage(message);
    if (!parsed.address || !parsed.domain || !parsed.uri || !parsed.nonce) {
      throw new UnauthorizedException('Malformed SIWE message');
    }

    // Verify the signature recovers to a valid address.
    let recoveredAddress: `0x${string}`;
    try {
      recoveredAddress = await recoverMessageAddress({ message, signature });
    } catch (err) {
      this.logger.error(`Signature verification failed: ${err.message}`);
      throw new UnauthorizedException('Invalid signature');
    }

    // Consume the nonce (single-use)
    const allowedDomains = (process.env.AUTH_SIWE_DOMAINS ||
      'orba.fun,www.orba.fun,localhost:3000')
      .split(',')
      .map((domain) => domain.trim().toLowerCase())
      .filter(Boolean);
    const domain = parsed.domain.toLowerCase();
    let uri: URL;
    try {
      uri = new URL(parsed.uri);
    } catch {
      throw new UnauthorizedException('Invalid SIWE URI');
    }

    const issuedAt = parsed.issuedAt?.getTime();
    const now = Date.now();
    const validMessage =
      validateSiweMessage({
        message: parsed,
        address: recoveredAddress,
        domain: parsed.domain,
        nonce: parsed.nonce,
        ...(parsed.scheme ? { scheme: uri.protocol.slice(0, -1) } : {}),
        time: new Date(now),
      }) &&
      allowedDomains.includes(domain) &&
      uri.host.toLowerCase() === domain &&
      (uri.protocol === 'https:' ||
        (uri.protocol === 'http:' && domain.startsWith('localhost'))) &&
      parsed.chainId === ARC_TESTNET_CHAIN_ID &&
      parsed.version === '1' &&
      issuedAt !== undefined &&
      issuedAt <= now + 60_000 &&
      issuedAt >= now - NONCE_TTL_MS;

    if (!validMessage) {
      throw new UnauthorizedException('SIWE domain, chain, URI, or time is invalid');
    }

    const consumed = await this.redis.getDel(`${NONCE_KEY_PREFIX}${parsed.nonce}`);
    if (!consumed) {
      throw new UnauthorizedException('Nonce is invalid, expired, or already used');
    }

    const wallet = recoveredAddress.toLowerCase();
    const expires = Date.now() + TOKEN_TTL_HOURS * 60 * 60 * 1000;
    const token = this.createToken(wallet, expires);

    this.logger.log(`Auth token issued for ${wallet} (expires in ${TOKEN_TTL_HOURS}h)`);
    return { token, wallet, expires };
  }

  /**
   * Verify an auth token and return the wallet address, or null if invalid.
   * Called by the AuthGuard on protected endpoints.
   */
  verifyToken(token: string): string | null {
    if (!this.authSecret) return null;

    try {
      const decoded = JSON.parse(
        Buffer.from(token, 'base64').toString('utf-8'),
      ) as AuthToken;

      // Check expiry
      if (Date.now() > decoded.expires) return null;

      // Verify HMAC
      const expectedHmac = this.computeHmac(decoded.wallet, decoded.expires);
      if (!this.constantTimeEqual(decoded.hmac, expectedHmac)) return null;

      return decoded.wallet;
    } catch {
      return null;
    }
  }

  // ─── Internal helpers ───────────────────────────────────────────────────

  private createToken(wallet: string, expires: number): string {
    const hmac = this.computeHmac(wallet, expires);
    const payload: AuthToken = { wallet, expires, hmac };
    return Buffer.from(JSON.stringify(payload), 'utf-8').toString('base64');
  }

  private computeHmac(wallet: string, expires: number): string {
    return createHmac('sha256', this.authSecret)
      .update(`${wallet}:${expires}`)
      .digest('hex');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
      diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }
    return diff === 0;
  }

  /** Find a nonce issued by us within the message text. */
}
