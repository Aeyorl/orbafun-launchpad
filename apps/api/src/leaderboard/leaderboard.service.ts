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
           COALESCE(tv.vol, 0)::text as total_volume_usdc,
           COUNT(DISTINCT t.id) FILTER (WHERE t.status = 'active') as active_tokens,
           COALESCE(SUM(t.market_cap) FILTER (WHERE t.status = 'active'), 0) as total_market_cap
         FROM users u
         LEFT JOIN (
           SELECT t.creator_wallet, SUM(tr.usdc_amount) as vol
           FROM tokens t
           JOIN trades tr ON tr.token_id = t.id
           GROUP BY t.creator_wallet
         ) tv ON tv.creator_wallet = u.wallet
         LEFT JOIN tokens t ON t.creator_wallet = u.wallet
         WHERE u.tokens_launched > 0 OR t.id IS NOT NULL
         GROUP BY u.wallet, u.username, u.tokens_launched, tv.vol
         ORDER BY COALESCE(tv.vol, 0) DESC
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
