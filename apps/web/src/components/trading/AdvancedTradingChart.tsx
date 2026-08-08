'use client';

import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, CandleTimeframe, OhlcvCandle } from '@/lib/api';
import { MetricMode } from './ChartToolbar';
import { TradingChart } from './TradingChart';

const LIBRARY_PATH = '/vendor/tradingview/charting_library/';
const LIBRARY_SCRIPT = `${LIBRARY_PATH}charting_library.standalone.js`;
const SUPPORTED_RESOLUTIONS = ['10S', '1', '5', '15', '30', '60', '240', '1D'] as const;

type TvResolution = (typeof SUPPORTED_RESOLUTIONS)[number];

type TvBar = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

type HistoryMetadata = { noData: boolean };
type RealtimeCallback = (bar: TvBar) => void;

type TvSubscription = {
  subscribe: (context: unknown, callback: (resolution: string) => void) => void;
  unsubscribe?: (context: unknown, callback: (resolution: string) => void) => void;
};

type TvWidget = {
  chartReady: () => Promise<void>;
  activeChart: () => {
    onIntervalChanged: () => TvSubscription;
    createStudy?: (name: string, forceOverlay?: boolean, lock?: boolean) => Promise<unknown>;
  };
  remove: () => void;
};

type TradingViewGlobal = {
  widget: new (options: Record<string, unknown>) => TvWidget;
};

declare global {
  interface Window {
    TradingView?: TradingViewGlobal;
  }
}

const RESOLUTION_TO_TIMEFRAME: Record<TvResolution, CandleTimeframe> = {
  '10S': '10s',
  '1': '1m',
  '5': '5m',
  '15': '15m',
  '30': '30m',
  '60': '1h',
  '240': '4h',
  '1D': '1d',
};

const TIMEFRAME_TO_RESOLUTION: Record<CandleTimeframe, TvResolution> = {
  '10s': '10S',
  '1m': '1',
  '5m': '5',
  '15m': '15',
  '30m': '30',
  '1h': '60',
  '4h': '240',
  '1d': '1D',
};

let libraryPromise: Promise<boolean> | null = null;

function loadTradingViewLibrary(): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.TradingView?.widget) return Promise.resolve(true);
  if (libraryPromise) return libraryPromise;

  libraryPromise = new Promise((resolvePromise) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${LIBRARY_SCRIPT}"]`);
    const script = existing || document.createElement('script');
    let settled = false;

    const finish = (available: boolean) => {
      if (settled) return;
      settled = true;
      script.dataset.loadState = available ? 'ready' : 'failed';
      resolvePromise(available);
    };

    script.addEventListener('load', () => finish(Boolean(window.TradingView?.widget)), { once: true });
    script.addEventListener('error', () => finish(false), { once: true });

    if (existing?.dataset.loadState === 'ready') {
      finish(Boolean(window.TradingView?.widget));
      return;
    }
    if (existing?.dataset.loadState === 'failed') {
      finish(false);
      return;
    }

    if (!existing) {
      script.src = LIBRARY_SCRIPT;
      script.async = true;
      script.dataset.orbaTradingView = 'advanced-charts';
      const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
      if (nonce) script.nonce = nonce;
      document.head.appendChild(script);
    }
  });

  return libraryPromise;
}

function isTvResolution(value: string): value is TvResolution {
  return SUPPORTED_RESOLUTIONS.includes(value as TvResolution);
}

function toTvBar(candle: OhlcvCandle): TvBar {
  return {
    time: candle.timestamp * 1000,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume,
  };
}

