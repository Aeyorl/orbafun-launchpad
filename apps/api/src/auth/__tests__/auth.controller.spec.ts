import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '../auth.controller';
import { AuthService } from '../auth.service';
import { HttpException, HttpStatus } from '@nestjs/common';

// Mock AuthService
const mockAuthService = {
  generateNonce: jest.fn(),
  verify: jest.fn(),
};

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    // Set env so the controller doesn't throw 503 on construction
    process.env.AUTH_SECRET = 'test-secret';

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => {
    delete process.env.AUTH_SECRET;
  });

  // ─── GET /auth/nonce ───────────────────────────────────────────────────

  describe('GET /auth/nonce', () => {
    it('returns a nonce from auth service', async () => {
      mockAuthService.generateNonce.mockResolvedValue({ nonce: 'abc123' });

      const result = await controller.nonce();
      expect(result).toEqual({ nonce: 'abc123' });
      expect(mockAuthService.generateNonce).toHaveBeenCalledTimes(1);
    });

    it('throws 503 if AUTH_SECRET is not set', async () => {
      delete process.env.AUTH_SECRET;

      await expect(controller.nonce()).rejects.toThrow(
        new HttpException(
          'Auth not configured (AUTH_SECRET missing)',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });
  });

  // ─── POST /auth/verify ─────────────────────────────────────────────────

  describe('POST /auth/verify', () => {
    it('returns token on successful verification', async () => {
      const expected = {
        token: 'base64-token',
        wallet: '0x1234...5678',
        expires: Date.now() + 86400000,
      };
      mockAuthService.verify.mockResolvedValue(expected);

      const result = await controller.verify({
        message: 'Sign this message',
        signature: '0xdeadbeef',
      });

      expect(result).toEqual(expected);
      expect(mockAuthService.verify).toHaveBeenCalledWith(
        'Sign this message',
        '0xdeadbeef',
      );
    });

    it('throws 503 if AUTH_SECRET is not set', async () => {
      delete process.env.AUTH_SECRET;

      await expect(
        controller.verify({
          message: 'test',
          signature: '0xdeadbeef',
        }),
      ).rejects.toThrow(
        new HttpException(
          'Auth not configured (AUTH_SECRET missing)',
          HttpStatus.SERVICE_UNAVAILABLE,
        ),
      );
    });

    it('throws 400 if message is missing', async () => {
      await expect(
        controller.verify({
          message: '',
          signature: '0xdeadbeef',
        }),
      ).rejects.toThrow(
        new HttpException(
          'message and signature are required',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('throws 400 if signature is missing', async () => {
      await expect(
        controller.verify({
          message: 'test',
          signature: '',
        }),
      ).rejects.toThrow(
        new HttpException(
          'message and signature are required',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('throws 400 if signature does not start with 0x', async () => {
      await expect(
        controller.verify({
          message: 'test',
          signature: 'deadbeef',
        }),
      ).rejects.toThrow(
        new HttpException(
          'signature must start with 0x',
          HttpStatus.BAD_REQUEST,
        ),
      );
    });

    it('throws 400 if both fields are missing', async () => {
      await expect(
        controller.verify({
          message: '',
          signature: '',
        }),
      ).rejects.toThrow(HttpException);
    });

    it('propagates auth service errors (e.g. invalid nonce)', async () => {
      mockAuthService.verify.mockRejectedValue(
        new HttpException('No valid nonce found', HttpStatus.UNAUTHORIZED),
      );

      await expect(
        controller.verify({
          message: 'bad message',
          signature: '0xbad',
        }),
      ).rejects.toThrow(HttpException);
    });
  });
});
