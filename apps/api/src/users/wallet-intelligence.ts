import { DatabaseService } from '../database/database.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

export type WalletTier = 'shrimp' | 'fish' | 'dolphin' | 'whale';

export interface WalletTierInputs {
  portfolioValueMicroUsdc: bigint;
  volume30dMicroUsdc: bigint;
  largestTradeMicroUsdc: bigint;
  confirmedTradeCount: number;
}

const MICRO_USDC = 1_000_000n;

function threshold(name: string, fallbackUsdc: bigint): bigint {
  const value = process.env[name];
  if (!value) return fallbackUsdc * MICRO_USDC;
  if (!/^\d+(\.\d{1,6})?$/.test(value)) {
    throw new Error(`${name} must be a non-negative USDC amount with at most 6 decimals`);
  }
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * MICRO_USDC + BigInt(fraction.padEnd(6, '0'));
}

export function classifyWallet(inputs: WalletTierInputs): WalletTier {
  const thresholds = {
    whale: {
      portfolio: threshold('WALLET_TIER_WHALE_PORTFOLIO_USDC', 10_000n),
      volume: threshold('WALLET_TIER_WHALE_VOLUME_30D_USDC', 50_000n),
      trade: threshold('WALLET_TIER_WHALE_LARGEST_TRADE_USDC', 5_000n),
    },
    dolphin: {
      portfolio: threshold('WALLET_TIER_DOLPHIN_PORTFOLIO_USDC', 2_500n),
      volume: threshold('WALLET_TIER_DOLPHIN_VOLUME_30D_USDC', 10_000n),
      trade: threshold('WALLET_TIER_DOLPHIN_LARGEST_TRADE_USDC', 1_000n),
    },
    fish: {
      portfolio: threshold('WALLET_TIER_FISH_PORTFOLIO_USDC', 250n),
      volume: threshold('WALLET_TIER_FISH_VOLUME_30D_USDC', 1_000n),
      trade: threshold('WALLET_TIER_FISH_LARGEST_TRADE_USDC', 100n),
    },
  };
  const qualifies = (tier: keyof typeof thresholds, requireHistory: boolean) => {
    const target = thresholds[tier];
    return (
      inputs.portfolioValueMicroUsdc >= target.portfolio ||
      (!requireHistory || inputs.confirmedTradeCount >= 3) &&
        (inputs.volume30dMicroUsdc >= target.volume ||
          inputs.largestTradeMicroUsdc >= target.trade)
    );
  };

  if (qualifies('whale', true)) return 'whale';
  if (qualifies('dolphin', true)) return 'dolphin';
  if (qualifies('fish', false)) return 'fish';
  return 'shrimp';
}

export function classifyWalletForRanking(
  inputs: WalletTierInputs,
  suspiciousActivity: boolean,
): WalletTier {
  return suspiciousActivity ? 'shrimp' : classifyWallet(inputs);
}

