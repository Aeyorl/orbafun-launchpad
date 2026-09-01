import { describe, it, expect } from 'vitest';
import {
  cn,
  formatUsdc,
  formatUsdDirect,
  formatUsdCompact,
  formatNativeUsdc,
  formatTokens,
  formatPrice,
  formatMarketCap,
  bondingCurveProgress,
  shortenAddress,
  ipfsGatewayUrls,
  ipfsToGateway,
  timeAgo,
  tokenEmoji,
} from '../utils';

// ─── cn ───────────────────────────────────────────────────────────────────

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar');
  });

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', 'active')).toBe('base active');
  });

  it('resolves Tailwind conflicts (last wins)', () => {
    // px-4 should win over px-2 via tailwind-merge
    expect(cn('px-2', 'px-4')).toBe('px-4');
  });

  it('returns empty string for no args', () => {
    expect(cn()).toBe('');
  });

  it('handles clsx tuple syntax', () => {
    expect(cn(['a', 'b'], 'c')).toBe('a b c');
  });
});

// ─── formatUsdc ───────────────────────────────────────────────────────────

describe('formatUsdc', () => {
  it('formats whole dollars', () => {
    expect(formatUsdc('1000000')).toBe('$1.00');
    expect(formatUsdc(1_000_000)).toBe('$1.00');
    expect(formatUsdc(5_000_000n)).toBe('$5.00');
  });

  it('formats sub-dollar amounts', () => {
    expect(formatUsdc('500000')).toBe('$0.500000');
    expect(formatUsdc(100_000)).toBe('$0.100000');
    expect(formatUsdc(1)).toBe('$0.000001');
  });

  it('formats thousands (K)', () => {
    // formatUsdc divides by 1e6, so 1_000_000_000 micro-USDC = 1000 USDC
    expect(formatUsdc(1_000_000_000)).toBe('$1.00K');
    expect(formatUsdc(1_500_000_000)).toBe('$1.50K');
  });

  it('formats millions (M)', () => {
    // 1_000_000_000_000 micro-USDC = 1,000,000 USDC = $1.00M
    expect(formatUsdc(1_000_000_000_000)).toBe('$1.00M');
    expect(formatUsdc(2_500_000_000_000)).toBe('$2.50M');
  });

  it('handles edge cases', () => {
    // 0 / 1e6 = 0, which hits the < 1 branch → .toFixed(6)
    expect(formatUsdc(0)).toBe('$0.000000');
    expect(formatUsdc(0n)).toBe('$0.000000');
    expect(formatUsdc('')).toBe('$0.000000');
    expect(formatUsdc(NaN)).toBe('$0.00');
  });
});

// ─── formatUsdDirect ──────────────────────────────────────────────────────

describe('formatUsdDirect', () => {
  it('formats dollar amounts directly (no division)', () => {
    expect(formatUsdDirect('1.00')).toBe('$1.00');
    expect(formatUsdDirect(5)).toBe('$5.00');
    expect(formatUsdDirect(0.5)).toBe('$0.500000');
  });

  it('formats thousands (K)', () => {
    // formatUsdDirect does NOT divide — 4000 = $4.00K, not $4,000.00
    expect(formatUsdDirect(4000)).toBe('$4.00K');
    expect(formatUsdDirect(25000)).toBe('$25.00K');
  });

  it('formats millions (M)', () => {
    expect(formatUsdDirect(1_000_000)).toBe('$1.00M');
    expect(formatUsdDirect(25_000_000)).toBe('$25.00M');
  });

  it('handles edge cases', () => {
    // 0 hits the < 1 branch → .toFixed(6)
    expect(formatUsdDirect(0)).toBe('$0.000000');
    expect(formatUsdDirect('')).toBe('$0.000000');
    expect(formatUsdDirect(NaN)).toBe('$0.00');
  });
});

// ─── formatNativeUsdc ─────────────────────────────────────────────────────

describe('formatNativeUsdc', () => {
  it('formats native USDC (18-dec) correctly', () => {
    // 1 native USDC = 10^18 wei
    expect(formatNativeUsdc(1_000_000_000_000_000_000n)).toBe('$1.00');
    expect(formatNativeUsdc(5_500_000_000_000_000_000n)).toBe('$5.50');
  });

  it('formats sub-dollar native USDC', () => {
    expect(formatNativeUsdc(100_000_000_000_000_000n)).toBe('$0.100000');
    expect(formatNativeUsdc(1_000_000_000_000_000n)).toBe('$0.001000');
  });

  it('formats large native USDC', () => {
    // 1,000,000 USDC = 10^24 wei
    expect(formatNativeUsdc(1_000_000_000_000_000_000_000_000n)).toBe('$1.00M');
    // 100,000,000 USDC = 10^26 wei
    expect(formatNativeUsdc(100_000_000_000_000_000_000_000_000n)).toBe('$100.00M');
  });

  it('handles edge cases', () => {
    // 0 hits the < 1 branch → .toFixed(6)
    expect(formatNativeUsdc(0n)).toBe('$0.000000');
  });
});

