import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

/**
 * OHLCV candle data for the trading terminal chart.
 * Aggregated server-side from the `trades` table.
 */
export interface OhlcvCandle {
  timestamp: number;   // UTC Unix seconds (bucket start)
  open: number;        // Price or market cap (depending on mode)
  high: number;
  low: number;
  close: number;
  volume: number;      // USDC volume in dollars (divided by 1e6)
}

// Support both lowercase ('10s', '1m', '5m', '15m', '30m', '1h', '4h', '1d')
// and uppercase ('1H', '4H', '1D') timeframe strings.
export type CandleTimeframe =
  | '10s' | '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d'
  | '1H' | '4H' | '1D';

const TIMEFRAME_SECONDS: Record<string, number> = {
  '10s': 10,
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,  '1H': 3600,
  '4h': 14400, '4H': 14400,
  '1d': 86400, '1D': 86400,
};

/** Default lookback windows per timeframe (in seconds) */
const TIMEFRAME_WINDOW: Record<string, number> = {
  '10s': 1800,         // 30 minutes
  '1m': 3600,          // 1 hour
  '5m': 21600,         // 6 hours
  '15m': 86400,        // 24 hours
  '30m': 172800,       // 48 hours
  '1h': 604800,  '1H': 604800,   // 7 days
  '4h': 2592000, '4H': 2592000,  // 30 days
  '1d': 31536000,'1D': 31536000, // 365 days
};

