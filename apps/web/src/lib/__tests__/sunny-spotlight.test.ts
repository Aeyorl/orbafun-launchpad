import { describe, expect, it } from 'vitest';
import { calculateMarketChange24h, hasUsableTokenImage } from '../sunny-spotlight';

describe('calculateMarketChange24h', () => {
  it('calculates the real movement between the first and latest market cap candle', () => {
    expect(calculateMarketChange24h([
      { timestamp: 1, open: 10000, high: 10000, low: 10000, close: 10000, volume: 10 },
      { timestamp: 2, open: 10000, high: 13800, low: 10000, close: 13800, volume: 20 },
    ])).toBe(38);
  });

  it('returns null when there is not enough honest history to calculate a change', () => {
    expect(calculateMarketChange24h([])).toBeNull();
    expect(calculateMarketChange24h([
      { timestamp: 1, open: 10000, high: 10000, low: 10000, close: 10000, volume: 10 },
    ])).toBeNull();
  });

  it('rejects an invalid baseline instead of presenting a fake percentage', () => {
    expect(calculateMarketChange24h([
      { timestamp: 1, open: 0, high: 0, low: 0, close: 0, volume: 0 },
      { timestamp: 2, open: 0, high: 100, low: 0, close: 100, volume: 10 },
    ])).toBeNull();
  });
});

describe('hasUsableTokenImage', () => {
  it('accepts browser URLs and well-formed IPFS CIDs', () => {
    expect(hasUsableTokenImage('https://example.com/token.png')).toBe(true);
    expect(hasUsableTokenImage('ipfs://QmYwAPJzv5CZsnAzt8auVZRnGiYj8fvQ3SUQxFjMCD4wVx')).toBe(true);
  });

  it('rejects incomplete IPFS placeholders so the brand fallback can render', () => {
    expect(hasUsableTokenImage('ipfs://grad/48157')).toBe(false);
    expect(hasUsableTokenImage(null)).toBe(false);
  });
});
