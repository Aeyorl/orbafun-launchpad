import { vi } from 'vitest';

/**
 * Mock for lightweight-charts module.
 * Creates mock chart instances that track calls but don't render anything.
 */

type SeriesMock = {
  setData: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  createPriceLine: ReturnType<typeof vi.fn>;
  setMarkers: ReturnType<typeof vi.fn>;
};

type PriceScaleMock = {
  applyOptions: ReturnType<typeof vi.fn>;
};

type TimeScaleMock = {
  fitContent: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
};

type ChartMock = {
  addSeries: ReturnType<typeof vi.fn>;
  priceScale: ReturnType<typeof vi.fn>;
  timeScale: ReturnType<typeof vi.fn>;
  applyOptions: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
  subscribeCrosshairMove: ReturnType<typeof vi.fn>;
};

export function createMockChart(): ChartMock {
  const timeScale: TimeScaleMock = {
    fitContent: vi.fn(),
    applyOptions: vi.fn(),
  };

  const priceScale: PriceScaleMock = {
    applyOptions: vi.fn(),
  };

  const series: SeriesMock = {
    setData: vi.fn(),
    applyOptions: vi.fn(),
    createPriceLine: vi.fn(),
    setMarkers: vi.fn(),
  };

  return {
    addSeries: vi.fn().mockReturnValue(series),
    priceScale: vi.fn().mockReturnValue(priceScale),
    timeScale: vi.fn().mockReturnValue(timeScale),
    applyOptions: vi.fn(),
    remove: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
  };
}

// Module-level tracking for shared state across mock instances
const mockCharts: ChartMock[] = [];
let latestMockChart: ChartMock;

export function getLatestChart(): ChartMock {
  return latestMockChart;
}

export function getCharts(): ChartMock[] {
  return mockCharts;
}

export function clearCharts(): void {
  mockCharts.length = 0;
}

const mockCreateChart = (...args: unknown[]) => {
  const chart = createMockChart();
  mockCharts.push(chart);
  latestMockChart = chart;
  return chart;
};

const lightweightChartsMock = {
  createChart: vi.fn(mockCreateChart),
  ColorType: {
    Solid: 'solid',
  },
  CrosshairMode: {
    Normal: 'normal',
    Magnet: 'magnet',
  },
  LineType: {
    Curved: 0,
    Simple: 1,
    WithSteps: 2,
  },
  PriceScaleMode: {
    Normal: 0,
    Logarithmic: 1,
    Percentage: 2,
    IndexedTo100: 3,
  },
  CandlestickSeries: 'Candlestick',
  AreaSeries: 'Area',
  LineSeries: 'Line',
  HistogramSeries: 'Histogram',
  createSeriesMarkers: vi.fn(),
};

export default lightweightChartsMock;
