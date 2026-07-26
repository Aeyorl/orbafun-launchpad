'use client';

import { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { Trade } from '@/lib/api';
import { formatMarketCap } from '@/lib/utils';

// Dynamic imports for lightweight-charts
let createChart: any;
let ColorType: any;
let CrosshairMode: any;
let LineType: any;
let PriceScaleMode: any;
let CandlestickSeries: any;
let AreaSeries: any;
let HistogramSeries: any;
let createSeriesMarkers: any;

type Timeframe = '1m' | '5m' | '15m' | '1h' | '4h' | '1D' | 'all';
type ChartType = 'candlestick' | 'area';
type MetricMode = 'mcap' | 'price';
type ScaleType = 'normal' | 'log' | 'percent';

const TIMEFRAMES: { key: Timeframe; label: string; bucketMs: number; windowMs: number }[] = [
  { key: '1m',  label: '1m',  bucketMs: 60_000,          windowMs: 60 * 60_000 },       // 1h window
  { key: '5m',  label: '5m',  bucketMs: 5 * 60_000,      windowMs: 6 * 60 * 60_000 },   // 6h window
  { key: '15m', label: '15m', bucketMs: 15 * 60_000,      windowMs: 24 * 60 * 60_000 },  // 24h window
  { key: '1h',  label: '1h',  bucketMs: 60 * 60_000,      windowMs: 7 * 24 * 60 * 60_000 }, // 7d window
  { key: '4h',  label: '4h',  bucketMs: 4 * 60 * 60_000,  windowMs: 30 * 24 * 60 * 60_000 }, // 30d
  { key: '1D',  label: '1D',  bucketMs: 24 * 60 * 60_000, windowMs: 365 * 24 * 60 * 60_000 }, // 1y
  { key: 'all', label: 'All', bucketMs: 0,                 windowMs: Infinity },
];

export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface VolumeData {
  time: number;
  value: number;
  color: string;
}

export interface AreaPoint {
  time: number;
  value: number;
}

export interface ChartMarker {
  time: number;
  position: 'aboveBar' | 'belowBar';
  color: string;
  shape: 'arrowUp' | 'arrowDown';
  text: string;
}

/**
 * Aggregate trade history into high-precision OHLC candles, volume bars,
 * and buy/sell event markers.
 */
function aggregateTradeData(
  trades: Trade[],
  timeframe: Timeframe,
  mode: MetricMode,
  currentVal?: number,
): { candles: CandleData[]; volume: VolumeData[]; area: AreaPoint[]; markers: ChartMarker[] } {
  const tf = TIMEFRAMES.find((t) => t.key === timeframe)!;
  const now = Date.now();
  const cutoff = tf.windowMs === Infinity ? 0 : now - tf.windowMs;

  const extractVal = (t: Trade) => (mode === 'price' ? Number(t.price) : Number(t.market_cap_after));

  // Sort trades chronologically
  const sorted = [...trades]
    .filter((t) => new Date(t.timestamp).getTime() >= cutoff)
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

  // Base initial starting price/mcap before any trade ($4,000 MC / $0.000004 price)
  const baseInitial = mode === 'price' ? 0.000004 : 4000;

  if (sorted.length === 0) {
    const active = currentVal || baseInitial;
    const nowSec = Math.floor(now / 1000);
    return {
      candles: [{ time: nowSec, open: active, high: active * 1.001, low: active * 0.999, close: active }],
      volume: [],
      area: [{ time: nowSec, value: active }],
      markers: [],
    };
  }

  const bucketMs = tf.bucketMs === 0 ? 60_000 : tf.bucketMs;
  const bucketMap = new Map<number, Trade[]>();

  for (const trade of sorted) {
    const t = new Date(trade.timestamp).getTime();
    const bucketStart = Math.floor(t / bucketMs) * bucketMs;
    const bucketSec = Math.floor(bucketStart / 1000);
    if (!bucketMap.has(bucketSec)) bucketMap.set(bucketSec, []);
    bucketMap.get(bucketSec)!.push(trade);
  }

  const sortedBuckets = Array.from(bucketMap.entries()).sort((a, b) => a[0] - b[0]);
  const candles: CandleData[] = [];
  const volume: VolumeData[] = [];
  const area: AreaPoint[] = [];
  const markers: ChartMarker[] = [];

  let runningOpen = baseInitial;

  for (const [tSec, bTrades] of sortedBuckets) {
    const open = runningOpen;
    let high = open;
    let low = open;
    let close = open;
    let bucketVolUsdc = 0;

    for (const tr of bTrades) {
      const trVal = extractVal(tr);
      const usdcAmt = Number(tr.usdc_amount) / 1e6;
      bucketVolUsdc += usdcAmt;

      close = trVal;
      if (trVal > high) high = trVal;
      if (trVal < low) low = trVal;

      // Add Pump.fun buy/sell marker for distinct trades
      if (usdcAmt >= 1) {
        markers.push({
          time: tSec,
          position: tr.type === 'buy' ? 'belowBar' : 'aboveBar',
          color: tr.type === 'buy' ? '#22c55e' : '#ef4444',
          shape: tr.type === 'buy' ? 'arrowUp' : 'arrowDown',
          text: `${tr.type.toUpperCase()} $${usdcAmt >= 1000 ? `${(usdcAmt / 1000).toFixed(1)}k` : usdcAmt.toFixed(0)}`,
        });
      }
    }

    // Ensure candle has non-zero height for clear visibility
    if (high === low) {
      high = open * 1.002;
      low = open * 0.998;
    }

    runningOpen = close;

    candles.push({ time: tSec, open, high, low, close });
    volume.push({
      time: tSec,
      value: bucketVolUsdc,
      color: close >= open ? 'rgba(34, 197, 94, 0.65)' : 'rgba(239, 68, 68, 0.65)',
    });
    area.push({ time: tSec, value: close });
  }

  // Append live current market cap / price if available
  if (currentVal && candles.length > 0) {
    const last = candles[candles.length - 1];
    const nowSec = Math.floor(now / 1000);
    if (nowSec > last.time) {
      const open = last.close;
      const close = currentVal;
      const high = Math.max(open, close) * 1.001;
      const low = Math.min(open, close) * 0.999;
      candles.push({ time: nowSec, open, high, low, close });
      volume.push({
        time: nowSec,
        value: 0,
        color: close >= open ? 'rgba(34, 197, 94, 0.65)' : 'rgba(239, 68, 68, 0.65)',
      });
      area.push({ time: nowSec, value: currentVal });
    }
  }

  return { candles, volume, area, markers };
}

export function PriceChart({
  trades,
  currentMarketCap,
  tokenSymbol,
  tokenPrice,
}: {
  trades: Trade[];
  currentMarketCap?: number;
  tokenSymbol?: string;
  tokenPrice?: number;
}) {
  const [metricMode, setMetricMode] = useState<MetricMode>('mcap');
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [scaleMode, setScaleMode] = useState<ScaleType>('normal');
  const [ready, setReady] = useState(false);

  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const mainSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);

  // Load lightweight-charts dynamically client-side
  useEffect(() => {
    import('lightweight-charts').then((mod) => {
      createChart = mod.createChart;
      ColorType = mod.ColorType;
      CrosshairMode = mod.CrosshairMode;
      LineType = mod.LineType;
      PriceScaleMode = mod.PriceScaleMode;
      CandlestickSeries = mod.CandlestickSeries;
      AreaSeries = mod.AreaSeries;
      HistogramSeries = mod.HistogramSeries;
      createSeriesMarkers = mod.createSeriesMarkers;
      setReady(true);
    });
  }, []);

  const activeVal = metricMode === 'price'
    ? (tokenPrice || (trades.length > 0 ? Number(trades[0].price) : 0.000004))
    : (currentMarketCap || (trades.length > 0 ? Number(trades[0].market_cap_after) : 4000));

  const { candles, volume, area, markers } = useMemo(
    () => aggregateTradeData(trades, timeframe, metricMode, activeVal),
    [trades, timeframe, metricMode, activeVal],
  );

  // ATH (All-Time High) calculation
  const athValue = useMemo(() => {
    if (trades.length === 0) return activeVal;
    const maxTrade = Math.max(
      ...trades.map((t) => (metricMode === 'price' ? Number(t.price) : Number(t.market_cap_after))),
    );
    return Math.max(maxTrade, activeVal);
  }, [trades, metricMode, activeVal]);

  const athProgressPercent = Math.min(100, Math.max(0, (activeVal / (athValue || 1)) * 100));

  // 24h Change calculation
  const change24h = useMemo(() => {
    if (trades.length === 0) return { diff: 0, pct: 0, isPositive: true };
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const trades24h = trades.filter((t) => new Date(t.timestamp).getTime() >= cutoff);
    if (trades24h.length === 0) return { diff: 0, pct: 0, isPositive: true };

    const firstVal = metricMode === 'price' ? Number(trades24h[trades24h.length - 1].price) : Number(trades24h[trades24h.length - 1].market_cap_after);
    const diff = activeVal - firstVal;
    const pct = firstVal > 0 ? (diff / firstVal) * 100 : 0;
    return { diff, pct, isPositive: diff >= 0 };
  }, [trades, metricMode, activeVal]);

  const formatValue = useCallback(
    (val: number) => {
      if (val === undefined || val === null || isNaN(val)) return '$0.00';
      if (metricMode === 'price') {
        if (val < 0.0001) return `$${val.toFixed(8)}`;
        if (val < 0.01) return `$${val.toFixed(6)}`;
        return `$${val.toFixed(4)}`;
      }
      return formatMarketCap(val);
    },
    [metricMode],
  );

  // Create / Render TradingView Chart
  useEffect(() => {
    if (!ready || !chartContainerRef.current || candles.length === 0) return;

    // Dispose previous instance cleanly
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* ignore */ }
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: '#121318' },
        textColor: '#979799',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)', style: 1 },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Magnet,
        vertLine: { color: '#6b7280', width: 1, style: 3, labelBackgroundColor: '#374151' },
        horzLine: { color: '#6b7280', width: 1, style: 3, labelBackgroundColor: '#374151' },
      },
      rightPriceScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        scaleMargins: { top: 0.1, bottom: 0.25 },
        mode: scaleMode === 'log' ? PriceScaleMode.Logarithmic : scaleMode === 'percent' ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
        autoScale: true,
      },
      timeScale: {
        borderColor: 'rgba(255, 255, 255, 0.1)',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    });

    // Add Volume Histogram Series on separate overlay scale
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume_overlay',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('volume_overlay').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(volume);
    volumeSeriesRef.current = volumeSeries;

    // Add Main Series (Candlestick or Area)
    let mainSeries: any;
    if (chartType === 'candlestick') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: '#22c55e',
        downColor: '#ef4444',
        wickUpColor: '#22c55e',
        wickDownColor: '#ef4444',
        borderVisible: false,
        priceFormat: {
          type: 'custom',
          minMove: metricMode === 'price' ? 0.00000001 : 0.01,
          formatter: (p: number) => formatValue(p),
        },
        autoscaleInfoProvider: () => {
          const vals = candles.flatMap((c: CandleData) => [c.low, c.high]);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const pad = (max - min) * 0.1 || min * 0.05;
          return {
            priceRange: {
              minValue: Math.max(0.00000001, min - pad),
              maxValue: max + pad,
            },
          };
        },
      });
      mainSeries.setData(candles);

      // Add Buy / Sell markers to candles
      if (markers.length > 0 && createSeriesMarkers) {
        try {
          createSeriesMarkers(mainSeries, markers);
        } catch {
          try { mainSeries.setMarkers(markers); } catch { /* ignore */ }
        }
      } else if (markers.length > 0) {
        try { mainSeries.setMarkers(markers); } catch { /* ignore */ }
      }
    } else {
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: change24h.isPositive ? '#22c55e' : '#ef4444',
        topColor: change24h.isPositive ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)',
        bottomColor: change24h.isPositive ? 'rgba(34, 197, 94, 0.0)' : 'rgba(239, 68, 68, 0.0)',
        lineWidth: 2,
        lineType: LineType.Curved,
        priceFormat: {
          type: 'custom',
          minMove: metricMode === 'price' ? 0.00000001 : 0.01,
          formatter: (p: number) => formatValue(p),
        },
        autoscaleInfoProvider: () => {
          const vals = area.map((a: AreaPoint) => a.value);
          const min = Math.min(...vals);
          const max = Math.max(...vals);
          const pad = (max - min) * 0.1 || min * 0.05;
          return {
            priceRange: {
              minValue: Math.max(0.00000001, min - pad),
              maxValue: max + pad,
            },
          };
        },
      });
      mainSeries.setData(area);
    }

    mainSeriesRef.current = mainSeries;
    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Auto-resize
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
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [ready, candles, volume, area, markers, chartType, scaleMode, metricMode, formatValue, change24h.isPositive]);

  return (
    <div className="card space-y-3 !p-4 bg-[#121318] border-bg-border/60 text-white rounded-xl shadow-lg">
      {/* Header Row: Metric Switcher + Big Price/MCap + 24h Change + ATH Progress Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        <div>
          {/* Toggle label */}
          <button
            onClick={() => setMetricMode(metricMode === 'mcap' ? 'price' : 'mcap')}
            className="flex items-center gap-1.5 text-xs text-text-muted hover:text-white transition-colors"
          >
            <span>{metricMode === 'mcap' ? 'Market cap' : 'Price'}</span>
            <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded">⇄</span>
          </button>

          {/* Big metric display */}
          <div className="flex items-baseline gap-3 mt-1">
            <span className="text-2xl font-bold tracking-tight">
              {formatValue(activeVal)}
            </span>
            {change24h.pct !== 0 && (
              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${change24h.isPositive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                {change24h.isPositive ? '+' : ''}{formatValue(change24h.diff)} ({change24h.isPositive ? '+' : ''}{change24h.pct.toFixed(2)}%) 24h
              </span>
            )}
          </div>
        </div>

        {/* Right side: ATH Progress Bar */}
        <div className="min-w-[160px] text-right space-y-1">
          <div className="text-xs text-text-muted font-medium">
            ATH <span className="text-white font-semibold">{formatValue(athValue)}</span>
          </div>
          <div className="w-40 h-2 bg-white/10 rounded-full overflow-hidden ml-auto">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-green-400 transition-all duration-300 rounded-full"
              style={{ width: `${athProgressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Subheader Toolbar: Timeframe pills + Chart Type + Mode Switcher */}
      <div className="flex items-center justify-between flex-wrap gap-2 text-xs">
        {/* Timeframe pills */}
        <div className="flex items-center gap-1 bg-white/5 p-1 rounded-lg">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-2.5 py-1 text-xs font-medium rounded-md transition-all ${
                timeframe === tf.key
                  ? 'bg-accent-sienna text-white shadow-sm font-semibold'
                  : 'text-text-muted hover:text-white hover:bg-white/10'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Chart type & Mode controls */}
        <div className="flex items-center gap-2">
          {/* Candlestick vs Line toggle */}
          <div className="flex items-center bg-white/5 p-1 rounded-lg">
            <button
              onClick={() => setChartType('candlestick')}
              title="Candlestick Chart"
              className={`px-2 py-1 rounded text-xs transition-colors ${chartType === 'candlestick' ? 'bg-white/20 text-white font-medium' : 'text-text-muted hover:text-white'}`}
            >
              📊 Candles
            </button>
            <button
              onClick={() => setChartType('area')}
              title="Line Chart"
              className={`px-2 py-1 rounded text-xs transition-colors ${chartType === 'area' ? 'bg-white/20 text-white font-medium' : 'text-text-muted hover:text-white'}`}
            >
              📈 Line
            </button>
          </div>

          {/* Price / MCap pill */}
          <button
            onClick={() => setMetricMode(metricMode === 'mcap' ? 'price' : 'mcap')}
            className="px-3 py-1 bg-white/10 hover:bg-white/20 text-xs font-medium rounded-lg text-white transition-colors"
          >
            {metricMode === 'mcap' ? 'Price / MCap' : 'MCap / Price'}
          </button>
        </div>
      </div>

      {/* Chart Canvas Area */}
      <div className="relative bg-[#121318] rounded-lg overflow-hidden">
        <div ref={chartContainerRef} className="w-full h-[350px]" />

        {/* TradingView Watermark badge */}
        <div className="absolute bottom-2 left-2 flex items-center gap-1.5 bg-black/50 backdrop-blur-md px-2 py-1 rounded text-[10px] text-text-muted border border-white/10 pointer-events-none z-10">
          <svg className="w-3.5 h-3.5 text-white fill-current" viewBox="0 0 36 28">
            <path d="M14 22H7V11H0V4h14v18zm8-18h7v18h-7V4zm14 0h-7v18h7V4z" />
          </svg>
          <span className="font-semibold text-white/90">TradingView</span>
        </div>
      </div>

      {/* Bottom Scale Control Toolbar (1D 5D 1M 3M 1Y, %, log, auto) */}
      <div className="flex items-center justify-between pt-1 border-t border-white/10 text-[11px] text-text-muted">
        <div className="flex items-center gap-2">
          {(['1D', '5D', '1M', '3M', '1Y'] as const).map((label) => (
            <button
              key={label}
              onClick={() => setTimeframe(label.toLowerCase() as any)}
              className="hover:text-white transition-colors px-1 py-0.5"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 font-mono">
          <button
            onClick={() => setScaleMode(scaleMode === 'percent' ? 'normal' : 'percent')}
            className={`px-1.5 py-0.5 rounded transition-colors ${scaleMode === 'percent' ? 'bg-white/20 text-white' : 'hover:text-white'}`}
          >
            %
          </button>
          <button
            onClick={() => setScaleMode(scaleMode === 'log' ? 'normal' : 'log')}
            className={`px-1.5 py-0.5 rounded transition-colors ${scaleMode === 'log' ? 'bg-white/20 text-white' : 'hover:text-white'}`}
          >
            log
          </button>
          <button
            onClick={() => {
              setScaleMode('normal');
              if (chartRef.current) chartRef.current.timeScale().fitContent();
            }}
            className="hover:text-white transition-colors px-1.5 py-0.5 bg-white/5 rounded"
          >
            auto
          </button>
        </div>
      </div>
    </div>
  );
}
