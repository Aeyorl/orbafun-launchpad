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
}
