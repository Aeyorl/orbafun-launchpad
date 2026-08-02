import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { recoverMessageAddress } from 'viem';
import { AuthService } from '../auth.service';
import { RedisService } from '../../redis/redis.service';

jest.mock('viem', () => ({
  recoverMessageAddress: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  const nonces = new Map<string, string>();
  const mockWallet = '0x000000000000000000000000000000000000dEaD';
  const mockSecret = 'test-secret-key-32-bytes-minimum!!!!!!!!';
  const redis = {
    isAvailable: jest.fn(() => true),
    setIfAbsent: jest.fn(async (key: string, value: string) => {
      if (nonces.has(key)) return false;
      nonces.set(key, value);
      return true;
    }),
    getDel: jest.fn(async (key: string) => {
      const value = nonces.get(key) ?? null;
      nonces.delete(key);
      return value;
    }),
  };

  const siweMessage = (nonce: string, wallet = mockWallet) =>
    `localhost:3000 wants you to sign in with your Ethereum account:\n${wallet}\n\nSign in to Orba\n\nURI: http://localhost:3000\nVersion: 1\nChain ID: 5042002\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;

  beforeEach(async () => {
    process.env.AUTH_SECRET = mockSecret;
    process.env.AUTH_SIWE_DOMAINS = 'localhost:3000';
    nonces.clear();
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
    delete process.env.AUTH_SIWE_DOMAINS;
  });

  it('issues unique 64-character nonces through the shared store', async () => {
    const first = await service.generateNonce();
    const second = await service.generateNonce();
    expect(first.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(second.nonce).not.toBe(first.nonce);
    expect(redis.setIfAbsent).toHaveBeenCalledTimes(2);
  });

  it('rejects a malformed SIWE message', async () => {
    await expect(
      service.verify('not SIWE', '0xdeadbeef'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('verifies a bound SIWE message and consumes its nonce once', async () => {
    const { nonce } = await service.generateNonce();
    const message = siweMessage(nonce);
    (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

    const result = await service.verify(message, '0xdeadbeef');
    expect(result.wallet).toBe(mockWallet.toLowerCase());
    expect(service.verifyToken(result.token)).toBe(mockWallet.toLowerCase());

    await expect(
      service.verify(message, '0xdeadbeef'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a SIWE message for an unapproved domain', async () => {
    const { nonce } = await service.generateNonce();
    const message = siweMessage(nonce).replaceAll('localhost:3000', 'evil.example');
    (recoverMessageAddress as jest.Mock).mockResolvedValue(mockWallet);

    await expect(
      service.verify(message, '0xdeadbeef'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects signature recovery failures', async () => {
    const { nonce } = await service.generateNonce();
    (recoverMessageAddress as jest.Mock).mockRejectedValue(new Error('bad signature'));

    await expect(
      service.verify(siweMessage(nonce), '0xbad'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects verification when AUTH_SECRET is absent', async () => {
    delete process.env.AUTH_SECRET;
    const module = await Test.createTestingModule({
      providers: [AuthService, { provide: RedisService, useValue: redis }],
    }).compile();

    await expect(
      module.get(AuthService).verify('message', '0xdeadbeef'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rejects expired, tampered, and malformed tokens', () => {
    const wallet = mockWallet.toLowerCase();
    const expires = Date.now() - 1_000;
    const hmac = require('crypto')
      .createHmac('sha256', mockSecret)
      .update(`${wallet}:${expires}`)
      .digest('hex');
    const expired = Buffer.from(JSON.stringify({ wallet, expires, hmac })).toString('base64');
    const tampered = Buffer.from(JSON.stringify({
      wallet,
      expires: Date.now() + 60_000,
      hmac: '0'.repeat(64),
    })).toString('base64');

    expect(service.verifyToken(expired)).toBeNull();
    expect(service.verifyToken(tampered)).toBeNull();
    expect(service.verifyToken(Buffer.from('not-json').toString('base64'))).toBeNull();
  });
});
