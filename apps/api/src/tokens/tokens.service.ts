import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService, QueryParam } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

export interface Token {
  id: number;
  contract_address: string;
  curve_address: string;
  factory_address: string | null;
  transfer_policy: 'legacy_capped' | 'uncapped';
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
  // Agent-launched token attributes
  is_agent: string;       // 'true' or 'false' — whether this token was launched by an AI agent
  agent_name: string | null;  // The agent's display name, if agent-launched
  agent_uuid: string | null;  // The agent's public UUID, if agent-launched
}

export interface Trade {
  id: number;
  token_id: number;
  wallet: string;
  type: string;
  usdc_amount: string;
  token_amount: string;
  price: string;
  market_cap_after: string;
  real_usdc_after: string;
  tokens_sold_after: string;
  tx_hash: string;
  block_number: string;
  log_index: number;
  timestamp: string;
  wallet_tier: 'shrimp' | 'fish' | 'dolphin' | 'whale' | null;
  wallet_tier_label: string | null;
  wallet_tier_calculated_at: string | null;
}

export type MarketFlowWindow = '5m' | '1h' | '6h' | '24h';

export interface MarketFlow {
  window: MarketFlowWindow;
  price_change_pct: string;
  buy_count: number;
  sell_count: number;
  buy_volume_usdc: string;
  sell_volume_usdc: string;
  unique_buyers: number;
  unique_sellers: number;
  current_market_cap: string;
  all_time_high: string;
}

export type SortOption = 'newest' | 'market_cap' | 'volume';
export type StatusFilter = 'active' | 'graduated' | 'all';

@Injectable()
export class TokensService implements OnModuleInit {
  private readonly logger = new Logger(TokensService.name);
  private readonly CACHE_TTL = 10; // seconds

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  private publicFactories(): string[] {
    return getPublicFactoryAddresses();
  }

  private scopeCacheKey(): string {
    return this.publicFactories().join(',');
  }

  async onModuleInit(): Promise<void> {
    const scope = this.scopeCacheKey();
    const doneKey = `factory-scope-cache-reset:${scope}:done`;
    if (await this.redis.get(doneKey)) return;

    const lockKey = `factory-scope-cache-reset:${scope}:lock`;
    if (!(await this.redis.setIfAbsent(lockKey, '1', 300))) return;

    try {
      await Promise.all([
        this.redis.delPattern('token:*'),
        this.redis.delPattern('tokens:*'),
        this.redis.delPattern('candles:*'),
        this.redis.delPattern('stats:platform:*'),
        this.redis.delPattern('leaderboard:*'),
        this.redis.delPattern('user:*'),
        this.redis.delPattern('user-stats:*'),
        this.redis.delPattern('user-pnl:*'),
        this.redis.delPattern('user-holdings:*'),
      ]);
      await this.redis.set(doneKey, new Date().toISOString());
      this.logger.log(`Cleared public caches for factory scope ${scope}`);
    } finally {
      await this.redis.del(lockKey);
    }
  }

  /**
   * Cron task running every 5 minutes to refresh the 24h rolling volume window
   * across all active tokens and clear cached token lists.
   */
  @Cron('17 */5 * * * *')
  async refreshVolume24h(): Promise<void> {
    try {
      await this.db.query(
        `UPDATE tokens t
         SET volume_24h = COALESCE((
           SELECT (SUM(volume_raw)::numeric / 1000000.0)::numeric(20,6)
           FROM (
             SELECT tr.usdc_amount AS volume_raw
             FROM trades tr
             WHERE tr.token_id = t.id AND tr.timestamp > NOW() - INTERVAL '24 hours'
             UNION ALL
             SELECT CASE WHEN swap.is_buy THEN swap.usdc_in ELSE swap.usdc_out END AS volume_raw
             FROM amm_swaps swap
             WHERE swap.token_id = t.id AND swap.timestamp > NOW() - INTERVAL '24 hours'
           ) AS activity
         ), 0)
         WHERE ${publicFactoryClause('t', 1)}`,
        [this.publicFactories()],
      );
      await this.redis.delPattern('tokens:list:*');
    } catch (err) {
      this.logger.error(`Failed to refresh 24h volume: ${err.message}`);
    }
  }

