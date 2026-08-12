'use client';

import { TokenCard } from './TokenCard';
import { Token } from '@/lib/api';
import styles from './TokenGrid.module.css';

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
    <div className={styles.tokenGrid}>
      {tokens.map((token, index) => (
        <TokenCard key={token.contract_address} token={token} featured={index === 0} />
      ))}
    </div>
  );
}