export function createOrbaDatafeed({
  tokenAddress,
  tokenName,
  tokenSymbol,
  metricMode,
  subscribers,
}: {
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  metricMode: MetricMode;
  subscribers: Map<string, { resolution: TvResolution; callback: RealtimeCallback }>;
}) {
  const displaySymbol = `${tokenSymbol}/${metricMode === 'price' ? 'USDC' : 'MCAP'}`;

  return {
    onReady(callback: (configuration: Record<string, unknown>) => void) {
      queueMicrotask(() => callback({
        supported_resolutions: [...SUPPORTED_RESOLUTIONS],
        supports_marks: false,
        supports_timescale_marks: false,
        supports_time: true,
      }));
    },
    searchSymbols(
      _userInput: string,
      _exchange: string,
      _symbolType: string,
      onResult: (results: unknown[]) => void,
    ) {
      onResult([]);
    },
    resolveSymbol(
      _symbolName: string,
      onResolve: (symbolInfo: Record<string, unknown>) => void,
      _onError: (reason: string) => void,
    ) {
      queueMicrotask(() => onResolve({
        name: displaySymbol,
        ticker: tokenAddress,
        description: `${tokenName} on Orba`,
        type: 'crypto',
        session: '24x7',
        timezone: 'Etc/UTC',
        exchange: 'Orba',
        listed_exchange: 'Orba',
        format: 'price',
        minmov: 1,
        pricescale: metricMode === 'price' ? 1_000_000_000_000 : 100,
        has_intraday: true,
        intraday_multipliers: ['1', '5', '15', '30', '60', '240'],
        has_seconds: true,
        seconds_multipliers: ['10'],
        has_daily: true,
        supported_resolutions: [...SUPPORTED_RESOLUTIONS],
        volume_precision: 2,
        data_status: 'streaming',
      }));
    },
    async getBars(
      _symbolInfo: unknown,
      resolution: string,
      periodParams: { from: number; to: number; countBack: number },
      onHistory: (bars: TvBar[], metadata: HistoryMetadata) => void,
      onError: (reason: string) => void,
    ) {
      if (!isTvResolution(resolution)) {
        onError(`Unsupported resolution: ${resolution}`);
        return;
      }

      try {
        const timeframe = RESOLUTION_TO_TIMEFRAME[resolution];
        const candles = await api.getCandles(tokenAddress, timeframe, metricMode, 2000);
        const eligible = candles.filter((candle) => candle.timestamp < periodParams.to);
        const requested = eligible.filter((candle) => candle.timestamp >= periodParams.from);
        const selected = requested.length >= periodParams.countBack
          ? requested
          : eligible.slice(-periodParams.countBack);
        const bars = selected.map(toTvBar);
        onHistory(bars, { noData: bars.length === 0 });
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Unable to load Orba candles');
      }
    },
    subscribeBars(
      _symbolInfo: unknown,
      resolution: string,
      onRealtime: RealtimeCallback,
      listenerGuid: string,
    ) {
      if (isTvResolution(resolution)) {
        subscribers.set(listenerGuid, { resolution, callback: onRealtime });
      }
    },
    unsubscribeBars(listenerGuid: string) {
      subscribers.delete(listenerGuid);
    },
    getServerTime(callback: (time: number) => void) {
      callback(Math.floor(Date.now() / 1000));
    },
  };
}

type AdvancedChartProps = {
  candles: OhlcvCandle[];
  tokenAddress: string;
  tokenName: string;
  tokenSymbol: string;
  timeframe: CandleTimeframe;
  isConnected?: boolean;
  onTimeframeChange: (timeframe: CandleTimeframe) => void;
  metricMode: MetricMode;
  onMetricModeChange: (mode: MetricMode) => void;
};

