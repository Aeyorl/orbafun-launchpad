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
           SELECT t.creator_wallet, (SUM(tr.usdc_amount) / 1000000.0) as vol
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
      // Top gainers: tokens with the highest percentage gain in the last 24h.
      // Uses the price_snapshots table (recorded on every trade). Compares the
      // latest price snapshot against the snapshot closest to 24h ago (or the
      // earliest snapshot if the token is less than 24h old).
      result = await this.db.queryRows(
        `SELECT
           t.contract_address,
           t.name,
           t.symbol,
           t.image,
           t.market_cap,
           t.price,
           t.volume_24h,
           t.status,
           t.created_at,
           COALESCE(
             ROUND(
               ((latest.price - earliest.price) / NULLIF(earliest.price, 0)) * 100,
               2
             ),
             0
           )::text AS gain_pct
         FROM tokens t
         LEFT JOIN LATERAL (
           SELECT price FROM price_snapshots
           WHERE token_id = t.id
           ORDER BY ABS(EXTRACT(EPOCH FROM (snapshot_at - (NOW() - INTERVAL '24 hours'))))
           LIMIT 1
         ) earliest ON true
         LEFT JOIN LATERAL (
           SELECT price FROM price_snapshots
           WHERE token_id = t.id
           ORDER BY snapshot_at DESC
           LIMIT 1
         ) latest ON true
         WHERE t.status = 'active'
           AND latest.price IS NOT NULL
           AND earliest.price IS NOT NULL
         ORDER BY gain_pct DESC
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
