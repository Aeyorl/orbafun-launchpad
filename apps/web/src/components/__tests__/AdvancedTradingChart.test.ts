/**
 * @vitest-environment jsdom
 */
import { describe, expect, it, vi } from 'vitest';
import { api, OhlcvCandle } from '@/lib/api';
import { createOrbaDatafeed } from '../trading/AdvancedTradingChart';

const candles: OhlcvCandle[] = [
  { timestamp: 1_720_000_000, open: 0.000004, high: 0.000005, low: 0.000003, close: 0.0000045, volume: 12 },
  { timestamp: 1_720_000_300, open: 0.0000045, high: 0.000006, low: 0.000004, close: 0.0000055, volume: 20 },
];

describe('Orba Advanced Charts datafeed', () => {
  it('resolves the Orba token with seconds and intraday resolutions', async () => {
    const datafeed = createOrbaDatafeed({
      tokenAddress: '0xabc',
      tokenName: 'Arc Dog',
      tokenSymbol: 'ADOGE',
      metricMode: 'price',
      subscribers: new Map(),
    });
    const onResolve = vi.fn();

    datafeed.resolveSymbol('ADOGE', onResolve, vi.fn());
    await Promise.resolve();

    expect(onResolve).toHaveBeenCalledWith(expect.objectContaining({
      name: 'ADOGE/USDC',
      ticker: '0xabc',
      exchange: 'Orba',
      pricescale: 100_000_000,
      has_seconds: true,
      supported_resolutions: ['10S', '1', '5', '15', '30', '60', '240', '1D'],
    }));
  });

  it('maps TradingView history requests to Orba candles', async () => {
    const getCandles = vi.spyOn(api, 'getCandles').mockResolvedValueOnce(candles);
    const datafeed = createOrbaDatafeed({
      tokenAddress: '0xabc',
      tokenName: 'Arc Dog',
      tokenSymbol: 'ADOGE',
      metricMode: 'price',
      subscribers: new Map(),
    });
    const onHistory = vi.fn();

    await datafeed.getBars(
      {},
      '5',
      { from: 1_719_999_000, to: 1_720_001_000, countBack: 2 },
      onHistory,
      vi.fn(),
    );

    expect(getCandles).toHaveBeenCalledWith('0xabc', '5m', 'price', 2000);
    expect(onHistory).toHaveBeenCalledWith(
      candles.map((candle) => expect.objectContaining({ time: candle.timestamp * 1000 })),
      { noData: false },
    );
  });

  it('uses page-loaded candles when the initial history request returns empty', async () => {
    vi.spyOn(api, 'getCandles').mockResolvedValueOnce([]);
    const datafeed = createOrbaDatafeed({
      tokenAddress: '0xabc',
      tokenName: 'Arc Dog',
      tokenSymbol: 'ADOGE',
      metricMode: 'price',
      subscribers: new Map(),
      getSeedCandles: () => candles,
    });
    const onHistory = vi.fn();

    await datafeed.getBars(
      {},
      '5',
      { from: 1_719_999_000, to: 1_720_001_000, countBack: 2 },
      onHistory,
      vi.fn(),
    );

    expect(onHistory).toHaveBeenCalledWith(
      candles.map((candle) => expect.objectContaining({ time: candle.timestamp * 1000 })),
      { noData: false },
    );
  });

  it('sorts, deduplicates, and rejects malformed history bars', async () => {
    const newest = { ...candles[1], close: 0.0000057 };
    vi.spyOn(api, 'getCandles').mockResolvedValueOnce([
      newest,
      { ...candles[0], close: Number.NaN },
    ]);
    const datafeed = createOrbaDatafeed({
      tokenAddress: '0xabc',
      tokenName: 'Arc Dog',
      tokenSymbol: 'ADOGE',
      metricMode: 'price',
      subscribers: new Map(),
      getSeedCandles: () => [candles[1], candles[0]],
    });
    const onHistory = vi.fn();

    await datafeed.getBars(
      {},
      '5',
      { from: 1_719_999_000, to: 1_720_001_000, countBack: 2 },
      onHistory,
      vi.fn(),
    );

    expect(onHistory).toHaveBeenCalledWith([
      expect.objectContaining({ time: candles[0].timestamp * 1000, close: candles[0].close }),
      expect.objectContaining({ time: newest.timestamp * 1000, close: newest.close }),
    ], { noData: false });
  });

  it('registers and removes real-time subscribers', () => {
    const subscribers = new Map();
    const datafeed = createOrbaDatafeed({
      tokenAddress: '0xabc',
      tokenName: 'Arc Dog',
      tokenSymbol: 'ADOGE',
      metricMode: 'mcap',
      subscribers,
    });
    const callback = vi.fn();

    datafeed.subscribeBars({}, '10S', callback, 'listener-1');
    expect(subscribers.get('listener-1')).toEqual({ resolution: '10S', callback });

    datafeed.unsubscribeBars('listener-1');
    expect(subscribers.has('listener-1')).toBe(false);
  });
});
