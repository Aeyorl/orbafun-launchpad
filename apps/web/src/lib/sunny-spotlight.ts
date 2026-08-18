import type { OhlcvCandle } from '@/lib/api';

export function calculateMarketChange24h(candles: OhlcvCandle[]): number | null {
  if (candles.length < 2) return null;
  const firstMarketCap = candles[0].close;
  const lastMarketCap = candles[candles.length - 1].close;
  if (!Number.isFinite(firstMarketCap) || !Number.isFinite(lastMarketCap) || firstMarketCap <= 0) {
    return null;
  }
  return ((lastMarketCap - firstMarketCap) / firstMarketCap) * 100;
}

export function hasUsableTokenImage(uri: string | null | undefined): boolean {
  if (!uri) return false;
  if (/^https?:\/\//i.test(uri)) return true;
  if (!uri.startsWith('ipfs://')) return false;
  const cid = uri.slice('ipfs://'.length).split('/')[0];
  return /^Qm[1-9A-HJ-NP-Za-km-z]{44}$/.test(cid) || /^b[a-z2-7]{20,}$/.test(cid);
}