function LicensedAdvancedChart({
  candles,
  tokenAddress,
  tokenName,
  tokenSymbol,
  timeframe,
  isConnected,
  onTimeframeChange,
  metricMode,
  onMetricModeChange,
}: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<TvWidget | null>(null);
  const timeframeRef = useRef(timeframe);
  const subscribersRef = useRef(
    new Map<string, { resolution: TvResolution; callback: RealtimeCallback }>(),
  );

  const datafeed = useMemo(
    () => createOrbaDatafeed({
      tokenAddress,
      tokenName,
      tokenSymbol,
      metricMode,
      subscribers: subscribersRef.current,
    }),
    [metricMode, tokenAddress, tokenName, tokenSymbol],
  );

  useEffect(() => {
    timeframeRef.current = timeframe;
  }, [timeframe]);

  useEffect(() => {
    const TradingView = window.TradingView;
    if (!TradingView?.widget || !containerRef.current) return;

    subscribersRef.current.clear();
    const intervalChanged = (resolution: string) => {
      if (!isTvResolution(resolution)) return;
      const nextTimeframe = RESOLUTION_TO_TIMEFRAME[resolution];
      if (nextTimeframe !== timeframeRef.current) onTimeframeChange(nextTimeframe);
    };

    let disposed = false;
    const nonce = document.querySelector<HTMLScriptElement>('script[nonce]')?.nonce;
    const widget = new TradingView.widget({
      container: containerRef.current,
      datafeed,
      symbol: tokenAddress,
      interval: TIMEFRAME_TO_RESOLUTION[timeframe],
      library_path: LIBRARY_PATH,
      nonce,
      locale: 'en',
      timezone: 'Etc/UTC',
      autosize: true,
      theme: 'dark',
      toolbar_bg: '#0a0e1a',
      loading_screen: { backgroundColor: '#0a0e1a', foregroundColor: '#2775ca' },
      enabled_features: [
        'seconds_resolution',
        'iframe_loading_same_origin',
      ],
      disabled_features: [
        'use_localstorage_for_settings',
        'header_symbol_search',
        'symbol_search_hot_key',
      ],
      favorites: {
        intervals: [...SUPPORTED_RESOLUTIONS],
      },
      overrides: {
        'paneProperties.background': '#0a0e1a',
        'paneProperties.backgroundType': 'solid',
        'paneProperties.vertGridProperties.color': 'rgba(39, 117, 202, 0.08)',
        'paneProperties.horzGridProperties.color': 'rgba(39, 117, 202, 0.08)',
        'scalesProperties.textColor': '#8b95a8',
        'mainSeriesProperties.candleStyle.upColor': '#22c55e',
        'mainSeriesProperties.candleStyle.downColor': '#ef4444',
        'mainSeriesProperties.candleStyle.borderUpColor': '#22c55e',
        'mainSeriesProperties.candleStyle.borderDownColor': '#ef4444',
        'mainSeriesProperties.candleStyle.wickUpColor': '#22c55e',
        'mainSeriesProperties.candleStyle.wickDownColor': '#ef4444',
      },
    });

    widgetRef.current = widget;
    widget.chartReady().then(() => {
      if (disposed) return;
      const chart = widget.activeChart();
      chart.onIntervalChanged().subscribe(null, intervalChanged);
      chart.createStudy?.('Volume', false, false).catch(() => undefined);
    }).catch(() => undefined);

    return () => {
      disposed = true;
      try {
        widget.activeChart().onIntervalChanged().unsubscribe?.(null, intervalChanged);
      } catch {
        // Widget may not have completed initialization.
      }
      subscribersRef.current.clear();
      try {
        widget.remove();
      } catch {
        // Widget may not have completed initialization.
      }
      widgetRef.current = null;
    };
  }, [datafeed, metricMode, onTimeframeChange, tokenAddress]);

  useEffect(() => {
    const latest = candles.at(-1);
    if (!latest) return;

    for (const subscriber of subscribersRef.current.values()) {
      if (RESOLUTION_TO_TIMEFRAME[subscriber.resolution] === timeframe) {
        subscriber.callback(toTvBar(latest));
      }
    }
  }, [candles, timeframe]);

  return (
    <div className="card !p-0 overflow-hidden border border-bg-border bg-[#0a0e1a]">
      <div className="flex h-10 items-center justify-between border-b border-[#1e2a44] px-3 text-xs">
        <div className="flex items-center gap-2 text-[#8b95a8]">
          <span className={`h-2 w-2 ${isConnected ? 'bg-emerald-500' : 'bg-amber-500'}`} />
          <span>{isConnected ? 'Live' : 'Reconnecting'}</span>
          <span className="text-[#4f5d75]">TradingView Advanced Charts</span>
        </div>
        <div className="flex items-center border border-[#1e2a44]">
          {(['price', 'mcap'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onMetricModeChange(mode)}
              className={`px-3 py-1 font-medium uppercase transition-colors ${
                metricMode === mode
                  ? 'bg-[#2775ca] text-white'
                  : 'text-[#8b95a8] hover:text-white'
              }`}
            >
              {mode === 'price' ? 'Price' : 'Market cap'}
            </button>
          ))}
        </div>
      </div>
      <div ref={containerRef} className="h-[380px] w-full sm:h-[480px] lg:h-[560px]" />
    </div>
  );
}

export const AdvancedTradingChart = memo(function AdvancedTradingChart(props: AdvancedChartProps) {
  const [libraryAvailable, setLibraryAvailable] = useState(
    () => typeof window !== 'undefined' && Boolean(window.TradingView?.widget),
  );

  useEffect(() => {
    let active = true;
    loadTradingViewLibrary().then((available) => {
      if (active) setLibraryAvailable(available);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleMetricModeChange = useCallback(
    (mode: MetricMode) => props.onMetricModeChange(mode),
    [props.onMetricModeChange],
  );

  if (!libraryAvailable) {
    return (
      <TradingChart
        candles={props.candles}
        tokenSymbol={props.tokenSymbol}
        timeframe={props.timeframe}
        isConnected={props.isConnected}
        onTimeframeChange={props.onTimeframeChange}
        metricMode={props.metricMode}
        onMetricModeChange={handleMetricModeChange}
      />
    );
  }

  return <LicensedAdvancedChart {...props} onMetricModeChange={handleMetricModeChange} />;
});
