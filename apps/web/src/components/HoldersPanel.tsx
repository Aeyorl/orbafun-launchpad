'use client';

import { useQuery } from '@tanstack/react-query';
import { api, Holder } from '@/lib/api';
import { formatTokens, shortenAddress } from '@/lib/utils';

/**
 * HoldersPanel — shows top holders of a token with their percentage share.
 * Fetches from /tokens/:address/holders. Cached for 30s, refetched on
 * WebSocket trade events (via the parent invalidating the query).
 */
export function HoldersPanel({ tokenAddress }: { tokenAddress: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tokenHolders', tokenAddress],
    queryFn: () => api.getTokenHolders(tokenAddress, 20),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <div className="card">
        <h3 className="font-semibold mb-3">Top Holders</h3>
        <div className="space-y-2 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-8 bg-bg-input rounded" />
          ))}
        </div>
      </div>
    );
  }

  const holders = data?.holders || [];
  const total = data?.total || 0;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Top Holders</h3>
        <span className="text-xs text-text-muted tabular-nums">
          {total} {total === 1 ? 'holder' : 'holders'}
        </span>
      </div>
      {holders.length === 0 ? (
        <div className="text-center py-6 text-text-muted text-sm">
          No holders yet
        </div>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {holders.map((holder, i) => (
            <HolderRow key={holder.wallet} holder={holder} rank={i + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function HolderRow({ holder, rank }: { holder: Holder; rank: number }) {
  const pct = Number(holder.percentage);
  const isWhale = pct > 10; // >10% = whale, highlight

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-muted text-xs w-5 tabular-nums">{rank}</span>
        <span className="font-mono text-text-secondary text-xs truncate">
          {shortenAddress(holder.wallet)}
        </span>
        {isWhale && (
          <span className="badge-orange text-[10px] px-1.5 py-0.5">🐋</span>
        )}
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-text-muted text-xs tabular-nums">
          {formatTokens(holder.balance)}
        </span>
        <span
          className={`font-semibold tabular-nums text-xs w-16 text-right ${
            isWhale ? 'text-accent-orange' : 'text-text-primary'
          }`}
        >
          {pct.toFixed(2)}%
        </span>
      </div>
    </div>
  );
}