// ─── formatTokens ─────────────────────────────────────────────────────────

describe('formatTokens', () => {
  it('formats token amounts (18-dec bigint) correctly', () => {
    // 1 token = 10^18, so 10^18n should show as 1.00 tokens
    expect(formatTokens(1_000_000_000_000_000_000n)).toBe('1.00');
    // 1.5 tokens
    expect(formatTokens(1_500_000_000_000_000_000n)).toBe('1.50');
  });

  it('formats 18-decimal strings returned by the API', () => {
    expect(formatTokens('1000000000000000000')).toBe('1.00');
    expect(formatTokens('8856148545541526000000000000')).toBe('8.86B');
  });

  it('formats with K suffix for 1K+ tokens', () => {
    // 1000 tokens = 1000 * 10^18 = 10^21
    expect(formatTokens(1_000_000_000_000_000_000_000n)).toBe('1.00K');
    expect(formatTokens(5_000_000_000_000_000_000_000n)).toBe('5.00K');
  });

  it('formats with M suffix for 1M+ tokens', () => {
    // 1M tokens = 1_000_000 * 10^18 = 10^24
    expect(formatTokens(1_000_000_000_000_000_000_000_000n)).toBe('1.00M');
    expect(formatTokens(50_000_000_000_000_000_000_000_000n)).toBe('50.00M');
  });

  it('formats with B suffix for 1B+ tokens', () => {
    // 1B tokens = 1_000_000_000 * 10^18 = 10^27
    expect(formatTokens(1_000_000_000_000_000_000_000_000_000n)).toBe('1.00B');
    expect(formatTokens(880_000_000_000_000_000_000_000_000_000n)).toBe('880.00B');
  });

  it('formats sub-unit amounts', () => {
    // 0.1 token = 10^17 wei
    expect(formatTokens(100_000_000_000_000_000n)).toBe('0.100000');
    // 0.001 token = 10^15 wei
    expect(formatTokens(1_000_000_000_000_000n)).toBe('0.001000');
  });

  it('handles edge cases', () => {
    // 0 hits the < 1 branch → .toFixed(6)
    expect(formatTokens('0')).toBe('0.000000');
    expect(formatTokens(0n)).toBe('0.000000');
    expect(formatTokens('')).toBe('0.000000');
    expect(formatTokens(NaN)).toBe('0');
  });
});

// ─── formatPrice ──────────────────────────────────────────────────────────

describe('formatPrice', () => {
  it('formats prices >= $1', () => {
    expect(formatPrice(1)).toBe('$1.00000000');
    expect(formatPrice(1.5)).toBe('$1.50000000');
    expect(formatPrice(100)).toBe('$100.00000000');
  });

  it('formats prices below $1 with eight decimal places', () => {
    expect(formatPrice(0.05)).toBe('$0.05000000');
    expect(formatPrice(0.5)).toBe('$0.50000000');
    expect(formatPrice(0.00745725)).toBe('$0.00745725');
  });

  it('formats very small prices without exponential notation', () => {
    expect(formatPrice(0.001)).toBe('$0.00100000');
    expect(formatPrice(0.00005)).toBe('$0.00005000');
    expect(formatPrice(0.0000001)).toBe('$0.00000010');
    expect(formatPrice('0.000005680785801888')).toBe('$0.00000568');
  });

  it('handles edge cases', () => {
    expect(formatPrice(0)).toBe('$0.00000000');
    expect(formatPrice('')).toBe('$0.00000000');
    expect(formatPrice(NaN)).toBe('$0');
  });
});

// ─── formatMarketCap ──────────────────────────────────────────────────────

describe('formatMarketCap', () => {
  it('delegates to formatUsdDirect', () => {
    // Same K-style formatting as formatUsdDirect
    expect(formatMarketCap(4000)).toBe('$4.00K');
    expect(formatMarketCap(25000)).toBe('$25.00K');
    expect(formatMarketCap(1_000_000)).toBe('$1.00M');
  });

  it('handles edge cases', () => {
    // 0 delegates to formatUsdDirect which returns $0.000000
    expect(formatMarketCap(0)).toBe('$0.000000');
    expect(formatMarketCap(NaN)).toBe('$0.00');
  });
});

describe('formatUsdCompact', () => {
  it('omits unnecessary trailing zeros in compact headline values', () => {
    expect(formatUsdCompact(4000)).toBe('$4K');
    expect(formatUsdCompact(4200)).toBe('$4.2K');
    expect(formatUsdCompact(4540)).toBe('$4.54K');
    expect(formatUsdCompact(555)).toBe('$555');
  });

  it('handles invalid values', () => {
    expect(formatUsdCompact(NaN)).toBe('$0');
  });
});

