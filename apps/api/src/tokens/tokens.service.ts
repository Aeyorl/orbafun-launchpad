import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

export interface Token {
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
}

export type SortOption = 'newest' | 'market_cap' | 'volume';
export type StatusFilter = 'active' | 'graduated' | 'all';

@Injectable()
export class TokensService {
  private readonly logger = new Logger(TokensService.name);
  private readonly CACHE_TTL = 10; // seconds

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  /**
   * Cron task running every 60s to refresh 24h rolling volume window
   * across all active tokens and clear cached token lists.
   */
  @Cron('*/60 * * * * *')
  async refreshVolume24h(): Promise<void> {
    try {
      await this.db.query(`SELECT refresh_volume_24h()`);
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
    const cacheKey = `tokens:list:${sort}:${status}:${isAgent || ''}:${limit}:${offset}:${search || ''}`;
    const cached = await this.redis.getJson<{ tokens: Token[]; total: number }>(cacheKey);
    if (cached) return cached;

    // Build query
    const orderClause = {
      newest: 'ORDER BY t.created_at DESC',
      market_cap: 'ORDER BY t.market_cap DESC',
      volume: 'ORDER BY t.volume_24h DESC',
    }[sort];

    // Build WHERE clauses and params with correct $N indexing
    const filterParams: (string | number)[] = [];
    let paramIdx = 1;

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
      WHERE 1=1 ${statusClause} ${searchClause} ${agentClause}
      ${orderClause}
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const countQuery = `
      SELECT COUNT(*) as total
      FROM tokens t
      LEFT JOIN agent_launches al ON al.token_address = t.contract_address
      WHERE 1=1 ${statusClause} ${searchClause} ${agentClause}
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
    const cacheKey = `token:${normalized}`;
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
       WHERE t.contract_address = $1`,
      [normalized],
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
      `SELECT tr.*
       FROM trades tr
       JOIN tokens t ON tr.token_id = t.id
       WHERE t.contract_address = $1
       ORDER BY tr.timestamp ${order === 'desc' ? 'DESC' : 'ASC'}
       LIMIT $2 OFFSET $3`,
      [normalized, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total
       FROM trades tr
       JOIN tokens t ON tr.token_id = t.id
       WHERE t.contract_address = $1`,
      [normalized],
    );

    return {
      trades,
      total: parseInt(countResult?.total || '0', 10),
    };
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
       ORDER BY t.created_at DESC LIMIT $2 OFFSET $3`,
      [normalized, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total FROM tokens WHERE creator_wallet = $1`,
      [normalized],
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
      `SELECT h.wallet,
              h.balance::text AS balance,
              h.percentage::text AS percentage
       FROM (
         SELECT wallet,
                SUM(balance) AS balance,
                SUM(balance) * 100.0 / NULLIF(SUM(SUM(balance)) OVER (), 0) AS percentage
         FROM (
           SELECT tr.wallet,
                  CASE WHEN tr.type = 'buy' THEN tr.token_amount
                       ELSE -tr.token_amount END AS balance
           FROM trades tr
           JOIN tokens t ON tr.token_id = t.id
           WHERE t.contract_address = $1
           UNION ALL
           SELECT s.to_address AS wallet, s.token_out AS balance
           FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = true
           UNION ALL
           SELECT s.sender AS wallet, -s.token_in AS balance
           FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = false
         ) x
         GROUP BY wallet
         HAVING SUM(balance) > 0
       ) h
       ORDER BY h.balance DESC
       LIMIT $2`,
      [normalized, limit],
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
           WHERE t.contract_address = $1
           UNION ALL
           SELECT s.to_address, s.token_out FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = true
           UNION ALL
           SELECT s.sender, -s.token_in FROM amm_swaps s
           JOIN tokens t ON s.token_id = t.id
           WHERE t.contract_address = $1 AND s.is_buy = false
         ) x
         GROUP BY wallet
         HAVING SUM(balance) > 0
       ) h`,
      [normalized],
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
    const cacheKey = 'stats:platform';
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
        (SELECT COUNT(*)::int FROM tokens) AS total_tokens,
        (SELECT COUNT(*)::int FROM tokens WHERE status = 'active') AS active_tokens,
        (SELECT COUNT(*)::int FROM tokens WHERE status = 'graduated') AS graduated_tokens,
        (SELECT COALESCE(SUM(usdc_amount::bigint), 0)::text FROM trades WHERE timestamp >= NOW() - INTERVAL '24 hours') AS volume_24h_micro
    `);

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
}
