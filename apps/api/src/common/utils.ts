/**
 * Shared utility functions for the API.
 */

const EVM_ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;
const TX_HASH_RE = /^0x[a-fA-F0-9]{64}$/;

/** Validate that a string is a valid EVM address (0x + 40 hex chars). */
export function isValidEvmAddress(addr: string): boolean {
  return typeof addr === 'string' && EVM_ADDRESS_RE.test(addr);
}

/** Validate that a string is a valid EVM transaction hash (0x + 64 hex chars). */
export function isValidTxHash(hash: string): boolean {
  return typeof hash === 'string' && TX_HASH_RE.test(hash);
}

/** Normalize an EVM address to lowercase, or throw if invalid. */
export function normalizeAddress(addr: string): string {
  if (!isValidEvmAddress(addr)) {
    throw new Error(`Invalid EVM address: ${addr}`);
  }
  return addr.toLowerCase();
}

/**
 * Safely parse a value to BigInt. Accepts string, number, or bigint.
 * Throws a descriptive error on invalid input (non-numeric, negative if
 * requirePositive is set, NaN, Infinity, etc.) instead of an opaque
 * SyntaxError from BigInt().
 */
export function safeBigInt(
  value: string | number | bigint,
  opts?: { requirePositive?: boolean },
): bigint {
  if (typeof value === 'bigint') {
    if (opts?.requirePositive && value <= 0n) {
      throw new Error('Value must be positive');
    }
    return value;
  }

  const str = String(value).trim();
  // Reject empty, NaN, Infinity, decimals, and non-numeric chars
  if (!str || !/^-?\d+$/.test(str)) {
    throw new Error(`Invalid integer value: "${str}"`);
  }

  const result = BigInt(str);
  if (opts?.requirePositive && result <= 0n) {
    throw new Error('Value must be positive');
  }
  return result;
}
