import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge Tailwind classes intelligently. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a USDC amount stored in 6-decimal micro-USDC units (e.g. 1_000_000 = $1).
 *
 * The API returns these as strings (from Postgres BIGINT columns), so we must
 * divide by 1e6 regardless of input type. Fields using this:
 *   real_usdc, creator_fees_accrued, protocol_fees_accrued,
 *   total_volume_usdc, usdc_amount (trades).
 *
 * For values already in USDC dollars (market_cap, price), use formatUsdDirect
 * or formatPrice instead — those do NOT divide by 1e6.
 */
export function formatUsdc(amount: string | number | bigint): string {
  const raw = typeof amount === 'bigint' ? Number(amount) : Number(amount);
  if (isNaN(raw)) return '$0.00';
  const num = raw / 1e6;
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(6)}`;
}

/**
 * Format a value that is already in USDC dollars (not micro-USDC).
 * Used for market_cap, price, and volume_24h, which are stored as decimal
 * dollars in the DB.
 */
export function formatUsdDirect(amount: string | number | bigint): string {
  const num = Number(amount);
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(6)}`;
}

const compactUsdFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  notation: 'compact',
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Format a dollar value as a compact headline (for example $4K or $4.54K). */
export function formatUsdCompact(amount: string | number | bigint): string {
  const num = Number(amount);
  if (!Number.isFinite(num)) return '$0';
  return compactUsdFormatter.format(num);
}

/**
 * Format Arc native USDC balance (18-dec, from eth_getBalance / useBalance).
 * Arc's USDC is native gas with 18 decimals — NOT the 6-dec ERC-20 view.
 */
export function formatNativeUsdc(amount: bigint): string {
  const num = Number(amount) / 1e18;
  if (isNaN(num)) return '$0.00';
  if (num >= 1_000_000) return `$${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `$${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return `$${num.toFixed(2)}`;
  return `$${num.toFixed(6)}`;
}

/** Format token amount (18-dec) for display. */
export function formatTokens(amount: string | number | bigint): string {
  const raw = Number(amount);
  if (isNaN(raw)) return '0';
  const num = raw / 1e18;
  if (num >= 1_000_000_000) return `${(num / 1_000_000_000).toFixed(2)}B`;
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(2)}M`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(2)}K`;
  if (num >= 1) return num.toFixed(2);
  return num.toFixed(6);
}

/** Format price (USDC per token) for display. */
export function formatPrice(price: string | number): string {
  const num = Number(price);
  if (isNaN(num)) return '$0';
  if (num >= 1) return `$${num.toFixed(4)}`;
  if (num >= 0.01) return `$${num.toFixed(6)}`;
  return `$${num.toExponential(4)}`;
}

/** Format market cap for display.
 * market_cap is stored in USDC dollars (price * 1e9), NOT micro-USDC. */
export function formatMarketCap(mcap: string | number): string {
  return formatUsdDirect(mcap);
}

/** Calculate bonding curve progress (0-100%).
 * Market cap starts at $4,000 and graduates at $30,000. */
export function bondingCurveProgress(marketCap: string | number): number {
  const mcap = Number(marketCap);
  if (isNaN(mcap)) return 0;
  const start = 4000;
  const graduate = 30000;
  const progress = ((mcap - start) / (graduate - start)) * 100;
  return Math.max(0, Math.min(100, progress));
}

/** Shorten an address for display (0x1234...5678). */
export function shortenAddress(addr: string): string {
  if (!addr || addr.length < 10) return addr;
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

/**
 * Convert an IPFS URI (ipfs://<cid>) to a browser-loadable gateway URL.
 * Returns the input unchanged if it's already an HTTP(S) URL or empty.
 * Uses ipfs.io as the gateway — reliable and publicly available.
 */
export function ipfsToGateway(uri: string | null | undefined): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return uri;
}

/** Format a timestamp relative to now (e.g. "2m ago"). */
export function timeAgo(timestamp: string | number): string {
  const now = Date.now();
  const then = new Date(timestamp).getTime();
  const seconds = Math.floor((now - then) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Get emoji for a token symbol (fallback to first letter). */
export function tokenEmoji(symbol: string): string {
  const emojis: Record<string, string> = {
    DOGE: '🐶', PEPE: '🐸', CAT: '🐱', FROG: '⚛️', MOON: '🌙',
    ROCKET: '🚀', FIRE: '🔥', DIAMOND: '💎', WHALE: '🐋',
    ADOGE: '🐶', SPEPE: '🐸', CYCAT: '🐱', MAXI: '💵', QFROG: '⚛️',
  };
  return emojis[symbol.toUpperCase()] || symbol.charAt(0).toUpperCase();
}
