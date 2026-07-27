import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

/**
 * OHLCV candle data for the trading terminal chart.
 * Aggregated server-side from the `trades` table.
 */
export interface OhlcvCandle {
  timestamp: number;   // Unix seconds
  open: number;        // Price or market cap (depending on mode)
  high: number;
  low: number;
  close: number;
  volume: number;      // USDC volume in dollars (divided by 1e6)
}

export type CandleTimeframe = '1m' | '5m' | '15m' | '30m' | '1h' | '4h' | '1d';

const TIMEFRAME_SECONDS: Record<CandleTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

/** Default lookback windows per timeframe (in seconds) */
const TIMEFRAME_WINDOW: Record<CandleTimeframe, number> = {
  '1m': 3600,           // 1 hour
  '5m': 21600,          // 6 hours
  '15m': 86400,         // 24 hours
  '30m': 172800,        // 48 hours
  '1h': 604800,         // 7 days
  '4h': 2592000,        // 30 days
  '1d': 31536000,       // 365 days
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
   * Architecture:
   *   trades table → SQL aggregation (group by time bucket) → gap-filled OHLCV
   *
   * @param tokenAddress - Contract address of the token
   * @param timeframe - Candle timeframe (1m, 5m, 15m, 30m, 1h, 4h, 1d)
   * @param mode - 'price' uses trade price, 'mcap' uses market_cap_after
   * @param limit - Max candles to return (default 500)
   */
  async getCandles(
    tokenAddress: string,
    timeframe: CandleTimeframe = '5m',
    mode: 'price' | 'mcap' = 'price',
    limit = 500,
  ): Promise<OhlcvCandle[]> {
    const normalized = tokenAddress.toLowerCase();
    const cacheKey = `candles:${normalized}:${timeframe}:${mode}:${limit}`;

    // Check cache (10s TTL — fast enough for live trading)
    const cached = await this.redis.getJson<OhlcvCandle[]>(cacheKey);
    if (cached) return cached;

    const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
    const windowSeconds = TIMEFRAME_WINDOW[timeframe];
    const valueColumn = mode === 'price' ? 'tr.price' : 'tr.market_cap_after';

    // Query: aggregate trades into OHLCV buckets
    // Uses generate_series to fill gaps, with carry-forward close price via
    // window functions (LAG with IGNORE NULLS emulation).
    const query = `
      WITH token_id AS (
        SELECT id, created_at FROM tokens WHERE contract_address = $1 LIMIT 1
      ),
      trade_buckets AS (
        SELECT
          (EXTRACT(EPOCH FROM tr.timestamp)::bigint / $2) * $2 AS bucket,
          (array_agg(${valueColumn}::numeric ORDER BY tr.timestamp ASC))[1] AS open_val,
          MAX(${valueColumn}::numeric) AS high_val,
          MIN(${valueColumn}::numeric) AS low_val,
          (array_agg(${valueColumn}::numeric ORDER BY tr.timestamp DESC))[1] AS close_val,
          SUM(tr.usdc_amount::numeric) AS volume_raw
        FROM trades tr
        JOIN token_id ti ON tr.token_id = ti.id
        WHERE tr.timestamp >= NOW() - INTERVAL '${windowSeconds} seconds'
        GROUP BY bucket
      ),
      time_range AS (
        SELECT
          GREATEST(
            (EXTRACT(EPOCH FROM (SELECT created_at FROM token_id))::bigint / $2) * $2,
            (EXTRACT(EPOCH FROM NOW())::bigint - $3) / $2 * $2
          ) AS start_bucket,
          (EXTRACT(EPOCH FROM NOW())::bigint / $2) * $2 AS end_bucket
      ),
      all_buckets AS (
        SELECT generate_series(
          (SELECT start_bucket FROM time_range)::bigint,
          (SELECT end_bucket FROM time_range)::bigint,
          $2::bigint
        ) AS bucket
      ),
      filled AS (
        SELECT
          ab.bucket,
          tb.open_val,
          tb.high_val,
          tb.low_val,
          tb.close_val,
          COALESCE(tb.volume_raw, 0) AS volume_raw
        FROM all_buckets ab
        LEFT JOIN trade_buckets tb ON ab.bucket = tb.bucket
      )
      SELECT
        bucket AS timestamp,
        open_val,
        high_val,
        low_val,
        close_val,
        volume_raw
      FROM filled
      ORDER BY bucket ASC
      LIMIT $4
    `;

    try {
      const result = await this.db.query(query, [
        normalized,
        bucketSeconds,
        windowSeconds,
        limit,
      ]);

      // Post-process: fill gaps with carry-forward close price
      const candles: OhlcvCandle[] = [];
      // Default initial price for tokens with no trades: $0.000004 (launch price)
      // Default initial mcap: $4,000 (launch market cap)
      let lastClose = mode === 'price' ? 0.000004 : 4000;

      for (const row of result.rows) {
        const hasData = row.open_val !== null;
        const open = hasData ? Number(row.open_val) : lastClose;
        const high = hasData ? Number(row.high_val) : lastClose;
        const low = hasData ? Number(row.low_val) : lastClose;
        const close = hasData ? Number(row.close_val) : lastClose;
        const volume = Number(row.volume_raw) / 1e6; // Convert micro-USDC to dollars

        candles.push({
          timestamp: Number(row.timestamp),
          open,
          high,
          low,
          close,
          volume,
        });

        lastClose = close;
      }

      // Cache for 10 seconds
      await this.redis.setJson(cacheKey, candles, 10);
      return candles;
    } catch (err) {
      this.logger.error(`Failed to get candles for ${normalized}: ${err.message}`);
      return [];
    }
  }
}
