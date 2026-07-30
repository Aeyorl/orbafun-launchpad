/** @type {import('next').NextConfig} */

// Arc RPC endpoints whitelisted in CSP (for wagmi direct fallback transport).
const ARC_RPC_HOSTS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
];

// IPFS gateways for token images uploaded via Pinata.
const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud',
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
  'https://dweb.link',
];

// WalletConnect relay server (used by injected connector for session pairing).
const WALLETCONNECT_RELAY = 'wss://relay.walletconnect.com';

// API origin — the frontend talks to this for REST + WebSocket (Socket.IO).
// In production this is https://orba.fun (same-origin), in dev it's
// http://localhost:4000. Both http + ws schemes are added so CSP allows
// the API REST calls and the Socket.IO WebSocket upgrade.
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const API_WS_URL = process.env.NEXT_PUBLIC_WS_URL || API_URL;
// Normalize: derive ws:// from http:// for the WebSocket connect-src entry.
const API_WS_SCHEME = API_WS_URL.replace(/^http/, 'ws');

const cspDirectives = [
  "default-src 'self'",
  // Next.js needs 'unsafe-eval' for dev, 'unsafe-inline' for styles (styled-jsx / CSS modules)
  process.env.NODE_ENV === 'production'
    ? "script-src 'self' 'unsafe-inline'"
    : "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https: " + IPFS_GATEWAYS.join(' '),
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' " +
    API_URL + ' ' +
    API_WS_URL + ' ' +
    API_WS_SCHEME + ' ' +
    ARC_RPC_HOSTS.join(' ') + ' ' +
    IPFS_GATEWAYS.join(' ') + ' ' +
    WALLETCONNECT_RELAY,
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self' blob:",
].join('; ');

const nextConfig = {
  transpilePackages: ['@orbafun/shared'],
  // Security headers — applied to all routes.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
          { key: 'Content-Security-Policy', value: cspDirectives },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000',
    NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.testnet.arc.io',
    NEXT_PUBLIC_ARC_CHAIN_ID: process.env.NEXT_PUBLIC_ARC_CHAIN_ID || '5042002',
    NEXT_PUBLIC_ARC_USDC_ADDRESS: process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS || '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b',
    NEXT_PUBLIC_TREASURY_ADDRESS: process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0x2cAc61423fe5d7e74e5f3504901478F52a71156D',
    NEXT_PUBLIC_MIGRATOR_ADDRESS: process.env.NEXT_PUBLIC_MIGRATOR_ADDRESS || '0x34d4eC02a916164F178885B7ed05127D40847212',
    NEXT_PUBLIC_AMM_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS || '0x4058646F179a4f5dF430E8e125b8F30fF3489BF9',
    NEXT_PUBLIC_MAINNET_LAUNCHED: process.env.NEXT_PUBLIC_MAINNET_LAUNCHED || 'false',
  },
  webpack: (config) => {
    // Ignore optional Coinbase/CDP SDK / x402 deps that wagmi's connector
    // barrel export references but we don't use (we only use injected()).
    const { IgnorePlugin } = require('webpack');
    config.plugins = config.plugins || [];
    config.plugins.push(
      new IgnorePlugin({
        resourceRegExp: /^@x402\/(svm|evm|core)/,
      })
    );
    // pino-pretty is an optional dep of pino (used by WalletConnect) — not needed in browser
    config.plugins.push(
      new IgnorePlugin({
        resourceRegExp: /pino-pretty/,
      })
    );
    // MetaMask SDK references react-native storage which is not available in web
    config.plugins.push(
      new IgnorePlugin({
        resourceRegExp: /@react-native-async-storage\/async-storage/,
      })
    );
    return config;
  },
};

module.exports = nextConfig;
