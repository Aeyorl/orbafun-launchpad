'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/**
 * Error boundary for /coin/[address] — handles invalid token addresses,
 * RPC failures, and missing tokens with a helpful message instead of a
 * blank page.
 */
export default function CoinError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[coin-page-error]', error);
  }, [error]);

  const isNotFound =
    error.message.includes('not found') ||
    error.message.includes('404') ||
    error.message.includes('invalid');

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="text-5xl mb-4">{isNotFound ? '🔍' : '⚠️'}</div>
        <h1 className="text-2xl font-bold mb-2">
          {isNotFound ? 'Token not found' : 'Couldn\'t load this token'}
        </h1>
        <p className="text-text-secondary mb-6">
          {isNotFound
            ? "This token doesn't exist or hasn't been indexed yet. If you just launched it, wait a few seconds and try again."
            : 'We couldn\'t fetch this token\'s data. The RPC may be rate-limited or the token may have an issue.'}
        </p>
        {error.digest && (
          <p className="text-xs text-text-muted mb-4 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="flex gap-3 justify-center">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/explore" className="btn-secondary">
            Browse tokens
          </Link>
        </div>
      </div>
    </div>
  );
}
