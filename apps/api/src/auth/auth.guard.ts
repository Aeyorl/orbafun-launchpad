import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { isValidEvmAddress } from '../common/utils';

/**
 * AuthGuard — protects write endpoints with wallet signature auth.
 *
 * Extracts the auth token from the `x-auth-token` header, verifies it via
 * AuthService, and attaches the wallet address to `request.wallet`.
 *
 * Fallback: if no auth token is present but an `x-wallet` header is set,
 * the guard allows the request through (with a warning) when AUTH_ALLOW_INSECURE
 * is set to 'true' in the environment. This is for testnet/dev backward compat.
 * In production (AUTH_ALLOW_INSECURE unset or 'false'), x-wallet alone is rejected.
 *
 * Usage: apply as a controller-level or method-level guard:
 *   @UseGuards(AuthGuard)
 *
 * The wallet address is available as `req.wallet` (lowercase string).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private authService: AuthService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { wallet?: string }>();
    const authHeader = request.headers['x-auth-token'] as string | undefined;

    if (authHeader) {
      const wallet = this.authService.verifyToken(authHeader);
      if (!wallet) {
        throw new UnauthorizedException('Invalid or expired auth token');
      }
      request.wallet = wallet;
      return true;
    }

    // Fallback: insecure x-wallet header (testnet/dev only)
    const allowInsecure = process.env.AUTH_ALLOW_INSECURE === 'true';
    const walletHeader = request.headers['x-wallet'] as string | undefined;
    if (allowInsecure && walletHeader && isValidEvmAddress(walletHeader)) {
      // Insecure mode — trust the header. For testnet only.
      request.wallet = walletHeader.toLowerCase();
      return true;
    }

    throw new UnauthorizedException(
      'Authentication required — provide x-auth-token header' +
        (allowInsecure ? ' or x-wallet header' : ''),
    );
  }
}
