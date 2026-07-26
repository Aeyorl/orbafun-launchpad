'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Trade } from '@/lib/api';
import { formatMarketCap, timeAgo } from '@/lib/utils';

// Dynamic import to avoid SSR issues with lightweight-charts
let createChart: typeof import('lightweight-charts').createChart;
let ColorType: typeof import('lightweight-charts').ColorType;
let CrosshairMode: typeof import('lightweight-charts').CrosshairMode;
let LineType: typeof import('lightweight-charts').LineType;

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | 'all';

const TIMEFRAMES: { key: Timeframe; label: string; bucketMs: number; windowMs: number }[] = [
  { key: '1m',  label: '1m',  bucketMs: 60_000,          windowMs: 60 * 60_000 },       // 1h window
  { key: '5m',  label: '5m',  bucketMs: 5 * 60_000,      windowMs: 6 * 60 * 60_000 },   // 6h window
  { key: '15m', label: '15m', bucketMs: 15 * 60_000,      windowMs: 24 * 60 * 60_000 },  // 24h window
  { key: '1h',  label: '1h',  bucketMs: 60 * 60_000,      windowMs: 7 * 24 * 60 * 60_000 }, // 7d window
  { key: '4h',  label: '4h',  bucketMs: 4 * 60 * 60_000,  windowMs: 30 * 24 * 60 * 60_000 }, // 30d
  { key: '1D',  label: '1D',  bucketMs: 24 * 60 * 60_000, windowMs: 365 * 24 * 60 * 60_000 }, // 1y
  { key: 'all', label: 'All', bucketMs: 0,                 windowMs: Infinity },
];

/** Aggregate trades into time-bucketed data points for the chart. */
function aggregateTrades(
  trades: Trade[],
  timeframe: Timeframe,
  currentMarketCap?: number,
): { time: number; value: number }[] {
  if (trades.length === 0) return [];

  const tf = TIMEFRAMES.find((t) => t.key === timeframe)!;
  const now = Date.now();
  const cutoff = tf.windowMs === Infinity ? 0 : now - tf.windowMs;

  // Sort chronologically
  const sorted = [...trades]
    .filter((t) => new Date(t.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // If no trades in window, show at least the most recent one
  if (sorted.length === 0 && trades.length > 0) {
    const latest = [...trades].sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    )[0];
    const pts = [{ time: Math.floor(new Date(latest.timestamp).getTime() / 1000), value: Number(latest.market_cap_after) }];
    if (currentMarketCap && currentMarketCap !== Number(latest.market_cap_after)) {
      pts.push({ time: Math.floor(now / 1000), value: currentMarketCap });
    }
    return pts;
  }

  if (tf.key === 'all' || tf.bucketMs === 0) {
    // No bucketing — plot every trade
    const pts = sorted.map((t) => ({
      time: Math.floor(new Date(t.timestamp).getTime() / 1000),
      value: Number(t.market_cap_after),
    }));
    // Deduplicate timestamps (lightweight-charts requires unique timestamps)
    const seen = new Set<number>();
    const deduped = pts.filter((p) => {
      if (seen.has(p.time)) return false;
      seen.add(p.time);
      return true;
    });
    // Append live point
    if (currentMarketCap && deduped.length > 0) {
      const lastTime = deduped[deduped.length - 1].time;
      const nowSec = Math.floor(now / 1000);
      if (nowSec > lastTime) {
        deduped.push({ time: nowSec, value: currentMarketCap });
      }
    }
    return deduped;
  }

  // Bucket trades by timeframe interval
  const buckets = new Map<number, number>();
  for (const trade of sorted) {
    const t = new Date(trade.timestamp).getTime();
    const bucketStart = Math.floor(t / tf.bucketMs) * tf.bucketMs;
    const bucketSec = Math.floor(bucketStart / 1000);
    // Use the last market cap in the bucket
    buckets.set(bucketSec, Number(trade.market_cap_after));
  }

  const pts = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([time, value]) => ({ time, value }));

  // Append live point
  if (currentMarketCap && pts.length > 0) {
    const lastTime = pts[pts.length - 1].time;
    const nowSec = Math.floor(now / 1000);
    if (nowSec > lastTime) {
      pts.push({ time: nowSec, value: currentMarketCap });
    }
  }

  return pts;
}

/**
 * PriceChart — professional token chart using TradingView Lightweight Charts.
 * Shows market cap over time from trade data with interactive crosshair,
 * zoom/scroll, and theme-aware styling.
 */
