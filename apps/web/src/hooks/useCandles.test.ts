import { describe, expect, it } from 'vitest';
import { reconcileCandles } from './useCandles';

describe('reconcileCandles', () => {
  it('keeps a newer live candle when cached history refreshes', () => {
    const result = reconcileCandles(
      [{ timestamp: 100, open: 1, high: 2, low: 1, close: 2, volume: 10 }],
      [{ timestamp: 100, open: 1, high: 3, low: 1, close: 3, volume: 15 }],
    );

    expect(result).toEqual([
      { timestamp: 100, open: 1, high: 3, low: 1, close: 3, volume: 15 },
    ]);
  });

  it('accepts a more complete server candle and retains newer live buckets', () => {
    const result = reconcileCandles(
      [{ timestamp: 100, open: 1, high: 4, low: 0.5, close: 2, volume: 20 }],
      [
        { timestamp: 100, open: 1, high: 3, low: 1, close: 3, volume: 15 },
        { timestamp: 110, open: 3, high: 3.5, low: 3, close: 3.5, volume: 5 },
      ],
    );

    expect(result).toEqual([
      { timestamp: 100, open: 1, high: 4, low: 0.5, close: 2, volume: 20 },
      { timestamp: 110, open: 3, high: 3.5, low: 3, close: 3.5, volume: 5 },
    ]);
  });
});
