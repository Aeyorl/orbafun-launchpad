/** @type {import('next').NextConfig} */

const requiredProductionEnv = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_WS_URL',
];

if (process.env.NODE_ENV === 'production') {
  const missing = requiredProductionEnv.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(
      `Production build requires environment variables: ${missing.join(', ')}`,
    );
  }
}

const nextConfig = {
  transpilePackages: ['@orbafun/shared'],
  // Security headers — applied to all routes.
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-XSS-Protection', value: '1; mode=block' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=31536000; includeSubDomains; preload',
          },
        ],
      },
    ];
  },
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000',
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:4000',
    NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL || 'https://rpc.mainnet.arc.io',
    NEXT_PUBLIC_ARC_CHAIN_ID: process.env.NEXT_PUBLIC_ARC_CHAIN_ID || '5042',
    NEXT_PUBLIC_ARC_USDC_ADDRESS: process.env.NEXT_PUBLIC_ARC_USDC_ADDRESS || '0x3600000000000000000000000000000000000000',
    NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS || '0x8e5710fc5a3f2aA69104AC1b57E6916F7634701B',
    NEXT_PUBLIC_TREASURY_ADDRESS: process.env.NEXT_PUBLIC_TREASURY_ADDRESS || '0xD81C2CDa790231a8e701911175519d3521F1d51c',
    NEXT_PUBLIC_MIGRATOR_ADDRESS: process.env.NEXT_PUBLIC_MIGRATOR_ADDRESS || '0xd5F18F71FdFB6eB8fC49b32b2B264aC162F31525',
    NEXT_PUBLIC_AMM_FACTORY_ADDRESS: process.env.NEXT_PUBLIC_AMM_FACTORY_ADDRESS || '0x7B43cEDAA3e96c98D6f8c981d9d8BF4bFB443A7c',
    NEXT_PUBLIC_MAINNET_LAUNCHED: process.env.NEXT_PUBLIC_MAINNET_LAUNCHED || 'true',
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