  /**
   * List tokens with sorting and filtering.
   * GET /tokens?sort=newest|market_cap|volume&status=active|graduated&is_agent=true|false&limit=20&offset=0
   */
  async listTokens(opts: {
    sort?: SortOption;
    status?: StatusFilter;
    is_agent?: string;  // 'true' | 'false' — filter by AI agent-launched status
    limit?: number;
    offset?: number;
    search?: string;
  }): Promise<{ tokens: Token[]; total: number }> {
    const sort = opts.sort || 'newest';
    const status = opts.status || 'active';
    const isAgent = opts.is_agent;
    const limit = Math.min(opts.limit || 20, 100);
    const offset = opts.offset || 0;
    const search = opts.search;

    // Build cache key
    const cacheKey = `tokens:list:${this.scopeCacheKey()}:${sort}:${status}:${isAgent || ''}:${limit}:${offset}:${search || ''}`;
    const cached = await this.redis.getJson<{ tokens: Token[]; total: number }>(cacheKey);
    if (cached) return cached;

    // Build query
    const orderClause = {
      newest: 'ORDER BY t.created_at DESC',
      market_cap: 'ORDER BY t.market_cap DESC',
      volume: 'ORDER BY t.volume_24h DESC',
    }[sort];

    // Build WHERE clauses and params with correct $N indexing
    const filterParams: QueryParam[] = [this.publicFactories()];
    let paramIdx = 2;

    let statusClause = '';
    if (status !== 'all') {
      statusClause = `AND t.status = $${paramIdx}`;
      filterParams.push(status);
      paramIdx++;
    }

    let searchClause = '';
    if (search) {
      searchClause = `AND (t.name ILIKE $${paramIdx} OR t.symbol ILIKE $${paramIdx} OR t.contract_address ILIKE $${paramIdx})`;
      filterParams.push(`%${search}%`);
      paramIdx++;
    }

    let agentClause = '';
    if (isAgent === 'true') {
      agentClause = 'AND al.id IS NOT NULL';
    } else if (isAgent === 'false') {
      agentClause = 'AND al.id IS NULL';
    }

    const limitIdx = paramIdx;
    const offsetIdx = paramIdx + 1;

    const query = `
      SELECT t.*, u.username as creator_username,
        CASE WHEN al.id IS NOT NULL THEN true ELSE false END AS is_agent,
        a.name AS agent_name,
        a.agent_id AS agent_uuid
      FROM tokens t
      LEFT JOIN users u ON t.creator_wallet = u.wallet
      LEFT JOIN agent_launches al ON al.token_address = t.contract_address
      LEFT JOIN agents a ON a.id = al.agent_id
      WHERE ${publicFactoryClause('t', 1)} ${statusClause} ${searchClause} ${agentClause}
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tokens t
      LEFT JOIN agent_launches al ON al.token_address = t.contract_address
      WHERE ${publicFactoryClause('t', 1)} ${statusClause} ${searchClause} ${agentClause}
    `;

    const queryParams = [...filterParams, limit, offset];

    const [tokensResult, countResult] = await Promise.all([
      this.db.query(query, queryParams),
      this.db.query(countQuery, filterParams),
    ]);

    const result = {
      tokens: tokensResult.rows as Token[],
      total: parseInt(countResult.rows[0].total, 10),
    };

    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  /**
   * Get a single token by its contract address.
   * GET /tokens/:address
   */
  async getTokenByAddress(address: string): Promise<Token | null> {
    const normalized = address.toLowerCase();
    const cacheKey = `token:${this.scopeCacheKey()}:${normalized}`;
    const cached = await this.redis.getJson<Token>(cacheKey);
    if (cached) return cached;

    const token = await this.db.queryOne<Token>(
      `SELECT t.*,
        CASE WHEN al.id IS NOT NULL THEN true ELSE false END AS is_agent,
        a.name AS agent_name,
        a.agent_id AS agent_uuid
       FROM tokens t
       LEFT JOIN agent_launches al ON al.token_address = t.contract_address
       LEFT JOIN agents a ON a.id = al.agent_id
       WHERE t.contract_address = $1
         AND ${publicFactoryClause('t', 2)}`,
      [normalized, this.publicFactories()],
    );

    if (token) {
      await this.redis.setJson(cacheKey, token, 5); // shorter TTL for single token
    }
    return token;
  }

  /**
   * Get trades for a token (paginated, for chart + transaction list).
   * GET /tokens/:address/trades?limit=50&offset=0&order=desc
   */
  async getTokenTrades(
    address: string,
    opts: { limit?: number; offset?: number; order?: 'asc' | 'desc' } = {},
  ): Promise<{ trades: Trade[]; total: number }> {
    const limit = Math.min(opts.limit || 50, 500);
    const offset = opts.offset || 0;
    const order = opts.order || 'desc';
    const normalized = address.toLowerCase();

    const trades = await this.db.queryRows<Trade>(
      `WITH activity AS (
         SELECT tr.id, tr.token_id, tr.wallet, tr.type,
                tr.usdc_amount, tr.token_amount, tr.price,
                tr.market_cap_after, tr.real_usdc_after, tr.tokens_sold_after,
                tr.tx_hash, tr.block_number, tr.log_index, tr.timestamp
         FROM trades tr
         JOIN tokens t ON tr.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT s.id, s.token_id,
                CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END AS wallet,
                CASE WHEN s.is_buy THEN 'buy' ELSE 'sell' END AS type,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END AS usdc_amount,
                CASE WHEN s.is_buy THEN s.token_out ELSE s.token_in END AS token_amount,
                s.price_after AS price,
                s.price_after * 1000000000 AS market_cap_after,
                0::bigint AS real_usdc_after,
                0::numeric AS tokens_sold_after,
                s.tx_hash, s.block_number, s.log_index, s.timestamp
         FROM amm_swaps s
         JOIN tokens t ON s.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
       )
       SELECT a.*,
              ws.tier AS wallet_tier,
              CASE WHEN ws.suspicious_activity THEN 'Unranked' ELSE INITCAP(ws.tier) END AS wallet_tier_label,
              ws.calculated_at::text AS wallet_tier_calculated_at
       FROM activity a
       LEFT JOIN wallet_stats ws ON ws.wallet = a.wallet
       ORDER BY a.timestamp ${order === 'desc' ? 'DESC' : 'ASC'}, a.log_index ${order === 'desc' ? 'DESC' : 'ASC'}
       LIMIT $3 OFFSET $4`,
      [normalized, this.publicFactories(), limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT (
         SELECT COUNT(*) FROM trades tr JOIN tokens t ON tr.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
       ) + (
         SELECT COUNT(*) FROM amm_swaps s JOIN tokens t ON s.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
       ) AS total`,
      [normalized, this.publicFactories()],
    );

    return {
      trades,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  async getMarketFlow(address: string, window: MarketFlowWindow): Promise<MarketFlow> {
    const normalized = address.toLowerCase();
    const interval = {
      '5m': '5 minutes',
      '1h': '1 hour',
      '6h': '6 hours',
      '24h': '24 hours',
    }[window];

    const result = await this.db.queryOne<Omit<MarketFlow, 'window'>>(
      `WITH token_row AS (
         SELECT id, market_cap FROM tokens t
         WHERE contract_address = $1 AND ${publicFactoryClause('t', 2)}
       ), activity AS (
         SELECT tr.type, tr.wallet, tr.usdc_amount, tr.price, tr.market_cap_after, tr.timestamp
         FROM trades tr JOIN token_row t ON tr.token_id = t.id
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN 'buy' ELSE 'sell' END,
                CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END,
                s.price_after, s.price_after * 1000000000, s.timestamp
         FROM amm_swaps s JOIN token_row t ON s.token_id = t.id
       ), windowed AS (
         SELECT * FROM activity WHERE timestamp >= NOW() - $3::interval
       ), prices AS (
         SELECT
           (SELECT price FROM windowed ORDER BY timestamp ASC LIMIT 1) AS first_price,
           (SELECT price FROM windowed ORDER BY timestamp DESC LIMIT 1) AS last_price
       )
       SELECT
         COALESCE(ROUND(
           (prices.last_price - prices.first_price) * 100 / NULLIF(prices.first_price, 0), 4
         ), 0)::text AS price_change_pct,
         COUNT(*) FILTER (WHERE windowed.type = 'buy')::int AS buy_count,
         COUNT(*) FILTER (WHERE windowed.type = 'sell')::int AS sell_count,
         COALESCE(SUM(windowed.usdc_amount) FILTER (WHERE windowed.type = 'buy'), 0)::text AS buy_volume_usdc,
         COALESCE(SUM(windowed.usdc_amount) FILTER (WHERE windowed.type = 'sell'), 0)::text AS sell_volume_usdc,
         COUNT(DISTINCT windowed.wallet) FILTER (WHERE windowed.type = 'buy')::int AS unique_buyers,
         COUNT(DISTINCT windowed.wallet) FILTER (WHERE windowed.type = 'sell')::int AS unique_sellers,
         COALESCE((SELECT market_cap::text FROM token_row), '0') AS current_market_cap,
         GREATEST(
           COALESCE((SELECT MAX(market_cap_after) FROM activity), 0),
           COALESCE((SELECT market_cap FROM token_row), 0)
         )::text AS all_time_high
       FROM prices
       LEFT JOIN windowed ON true
       GROUP BY prices.first_price, prices.last_price`,
      [normalized, this.publicFactories(), interval],
    );

    return {
      window,
      price_change_pct: result?.price_change_pct || '0',
      buy_count: result?.buy_count || 0,
      sell_count: result?.sell_count || 0,
      buy_volume_usdc: result?.buy_volume_usdc || '0',
      sell_volume_usdc: result?.sell_volume_usdc || '0',
      unique_buyers: result?.unique_buyers || 0,
      unique_sellers: result?.unique_sellers || 0,
      current_market_cap: result?.current_market_cap || '0',
      all_time_high: result?.all_time_high || '0',
    };
  }

  async getRecentActivity(limit = 12): Promise<any[]> {
    return this.db.queryRows<any>(
      `WITH activity AS (
         SELECT tr.type,
                tr.wallet,
                tr.usdc_amount::text AS usdc_amount,
                tr.token_amount::text AS token_amount,
                tr.tx_hash,
                tr.block_number,
                tr.log_index,
                tr.timestamp,
                t.contract_address AS token_address,
                t.name AS token_name,
                t.symbol AS token_symbol
         FROM trades tr
         JOIN tokens t ON t.id = tr.token_id
         WHERE ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN 'buy' ELSE 'sell' END AS type,
                CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END AS wallet,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END::text AS usdc_amount,
                CASE WHEN s.is_buy THEN s.token_out ELSE s.token_in END::text AS token_amount,
                s.tx_hash,
                s.block_number,
                s.log_index,
                s.timestamp,
                t.contract_address AS token_address,
                t.name AS token_name,
                t.symbol AS token_symbol
         FROM amm_swaps s
         JOIN tokens t ON t.id = s.token_id
         WHERE ${publicFactoryClause('t', 2)}
       )
       SELECT a.*,
              ws.tier AS wallet_tier,
              CASE WHEN ws.suspicious_activity THEN 'Unranked' ELSE INITCAP(ws.tier) END AS wallet_tier_label,
              ws.calculated_at::text AS wallet_tier_calculated_at
       FROM activity a
       LEFT JOIN wallet_stats ws ON ws.wallet = a.wallet
       ORDER BY a.block_number DESC, a.log_index DESC
       LIMIT $1`,
      [limit, this.publicFactories()],
    );
  }

  /**
   * Get tokens created by a specific wallet.
   */
  async getTokensByCreator(
    wallet: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ tokens: Token[]; total: number }> {
    const limit = Math.min(opts.limit || 20, 100);
    const offset = opts.offset || 0;
    const normalized = wallet.toLowerCase();

    const tokens = await this.db.queryRows<Token>(
      `SELECT t.*,
        CASE WHEN al.id IS NOT NULL THEN true ELSE false END AS is_agent,
        a.name AS agent_name,
        a.agent_id AS agent_uuid
       FROM tokens t
       LEFT JOIN agent_launches al ON al.token_address = t.contract_address
       LEFT JOIN agents a ON a.id = al.agent_id
       WHERE t.creator_wallet = $1
         AND ${publicFactoryClause('t', 2)}
       ORDER BY t.created_at DESC LIMIT $3 OFFSET $4`,
      [normalized, this.publicFactories(), limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM tokens t
       WHERE t.creator_wallet = $1 AND ${publicFactoryClause('t', 2)}`,
      [normalized, this.publicFactories()],
    );

    return {
      tokens,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Get top holders for a token (computed from trades + AMM swaps).
   * GET /tokens/:address/holders?limit=20
   */
  async getTokenHolders(
    address: string,
    opts: { limit?: number } = {},
  ): Promise<{ holders: Holder[]; total: number }> {
    const limit = Math.min(opts.limit || 20, 100);
    const normalized = address.toLowerCase();

    const holders = await this.db.queryRows<Holder>(
      `WITH activity AS (
         SELECT tr.wallet, tr.type, tr.token_amount, tr.timestamp
         FROM trades tr JOIN tokens t ON tr.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN s.to_address ELSE s.sender END,
                CASE WHEN s.is_buy THEN 'buy' ELSE 'sell' END,
                CASE WHEN s.is_buy THEN s.token_out ELSE s.token_in END,
                s.timestamp
         FROM amm_swaps s JOIN tokens t ON s.token_id = t.id
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
       ), balances AS (
         SELECT wallet,
                SUM(CASE WHEN type = 'buy' THEN token_amount ELSE -token_amount END) AS balance,
                MAX(timestamp) AS last_activity_at,
                COUNT(*) FILTER (WHERE type = 'buy')::int AS buy_count,
                COUNT(*) FILTER (WHERE type = 'sell')::int AS sell_count
         FROM activity GROUP BY wallet
         HAVING SUM(CASE WHEN type = 'buy' THEN token_amount ELSE -token_amount END) > 0
       )
       SELECT h.wallet,
              h.balance::text AS balance,
              h.percentage::text AS percentage,
              h.last_activity_at::text,
              h.buy_count,
              h.sell_count,
              ws.tier AS wallet_tier,
              CASE WHEN ws.suspicious_activity THEN 'Unranked' ELSE INITCAP(ws.tier) END AS wallet_tier_label,
              ws.calculated_at::text AS wallet_tier_calculated_at
       FROM (
         SELECT balances.*,
                balance * 100.0 / NULLIF(SUM(balance) OVER (), 0) AS percentage
         FROM balances
       ) h
        LEFT JOIN wallet_stats ws ON ws.wallet = h.wallet
       ORDER BY h.balance DESC
       LIMIT $3`,
      [normalized, this.publicFactories(), limit],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM (
         SELECT wallet, SUM(balance) AS bal
         FROM (
           SELECT tr.wallet,
                  CASE WHEN tr.type = 'buy' THEN tr.token_amount
                       ELSE -tr.token_amount END AS balance
           FROM trades tr
           JOIN tokens t ON tr.token_id = t.id
           WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}
           UNION ALL
           SELECT s.to_address, s.token_out FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = true AND ${publicFactoryClause('t', 2)}
           UNION ALL
           SELECT s.sender, -s.token_in FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = false AND ${publicFactoryClause('t', 2)}
         ) x
         GROUP BY wallet
         HAVING SUM(balance) > 0
       ) h`,
      [normalized, this.publicFactories()],
    );

    return {
      holders,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Global platform stats for the landing page.
   * GET /tokens/stats
   * Returns total tokens, 24h volume, and graduated count.
   * Cached for 30s.
   */
  async getPlatformStats(): Promise<{
    total_tokens: number;
    active_tokens: number;
    graduated_tokens: number;
    volume_24h: string;
  }> {
    const cacheKey = `stats:platform:${this.scopeCacheKey()}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // fall through to DB query
      }
    }

    const result = await this.db.query(`
      SELECT
        (SELECT COUNT(*)::int FROM tokens t WHERE ${publicFactoryClause('t', 1)}) AS total_tokens,
        (SELECT COUNT(*)::int FROM tokens t WHERE status = 'active' AND ${publicFactoryClause('t', 1)}) AS active_tokens,
        (SELECT COUNT(*)::int FROM tokens t WHERE status = 'graduated' AND ${publicFactoryClause('t', 1)}) AS graduated_tokens,
        (SELECT COALESCE(SUM(activity.volume_raw::numeric), 0)::text
         FROM (
           SELECT tr.usdc_amount AS volume_raw, tr.token_id
           FROM trades tr
           WHERE tr.timestamp >= NOW() - INTERVAL '24 hours'
           UNION ALL
           SELECT CASE WHEN swap.is_buy THEN swap.usdc_in ELSE swap.usdc_out END AS volume_raw,
                  swap.token_id
           FROM amm_swaps swap
           WHERE swap.timestamp >= NOW() - INTERVAL '24 hours'
         ) AS activity
         JOIN tokens t ON t.id = activity.token_id
         WHERE ${publicFactoryClause('t', 1)}) AS volume_24h_micro
    `, [this.publicFactories()]);

    const micro = BigInt(result.rows[0]?.volume_24h_micro || '0');
    const volumeDollars = (Number(micro) / 1e6).toFixed(6);

    const stats = {
      total_tokens: result.rows[0]?.total_tokens || 0,
      active_tokens: result.rows[0]?.active_tokens || 0,
      graduated_tokens: result.rows[0]?.graduated_tokens || 0,
      volume_24h: volumeDollars,
    };

    await this.redis.set(cacheKey, JSON.stringify(stats), 10);
    return stats;
  }
}

export interface Holder {
  wallet: string;
  balance: string;       // 18-dec token amount (as string — BigInt-safe)
  percentage: string;    // 0-100, as string
  last_activity_at: string;
  buy_count: number;
  sell_count: number;
  wallet_tier: 'shrimp' | 'fish' | 'dolphin' | 'whale' | null;
  wallet_tier_label: string | null;
  wallet_tier_calculated_at: string | null;
}
