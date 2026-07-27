'use client';

import { useEffect, useRef, useState, memo } from 'react';
import {
  createChart,
  IChartApi,
  ISeriesApi,
  CandlestickData,
  HistogramData,
  UTCTimestamp,
  ColorType,
  CandlestickSeries,
  HistogramSeries,
} from 'lightweight-charts';
import { OhlcvCandle, CandleTimeframe } from '@/lib/api';

// ---- Candle Bucket Math --------------------------------------------------

const TIMEFRAME_SECONDS: Record<string, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,  '1H': 3600,
  '4h': 14400, '4H': 14400,
  '1d': 86400, '1D': 86400,
};

function bucketStart(tsSec: number, timeframe: CandleTimeframe): UTCTimestamp {
  const bucket = TIMEFRAME_SECONDS[timeframe] || 300;
  return (Math.floor(tsSec / bucket) * bucket) as UTCTimestamp;
}

export interface LiveTrade {
  type: 'NEW_BUY' | 'NEW_SELL';
  price: number;
  usdc_amount: number;
  timestamp?: number;
}

/**
 * Folds a single live trade into the candle array in real time.
 */
export function applyTradeToCandles(
  candles: OhlcvCandle[],
  trade: LiveTrade,
  timeframe: CandleTimeframe,
): OhlcvCandle[] {
  const tsSec = trade.timestamp ? Math.floor(trade.timestamp / 1000) : Math.floor(Date.now() / 1000);
  const time = bucketStart(tsSec, timeframe);
  const price = trade.price;
  const volumeUsdc = (trade.usdc_amount || 0) > 1e4 ? trade.usdc_amount / 1e6 : trade.usdc_amount;
  const last = candles[candles.length - 1];

  if (last && last.timestamp === (time as number)) {
    const updated: OhlcvCandle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
      volume: last.volume + volumeUsdc,
    };
    return [...candles.slice(0, -1), updated];
  }

  const openPrice = last ? last.close : price;
  const fresh: OhlcvCandle = {
    timestamp: time as number,
    open: openPrice,
    high: Math.max(openPrice, price),
    low: Math.min(openPrice, price),
    close: price,
    volume: volumeUsdc,
  };
  return [...candles, fresh];
}

// ---- Component Props ----------------------------------------------------

interface TokenChartProps {
  candles: OhlcvCandle[];
  tokenSymbol?: string;
  timeframe?: CandleTimeframe;
  isConnected?: boolean;
}

export const TokenChart = memo(function TokenChart({
  candles,
  tokenSymbol,
  timeframe = '5m',
}: TokenChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const histogramSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  const [hoverData, setHoverData] = useState<{
    time: string;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  } | null>(null);

  // 1. Initialize Chart instance on mount
  useEffect(() => {
    if (!containerRef.current) return;

    const isDark = typeof document !== 'undefined'
      ? document.documentElement.classList.contains('dark')
      : true;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#0a0e1a' : '#ffffff' },
        textColor: isDark ? '#8b95a8' : '#101828',
        fontFamily: "'Inter', 'JetBrains Mono', system-ui, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(39, 117, 202, 0.06)' : 'rgba(0, 0, 0, 0.04)' },
        horzLines: { color: isDark ? 'rgba(39, 117, 202, 0.06)' : 'rgba(0, 0, 0, 0.04)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        borderColor: isDark ? '#1e2a44' : '#ececec',
        barSpacing: 8,
      },
      rightPriceScale: {
        borderColor: isDark ? '#1e2a44' : '#ececec',
        scaleMargins: { top: 0.1, bottom: 0.2 },
      },
      width: containerRef.current.clientWidth,
      height: containerRef.current.clientHeight,
    });

    // Volume Series overlay (lightweight-charts v5 addSeries API)
    const histogramSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 },
    });

    // Candlestick Series (lightweight-charts v5 addSeries API)
    const candlestickSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    chartRef.current = chart;
    candlestickSeriesRef.current = candlestickSeries;
    histogramSeriesRef.current = histogramSeries;

    // Tooltip crosshair subscriber
    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.time || !param.seriesData) {
        setHoverData(null);
        return;
      }
      const candleData = param.seriesData.get(candlestickSeries) as CandlestickData | undefined;
      const volData = param.seriesData.get(histogramSeries) as HistogramData | undefined;
      if (candleData) {
        const timeStr = new Date((param.time as number) * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        setHoverData({
          time: timeStr,
          open: candleData.open,
          high: candleData.high,
          low: candleData.low,
          close: candleData.close,
          volume: volData ? volData.value : 0,
        });
      }
    });

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candlestickSeriesRef.current = null;
      histogramSeriesRef.current = null;
    };
  }, []);

  // 2. Set series data whenever candles array changes
  useEffect(() => {
    if (!candlestickSeriesRef.current || !histogramSeriesRef.current || candles.length === 0) {
      return;
    }

    const candleData: CandlestickData[] = candles.map((c) => ({
      time: c.timestamp as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));

    const volumeData: HistogramData[] = candles.map((c) => ({
      time: c.timestamp as UTCTimestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    }));

    candlestickSeriesRef.current.setData(candleData);
    histogramSeriesRef.current.setData(volumeData);
    chartRef.current?.timeScale().fitContent();
  }, [candles]);

  return (
    <div className="relative w-full h-full min-h-[350px]">
      {/* Legend overlay */}
      {hoverData && (
        <div className="absolute top-2 left-2 z-10 bg-bg-card/90 backdrop-blur-md border border-bg-border px-3 py-1.5 rounded text-xs font-mono flex items-center gap-3 text-text-secondary pointer-events-none">
          <span className="text-text-muted">{hoverData.time}</span>
          <span>O <strong className="text-text-primary">${hoverData.open.toFixed(6)}</strong></span>
          <span>H <strong className="text-text-primary">${hoverData.high.toFixed(6)}</strong></span>
          <span>L <strong className="text-text-primary">${hoverData.low.toFixed(6)}</strong></span>
          <span>C <strong className="text-text-primary">${hoverData.close.toFixed(6)}</strong></span>
          <span>Vol <strong className="text-text-primary">${hoverData.volume.toFixed(2)}</strong></span>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full min-h-[350px]" />

      {candles.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg-card/50 backdrop-blur-xs">
          <div className="text-center text-text-muted text-sm space-y-1">
            <div className="text-2xl">📊</div>
            <div className="font-semibold text-text-primary">No trades yet</div>
            <div className="text-xs text-text-muted">
              Once the first trade occurs for {tokenSymbol ? `$${tokenSymbol}` : 'this token'}, price history will appear here.
            </div>
          </div>
        </div>
      )}
    </div>
  );
});
