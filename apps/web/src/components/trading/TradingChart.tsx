'use client';

import { useRef, useEffect, useCallback, useState, memo } from 'react';
import { OhlcvCandle, CandleTimeframe } from '@/lib/api';
import { formatMarketCap, formatPrice } from '@/lib/utils';
import { ChartToolbar, ChartType, MetricMode, ScaleType } from './ChartToolbar';
import { ConnectionStatus } from '@/lib/useWebSocket';
import { ChartLineUp, X } from '@phosphor-icons/react';

// Dynamic imports for lightweight-charts (client-side only)
let createChart: any;
let ColorType: any;
let CrosshairMode: any;
let LineType: any;
let PriceScaleMode: any;
let CandlestickSeries: any;
let AreaSeries: any;
let LineSeries: any;
let HistogramSeries: any;

/**
 * TradingChart — professional trading chart powered by TradingView Lightweight Charts.
 *
 * Key differences from the old PriceChart:
 *   - Uses server-side OHLCV candles (not client-side aggregation from raw trades)
 *   - Dark terminal theme forced regardless of site theme
 *   - Isolated chart state — only the current candle is updated on trades
 *   - Volume overlay at the bottom
 *   - Professional crosshair with OHLCV tooltip
 */
export const TradingChart = memo(function TradingChart({
  candles,
  tokenSymbol,
  timeframe,
  isConnected,
  connectionStatus,
  onTimeframeChange,
  metricMode: externalMode,
  onMetricModeChange: externalModeChange,
}: {
  candles: OhlcvCandle[];
  tokenSymbol?: string;
  timeframe: CandleTimeframe;
  isConnected?: boolean;
  connectionStatus?: ConnectionStatus;
  onTimeframeChange: (tf: CandleTimeframe) => void;
  metricMode?: MetricMode;
  onMetricModeChange?: (mode: MetricMode) => void;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const mainSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chartType, setChartType] = useState<ChartType>('candlestick');
  const [metricMode, setMetricMode] = useState<MetricMode>(externalMode || 'price');
  const [scale, setScale] = useState<ScaleType>('linear');
  const [showMarkers, setShowMarkers] = useState(false);
  const [isDark, setIsDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
  );
  const hasCandles = candles.length > 0;

  useEffect(() => {
    const root = document.documentElement;
    const syncTheme = () => setIsDark(root.classList.contains('dark'));
    syncTheme();
    const observer = new MutationObserver(syncTheme);
    observer.observe(root, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  // Sync external mode
  useEffect(() => {
    if (externalMode) setMetricMode(externalMode);
  }, [externalMode]);

  // Load lightweight-charts dynamically
  useEffect(() => {
    import('lightweight-charts').then((mod) => {
      createChart = mod.createChart;
      ColorType = mod.ColorType;
      CrosshairMode = mod.CrosshairMode;
      LineType = mod.LineType;
      PriceScaleMode = mod.PriceScaleMode;
      CandlestickSeries = mod.CandlestickSeries;
      AreaSeries = mod.AreaSeries;
      LineSeries = mod.LineSeries;
      HistogramSeries = mod.HistogramSeries;
      setReady(true);
    });
  }, []);

  const formatValue = useCallback(
    (val: number) => {
      if (val === undefined || val === null || isNaN(val)) return '$0.00';
      return metricMode === 'price' ? formatPrice(val) : formatMarketCap(val);
    },
    [metricMode],
  );

  const [hoverLegend, setHoverLegend] = useState<{
    time?: string;
    price?: number;
    volume?: number;
  } | null>(null);

  // Render chart
  useEffect(() => {
    if (!ready || !chartContainerRef.current || !hasCandles) return;

    // Clean up previous chart
    if (chartRef.current) {
      try { chartRef.current.remove(); } catch { /* */ }
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    }

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: isDark ? '#13182b' : '#fffdf6' },
        textColor: isDark ? '#9aa4bf' : '#70778a',
        fontFamily: "'Inter', 'JetBrains Mono', system-ui, monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: isDark ? 'rgba(126, 153, 255, 0.10)' : 'rgba(130, 116, 87, 0.13)', style: 1 },
        horzLines: { color: isDark ? 'rgba(126, 153, 255, 0.10)' : 'rgba(130, 116, 87, 0.13)', style: 1 },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#7e99ff' : '#2348df',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#313b65' : '#2348df',
        },
        horzLine: {
          color: isDark ? '#7e99ff' : '#2348df',
          width: 1,
          style: 3,
          labelBackgroundColor: isDark ? '#313b65' : '#2348df',
        },
      },
      rightPriceScale: {
        borderColor: isDark ? '#3e4767' : '#ddd6c6',
        scaleMargins: { top: 0.1, bottom: 0.22 },
        mode: scale === 'log' ? PriceScaleMode.Logarithmic : PriceScaleMode.Normal,
        autoScale: true,
      },
      timeScale: {
        borderColor: isDark ? '#3e4767' : '#ddd6c6',
        timeVisible: true,
        secondsVisible: timeframe === '10s',
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScroll: { vertTouchDrag: false },
      handleScale: { axisPressedMouseMove: true },
    });

    // Volume series (overlay at bottom)
    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceScaleId: 'volume_overlay',
      priceFormat: { type: 'volume' },
    });
    chart.priceScale('volume_overlay').applyOptions({
      scaleMargins: { top: 0.82, bottom: 0 },
    });

    const volumeData = candles.map((c) => ({
      time: c.timestamp,
      value: c.volume,
      color: c.close >= c.open
        ? 'rgba(34, 197, 94, 0.3)'
        : 'rgba(239, 68, 68, 0.3)',
    }));
    volumeSeries.setData(volumeData);
    volumeSeriesRef.current = volumeSeries;

    // Main series
    const priceFormat = {
      type: 'custom' as const,
      minMove: metricMode === 'price' ? 0.00000001 : 0.01,
      formatter: (p: number) => formatValue(p),
    };

    let mainSeries: any;

    if (chartType === 'candlestick') {
      mainSeries = chart.addSeries(CandlestickSeries, {
        upColor: isDark ? '#62d29f' : '#4ca978',
        downColor: isDark ? '#ff7162' : '#e86959',
        wickUpColor: isDark ? '#62d29f' : '#4ca978',
        wickDownColor: isDark ? '#ff7162' : '#e86959',
        borderVisible: false,
        priceFormat,
      });
      mainSeries.setData(
        candles.map((c) => ({
          time: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else if (chartType === 'line') {
      mainSeries = chart.addSeries(LineSeries || AreaSeries, {
        color: '#2775CA',
        lineWidth: 2,
        priceFormat,
      });
      mainSeries.setData(
        candles.map((c) => ({ time: c.timestamp, value: c.close }))
      );
    } else {
      // area
      const lastCandle = candles[candles.length - 1];
      const firstCandle = candles[0];
      const isUp = lastCandle && firstCandle ? lastCandle.close >= firstCandle.close : true;
      mainSeries = chart.addSeries(AreaSeries, {
        lineColor: isUp ? '#22c55e' : '#ef4444',
        topColor: isUp ? 'rgba(34, 197, 94, 0.18)' : 'rgba(239, 68, 68, 0.18)',
        bottomColor: isUp ? 'rgba(34, 197, 94, 0.0)' : 'rgba(239, 68, 68, 0.0)',
        lineWidth: 2,
        lineType: LineType?.Curved || 0,
        priceFormat,
      });
      mainSeries.setData(
        candles.map((c) => ({ time: c.timestamp, value: c.close }))
      );
    }

    // Add $30.0K DEX Graduation Threshold line when in Market Cap mode
    if (metricMode === 'mcap') {
      try {
        mainSeries.createPriceLine({
          price: 30000,
          color: '#a855f7',
          lineWidth: 1,
          lineStyle: 2, // Dashed
          axisLabelVisible: true,
          title: 'DEX Graduation ($30K)',
        });
      } catch {
        /* ignore if price line unsupported */
      }
    }

    // Subscribe to crosshair move for dynamic header legend
    chart.subscribeCrosshairMove((param: any) => {
      if (!param || !param.time || param.point === undefined || param.point.x < 0) {
        setHoverLegend(null);
        return;
      }
      const data = param.seriesData.get(mainSeries);
      const volData = param.seriesData.get(volumeSeries);
      if (data) {
        const val = data.close !== undefined ? data.close : data.value;
        const formattedTime = new Date(param.time * 1000).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });
        setHoverLegend({
          time: formattedTime,
          price: val,
          volume: volData ? volData.value : undefined,
        });
      }
    });

    mainSeriesRef.current = mainSeries;
    volumeSeriesRef.current = volumeSeries;
    chart.timeScale().fitContent();
    chartRef.current = chart;

    // Responsive resize
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          chart.applyOptions({ width, height });
        }
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      try { chart.remove(); } catch { /* */ }
      chartRef.current = null;
      mainSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [ready, hasCandles, chartType, scale, metricMode, timeframe, formatValue, isDark]);

  // Update series data when candles change without destroying chart
  useEffect(() => {
    if (!mainSeriesRef.current || !volumeSeriesRef.current || candles.length === 0) return;

    const volumeData = candles.map((c) => ({
      time: c.timestamp,
      value: c.volume,
      color: c.close >= c.open ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
    }));

    volumeSeriesRef.current.setData(volumeData);

    if (chartType === 'candlestick') {
      mainSeriesRef.current.setData(
        candles.map((c) => ({
          time: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
        }))
      );
    } else {
      mainSeriesRef.current.setData(
        candles.map((c) => ({ time: c.timestamp, value: c.close }))
      );
    }
  }, [candles, chartType]);

  const handleMetricChange = useCallback(
    (mode: MetricMode) => {
      setMetricMode(mode);
      externalModeChange?.(mode);
    },
    [externalModeChange],
  );

  const handleFullscreen = useCallback(() => {
    setIsFullscreen((prev) => !prev);
  }, []);

  const handleReset = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.timeScale().fitContent();
    }
  }, []);

  return (
    <div
      className={`flex flex-col bg-bg-card ${
        isFullscreen
          ? 'fixed inset-0 z-50 bg-bg-base'
          : 'h-full overflow-hidden'
      }`}
    >
      {/* Toolbar */}
      <ChartToolbar
        isConnected={isConnected}
        connectionStatus={connectionStatus}
        timeframe={timeframe}
        chartType={chartType}
        metricMode={metricMode}
        scale={scale}
        showMarkers={showMarkers}
        onTimeframeChange={onTimeframeChange}
        onChartTypeChange={setChartType}
        onMetricModeChange={handleMetricChange}
        onScaleChange={setScale}
        onToggleMarkers={() => setShowMarkers(!showMarkers)}
        onFullscreen={handleFullscreen}
        onResetChart={handleReset}
      />

      {/* Chart canvas */}
      <div className="relative flex-1 min-h-0">
        {/* Dynamic Crosshair Hover Legend Overlay */}
        {hoverLegend && (
          <div className="pointer-events-none absolute left-2 top-2 z-10 flex items-center gap-3 rounded-md border border-bg-border bg-bg-card/90 px-2.5 py-1 font-mono text-[11px] text-text-secondary backdrop-blur-md">
            <span className="text-text-muted">{hoverLegend.time}</span>
            <span>
              <span className="text-text-muted mr-1">{metricMode === 'price' ? 'Price:' : 'MCap:'}</span>
              <span className="font-bold text-text-primary">{formatValue(hoverLegend.price || 0)}</span>
            </span>
            {hoverLegend.volume !== undefined && (
              <span>
                <span className="text-text-muted mr-1">Vol:</span>
                <span className="font-bold text-text-primary">{formatPrice(hoverLegend.volume)}</span>
              </span>
            )}
          </div>
        )}

        <div
          ref={chartContainerRef}
          className={`w-full ${isFullscreen ? 'h-full' : 'h-[420px] sm:h-[500px] lg:h-[460px]'}`}
        />

        {/* Empty state — no fake candles manufactured */}
        {candles.length === 0 && ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-card">
            <div className="text-center text-text-muted text-sm space-y-1">
              <ChartLineUp size={28} weight="duotone" className="mx-auto mb-2 text-accent-blue" aria-hidden="true" />
              <div className="font-semibold text-text-primary">No trades in this timeframe</div>
              <div className="text-xs text-text-muted">
                Select a longer interval or wait for the next trade.
              </div>
            </div>
          </div>
        )}

        {/* Loading state */}
        {!ready && (
          <div className="absolute inset-0 flex items-center justify-center bg-bg-card">
            <div className="w-6 h-6 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Watermark */}
        <div className="absolute bottom-2 left-2 text-[9px] text-text-muted/40 font-mono pointer-events-none">
          Orba.fun · {tokenSymbol ? `$${tokenSymbol}` : ''} · {timeframe}
        </div>

        {/* Fullscreen exit */}
        {isFullscreen && (
          <button
            onClick={handleFullscreen}
            className="absolute top-2 right-2 z-10 inline-flex items-center gap-1.5 border border-bg-border bg-bg-card px-3 py-1 text-xs text-text-primary transition-colors hover:bg-bg-hover"
          >
            <X size={14} weight="bold" aria-hidden="true" /> Exit
          </button>
        )}
      </div>
    </div>
  );
});