@Injectable()
export class CandlesService {
  private readonly logger = new Logger(CandlesService.name);

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  /**
   * Get OHLCV candles for a token.
   *
   * Database Schema Alignment:
   *   trades table:
   *     token_id (bigint) -> tokens.id
   *     price (numeric(20,6)) -> USDC per token
   *     market_cap_after (numeric(20,6)) -> Market cap in USDC dollars
   *     usdc_amount (bigint) -> 6-decimal micro-USDC (divided by 1e6 for volume in dollars)
   *     timestamp (timestamptz) -> UTC
   *     log_index (integer) -> log ordering
   *
   * Handling Edge Cases:
   *   1. Zero trades: Returns empty array []. No manufactured fake candles.
   *   2. Sparse / Gappy trades: Aggregates trade buckets from earliest trade to now,
   *      filling missing buckets with flat candles (open = high = low = close = prevClose, volume = 0).
   *   3. Timezone: All timestamps kept strictly as UTC Unix epoch seconds.
   */
  async getCandles(
    tokenAddress: string,
    timeframe: CandleTimeframe = '5m',
    mode: 'price' | 'mcap' = 'price',
    limit = 500,
  ): Promise<OhlcvCandle[]> {
    const normalized = tokenAddress.toLowerCase();
    const normalizedTf = timeframe.toLowerCase();
    const publicFactories = getPublicFactoryAddresses();
    const cacheKey = `candles:${publicFactories.join(',')}:${normalized}:${normalizedTf}:${mode}:${limit}`;

    // Check Redis cache (5s TTL — fast for live trading)
    const cached = await this.redis.getJson<OhlcvCandle[]>(cacheKey);
    if (cached) return cached;

    const bucketSeconds = TIMEFRAME_SECONDS[timeframe] || TIMEFRAME_SECONDS['5m'];
    const windowSeconds = TIMEFRAME_WINDOW[timeframe] || TIMEFRAME_WINDOW['5m'];
    const valueColumn = mode === 'price' ? 'price' : 'market_cap';

    // 1. Check if token has any executed trades in the database
    const countRes = await this.db.query(
      `SELECT
         COUNT(*)::text AS count,
         MIN(activity.timestamp)::text AS min_ts,
         (array_agg(${valueColumn}::numeric ORDER BY activity.timestamp ASC, activity.log_index ASC))[1]::text AS first_val
       FROM (SELECT tr.token_id, tr.timestamp, tr.log_index, tr.price, tr.market_cap_after AS market_cap, tr.usdc_amount AS volume_raw FROM trades tr UNION ALL SELECT s.token_id, s.timestamp, s.log_index, s.price_after, (s.price_after * 1000000000)::numeric, CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END FROM amm_swaps s) activity
       JOIN tokens t ON activity.token_id = t.id
       WHERE t.contract_address = $1
         AND ${publicFactoryClause('t', 2)}`,
      [normalized, publicFactories],
    );

    const tradeCount = parseInt(countRes.rows[0]?.count || '0', 10);

    // If token has zero trades, return empty array — do NOT manufacture fake candles
    if (tradeCount === 0 || !countRes.rows[0]?.min_ts) {
      await this.redis.setJson(cacheKey, [], 5);
      return [];
    }

    const initialVal = Number(countRes.rows[0].first_val || '0');

    // 2. Query sparse buckets from DB using Postgres epoch aggregation in UTC
    const query = `
      WITH token_info AS (
        SELECT t.id FROM tokens t
        WHERE t.contract_address = $1
          AND ${publicFactoryClause('t', 3)}
        LIMIT 1
      ),
      trade_buckets AS (
        SELECT
          (EXTRACT(EPOCH FROM activity.timestamp)::bigint / $2) * $2 AS bucket,
          (array_agg(${valueColumn}::numeric ORDER BY activity.timestamp ASC, activity.log_index ASC))[1] AS open_val,
          MAX(${valueColumn}::numeric) AS high_val,
          MIN(${valueColumn}::numeric) AS low_val,
          (array_agg(${valueColumn}::numeric ORDER BY activity.timestamp DESC, activity.log_index DESC))[1] AS close_val,
          SUM(activity.volume_raw::numeric) AS volume_raw
        FROM (SELECT tr.token_id, tr.timestamp, tr.log_index, tr.price, tr.market_cap_after AS market_cap, tr.usdc_amount AS volume_raw FROM trades tr UNION ALL SELECT s.token_id, s.timestamp, s.log_index, s.price_after, (s.price_after * 1000000000)::numeric, CASE WHEN s.is_buy THEN s.usdc_in ELSE s.usdc_out END FROM amm_swaps s) activity
        JOIN token_info ti ON activity.token_id = ti.id
        WHERE activity.timestamp >= NOW() - INTERVAL '${windowSeconds} seconds'
        GROUP BY bucket
      )
      SELECT
        bucket AS timestamp,
        open_val,
        high_val,
        low_val,
        close_val,
        volume_raw
      FROM trade_buckets
      ORDER BY bucket ASC
    `;

    try {
      const result = await this.db.query(query, [normalized, bucketSeconds, publicFactories]);

      const sparse: OhlcvCandle[] = result.rows.map((row) => ({
        timestamp: Number(row.timestamp),
        open: Number(row.open_val),
        high: Number(row.high_val),
        low: Number(row.low_val),
        close: Number(row.close_val),
        volume: Number(row.volume_raw) / 1e6, // Convert 6-dec micro-USDC to dollars
      }));

      if (sparse.length === 0) {
        await this.redis.setJson(cacheKey, [], 5);
        return [];
      }

      // 3. Gap filling from earliest trade bucket to current in-progress bucket (UTC)
      const nowBucket = Math.floor(Date.now() / 1000 / bucketSeconds) * bucketSeconds;
      const filled = this.fillGaps(sparse, bucketSeconds, nowBucket, initialVal);

      // Limit results to requested max bars (most recent)
      const finalCandles = filled.slice(-limit);

      await this.redis.setJson(cacheKey, finalCandles, 5);
      return finalCandles;
    } catch (err) {
      this.logger.error(`Failed to get candles for ${normalized}: ${err.message}`);
      return [];
    }
  }

  /**
   * Standard gap filling for zero-trade interval buckets.
   * Fills gaps with flat candles carried forward from prevClose with volume = 0.
   */
  private fillGaps(
    candles: OhlcvCandle[],
    bucketSeconds: number,
    endTime: number,
    initialVal: number,
  ): OhlcvCandle[] {
    const filled: OhlcvCandle[] = [];
    let prevClose = candles[0]?.open ?? initialVal;
    let idx = 0;
    let t = candles[0].timestamp;

    while (t <= endTime) {
      if (idx < candles.length && candles[idx].timestamp === t) {
        filled.push(candles[idx]);
        prevClose = candles[idx].close;
        idx++;
      } else {
        filled.push({
          timestamp: t,
          open: prevClose,
          high: prevClose,
          low: prevClose,
          close: prevClose,
          volume: 0,
        });
      }
      t += bucketSeconds;
    }

    return filled;
  }
}
