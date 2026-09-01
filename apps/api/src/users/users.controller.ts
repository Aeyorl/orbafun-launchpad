import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Request } from 'express';
import { UsersService } from './users.service';
import { isValidEvmAddress } from '../common/utils';
import { AuthGuard } from '../auth/auth.guard';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  /** Set or change the authenticated user's public profile fields. */
  @Patch('me')
  @UseGuards(AuthGuard)
  async updateMe(
    @Req() req: Request & { wallet?: string },
    @Body() body: { username?: string; avatar?: string | null },
  ) {
    if (body?.username === undefined && body?.avatar === undefined) {
      throw new BadRequestException('username or avatar is required');
    }
    return this.usersService.updateProfile(req.wallet!, body);
  }

  /**
   * GET /users/:wallet
   * Returns user profile, launched tokens, and trade stats.
   */
  @Get(':wallet')
  async getUser(@Param('wallet') wallet: string) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const profile = await this.usersService.getUserProfile(wallet);
    if (!profile) throw new NotFoundException('User not found');
    return profile;
  }

  /**
   * GET /users/:wallet/pnl?period=7d|30d|all
   * Returns realized PnL (sell proceeds - buy costs) for the given period.
   */
  @Get(':wallet/pnl')
  async getPnl(
    @Param('wallet') wallet: string,
    @Query('period') period: string = 'all',
  ) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    const validPeriods = ['7d', '30d', 'all'];
    if (!validPeriods.includes(period)) {
      throw new BadRequestException(`Invalid period. Use: ${validPeriods.join(', ')}`);
    }
    return this.usersService.getUserPnl(wallet, period as '7d' | '30d' | 'all');
  }

  @Get(':wallet/stats')
  async getStats(@Param('wallet') wallet: string) {
    this.assertWallet(wallet);
    const stats = await this.usersService.getWalletStats(wallet);
    if (!stats) throw new NotFoundException('Wallet activity not found');
    return stats;
  }

  @Get(':wallet/tier')
  async getTier(@Param('wallet') wallet: string) {
    this.assertWallet(wallet);
    const tier = await this.usersService.getWalletTier(wallet);
    if (!tier) throw new NotFoundException('Wallet activity not found');
    return tier;
  }

  @Get(':wallet/positions')
  async getPositions(
    @Param('wallet') wallet: string,
    @Query('status') status: string = 'all',
    @Query('limit') limitValue: string = '50',
    @Query('offset') offsetValue: string = '0',
  ) {
    this.assertWallet(wallet);
    if (!['open', 'closed', 'all'].includes(status)) {
      throw new BadRequestException('Invalid status. Use: open, closed, all');
    }
    const limit = Number.parseInt(limitValue, 10);
    const offset = Number.parseInt(offsetValue, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new BadRequestException('limit must be between 1 and 100');
    }
    if (!Number.isInteger(offset) || offset < 0) {
      throw new BadRequestException('offset must be a non-negative integer');
    }
    return this.usersService.getUserPositions(
      wallet,
      status as 'open' | 'closed' | 'all',
      limit,
      offset,
    );
  }

  @Get(':wallet/positions/:tokenAddress')
  async getPosition(
    @Param('wallet') wallet: string,
    @Param('tokenAddress') tokenAddress: string,
  ) {
    this.assertWallet(wallet);
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    const position = await this.usersService.getUserPosition(wallet, tokenAddress);
    if (!position) throw new NotFoundException('Position not found');
    return position;
  }

  /**
   * GET /users/:wallet/holdings
   * Returns tokens held by user with balance, estimated USDC value, and trade stats per token.
   */
  @Get(':wallet/holdings')
  async getHoldings(@Param('wallet') wallet: string) {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    return this.usersService.getUserHoldings(wallet);
  }

  private assertWallet(wallet: string): void {
    if (!isValidEvmAddress(wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
  }
}
