import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { TokensService } from '../tokens/tokens.service';
import { refreshWalletStats } from './wallet-intelligence';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

export interface UserHolding {
  token: Record<string, unknown>;
  balance: string;
  value_usdc: string;
  total_bought_usdc: string;
  total_sold_usdc: string;
  remaining_cost_usdc: string;
  realized_pnl_usdc: string;
  unrealized_pnl_usdc: string;
  total_pnl_usdc: string;
  roi_pct: string | null;
  basis_status: 'complete' | 'incomplete';
}

export interface UserProfile {
  wallet: string;
  username: string | null;
  referral_slug: string | null;
  avatar: string | null;
  tokens_launched: number;
  total_volume_usdc: string;
  created_at: string;
  launched_tokens: { tokens: any[]; total: number };
  trade_stats: {
    total_trades: number;
    total_buys: number;
    total_sells: number;
    total_usdc_volume: string;
  };
}

type PnlPeriod = '7d' | '30d' | 'all';
type PositionStatus = 'open' | 'closed' | 'all';

@Injectable()
export class UsersService {
  private readonly CACHE_TTL = 30;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
    private tokensService: TokensService,
  ) {}

  private scopeCacheKey(): string {
    return getPublicFactoryAddresses().join(',');
  }

  async getUserProfile(wallet: string): Promise<UserProfile | null> {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user:${this.scopeCacheKey()}:${normalized}`;
    const cached = await this.redis.getJson<UserProfile>(cacheKey);
    if (cached) return cached;

    const user = await this.db.queryOne<any>(
      `SELECT * FROM users WHERE wallet = $1`,
      [normalized],
    );
    if (!user) return null;

    const launchedTokens = await this.tokensService.getTokensByCreator(normalized, {
      limit: 100,
      offset: 0,
    });
    const tradeStats = await this.db.queryOne<any>(
      `WITH activity AS (
         SELECT tr.type, tr.gross_usdc_amount AS usdc_amount
         FROM trades tr JOIN tokens t ON t.id = tr.token_id
         WHERE tr.wallet = $1 AND ${publicFactoryClause('t', 2)}
         UNION ALL
         SELECT CASE WHEN s.is_buy THEN 'buy' ELSE 'sell' END,
                CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END
         FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
         WHERE ((s.is_buy AND s.to_address = $1) OR (NOT s.is_buy AND s.sender = $1))
           AND ${publicFactoryClause('t', 2)}
       )
       SELECT
         COUNT(*) AS total_trades,
         COUNT(*) FILTER (WHERE type = 'buy') AS total_buys,
         COUNT(*) FILTER (WHERE type = 'sell') AS total_sells,
         COALESCE(SUM(usdc_amount), 0) AS total_usdc_volume
       FROM activity`,
      [normalized, getPublicFactoryAddresses()],
    );

    const profile: UserProfile = {
      wallet: user.wallet,
      username: user.username,
      referral_slug: user.referral_slug,
      avatar: user.avatar,
      tokens_launched: launchedTokens.total,
      total_volume_usdc: tradeStats?.total_usdc_volume?.toString() || '0',
      created_at: user.created_at,
      launched_tokens: launchedTokens,
      trade_stats: {
        total_trades: Number(tradeStats?.total_trades || 0),
        total_buys: Number(tradeStats?.total_buys || 0),
        total_sells: Number(tradeStats?.total_sells || 0),
        total_usdc_volume: tradeStats?.total_usdc_volume?.toString() || '0',
      },
    };

    await this.redis.setJson(cacheKey, profile, this.CACHE_TTL);
    return profile;
  }

  async updateProfile(wallet: string, input: { username: string }) {
    const normalizedWallet = wallet.toLowerCase();
    if (typeof input.username !== 'string') {
      throw new BadRequestException('username is required');
    }
    const username = input.username.trim().replace(/^@/, '');
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{2,31}$/.test(username)) {
      throw new BadRequestException(
        'Username must be 3-32 letters, numbers, underscores, or hyphens',
      );
    }
    const referralSlug = username.toLowerCase().replaceAll('_', '-');

    const reservedPartner = await this.db.queryOne<{ wallet: string }>(
      `SELECT wallet FROM referral_partners WHERE code = $1`,
      [referralSlug],
    );
    if (reservedPartner && reservedPartner.wallet !== normalizedWallet) {
      throw new ConflictException('That username is already in use');
    }
    const reservedAlias = await this.db.queryOne<{ wallet: string }>(
      `SELECT wallet FROM user_referral_aliases WHERE slug = $1`,
      [referralSlug],
    );
    if (reservedAlias && reservedAlias.wallet !== normalizedWallet) {
      throw new ConflictException('That username is already in use');
    }

    await this.db.query(
      `INSERT INTO users (wallet) VALUES ($1) ON CONFLICT (wallet) DO NOTHING`,
      [normalizedWallet],
    );
    try {
      const current = await this.db.queryOne<{ referral_slug: string | null }>(
        `SELECT referral_slug FROM users WHERE wallet = $1`,
        [normalizedWallet],
      );
      if (current?.referral_slug && current.referral_slug !== referralSlug) {
        await this.db.query(
          `INSERT INTO user_referral_aliases (slug, wallet)
           VALUES ($1, $2)
           ON CONFLICT (slug) DO NOTHING`,
          [current.referral_slug, normalizedWallet],
        );
      }
      const updated = await this.db.queryOne<{
        wallet: string;
        username: string;
        referral_slug: string;
      }>(
        `UPDATE users
         SET username = $2, referral_slug = $3
         WHERE wallet = $1
         RETURNING wallet, username, referral_slug`,
        [normalizedWallet, username, referralSlug],
      );
      await this.redis.del(`user:${normalizedWallet}`);
      return updated;
    } catch (err: any) {
      if (err?.code === '23505') {
        throw new ConflictException('That username is already in use');
      }
      throw err;
    }
  }

  async getWalletStats(wallet: string) {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user-stats:${this.scopeCacheKey()}:${normalized}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const scope = this.scopeCacheKey();
    let stats = await this.db.queryOne<any>(
      `SELECT * FROM wallet_stats WHERE wallet = $1 AND factory_scope = $2`,
      [normalized, scope],
    );
    if (!stats) {
      await refreshWalletStats(this.db, normalized);
      stats = await this.db.queryOne<any>(
        `SELECT * FROM wallet_stats WHERE wallet = $1 AND factory_scope = $2`,
        [normalized, scope],
      );
    }

    const result = stats
      ? { ...stats, basis: 'orba_activity', amount_unit: 'micro_usdc' }
      : null;
    if (result) await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async getWalletTier(wallet: string) {
    const stats = await this.getWalletStats(wallet);
    if (!stats) return null;
    return {
      key: stats.tier,
      label: stats.suspicious_activity
        ? 'Unranked'
        : stats.tier.charAt(0).toUpperCase() + stats.tier.slice(1),
      basis: 'orba_activity',
      calculated_at: stats.calculated_at,
    };
  }

  async getUserPnl(wallet: string, period: PnlPeriod) {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user-pnl:${this.scopeCacheKey()}:${normalized}:${period}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const allTime = await this.db.queryOne<any>(
      `SELECT
         COALESCE(SUM(p.realized_pnl_usdc), 0) AS realized_pnl,
         COALESCE(SUM(p.cost_of_tokens_sold_usdc), 0) AS realized_cost,
         COALESCE(SUM(p.remaining_cost_usdc), 0) AS remaining_cost,
         COALESCE(SUM(ROUND(p.quantity_base_units * t.price * 1000000 / 1000000000000000000)), 0) AS portfolio_value,
         COALESCE(SUM(p.total_bought_usdc), 0) AS total_bought,
         COALESCE(SUM(p.total_sold_usdc), 0) AS total_sold,
         COALESCE(SUM(p.buy_count), 0) AS buy_count,
         COALESCE(SUM(p.sell_count), 0) AS sell_count,
         COUNT(*) FILTER (WHERE p.quantity_base_units > 0) AS open_positions,
         COUNT(*) FILTER (WHERE p.quantity_base_units = 0 AND p.buy_count + p.sell_count > 0) AS closed_positions,
         COUNT(*) FILTER (WHERE p.quantity_base_units = 0 AND p.realized_pnl_usdc > 0) AS profitable_closed_positions,
         BOOL_OR(p.basis_status = 'incomplete') AS has_incomplete_basis,
         MAX(p.updated_at) AS calculated_at
       FROM wallet_token_positions p
       JOIN tokens t ON t.id = p.token_id
       WHERE p.wallet = $1 AND ${publicFactoryClause('t', 2)}`,
      [normalized, getPublicFactoryAddresses()],
    );

    let realized = BigInt(allTime?.realized_pnl || '0');
    let realizedCost = BigInt(allTime?.realized_cost || '0');
    if (period !== 'all') {
      const interval = period === '7d' ? '7 days' : '30 days';
      const periodResult = await this.db.queryOne<any>(
        `WITH realized_events AS (
           SELECT tr.realized_pnl_usdc, tr.allocated_cost_usdc, tr.timestamp
           FROM trades tr JOIN tokens t ON t.id = tr.token_id
           WHERE tr.wallet = $1 AND tr.type = 'sell' AND ${publicFactoryClause('t', 3)}
           UNION ALL
           SELECT s.realized_pnl_usdc, s.allocated_cost_usdc, s.timestamp
           FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
           WHERE s.sender = $1 AND NOT s.is_buy AND ${publicFactoryClause('t', 3)}
         )
         SELECT
           COALESCE(SUM(realized_pnl_usdc), 0) AS realized_pnl,
           COALESCE(SUM(allocated_cost_usdc), 0) AS realized_cost
         FROM realized_events
         WHERE timestamp >= NOW() - $2::interval`,
        [normalized, interval, getPublicFactoryAddresses()],
      );
      realized = BigInt(periodResult?.realized_pnl || '0');
      realizedCost = BigInt(periodResult?.realized_cost || '0');
    }

    const remainingCost = BigInt(allTime?.remaining_cost || '0');
    const portfolioValue = BigInt(allTime?.portfolio_value || '0');
    const unrealized = portfolioValue - remainingCost;
    const total = realized + unrealized;
    const incomplete = Boolean(allTime?.has_incomplete_basis);
    const includeUnrealized = period === 'all';
    const result = {
      wallet: normalized,
      period,
      period_semantics: period === 'all' ? 'all_time_position_accounting' : 'realized_events_in_period',
      currency: 'USDC',
      amount_unit: 'micro_usdc',
      realized_pnl: realized.toString(),
      unrealized_pnl: includeUnrealized ? unrealized.toString() : null,
      total_pnl: includeUnrealized ? total.toString() : null,
      realized_roi_pct: incomplete ? null : formatPercentage(realized, realizedCost),
      unrealized_roi_pct:
        incomplete || !includeUnrealized
          ? null
          : formatPercentage(unrealized, remainingCost),
      total_roi_pct:
        incomplete || !includeUnrealized
          ? null
          : formatPercentage(total, realizedCost + remainingCost),
      portfolio_value: portfolioValue.toString(),
      remaining_cost_basis: remainingCost.toString(),
      total_bought: allTime?.total_bought?.toString() || '0',
      total_sold: allTime?.total_sold?.toString() || '0',
      buy_count: Number(allTime?.buy_count || 0),
      sell_count: Number(allTime?.sell_count || 0),
      open_positions: Number(allTime?.open_positions || 0),
      closed_positions: Number(allTime?.closed_positions || 0),
      profitable_closed_positions: Number(allTime?.profitable_closed_positions || 0),
      basis_status: incomplete ? 'incomplete' : 'complete',
      basis_scope: 'indexed_orba_trades',
      calculated_at: allTime?.calculated_at || new Date().toISOString(),
    };

    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }

  async getUserPositions(
    wallet: string,
    status: PositionStatus,
    limit: number,
    offset: number,
  ) {
    const normalized = wallet.toLowerCase();
    const statusSql =
      status === 'open'
        ? 'AND p.quantity_base_units > 0'
        : status === 'closed'
          ? 'AND p.quantity_base_units = 0 AND p.buy_count + p.sell_count > 0'
          : '';
    const rows = await this.db.queryRows<any>(
      `SELECT
         p.*, t.contract_address, t.curve_address, t.amm_pair_address,
         t.creator_wallet, t.name, t.symbol, t.description, t.image,
         t.price::text, t.market_cap::text, t.volume_24h::text, t.status,
         t.created_at,
         ROUND(p.quantity_base_units * t.price * 1000000 / 1000000000000000000)::text AS current_value_usdc,
         CASE WHEN p.quantity_base_units > 0
           THEN (p.remaining_cost_usdc::numeric * 1000000000000 / p.quantity_base_units)::numeric(38,18)::text
           ELSE NULL END AS average_entry_price
       FROM wallet_token_positions p
       JOIN tokens t ON t.id = p.token_id
       WHERE p.wallet = $1 AND ${publicFactoryClause('t', 2)} ${statusSql}
       ORDER BY p.last_activity_at DESC
       LIMIT $3 OFFSET $4`,
      [normalized, getPublicFactoryAddresses(), limit, offset],
    );
    const count = await this.db.queryOne<any>(
      `SELECT COUNT(*) AS total FROM wallet_token_positions p
       JOIN tokens t ON t.id = p.token_id
       WHERE p.wallet = $1 AND ${publicFactoryClause('t', 2)} ${statusSql}`,
      [normalized, getPublicFactoryAddresses()],
    );

    return {
      positions: rows.map((row) => serializePosition(row)),
      total: Number(count?.total || 0),
      limit,
      offset,
    };
  }

  async getUserPosition(wallet: string, tokenAddress: string) {
    const row = await this.db.queryOne<any>(
      `SELECT
         p.*, t.contract_address, t.curve_address, t.amm_pair_address,
         t.creator_wallet, t.name, t.symbol, t.description, t.image,
         t.price::text, t.market_cap::text, t.volume_24h::text, t.status,
         t.created_at,
         ROUND(p.quantity_base_units * t.price * 1000000 / 1000000000000000000)::text AS current_value_usdc,
         CASE WHEN p.quantity_base_units > 0
           THEN (p.remaining_cost_usdc::numeric * 1000000000000 / p.quantity_base_units)::numeric(38,18)::text
           ELSE NULL END AS average_entry_price
       FROM wallet_token_positions p
       JOIN tokens t ON t.id = p.token_id
       WHERE p.wallet = $1 AND t.contract_address = $2
         AND ${publicFactoryClause('t', 3)}`,
      [wallet.toLowerCase(), tokenAddress.toLowerCase(), getPublicFactoryAddresses()],
    );
    return row ? serializePosition(row) : null;
  }

  async getUserHoldings(
    wallet: string,
  ): Promise<{ holdings: UserHolding[]; total_value_usdc: string }> {
    const normalized = wallet.toLowerCase();
    const cacheKey = `user-holdings:${this.scopeCacheKey()}:${normalized}`;
    const cached = await this.redis.getJson<any>(cacheKey);
    if (cached) return cached;

    const positions = await this.getUserPositions(normalized, 'open', 500, 0);
    let totalValue = 0n;
    const holdings: UserHolding[] = positions.positions.map((position: any) => {
      totalValue += BigInt(position.current_value_usdc);
      return {
        token: position.token,
        balance: position.quantity_base_units,
        value_usdc: position.current_value_usdc,
        total_bought_usdc: position.total_bought_usdc,
        total_sold_usdc: position.total_sold_usdc,
        remaining_cost_usdc: position.remaining_cost_usdc,
        realized_pnl_usdc: position.realized_pnl_usdc,
        unrealized_pnl_usdc: position.unrealized_pnl_usdc,
        total_pnl_usdc: position.total_pnl_usdc,
        roi_pct: position.total_roi_pct,
        basis_status: position.basis_status,
      };
    });
    const result = { holdings, total_value_usdc: totalValue.toString() };
    await this.redis.setJson(cacheKey, result, this.CACHE_TTL);
    return result;
  }
}

function serializePosition(row: any) {
  const currentValue = BigInt(row.current_value_usdc || '0');
  const remainingCost = BigInt(row.remaining_cost_usdc || '0');
  const realized = BigInt(row.realized_pnl_usdc || '0');
  const unrealized = currentValue - remainingCost;
  const total = realized + unrealized;
  const denominator = BigInt(row.cost_of_tokens_sold_usdc || '0') + remainingCost;
  const incomplete = row.basis_status === 'incomplete';
  return {
    token: {
      id: row.token_id,
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
      status: row.status,
      created_at: row.created_at,
    },
    quantity_base_units: row.quantity_base_units.toString(),
    current_value_usdc: currentValue.toString(),
    remaining_cost_usdc: remainingCost.toString(),
    cost_of_tokens_sold_usdc: row.cost_of_tokens_sold_usdc.toString(),
    net_sale_proceeds_usdc: row.net_sale_proceeds_usdc.toString(),
    realized_pnl_usdc: realized.toString(),
    unrealized_pnl_usdc: unrealized.toString(),
    total_pnl_usdc: total.toString(),
    total_bought_usdc: row.total_bought_usdc.toString(),
    total_sold_usdc: row.total_sold_usdc.toString(),
    average_entry_price: row.average_entry_price,
    current_price: row.price,
    realized_roi_pct: incomplete
      ? null
      : formatPercentage(realized, BigInt(row.cost_of_tokens_sold_usdc || '0')),
    unrealized_roi_pct: incomplete
      ? null
      : formatPercentage(unrealized, remainingCost),
    total_roi_pct: incomplete ? null : formatPercentage(total, denominator),
    buy_count: Number(row.buy_count),
    sell_count: Number(row.sell_count),
    opened_at: row.opened_at,
    closed_at: row.closed_at,
    last_activity_at: row.last_activity_at,
    basis_status: row.basis_status,
    basis_scope: 'indexed_orba_trades',
  };
}

function formatPercentage(numerator: bigint, denominator: bigint): string | null {
  if (denominator === 0n) return null;
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const scaled = (absolute * 1_000_000n + denominator / 2n) / denominator;
  const whole = scaled / 10_000n;
  const fraction = (scaled % 10_000n).toString().padStart(4, '0');
  return `${negative ? '-' : ''}${whole}.${fraction}`;
}
