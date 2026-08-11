import { Controller, Get, Query, BadRequestException } from '@nestjs/common';
import { LeaderboardService } from './leaderboard.service';

@Controller('leaderboard')
export class LeaderboardController {
  constructor(private leaderboardService: LeaderboardService) {}

  /**
   * GET /leaderboard
   * Query params:
   *   type=top_creators|top_gainers|top_volume (default: top_gainers)
   *   limit=20 (max 100)
   */
  @Get()
  async getLeaderboard(
    @Query('type') type?: string,
    @Query('limit') limit?: string,
  ) {
    const validTypes = ['top_creators', 'top_gainers', 'top_volume', 'market_cap', 'new'];
    const typeOption = validTypes.includes(type || '') ? type! : 'top_gainers';
    const limitNum = limit ? parseInt(limit, 10) : 20;

    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }

    return this.leaderboardService.getLeaderboard(typeOption, limitNum);
  }
}