export async function refreshWalletStats(
  db: DatabaseService,
  wallet: string,
): Promise<void> {
  const normalized = wallet.toLowerCase();
  const metrics = await db.queryOne<any>(
    `WITH wallet_activity AS (
       SELECT token_id, type, gross_usdc_amount AS usdc_amount, timestamp
       FROM trades tr JOIN tokens t ON t.id = tr.token_id
       WHERE tr.wallet = $1 AND ${publicFactoryClause('t', 2)}
       UNION ALL
       SELECT token_id,
              CASE WHEN is_buy THEN 'buy' ELSE 'sell' END,
              CASE WHEN is_buy THEN usdc_in ELSE usdc_out END,
              timestamp
       FROM amm_swaps s JOIN tokens t ON t.id = s.token_id
       WHERE ((s.is_buy AND s.to_address = $1) OR (NOT s.is_buy AND s.sender = $1))
         AND ${publicFactoryClause('t', 2)}
     ), position_metrics AS (
       SELECT
         COALESCE(SUM(ROUND(p.quantity_base_units * t.price * 1000000 / 1000000000000000000)), 0) AS portfolio_value,
         COALESCE(SUM(p.realized_pnl_usdc), 0) AS realized_pnl,
         COALESCE(SUM(ROUND(p.quantity_base_units * t.price * 1000000 / 1000000000000000000) - p.remaining_cost_usdc), 0) AS unrealized_pnl,
         COUNT(*) FILTER (WHERE p.quantity_base_units > 0) AS open_positions,
         COUNT(*) FILTER (WHERE p.quantity_base_units = 0 AND p.buy_count + p.sell_count > 0) AS closed_positions,
         COUNT(*) FILTER (WHERE p.quantity_base_units = 0 AND p.realized_pnl_usdc > 0) AS profitable_positions,
         MIN(p.opened_at) AS first_seen_at,
         MAX(p.last_activity_at) AS last_active_at
       FROM wallet_token_positions p
       JOIN tokens t ON t.id = p.token_id
       WHERE p.wallet = $1 AND ${publicFactoryClause('t', 2)}
     )
     SELECT
       p.*,
       COALESCE((SELECT suspicious_activity FROM wallet_stats WHERE wallet = $1), FALSE) AS suspicious_activity,
       COALESCE(SUM(a.usdc_amount) FILTER (WHERE a.timestamp >= NOW() - INTERVAL '7 days'), 0) AS volume_7d,
       COALESCE(SUM(a.usdc_amount) FILTER (WHERE a.timestamp >= NOW() - INTERVAL '30 days'), 0) AS volume_30d,
       COALESCE(SUM(a.usdc_amount), 0) AS lifetime_volume,
       COALESCE(MAX(a.usdc_amount), 0) AS largest_trade,
       COUNT(*) FILTER (WHERE a.type = 'buy') AS buy_count,
       COUNT(*) FILTER (WHERE a.type = 'sell') AS sell_count,
       COUNT(DISTINCT a.token_id) AS distinct_tokens_traded,
       COUNT(a.token_id) AS trade_count
     FROM position_metrics p
     LEFT JOIN wallet_activity a ON true
     GROUP BY p.portfolio_value, p.realized_pnl, p.unrealized_pnl,
              p.open_positions, p.closed_positions, p.profitable_positions,
              p.first_seen_at, p.last_active_at`,
    [normalized, getPublicFactoryAddresses()],
  );
  if (!metrics) return;

  const tier = classifyWalletForRanking({
    portfolioValueMicroUsdc: BigInt(metrics.portfolio_value),
    volume30dMicroUsdc: BigInt(metrics.volume_30d),
    largestTradeMicroUsdc: BigInt(metrics.largest_trade),
    confirmedTradeCount: Number(metrics.trade_count),
  }, Boolean(metrics.suspicious_activity));

  await db.query(
    `INSERT INTO wallet_stats (
       wallet, tier, portfolio_value_usdc, realized_pnl_usdc,
       unrealized_pnl_usdc, volume_7d_usdc, volume_30d_usdc,
       lifetime_volume_usdc, largest_trade_usdc, buy_count, sell_count,
       distinct_tokens_traded, open_positions, closed_positions,
       profitable_positions, first_seen_at, last_active_at, factory_scope, calculated_at
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW()
     )
     ON CONFLICT (wallet) DO UPDATE SET
       tier = EXCLUDED.tier,
       portfolio_value_usdc = EXCLUDED.portfolio_value_usdc,
       realized_pnl_usdc = EXCLUDED.realized_pnl_usdc,
       unrealized_pnl_usdc = EXCLUDED.unrealized_pnl_usdc,
       volume_7d_usdc = EXCLUDED.volume_7d_usdc,
       volume_30d_usdc = EXCLUDED.volume_30d_usdc,
       lifetime_volume_usdc = EXCLUDED.lifetime_volume_usdc,
       largest_trade_usdc = EXCLUDED.largest_trade_usdc,
       buy_count = EXCLUDED.buy_count,
       sell_count = EXCLUDED.sell_count,
       distinct_tokens_traded = EXCLUDED.distinct_tokens_traded,
       open_positions = EXCLUDED.open_positions,
       closed_positions = EXCLUDED.closed_positions,
       profitable_positions = EXCLUDED.profitable_positions,
       first_seen_at = EXCLUDED.first_seen_at,
       last_active_at = EXCLUDED.last_active_at,
       factory_scope = EXCLUDED.factory_scope,
       calculated_at = NOW()`,
    [
      normalized,
      tier,
      metrics.portfolio_value,
      metrics.realized_pnl,
      metrics.unrealized_pnl,
      metrics.volume_7d,
      metrics.volume_30d,
      metrics.lifetime_volume,
      metrics.largest_trade,
      Number(metrics.buy_count),
      Number(metrics.sell_count),
      Number(metrics.distinct_tokens_traded),
      Number(metrics.open_positions),
      Number(metrics.closed_positions),
      Number(metrics.profitable_positions),
      metrics.first_seen_at,
      metrics.last_active_at,
      getPublicFactoryAddresses().join(','),
    ],
  );
}
