import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { TokensService } from '../tokens/tokens.service';

export interface UserProfile {
  wallet: string;
  username: string | null;
  avatar: string | null;
  tokens_launched: number;
  total_volume_usdc: string;
  created_at: string;
  launched_tokens: {
    tokens: any[];
    total: number;
  };
  trade_stats: {
    total_trades: number;
    total_buys: number;
    total_sells: number;
    total_usdc_volume: string;
  };
}

@Injectable()
export class UsersService {
  private readonly CACHE_TTL = 30;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private tokensService: TokensService,
  ) {}

  /**
   * GET /users/:wallet
   * Returns user profile, launched tokens, and trade stats.
   */
  async getUserProfile(wallet: string): Promise<UserProfile | null> {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user:${normalized}`;
    const cached = await this.redis.getJson<UserProfile>(cacheKey);
    if (cached) return cached;

    // Get user record
    const user = await this.db.queryOne<any>(
      `SELECT * FROM users WHERE wallet = $1`,
      [normalized],
    );
    if (!user) return null;

    // Get launched tokens
    const launchedTokens = await this.tokensService.getTokensByCreator(normalized, {
      limit: 100,
      offset: 0,
    });

    // Get trade stats
    const tradeStats = await this.db.queryOne<any>(
      `SELECT
         COUNT(*) as total_trades,
         COUNT(*) FILTER (WHERE type = 'buy') as total_buys,
         COUNT(*) FILTER (WHERE type = 'sell') as total_sells,
         COALESCE(SUM(usdc_amount), 0) as total_usdc_volume
       FROM trades WHERE wallet = $1`,
      [normalized],
    );

    const profile: UserProfile = {
      wallet: user.wallet,
      username: user.username,
      avatar: user.avatar,
      tokens_launched: user.tokens_launched,
      total_volume_usdc: user.total_volume_usdc.toString(),
      created_at: user.created_at,
      launched_tokens: launchedTokens,
      trade_stats: {
        total_trades: parseInt(tradeStats?.total_trades || '0', 10),
        total_buys: parseInt(tradeStats?.total_buys || '0', 10),
        total_sells: parseInt(tradeStats?.total_sells || '0', 10),
        total_usdc_volume: tradeStats?.total_usdc_volume?.toString() || '0',
      },
    };

    await this.redis.setJson(cacheKey, profile, this.CACHE_TTL);
    return profile;
  }

  /**
   * Calculate realized PnL for a wallet over a time period.
   * PnL = (total USDC received from sells) - (total USDC spent on buys)
   * usdc_amount is stored in 6-dec micro-USDC (bigint).
   */
  async getUserPnl(
    wallet: string,
    period: '7d' | '30d' | 'all',
  ): Promise<{
    period: string;
    realized_pnl: string;
    total_bought: string;
    total_sold: string;
    buy_count: number;
    sell_count: number;
  }> {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user-pnl:${normalized}:${period}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    let timeFilter = '';
    if (period === '7d') {
      timeFilter = `AND timestamp >= NOW() - INTERVAL '7 days'`;
    } else if (period === '30d') {
      timeFilter = `AND timestamp >= NOW() - INTERVAL '30 days'`;
    }

    const result = await this.db.queryOne<any>(
      `SELECT
         COALESCE(SUM(CASE WHEN type = 'buy'  THEN usdc_amount ELSE 0 END), 0) as total_bought,
         COALESCE(SUM(CASE WHEN type = 'sell' THEN usdc_amount ELSE 0 END), 0) as total_sold,
         COUNT(*) FILTER (WHERE type = 'buy')  as buy_count,
         COUNT(*) FILTER (WHERE type = 'sell') as sell_count
       FROM trades
       WHERE wallet = $1 ${timeFilter}`,
      [normalized],
    );

    const totalBought = BigInt(result?.total_bought || '0');
    const totalSold = BigInt(result?.total_sold || '0');
    const pnl = totalSold - totalBought;

    const pnlResult = {
      period,
      realized_pnl: pnl.toString(),
      total_bought: totalBought.toString(),
      total_sold: totalSold.toString(),
      buy_count: parseInt(result?.buy_count || '0', 10),
      sell_count: parseInt(result?.sell_count || '0', 10),
    };

    await this.redis.setJson(cacheKey, pnlResult, this.CACHE_TTL);
    return pnlResult;
  }
}
