import { Controller, Get, Param, Query, NotFoundException, BadRequestException } from '@nestjs/common';
import { UsersService } from './users.service';
import { isValidEvmAddress } from '../common/utils';

@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

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
}
