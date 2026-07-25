import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { isValidEvmAddress } from '../common/utils';

/**
 * AdminGuard — protects admin-only endpoints.
 *
 * Uses the same wallet signature auth as AuthGuard (x-auth-token header),
 * then checks if the authenticated wallet is in the ADMIN_WALLETS allowlist
 * (comma-separated EVM addresses in the environment variable).
 *
 * Fallback: in AUTH_ALLOW_INSECURE mode, the x-wallet header is accepted
 * (same as AuthGuard) but the wallet must still be in the admin allowlist.
 *
 * Usage:
 *   @UseGuards(AdminGuard)
 *
 * The wallet address is available as `req.wallet` (lowercase string).
 */
@Injectable()
export class AdminGuard implements CanActivate {
  private readonly logger = new Logger(AdminGuard.name);
  private readonly adminWallets: Set<string>;

  constructor(private authService: AuthService) {
    const raw = process.env.ADMIN_WALLETS || '';
    this.adminWallets = new Set(
      raw
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean),
    );
    if (this.adminWallets.size === 0) {
      this.logger.warn(
        'ADMIN_WALLETS not set — admin endpoints will reject all requests. Set ADMIN_WALLETS in .env (comma-separated wallet addresses).',
      );
    } else {
      this.logger.log(
        `Admin guard active with ${this.adminWallets.size} admin wallet(s)`,
      );
    }
  }

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { wallet?: string }>();
    const authHeader = request.headers['x-auth-token'] as string | undefined;

    let wallet: string | undefined;

    if (authHeader) {
      const verified = this.authService.verifyToken(authHeader);
      if (!verified) {
        throw new UnauthorizedException('Invalid or expired auth token');
      }
      wallet = verified;
    } else {
      // Fallback: insecure x-wallet header (testnet/dev only)
      const allowInsecure = process.env.AUTH_ALLOW_INSECURE === 'true';
      const walletHeader = request.headers['x-wallet'] as string | undefined;
      if (allowInsecure && walletHeader && isValidEvmAddress(walletHeader)) {
        wallet = walletHeader.toLowerCase();
      } else {
        throw new UnauthorizedException(
          'Admin authentication required — provide x-auth-token header' +
            (allowInsecure ? ' or x-wallet header' : ''),
        );
      }
    }

    if (!this.adminWallets.has(wallet)) {
      throw new ForbiddenException(
        `Wallet ${wallet} is not an admin. Access denied.`,
      );
    }

    request.wallet = wallet;
    return true;
  }
}
