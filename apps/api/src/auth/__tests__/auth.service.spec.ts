import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from '../auth.service';

// Mock viem's recoverMessageAddress so we don't need real crypto/signing
jest.mock('viem', () => ({
  recoverMessageAddress: jest.fn(),
}));

import { recoverMessageAddress } from 'viem';

describe('AuthService', () => {
  let service: AuthService;
  const mockWallet = '0x1234567890abcdef1234567890abcdef12345678';
  const mockSecret = 'test-secret-key-32-bytes-minimum!!!!!!!!';

  beforeEach(async () => {
    // Set env before module init — AuthService reads AUTH_SECRET in constructor
    process.env.AUTH_SECRET = mockSecret;

    const module: TestingModule = await Test.createTestingModule({
      providers: [AuthService],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  // ─── generateNonce ────────────────────────────────────────────────────

  describe('generateNonce', () => {
    it('returns a 64-character hex nonce', () => {
      const result = service.generateNonce();
      expect(result).toHaveProperty('nonce');
      expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique nonces on each call', () => {
      const { nonce: n1 } = service.generateNonce();
      const { nonce: n2 } = service.generateNonce();
      expect(n1).not.toBe(n2);
    });

    it('stores nonce for later verification', async () => {
      const { nonce } = service.generateNonce();

      // Construct a message containing the nonce and mock signature recovery
      const message = `Nonce: ${nonce}\nWelcome to Orba. Sign this message to authenticate.`;
      (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.verify(message, '0xdeadbeef' as `0x${string}`);
      expect(result).toHaveProperty('token');
      expect(result.wallet).toBe(mockWallet.toLowerCase());
    });
  });

  // ─── verify ────────────────────────────────────────────────────────────

  describe('verify', () => {
    it('throws if AUTH_SECRET is not set', async () => {
      delete process.env.AUTH_SECRET;
      // Recreate the service without secret
      const module: TestingModule = await Test.createTestingModule({
        providers: [AuthService],
      }).compile();
      const svc = module.get<AuthService>(AuthService);

      await expect(
        svc.verify('message', '0xdeadbeef' as `0x${string}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws if no valid nonce found in message', async () => {
      await expect(
        service.verify('no nonce here', '0xdeadbeef' as `0x${string}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('throws if signature verification fails', async () => {
      const { nonce } = service.generateNonce();
      const message = `Nonce: ${nonce}\nSign this message.`;

      (recoverMessageAddress as jest.Mock).mockRejectedValue(
        new Error('invalid signature'),
      );

      await expect(
        service.verify(message, '0xbad' as `0x${string}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('returns a valid token on successful verification', async () => {
      const { nonce } = service.generateNonce();
      const message = `Nonce: ${nonce}\nSign this message.`;

      (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

      const result = await service.verify(message, '0xdeadbeef' as `0x${string}`);

      expect(result).toHaveProperty('token');
      expect(result).toHaveProperty('wallet');
      expect(result).toHaveProperty('expires');
      expect(result.wallet).toBe(mockWallet.toLowerCase());
      expect(typeof result.token).toBe('string');
      expect(result.expires).toBeGreaterThan(Date.now());
    });

    it('consumes the nonce after successful verification (single-use)', async () => {
      const { nonce } = service.generateNonce();
      const message = `Nonce: ${nonce}\nSign this message.`;

      (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

      // First use succeeds
      await service.verify(message, '0xdeadbeef' as `0x${string}`);

      // Second use with same nonce should fail
      (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);
      await expect(
        service.verify(message, '0xdeadbeef' as `0x${string}`),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('normalizes wallet address to lowercase', async () => {
      const { nonce } = service.generateNonce();
      const message = `Nonce: ${nonce}\nSign this message.`;

      const mixedCaseWallet = '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12';
      (recoverMessageAddress as jest.Mock).mockResolvedValue(mixedCaseWallet);

      const result = await service.verify(message, '0xdeadbeef' as `0x${string}`);

      expect(result.wallet).toBe(mixedCaseWallet.toLowerCase());
    });
  });

  // ─── verifyToken ───────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('returns wallet for a valid token', async () => {
      const { nonce } = service.generateNonce();
      const message = `Nonce: ${nonce}\nTest`;
      (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

      const { token } = await service.verify(message, '0xdeadbeef' as `0x${string}`);

      const result = service.verifyToken(token);
      expect(result).toBe(mockWallet.toLowerCase());
    });

    it('returns null for an expired token', async () => {
      // Create a token with expires in the past by manipulating the secret
      // and constructing the token manually
      const wallet = mockWallet.toLowerCase();
      const expires = Date.now() - 1000; // expired 1 second ago
      const hmac = require('crypto')
        .createHmac('sha256', mockSecret)
        .update(`${wallet}:${expires}`)
        .digest('hex');
      const token = Buffer.from(
        JSON.stringify({ wallet, expires, hmac }),
        'utf-8',
      ).toString('base64');

      expect(service.verifyToken(token)).toBeNull();
    });

    it('returns null for a tampered token', () => {
      const wallet = mockWallet.toLowerCase();
      const expires = Date.now() + 3600000;
      const badHmac = '0'.repeat(64); // wrong HMAC
      const token = Buffer.from(
        JSON.stringify({ wallet, expires, hmac: badHmac }),
        'utf-8',
      ).toString('base64');

      expect(service.verifyToken(token)).toBeNull();
    });

    it('returns null for malformed token (invalid JSON)', () => {
      const token = Buffer.from('not-json', 'utf-8').toString('base64');
      expect(service.verifyToken(token)).toBeNull();
    });

    it('returns null when AUTH_SECRET is not set', () => {
      delete process.env.AUTH_SECRET;
      expect(service.verifyToken('some-token')).toBeNull();
    });
  });
});
