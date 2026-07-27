'use client';

import { memo, useState } from 'react';
import { CandleTimeframe } from '@/lib/api';

export type ChartType = 'candlestick' | 'line' | 'area';
export type MetricMode = 'price' | 'mcap';
export type ScaleType = 'linear' | 'log';

const TIMEFRAMES: { key: CandleTimeframe; label: string }[] = [
  { key: '1m', label: '1m' },
  { key: '5m', label: '5m' },
  { key: '15m', label: '15m' },
  { key: '30m', label: '30m' },
  { key: '1h', label: '1H' },
  { key: '4h', label: '4H' },
  { key: '1d', label: '1D' },
];

/**
 * ChartToolbar — compact toolbar for the trading chart.
 * Timeframes, chart type, price/mcap toggle, scale, fullscreen.
 */
export const ChartToolbar = memo(function ChartToolbar({
  isConnected,
  timeframe,
  chartType,
  metricMode,
  scale,
  showMarkers,
  onTimeframeChange,
  onChartTypeChange,
  onMetricModeChange,
  onScaleChange,
  onToggleMarkers,
  onFullscreen,
  onResetChart,
}: {
  isConnected?: boolean;
  timeframe: CandleTimeframe;
  chartType: ChartType;
  metricMode: MetricMode;
  scale: ScaleType;
  showMarkers: boolean;
  onTimeframeChange: (tf: CandleTimeframe) => void;
  onChartTypeChange: (type: ChartType) => void;
  onMetricModeChange: (mode: MetricMode) => void;
  onScaleChange: (scale: ScaleType) => void;
  onToggleMarkers: () => void;
  onFullscreen: () => void;
  onResetChart: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[rgb(var(--color-bg-card))] border-b border-bg-border text-[11px] flex-wrap">
      {/* Timeframes + Connection Status */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              onClick={() => onTimeframeChange(tf.key)}
              className={`px-2 py-1 font-medium transition-colors ${
                timeframe === tf.key
                  ? 'bg-accent-blue text-white'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Live / Reconnecting badge */}
        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono border border-bg-border bg-bg-card">
          <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
          <span className="text-text-secondary">{isConnected ? 'Live' : 'Reconnecting'}</span>
        </div>
      </div>

      {/* Chart type + controls */}
      <div className="flex items-center gap-1.5">
        {/* Chart type */}
        <div className="flex items-center border border-bg-border overflow-hidden">
          <button
            onClick={() => onChartTypeChange('candlestick')}
            className={`px-2 py-1 transition-colors ${chartType === 'candlestick' ? 'bg-accent-blue text-white' : 'text-text-muted hover:text-text-primary'}`}
            title="Candlestick"
          >
            ◩
          </button>
          <button
            onClick={() => onChartTypeChange('line')}
            className={`px-2 py-1 transition-colors ${chartType === 'line' ? 'bg-accent-blue text-white' : 'text-text-muted hover:text-text-primary'}`}
            title="Line"
          >
            ╱
          </button>
          <button
            onClick={() => onChartTypeChange('area')}
            className={`px-2 py-1 transition-colors ${chartType === 'area' ? 'bg-accent-blue text-white' : 'text-text-muted hover:text-text-primary'}`}
            title="Area"
          >
            ▤
          </button>
        </div>

        {/* Divider */}
        <div className="w-px h-4 bg-bg-border" />

        {/* Price / MCap toggle */}
        <button
          onClick={() => onMetricModeChange(metricMode === 'price' ? 'mcap' : 'price')}
          className="px-2 py-1 border border-bg-border text-text-muted hover:text-text-primary transition-colors font-medium"
        >
          {metricMode === 'price' ? 'Price' : 'MCap'}
        </button>

        {/* Scale toggle */}
        <button
          onClick={() => onScaleChange(scale === 'linear' ? 'log' : 'linear')}
          className={`px-2 py-1 border border-bg-border transition-colors font-mono ${
            scale === 'log' ? 'bg-accent-blue text-white' : 'text-text-muted hover:text-text-primary'
          }`}
        >
          log
        </button>

        {/* Show trades markers */}
        <button
          onClick={onToggleMarkers}
          className={`px-2 py-1 border border-bg-border transition-colors ${
            showMarkers ? 'bg-accent-blue text-white' : 'text-text-muted hover:text-text-primary'
          }`}
          title="Show trade markers"
        >
          ▲▼
        </button>

        {/* Divider */}
        <div className="w-px h-4 bg-bg-border" />

        {/* Reset */}
        <button
          onClick={onResetChart}
          className="px-2 py-1 text-text-muted hover:text-text-primary transition-colors"
          title="Reset / Fit chart"
        >
          ⟲
        </button>

        {/* Fullscreen */}
        <button
          onClick={onFullscreen}
          className="px-2 py-1 text-text-muted hover:text-text-primary transition-colors"
          title="Fullscreen"
        >
          ⛶
        </button>
      </div>
    </div>
  );
});
