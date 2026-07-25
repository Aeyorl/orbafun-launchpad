import { Controller, Get, Param, NotFoundException, BadRequestException } from '@nestjs/common';
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
}
