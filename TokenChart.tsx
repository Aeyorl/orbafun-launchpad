'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  UTCTimestamp,
  ColorType,
  CandlestickSeries, // lightweight-charts v5 series-type import
} from 'lightweight-charts';

// ---- Types -----------------------------------------------------------

type Timeframe = '1m' | '5m' | '15m' | '30m' | '1H' | '4H' | '1D';

interface Candle {
  time: UTCTimestamp; // bucket start, in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TradeEvent {
  type: 'NEW_BUY' | 'NEW_SELL';
  price: number;     // execution price (or implied mcap) at trade time
  amountUsdc: number; // trade size, used for volume
  timestamp: number;  // ms epoch
}

const TIMEFRAME_SECONDS: Record<Timeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1H': 3600,
  '4H': 14400,
  '1D': 86400,
};

// ---- Candle bucket math ------------------------------------------------

function bucketStart(tsMs: number, timeframe: Timeframe): UTCTimestamp {
  const secs = Math.floor(tsMs / 1000);
  const bucket = TIMEFRAME_SECONDS[timeframe];
  return (Math.floor(secs / bucket) * bucket) as UTCTimestamp;
}

/**
 * Folds a single trade into the candle array, mutating the last candle if the
 * trade belongs to the current (still-open) bucket, or pushing a new bar if
 * the trade rolled over into the next bucket. Pure function — returns a new
 * array, safe to use directly in setState.
 */
function applyTradeToCandles(
  candles: Candle[],
  trade: TradeEvent,
  timeframe: Timeframe
): Candle[] {
  const time = bucketStart(trade.timestamp, timeframe);
  const price = trade.price;
  const last = candles[candles.length - 1];

  if (last && last.time === time) {
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: last.volume + trade.amountUsdc,
    };
    return [...candles.slice(0, -1), updated];
  }

  // New bucket. Open = previous close if we have history, else the trade price
  // itself (handles the very first trade on a freshly launched token).
  const openPrice = last ? last.close : price;
  const fresh: Candle = {
    time,
    open: openPrice,
    high: Math.max(openPrice, price),
    low: Math.min(openPrice, price),
    close: price,
    volume: trade.amountUsdc,
  };
  return [...candles, fresh];
}

// ---- Component -----------------------------------------------------------

interface TokenChartProps {
  tokenAddress: string;
  timeframe?: Timeframe;
  /** Called once on mount / timeframe change to load history. */
  fetchCandles: (address: string, timeframe: Timeframe) => Promise<Candle[]>;
  /** Subscribe to live trades for this token; return an unsubscribe fn. */
  subscribeTrades: (
    address: string,
    onTrade: (trade: TradeEvent) => void
  ) => () => void;
}

export default function TokenChart({
  tokenAddress,
  timeframe = '5m',
  fetchCandles,
  subscribeTrades,
}: TokenChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const candlesRef = useRef<Candle[]>([]); // mirrors state, avoids stale closures in ws handler

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. Create chart once on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#0a0e17' },
        textColor: '#9aa4b2',
        fontFamily: 'monospace',
      },
      grid: {
        vertLines: { color: '#131a26' },
        horzLines: { color: '#131a26' },
      },
      timeScale: { timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: '#1c2433' },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    seriesRef.current = series;

    const resize = () => {
      if (!containerRef.current) return;
      chart.applyOptions({
        width: containerRef.current.clientWidth,
        height: containerRef.current.clientHeight,
      });
    };
    const ro = new ResizeObserver(resize);
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // 2. Load historical candles whenever token/timeframe changes
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetchCandles(tokenAddress, timeframe)
      .then((history) => {
        if (cancelled) return;
        candlesRef.current = history;
        seriesRef.current?.setData(history as CandlestickData[]);
        chartRef.current?.timeScale().fitContent();
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load candles');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [tokenAddress, timeframe, fetchCandles]);

  // 3. Subscribe to live trades, fold each one into the last candle
  const handleTrade = useCallback(
    (trade: TradeEvent) => {
      const updated = applyTradeToCandles(candlesRef.current, trade, timeframe);
      candlesRef.current = updated;

      const lastCandle = updated[updated.length - 1];
      // update() is O(1) and correctly either replaces the current bar
      // or appends a new one, based on matching `time`
      seriesRef.current?.update(lastCandle as CandlestickData);
    },
    [timeframe]
  );

  useEffect(() => {
    const unsubscribe = subscribeTrades(tokenAddress, handleTrade);
    return unsubscribe;
  }, [tokenAddress, subscribeTrades, handleTrade]);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {loading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9aa4b2', fontFamily: 'monospace' }}>
          Loading chart…
        </div>
      )}
      {error && (
        <div style={{ position: 'absolute', top: 8, left: 8, color: '#ef4444', fontFamily: 'monospace', fontSize: 12 }}>
          {error}
        </div>
      )}
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}

// ---- Example wiring to your endpoints ------------------------------------
//
// const fetchCandles = async (address: string, tf: Timeframe): Promise<Candle[]> => {
//   const res = await fetch(`/api/tokens/${address}/candles?timeframe=${tf}`);
//   if (!res.ok) throw new Error('candles fetch failed');
//   const rows = await res.json(); // [{ time, open, high, low, close, volume }, ...]
//   return rows as Candle[];
// };
//
// const subscribeTrades = (address: string, onTrade: (t: TradeEvent) => void) => {
//   const ws = new WebSocket(`${process.env.NEXT_PUBLIC_WS_URL}/tokens/${address}/trades`);
//   ws.onmessage = (msg) => {
//     const evt = JSON.parse(msg.data);
//     if (evt.type === 'NEW_BUY' || evt.type === 'NEW_SELL') {
//       onTrade({ type: evt.type, price: evt.price, amountUsdc: evt.amountUsdc, timestamp: evt.timestamp });
//     }
//   };
//   return () => ws.close();
// };
//
// <TokenChart
//   tokenAddress={address}
//   timeframe="5m"
//   fetchCandles={fetchCandles}
//   subscribeTrades={subscribeTrades}
// />
