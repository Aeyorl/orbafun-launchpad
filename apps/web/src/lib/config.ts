'use client';

import { createConfig, http, fallback } from 'wagmi';
import { arc, arcTestnet } from 'viem/chains';
import { injected } from '@wagmi/connectors/injected';

const requestedNetwork = (process.env.NEXT_PUBLIC_ARC_NETWORK || 'testnet').toLowerCase();

if (requestedNetwork !== 'testnet' && requestedNetwork !== 'mainnet') {
  throw new Error('NEXT_PUBLIC_ARC_NETWORK must be either "testnet" or "mainnet"');
}

export const IS_ARC_MAINNET = requestedNetwork === 'mainnet';
export const ARC_CHAIN = IS_ARC_MAINNET ? arc : arcTestnet;
export const ARC_CHAIN_ID = ARC_CHAIN.id;
export const ARC_NETWORK_NAME = ARC_CHAIN.name;

// Wagmi config for Arc testnet.
// arcTestnet is built into viem — no custom chain definition needed.
//
// Read transport strategy (in priority order):
//   1. Our own API's /rpc proxy — same origin as the app's data, so it is
//      never blocked by browser shields/adblockers (Brave etc.), and the
//      server rotates between all 4 Arc RPC providers to dodge rate limits.
//   2. Direct public RPC endpoints as backup, rotated via viem's `fallback`.
//
// This matters: browser privacy tools can silently block cross-origin
// fetches to third-party RPC domains, which breaks every wagmi read
// (balance shows $0, quotes never load, receipts never confirm).
//
// Providers (from https://docs.arc.io/arc/references/rpc-endpoints):
//   Circle (primary), dRPC, QuickNode, Blockdaemon
export const DEFAULT_ARC_RPC_URLS = [
  'https://rpc.testnet.arc.network',
  'https://rpc.drpc.testnet.arc.network',
  'https://rpc.quicknode.testnet.arc.network',
  'https://rpc.blockdaemon.testnet.arc.network',
];

export const ARC_RPC_URLS = (
  process.env.NEXT_PUBLIC_ARC_RPC_URLS ||
  process.env.NEXT_PUBLIC_ARC_RPC_URL ||
  (IS_ARC_MAINNET ? '' : DEFAULT_ARC_RPC_URLS.join(','))
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

if (ARC_RPC_URLS.length === 0) {
  throw new Error('Arc mainnet requires NEXT_PUBLIC_ARC_RPC_URLS');
}

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const activeTransport = fallback(
  [
    // Same-origin proxy first — immune to shields/adblock, server-side rotation.
    http(`${apiUrl}/rpc`),
    // Direct providers as backup if the API is down.
    ...ARC_RPC_URLS.map((url) => http(url)),
  ],
  {
    // Keep the order above rather than auto-ranking by latency.
    rank: false,
  }
);

export const config = createConfig({
  chains: [ARC_CHAIN],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: activeTransport,
    [arc.id]: activeTransport,
  },
});

function requiredMainnetAddress(value: string | undefined, fallbackAddress: string, name: string) {
  if (value) return value as `0x${string}`;
  if (IS_ARC_MAINNET) throw new Error(`Arc mainnet requires ${name}`);
  return fallbackAddress as `0x${string}`;
}

// Contract addresses from env. Mainnet deliberately has no fallbacks.
export const CONTRACTS = {
  USDC: requiredMainnetAddress(process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS, '0x3600000000000000000000000000000000000000', 'NEXT_PUBLIC_ARC_USDC_ADDRESS'),
  TOKEN_FACTORY: requiredMainnetAddress(process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS, '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b', 'NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS'),
  TREASURY: requiredMainnetAddress(process.env.NEXT_PUBLIC_TREASURY_ADDRESS, '0x2cAc61423fe5d7e74e5f3504901478F52a71156D', 'NEXT_PUBLIC_TREASURY_ADDRESS'),
  MIGRATOR: requiredMainnetAddress(process.env.NEXT_PUBLIC_MIGRATOR_ADDRESS, '0x34d4eC02a916164F178885B7ed05127D40847212', 'NEXT_PUBLIC_MIGRATOR_ADDRESS'),
  AMM_FACTORY: requiredMainnetAddress(process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS, '0x4058646F179a4f5dF430E8e125b8F30fF3489BF9', 'NEXT_PUBLIC_AMM_FACTORY_ADDRESS'),
} as const;

export const ARC_EXPLORER_URL = process.env.NEXT_PUBLIC_ARC_EXPLORER_URL ||
  (IS_ARC_MAINNET ? '' : 'https://testnet.arcscan.app');

if (!ARC_EXPLORER_URL) {
  throw new Error('Arc mainnet requires NEXT_PUBLIC_ARC_EXPLORER_URL');
}

// API URLs
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

// Arc constants
export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;
