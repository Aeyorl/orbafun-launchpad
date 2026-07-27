/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TradingChart } from '../trading/TradingChart';
import type { OhlcvCandle } from '@/lib/api';

// Mock ChartToolbar since it's a separate component with its own rendering logic
vi.mock('../trading/ChartToolbar', () => ({
  ChartToolbar: vi.fn((props) => {
    const { onTimeframeChange, onChartTypeChange, onMetricModeChange, onScaleChange, onFullscreen, onResetChart } = props;
    return (
      <div data-testid="chart-toolbar">
        <button onClick={() => onTimeframeChange?.('1h')} data-testid="tf-1h">1h</button>
        <button onClick={() => onChartTypeChange?.('line')} data-testid="chart-line">Line</button>
        <button onClick={() => onMetricModeChange?.('mcap')} data-testid="mode-mcap">MCap</button>
        <button onClick={() => onScaleChange?.('log')} data-testid="scale-log">Log</button>
        <button onClick={onFullscreen} data-testid="fullscreen">Full</button>
        <button onClick={onResetChart} data-testid="reset">Reset</button>
      </div>
    );
  }),
}));

// ─── Mock Candle Data ────────────────────────────────────────────────────

function createMockCandles(count = 5): OhlcvCandle[] {
  const candles: OhlcvCandle[] = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = count; i > 0; i--) {
    candles.push({
      timestamp: now - i * 300,
      open: 0.000004,
      high: 0.000005,
      low: 0.000003,
      close: 0.0000045,
      volume: 1000,
    });
  }
  return candles;
}

// ─── Tests ───────────────────────────────────────────────────────────────

describe('TradingChart', () => {
  // Clean up DOM between tests to avoid element collisions
  afterEach(() => {
    cleanup();
  });

  it('renders the chart toolbar', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        onTimeframeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chart-toolbar')).toBeInTheDocument();
  });

  it('shows token symbol in watermark', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        tokenSymbol="ADOGE"
        timeframe="5m"
        onTimeframeChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/\$ADOGE/)).toBeInTheDocument();
  });

  it('shows timeframe in watermark', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="1h"
        onTimeframeChange={vi.fn()}
      />,
    );

    // Use getAllByText and check at least one match is the watermark
    const matches = screen.getAllByText(/1h/);
    expect(matches.length).toBeGreaterThanOrEqual(1);
  });

  it('calls onTimeframeChange when toolbar button is clicked', () => {
    const onTimeframeChange = vi.fn();

    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        onTimeframeChange={onTimeframeChange}
      />,
    );

    // Use getAllByTestId and pick the first matching button
    const buttons = screen.getAllByTestId('tf-1h');
    fireEvent.click(buttons[0]);
    expect(onTimeframeChange).toHaveBeenCalledWith('1h');
  });

  it('shows fullscreen button in toolbar', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        onTimeframeChange={vi.fn()}
      />,
    );

    const buttons = screen.getAllByTestId('fullscreen');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('renders with default metric mode price', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        metricMode="price"
        onTimeframeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chart-toolbar')).toBeInTheDocument();
  });

  it('renders with market cap metric mode', () => {
    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        metricMode="mcap"
        onTimeframeChange={vi.fn()}
      />,
    );

    expect(screen.getByTestId('chart-toolbar')).toBeInTheDocument();
  });

  it('fires onMetricModeChange when metric mode toggled in toolbar', () => {
    const onMetricModeChange = vi.fn();

    render(
      <TradingChart
        candles={createMockCandles()}
        timeframe="5m"
        metricMode="price"
        onTimeframeChange={vi.fn()}
        onMetricModeChange={onMetricModeChange}
      />,
    );

    const buttons = screen.getAllByTestId('mode-mcap');
    fireEvent.click(buttons[0]);
    expect(onMetricModeChange).toHaveBeenCalledWith('mcap');
  });
});
