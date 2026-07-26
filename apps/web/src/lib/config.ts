'use client';

import { createConfig, http, fallback } from 'wagmi';
import { arcTestnet } from 'viem/chains';
import { injected } from 'wagmi/connectors';

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
  'https://arc-testnet.g.alchemy.com/v2/HMKXQ2KwDrFO0nwFthZm0',
  'https://rpc.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
];

const directRpcUrls = (
  process.env.NEXT_PUBLIC_ARC_RPC_URLS ||
  process.env.NEXT_PUBLIC_ARC_RPC_URL ||
  DEFAULT_ARC_RPC_URLS.join(',')
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export const config = createConfig({
  chains: [arcTestnet],
  connectors: [injected()],
  transports: {
    [arcTestnet.id]: fallback(
      [
        // Same-origin proxy first — immune to shields/adblock, server-side rotation.
        http(`${apiUrl}/rpc`),
        // Direct providers as backup if the API is down.
        ...directRpcUrls.map((url) => http(url)),
      ],
      {
        // Keep the order above rather than auto-ranking by latency.
        rank: false,
      }
    ),
  },
});

// Contract addresses from env
export const CONTRACTS = {
  USDC: (process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS ||
    '0x3600000000000000000000000000000000000000') as `0x${string}`,
  TOKEN_FACTORY: (process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS ||
    '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b') as `0x${string}`,
  TREASURY: (process.env.NEXT_PUBLIC_TREASURY_ADDRESS ||
    '0x2cAc61423fe5d7e74e5f3504901478F52a71156D') as `0x${string}`,
  MIGRATOR: (process.env.NEXT_PUBLIC_MIGRATOR_ADDRESS ||
    '0x34d4eC02a916164F178885B7ed05127D40847212') as `0x${string}`,
  AMM_FACTORY: (process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS ||
    '0x4058646F179a4f5dF430E8e125b8F30fF3489BF9') as `0x${string}`,
} as const;

// API URLs
export const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000';

// Arc constants
export const ARC_CHAIN_ID = 5042002;
export const USDC_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;
