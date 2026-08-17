import { NextRequest, NextResponse } from 'next/server';

const ARC_RPC_HOSTS = [
  'https://rpc.testnet.arc.io',
  'https://rpc.drpc.testnet.arc.io',
  'https://rpc.quicknode.testnet.arc.io',
  'https://rpc.blockdaemon.testnet.arc.io',
];

const IPFS_GATEWAYS = [
  'https://gateway.pinata.cloud',
  'https://ipfs.io',
  'https://cloudflare-ipfs.com',
  'https://dweb.link',
];

// Reown's published CSP allowlist for WalletConnect/AppKit network services.
// Keep both .com and .org endpoints because the SDK may rotate between them.
const WALLETCONNECT_CONNECT_HOSTS = [
  'https://rpc.walletconnect.com',
  'https://rpc.walletconnect.org',
  'https://relay.walletconnect.com',
  'https://relay.walletconnect.org',
  'wss://relay.walletconnect.com',
  'wss://relay.walletconnect.org',
  'https://pulse.walletconnect.com',
  'https://pulse.walletconnect.org',
  'https://api.web3modal.com',
  'https://api.web3modal.org',
  'https://keys.walletconnect.com',
  'https://keys.walletconnect.org',
  'https://notify.walletconnect.com',
  'https://notify.walletconnect.org',
  'https://echo.walletconnect.com',
  'https://echo.walletconnect.org',
  'https://push.walletconnect.com',
  'https://push.walletconnect.org',
];

const WALLETCONNECT_FRAME_HOSTS = [
  'https://verify.walletconnect.com',
  'https://verify.walletconnect.org',
  'https://secure.walletconnect.com',
  'https://secure.walletconnect.org',
];

async function tokenRouteStatus(request: NextRequest, apiUrl: string) {
  const match = request.nextUrl.pathname.match(
    /^\/(?:coin|trade)\/(0x[0-9a-f]{40})\/?$/i,
  );
  if (!match) return null;

  try {
    const response = await fetch(`${apiUrl}/tokens/${match[1].toLowerCase()}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(5_000),
    });
    if (response.status === 404) return 404;
    if (!response.ok) return 503;
    return null;
  } catch {
    return 503;
  }
}

export async function proxy(request: NextRequest) {
  const nonce = crypto.randomUUID().replace(/-/g, '');
  const isTradingViewRuntime = request.nextUrl.pathname.startsWith(
    '/vendor/tradingview/charting_library/',
  );
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || apiUrl;
  const wsSchemeUrl = wsUrl.replace(/^http/, 'ws');
  const scriptPolicy = isTradingViewRuntime
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
    : process.env.NODE_ENV === 'production'
      ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${nonce}' 'unsafe-eval'`;
  const csp = [
    "default-src 'self'",
    scriptPolicy,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    `img-src 'self' data: blob: https: ${IPFS_GATEWAYS.join(' ')}`,
    "font-src 'self' data: https://fonts.gstatic.com https://fonts.reown.com",
    `connect-src 'self' ${apiUrl} ${wsUrl} ${wsSchemeUrl} ${ARC_RPC_HOSTS.join(' ')} ${IPFS_GATEWAYS.join(' ')} ${WALLETCONNECT_CONNECT_HOSTS.join(' ')}`,
    `frame-src 'self' blob: ${WALLETCONNECT_FRAME_HOSTS.join(' ')}`,
    isTradingViewRuntime ? "frame-ancestors 'self'" : "frame-ancestors 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "worker-src 'self' blob:",
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const tokenStatus = await tokenRouteStatus(request, apiUrl);
  const response = tokenStatus
    ? new NextResponse(tokenStatus === 404 ? 'Not Found' : 'Service Unavailable', {
        status: tokenStatus,
      })
    : NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  response.headers.set('X-Frame-Options', isTradingViewRuntime ? 'SAMEORIGIN' : 'DENY');
  return response;
}

export const config = {
  matcher: [
    {
      source: '/((?!api|_next/static|_next/image|icon.png|apple-icon.png).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
