import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

@Injectable()
export class LeaderboardService {
  private readonly CACHE_TTL = 30;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  /**
   * GET /leaderboard?type=top_creators|top_gainers&limit=20
   */
  async getLeaderboard(type: string, limit: number): Promise<any> {
    const cacheKey = `leaderboard:${type}:${limit}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    let result: any;

    if (type === 'top_creators') {
      result = await this.db.queryRows(
        `SELECT
           u.wallet,
           u.username,
           u.tokens_launched,
           COALESCE(tr.vol, 0)::text as total_volume_usdc,
           COUNT(DISTINCT t.id) as active_tokens,
           COALESCE(SUM(t.market_cap), 0) as total_market_cap
         FROM users u
         LEFT JOIN (
           SELECT wallet, SUM(usdc_amount) as vol
           FROM trades
           GROUP BY wallet
         ) tr ON tr.wallet = u.wallet
         LEFT JOIN tokens t ON t.creator_wallet = u.wallet AND t.status = 'active'
         GROUP BY u.wallet, u.username, u.tokens_launched, tr.vol
         ORDER BY COALESCE(tr.vol, 0) DESC
         LIMIT $1`,
        [limit],
      );
    } else if (type === 'top_gainers') {
      // Top gainers: tokens with the highest market cap (proxy for gain,
      // since we don't track historical price snapshots yet).
      // TODO: Add a price_snapshots table for real gain calculations.
      result = await this.db.queryRows(
        `SELECT
           contract_address,
           name,
           symbol,
           image,
           market_cap,
           price,
           volume_24h,
           status,
           created_at
         FROM tokens
         WHERE status = 'active'
         ORDER BY market_cap DESC
         LIMIT $1`,
        [limit],
      );
    } else if (type === 'top_volume') {
      result = await this.db.queryRows(
        `SELECT
           contract_address,
           name,
           symbol,
           image,
           market_cap,
           volume_24h,
           status
         FROM tokens
         ORDER BY volume_24h DESC
         LIMIT $1`,
        [limit],
      );
    } else {
      result = [];
    }

    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }
}