// ─── bondingCurveProgress ──────────────────────────────────────────────────

describe('bondingCurveProgress', () => {
  it('returns 0% at start ($4,000)', () => {
    expect(bondingCurveProgress(4000)).toBe(0);
  });

  it('returns 100% at graduation ($30,000)', () => {
    expect(bondingCurveProgress(30000)).toBe(100);
  });

  it('returns 50% at midpoint ($17,000)', () => {
    expect(bondingCurveProgress(17000)).toBe(50);
  });

  it('clamps to 0-100 range', () => {
    expect(bondingCurveProgress(0)).toBe(0);
    expect(bondingCurveProgress(1000)).toBe(0);
    expect(bondingCurveProgress(50000)).toBe(100);
    expect(bondingCurveProgress(100000)).toBe(100);
  });

  it('handles edge cases', () => {
    expect(bondingCurveProgress(NaN)).toBe(0);
    expect(bondingCurveProgress('')).toBe(0);
  });
});

// ─── shortenAddress ────────────────────────────────────────────────────────

describe('shortenAddress', () => {
  it('shortens a full EVM address', () => {
    expect(shortenAddress('0x1234567890abcdef1234567890abcdef12345678'))
      .toBe('0x1234...5678');
  });

  it('returns short addresses unchanged', () => {
    expect(shortenAddress('0x1234')).toBe('0x1234');
  });

  it('handles empty/null/undefined', () => {
    expect(shortenAddress('')).toBe('');
  });
});

// ─── ipfsToGateway ─────────────────────────────────────────────────────────

describe('ipfsToGateway', () => {
  it('converts ipfs:// to https gateway URL', () => {
    expect(ipfsToGateway('ipfs://QmTest123'))
      .toBe('https://silver-tricky-kite-593.mypinata.cloud/ipfs/QmTest123');
  });

  it('leaves HTTPS URLs unchanged', () => {
    expect(ipfsToGateway('https://example.com/image.png'))
      .toBe('https://example.com/image.png');
  });

  it('provides alternate gateways in retry order', () => {
    expect(ipfsGatewayUrls('ipfs://QmTest123')).toEqual([
      'https://silver-tricky-kite-593.mypinata.cloud/ipfs/QmTest123',
      'https://gateway.pinata.cloud/ipfs/QmTest123',
      'https://dweb.link/ipfs/QmTest123',
      'https://ipfs.io/ipfs/QmTest123',
    ]);
  });

  it('normalizes ipfs://ipfs/ URIs without duplicating the path', () => {
    expect(ipfsToGateway('ipfs://ipfs/QmTest123/image.png'))
      .toBe('https://silver-tricky-kite-593.mypinata.cloud/ipfs/QmTest123/image.png');
  });

  it('handles null/undefined/empty', () => {
    expect(ipfsToGateway(null)).toBe('');
    expect(ipfsToGateway(undefined)).toBe('');
    expect(ipfsToGateway('')).toBe('');
  });
});

// ─── timeAgo ──────────────────────────────────────────────────────────────

describe('timeAgo', () => {
  it('returns seconds ago', () => {
    const now = Date.now();
    // 30 seconds ago
    expect(timeAgo(now - 30_000)).toBe('30s ago');
  });

  it('returns minutes ago', () => {
    const now = Date.now();
    expect(timeAgo(now - 120_000)).toBe('2m ago');
  });

  it('returns hours ago', () => {
    const now = Date.now();
    expect(timeAgo(now - 3_600_000)).toBe('1h ago');
  });

  it('returns days ago', () => {
    const now = Date.now();
    expect(timeAgo(now - 86_400_000)).toBe('1d ago');
    expect(timeAgo(now - 172_800_000)).toBe('2d ago');
  });

  it('handles ISO string timestamps', () => {
    const now = Date.now();
    const iso = new Date(now - 60_000).toISOString();
    expect(timeAgo(iso)).toBe('1m ago');
  });
});

// ─── tokenEmoji ───────────────────────────────────────────────────────────

describe('tokenEmoji', () => {
  it('returns matching emoji for known symbols', () => {
    expect(tokenEmoji('DOGE')).toBe('🐶');
    expect(tokenEmoji('PEPE')).toBe('🐸');
    expect(tokenEmoji('CAT')).toBe('🐱');
    expect(tokenEmoji('FROG')).toBe('⚛️');
  });

  it('is case-insensitive', () => {
    expect(tokenEmoji('doge')).toBe('🐶');
    expect(tokenEmoji('Doge')).toBe('🐶');
  });

  it('falls back to first letter uppercase for unknown symbols', () => {
    expect(tokenEmoji('XYZ')).toBe('X');
    expect(tokenEmoji('ABCDE')).toBe('A');
  });
});