export function PriceChart({
  trades,
  currentMarketCap,
}: {
  trades: Trade[];
  currentMarketCap?: number;
}) {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');
  const [ready, setReady] = useState(false);
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const seriesRef = useRef<any>(null);

  // Read theme colors from CSS variables
  const getColors = useCallback(() => {
    const cs = getComputedStyle(document.documentElement);
    const get = (v: string, fallback: string) => {
      const val = cs.getPropertyValue(v).trim();
      return val ? `rgb(${val})` : fallback;
    };
    return {
      bg: get('--color-bg-card', '#ffffff'),
      text: get('--color-text-primary', '#17191c'),
      textMuted: get('--color-text-muted', '#979799'),
      border: get('--color-bg-border', '#ececec'),
      accent: get('--color-accent-primary', '#2775CA'),
      accentSecondary: get('--color-accent-sienna', '#5d2a1a'),
      green: '#16a34a',
      red: '#dc2626',
    };
  }, []);

  // Dynamically load lightweight-charts on client side
  useEffect(() => {
    import('lightweight-charts').then((mod) => {
      createChart = mod.createChart;
      ColorType = mod.ColorType;
      CrosshairMode = mod.CrosshairMode;
      LineType = mod.LineType;
      setReady(true);
    });
  }, []);

  // Aggregate data
  const data = useMemo(
    () => aggregateTrades(trades, timeframe, currentMarketCap ? Number(currentMarketCap) : undefined),
    [trades, timeframe, currentMarketCap],
  );

  // Determine price direction for coloring
  const isPositive = data.length >= 2
    ? data[data.length - 1].value >= data[0].value
    : true;

  // Create / update chart
  useEffect(() => {
    if (!ready || !chartContainerRef.current || data.length === 0) return;

    const colors = getColors();
    const lineColor = isPositive ? colors.green : colors.red;

    // If chart already exists, just update data
    if (chartRef.current && seriesRef.current) {
      try {
        seriesRef.current.setData(data as any);
        chartRef.current.timeScale().fitContent();
      } catch {
        // Chart may have been disposed — recreate below
        chartRef.current = null;
        seriesRef.current = null;
      }
      if (chartRef.current) return;
    }

    // Dispose old chart if it exists
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ignore */ }
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: colors.textMuted,
        fontFamily: "'Inter', 'Source Serif 4', system-ui, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: colors.border, style: 1 },
        horzLines: { color: colors.border, style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: colors.textMuted, width: 1, style: 3, labelBackgroundColor: colors.accent },
        horzLine: { color: colors.textMuted, width: 1, style: 3, labelBackgroundColor: colors.accent },
      },
      rightPriceScale: {
        borderColor: colors.border,
        scaleMargins: { top: 0.1, bottom: 0.1 },
      },
      timeScale: {
        borderColor: colors.border,
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    } as any);

    const series = (chart as any).addAreaSeries({
      lineColor,
      topColor: isPositive ? 'rgba(22, 163, 74, 0.18)' : 'rgba(220, 38, 38, 0.18)',
      bottomColor: isPositive ? 'rgba(22, 163, 74, 0)' : 'rgba(220, 38, 38, 0)',
      lineWidth: 2,
      lineType: LineType.Curved,
      priceFormat: {
        type: 'custom',
        formatter: (price: number) => formatMarketCap(price),
      },
      crosshairMarkerRadius: 5,
      crosshairMarkerBackgroundColor: lineColor,
      crosshairMarkerBorderColor: '#ffffff',
      crosshairMarkerBorderWidth: 2,
    } as any);

    series.setData(data as any);
    chart.timeScale().fitContent();

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.applyOptions({ width, height });
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch { /* ignore */ }
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, [ready, data, getColors, isPositive]);

  // Update colors when chart direction changes (without full re-render)
  useEffect(() => {
    if (!seriesRef.current) return;
    const lineColor = isPositive ? '#16a34a' : '#dc2626';
    try {
      seriesRef.current.applyOptions({
        lineColor,
        topColor: isPositive ? 'rgba(22, 163, 74, 0.18)' : 'rgba(220, 38, 38, 0.18)',
        bottomColor: isPositive ? 'rgba(22, 163, 74, 0)' : 'rgba(220, 38, 38, 0)',
        crosshairMarkerBackgroundColor: lineColor,
      });
    } catch { /* ignore */ }
  }, [isPositive]);

  if (trades.length === 0) {
    return (
      <div className="card h-64 flex items-center justify-center text-text-muted">
        No trades yet — be the first to buy!
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div>
          <h3 className="font-semibold">Price Chart</h3>
          <div className="text-xs text-text-muted mt-0.5">
            {data.length} data points · MC {data.length > 0 ? formatMarketCap(data[data.length - 1].value) : '—'}
            {data.length >= 2 && (
              <span className={isPositive ? 'text-green-600 ml-2' : 'text-red-600 ml-2'}>
                {isPositive ? '▲' : '▼'}{' '}
                {Math.abs(
                  ((data[data.length - 1].value - data[0].value) / data[0].value) * 100,
                ).toFixed(2)}%
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1" role="tablist" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              role="tab"
              aria-selected={timeframe === tf.key}
              onClick={() => {
                setTimeframe(tf.key);
                // Force chart re-creation on timeframe change
                if (chartRef.current) {
                  try { chartRef.current.remove(); } catch { /* ignore */ }
                  chartRef.current = null;
                  seriesRef.current = null;
                }
              }}
              className={`px-2.5 py-1 text-xs font-medium rounded-full transition-colors ${
                timeframe === tf.key
                  ? 'bg-text-primary text-bg-base'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart container */}
      <div
        ref={chartContainerRef}
        className="w-full"
        style={{ height: '300px' }}
      />
    </div>
  );
}
