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

    // Check cache (5s TTL — fast for live trading)
    const cached = await this.redis.getJson<OhlcvCandle[]>(cacheKey);
    if (cached) return cached;

    const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
    const windowSeconds = TIMEFRAME_WINDOW[timeframe];
    const valueColumn = mode === 'price' ? 'tr.price' : 'tr.market_cap_after';

    // 1. Check if token has any executed trades in the database
    const countRes = await this.db.query(
      `SELECT
         COUNT(*)::text AS count,
         MIN(tr.timestamp)::text AS min_ts,
         (array_agg(${valueColumn}::numeric ORDER BY tr.timestamp ASC, tr.log_index ASC))[1]::text AS first_val
       FROM trades tr
       JOIN tokens t ON tr.token_id = t.id
       WHERE t.contract_address = $1`,
      [normalized],
    );

    const tradeCount = parseInt(countRes.rows[0]?.count || '0', 10);

    // If token has zero trades, return empty array — do NOT manufacture fake candles
    if (tradeCount === 0 || !countRes.rows[0]?.min_ts) {
      await this.redis.setJson(cacheKey, [], 5);
      return [];
    }

    const firstTradeTs = Math.floor(new Date(countRes.rows[0].min_ts).getTime() / 1000);
    const initialVal = Number(countRes.rows[0].first_val || '0');

    // 2. Query: aggregate trades into OHLCV time buckets starting from earliest trade
    const query = `
      WITH token_info AS (
        SELECT id FROM tokens WHERE contract_address = $1 LIMIT 1
      ),
      trade_buckets AS (
        SELECT
          (EXTRACT(EPOCH FROM tr.timestamp)::bigint / $2) * $2 AS bucket,
          (array_agg(${valueColumn}::numeric ORDER BY tr.timestamp ASC, tr.log_index ASC))[1] AS open_val,
          MAX(${valueColumn}::numeric) AS high_val,
          MIN(${valueColumn}::numeric) AS low_val,
          (array_agg(${valueColumn}::numeric ORDER BY tr.timestamp DESC, tr.log_index DESC))[1] AS close_val,
          SUM(tr.usdc_amount::numeric) AS volume_raw
        FROM trades tr
        JOIN token_info ti ON tr.token_id = ti.id
        WHERE tr.timestamp >= NOW() - INTERVAL '${windowSeconds} seconds'
        GROUP BY bucket
      ),
      time_range AS (
        SELECT
          GREATEST(
            ($3::bigint / $2) * $2,
            (EXTRACT(EPOCH FROM NOW())::bigint - $4) / $2 * $2
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
      LIMIT $5
    `;

    try {
      const result = await this.db.query(query, [
        normalized,
        bucketSeconds,
        firstTradeTs,
        windowSeconds,
        limit,
      ]);

      const candles: OhlcvCandle[] = [];
      let lastClose = initialVal;

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

      // Cache for 5 seconds
      await this.redis.setJson(cacheKey, candles, 5);
      return candles;
    } catch (err) {
      this.logger.error(`Failed to get candles for ${normalized}: ${err.message}`);
      return [];
    }
  }
}
