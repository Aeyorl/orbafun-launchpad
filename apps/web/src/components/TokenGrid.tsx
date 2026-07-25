'use client';

import { TokenCard } from './TokenCard';
import { Token } from '@/lib/api';

/**
 * TokenGrid — responsive grid of TokenCards.
 * Used on the landing page and explore page.
 */
export function TokenGrid({ tokens }: { tokens: Token[] }) {
  if (tokens.length === 0) {
    return (
      <div className="card text-center py-12 text-text-muted">
        <div className="text-4xl mb-2">🎯</div>
        <p>No tokens found. Be the first to launch one!</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {tokens.map((token) => (
        <TokenCard key={token.contract_address} token={token} />
      ))}
    </div>
  );
}
