import {
  Controller,
  Get,
  Post,
  Body,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

/**
 * AuthController — wallet signature authentication endpoints.
 *
 * Routes:
 *   GET  /auth/nonce   — get a random nonce to sign
 *   POST /auth/verify  — verify a signed message, get an auth token
 *
 * The auth token is sent in the `x-auth-token` header for write endpoints
 * (messages, favorites, token metadata). The token replaces the insecure
 * `x-wallet` header, which was trivially spoofable.
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private authService: AuthService) {}

  /** GET /auth/nonce — returns a random nonce for the client to sign. */
  @Get('nonce')
  @Throttle({ default: { ttl: 60_000, limit: 20 } }) // 20 nonce requests/min per IP
  async nonce() {
    if (!process.env.AUTH_SECRET) {
      throw new HttpException(
        'Auth not configured (AUTH_SECRET missing)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return this.authService.generateNonce();
  }

  /**
   * POST /auth/verify
   * Body: { message: string, signature: `0x${string}` }
   * Returns: { token: string, wallet: string, expires: number }
   */
  @Post('verify')
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 verify attempts/min per IP
  async verify(
    @Body() body: { message?: string; signature?: string },
  ) {
    if (!process.env.AUTH_SECRET) {
      throw new HttpException(
        'Auth not configured (AUTH_SECRET missing)',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    if (!body.message || !body.signature) {
      throw new HttpException(
        'message and signature are required',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!body.signature.startsWith('0x')) {
      throw new HttpException('signature must start with 0x', HttpStatus.BAD_REQUEST);
    }

    return this.authService.verify(body.message, body.signature as `0x${string}`);
  }
}
