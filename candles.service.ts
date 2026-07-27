import { Pool } from 'pg';

// ---- Types (mirror the frontend Candle shape) -----------------------------

export interface Candle {
  time: number; // unix seconds, bucket start
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
};

// ---- Service ---------------------------------------------------------------
//
// Assumes a `trades` table roughly shaped like:
//   token_address text, price double precision, amount_usdc double precision,
//   side text ('BUY' | 'SELL'), created_at timestamptz
//
// Adjust column names in the query below if yours differ.

export class CandlesService {
  constructor(private readonly pool: Pool) {}

  async getCandles(
    tokenAddress: string,
    timeframe: Timeframe,
    opts?: { limit?: number }
  ): Promise<Candle[]> {
    const bucketSeconds = TIMEFRAME_SECONDS[timeframe];
    if (!bucketSeconds) {
      throw new Error(`Unsupported timeframe: ${timeframe}`);
    }

    const limit = opts?.limit ?? 500;
    const lookbackSeconds = bucketSeconds * limit;

    // Sparse aggregation: one row per bucket that actually has trades.
    // - open  = price of the earliest trade in the bucket
    // - close = price of the latest trade in the bucket
    // - high/low/volume = straightforward MIN/MAX/SUM
    // No Postgres extensions required (works without TimescaleDB).
    const { rows } = await this.pool.query(
      `
      SELECT
        bucket_time,
        (array_agg(price ORDER BY created_at ASC))[1]::float8  AS open,
        (array_agg(price ORDER BY created_at DESC))[1]::float8 AS close,
        MAX(price)::float8        AS high,
        MIN(price)::float8        AS low,
        SUM(amount_usdc)::float8  AS volume
      FROM (
        SELECT
          floor(extract(epoch FROM created_at) / $2) * $2 AS bucket_time,
          price,
          amount_usdc,
          created_at
        FROM trades
        WHERE token_address = $1
          AND created_at >= NOW() - ($3 || ' seconds')::interval
      ) t
      GROUP BY bucket_time
      ORDER BY bucket_time ASC
      `,
      [tokenAddress, bucketSeconds, lookbackSeconds]
    );

    const sparse: Candle[] = rows.map((r) => ({
      time: Number(r.bucket_time),
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
      volume: Number(r.volume),
    }));

    if (sparse.length === 0) return [];

    // Extend through the *current* in-progress bucket (not just the last
    // bucket that had a trade) so the frontend has a live candle to `update()`
    // via websocket even if there hasn't been a trade in the current bucket yet.
    const nowBucket = Math.floor(Date.now() / 1000 / bucketSeconds) * bucketSeconds;

    return this.fillGaps(sparse, bucketSeconds, nowBucket);
  }

  /**
   * Postgres won't emit a row for buckets with zero trades, but a chart needs
   * a continuous time axis. Fill missing buckets with flat candles carried
   * forward from the previous close, volume = 0 — standard "no trades this
   * period" representation.
   */
  private fillGaps(
    candles: Candle[],
    bucketSeconds: number,
    endTime: number
  ): Candle[] {
    const filled: Candle[] = [];
    let prevClose = candles[0].open;
    let idx = 0;
    let t = candles[0].time;

    while (t <= endTime) {
      if (idx < candles.length && candles[idx].time === t) {
        filled.push(candles[idx]);
        prevClose = candles[idx].close;
        idx++;
      } else {
        filled.push({
          time: t,
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

// ---- NestJS controller wiring (adjust if you're on Express instead) -------
//
// @Controller('tokens')
// export class TokensController {
//   constructor(private readonly candlesService: CandlesService) {}
//
//   @Get(':address/candles')
//   async getCandles(
//     @Param('address') address: string,
//     @Query('timeframe') timeframe: Timeframe = '5m',
//   ) {
//     return this.candlesService.getCandles(address, timeframe);
//   }
// }
//
// ---- Plain Express wiring (if not NestJS) ---------------------------------
//
// router.get('/tokens/:address/candles', async (req, res) => {
//   try {
//     const timeframe = (req.query.timeframe as Timeframe) ?? '5m';
//     const candles = await candlesService.getCandles(req.params.address, timeframe);
//     res.json(candles);
//   } catch (err) {
//     res.status(400).json({ error: (err as Error).message });
//   }
// });
