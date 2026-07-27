import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { TokensService } from '../tokens/tokens.service';

export interface UserHolding {
  token: {
    id: number;
    contract_address: string;
    curve_address: string;
    amm_pair_address: string | null;
    creator_wallet: string;
    name: string;
    symbol: string;
    description: string | null;
    image: string | null;
    price: string;
    market_cap: string;
    volume_24h: string;
    real_usdc: string;
    tokens_sold: string;
    creator_fees_accrued: string;
    protocol_fees_accrued: string;
    status: string;
    graduated_at: string | null;
    lp_burned: string | null;
    created_block: string;
    created_tx_hash: string;
    created_at: string;
  };
  balance: string;
  value_usdc: string;
  total_bought_usdc: string;
  total_sold_usdc: string;
}

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
      total_volume_usdc: tradeStats?.total_usdc_volume?.toString() || '0',
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

  /**
   * GET /users/:wallet/holdings
   * Returns list of tokens held by user with balance, estimated USDC value, and trade stats per token.
   */
  async getUserHoldings(
    wallet: string,
  ): Promise<{ holdings: UserHolding[]; total_value_usdc: string }> {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user-holdings:${normalized}`;
    const cached = await this.redis.getJson<{ holdings: UserHolding[]; total_value_usdc: string }>(cacheKey);
    if (cached) return cached;

    const rows = await this.db.queryRows<any>(
      `SELECT
         t.id,
         t.contract_address,
         t.curve_address,
         t.amm_pair_address,
         t.creator_wallet,
         t.name,
         t.symbol,
         t.description,
         t.image,
         t.price::text as price,
         t.market_cap::text as market_cap,
         t.volume_24h::text as volume_24h,
         t.real_usdc::text as real_usdc,
         t.tokens_sold::text as tokens_sold,
         t.creator_fees_accrued::text as creator_fees_accrued,
         t.protocol_fees_accrued::text as protocol_fees_accrued,
         t.status,
         t.graduated_at,
         t.lp_burned::text as lp_burned,
         t.created_block::text as created_block,
         t.created_tx_hash,
         t.created_at,
         h.balance::text as balance,
         COALESCE(b.total_bought, '0') as total_bought_usdc,
         COALESCE(b.total_sold, '0') as total_sold_usdc
       FROM (
         SELECT token_id, SUM(balance) AS balance
         FROM (
           SELECT tr.token_id,
                  CASE WHEN tr.type = 'buy' THEN tr.token_amount
                       ELSE -tr.token_amount END AS balance
           FROM trades tr
           WHERE tr.wallet = $1

           UNION ALL

           SELECT s.token_id, s.token_out AS balance
           FROM amm_swaps s
           WHERE s.to_address = $1 AND s.is_buy = true

           UNION ALL

           SELECT s.token_id, -s.token_in AS balance
           FROM amm_swaps s
           WHERE s.sender = $1 AND s.is_buy = false
         ) x
         GROUP BY token_id
         HAVING SUM(balance) > 0
       ) h
       JOIN tokens t ON t.id = h.token_id
       LEFT JOIN LATERAL (
         SELECT
           SUM(CASE WHEN type = 'buy' THEN usdc_amount ELSE 0 END)::text as total_bought,
           SUM(CASE WHEN type = 'sell' THEN usdc_amount ELSE 0 END)::text as total_sold
         FROM trades
         WHERE token_id = t.id AND wallet = $1
       ) b ON true
       ORDER BY (h.balance * t.price) DESC`,
      [normalized],
    );

    let totalValueBigInt = 0n;

    const holdings: UserHolding[] = rows.map((row) => {
      // balance is in 18-dec token units
      // price is in USDC dollars per token (e.g. 0.000004)
      const balanceTokens = Number(BigInt(row.balance)) / 1e18;
      const priceUsdc = parseFloat(row.price || '0');
      // value in micro-USDC (6-dec)
      const valueMicroUsdc = Math.round(balanceTokens * priceUsdc * 1e6);
      totalValueBigInt += BigInt(valueMicroUsdc);

      const token = {
        id: row.id,
        contract_address: row.contract_address,
        curve_address: row.curve_address,
        amm_pair_address: row.amm_pair_address,
        creator_wallet: row.creator_wallet,
        name: row.name,
        symbol: row.symbol,
        description: row.description,
        image: row.image,
        price: row.price,
        market_cap: row.market_cap,
        volume_24h: row.volume_24h,
        real_usdc: row.real_usdc,
        tokens_sold: row.tokens_sold,
        creator_fees_accrued: row.creator_fees_accrued,
        protocol_fees_accrued: row.protocol_fees_accrued,
        status: row.status,
        graduated_at: row.graduated_at,
        lp_burned: row.lp_burned,
        created_block: row.created_block,
        created_tx_hash: row.created_tx_hash,
        created_at: row.created_at,
      };

      return {
        token,
        balance: row.balance,
        value_usdc: valueMicroUsdc.toString(),
        total_bought_usdc: row.total_bought_usdc || '0',
        total_sold_usdc: row.total_sold_usdc || '0',
      };
    });

    const result = {
      holdings,
      total_value_usdc: totalValueBigInt.toString(),
    };

    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }
}
