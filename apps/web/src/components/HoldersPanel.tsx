'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, Holder } from '@/lib/api';
import { formatTokens, shortenAddress } from '@/lib/utils';

const ARCSCAN_BASE = 'https://testnet.arcscan.app';

type HolderTab = 'top' | 'whales' | 'recent';

/**
 * HoldersPanel — tabbed view of token holders.
 *
 * Tabs:
 *  - Top Holders: all holders ranked by balance (default)
 *  - Whales (>5%): only holders with >5% of supply
 *  - Recent Buyers: holders sorted by most recent buy (future — currently same data)
 *
 * Each wallet links to the internal profile page and has an ArcScan icon link.
 * Shows USD value estimate and a visual distribution bar.
 */
export function HoldersPanel({ tokenAddress, currentPrice }: { tokenAddress: string; currentPrice?: number }) {
  const [tab, setTab] = useState<HolderTab>('top');

  const { data, isLoading } = useQuery({
    queryKey: ['tokenHolders', tokenAddress],
    queryFn: () => api.getTokenHolders(tokenAddress, 50),
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

  // Filter based on tab
  const whales = holders.filter((h) => Number(h.percentage) > 5);
  const displayed = tab === 'whales' ? whales : holders;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold">Holders</h3>
        <span className="text-xs text-text-muted tabular-nums">
          {total} {total === 1 ? 'holder' : 'holders'}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 mb-3" role="tablist" aria-label="Holder view">
        <TabButton label="Top Holders" active={tab === 'top'} onClick={() => setTab('top')} />
        <TabButton
          label={`Whales (${whales.length})`}
          active={tab === 'whales'}
          onClick={() => setTab('whales')}
        />
      </div>

      {/* Distribution bar */}
      {holders.length > 0 && (
        <div className="flex h-2 rounded-full overflow-hidden bg-bg-input mb-3" title="Ownership distribution">
          {holders.slice(0, 10).map((holder, i) => {
            const pct = Number(holder.percentage);
            const colors = [
              'bg-accent-blue', 'bg-green-500', 'bg-amber-500', 'bg-purple-500',
              'bg-rose-500', 'bg-cyan-500', 'bg-orange-500', 'bg-teal-500',
              'bg-indigo-500', 'bg-pink-500',
            ];
            return (
              <div
                key={holder.wallet}
                className={`${colors[i % colors.length]} transition-all`}
                style={{ width: `${Math.max(pct, 1)}%` }}
                title={`${shortenAddress(holder.wallet)}: ${pct.toFixed(2)}%`}
              />
            );
          })}
        </div>
      )}

      {displayed.length === 0 ? (
        <div className="text-center py-6 text-text-muted text-sm">
          {tab === 'whales' ? 'No whales (>5%) found' : 'No holders yet'}
        </div>
      ) : (
        <div className="space-y-1 max-h-80 overflow-y-auto pr-1">
          {displayed.map((holder, i) => (
            <HolderRow
              key={holder.wallet}
              holder={holder}
              rank={i + 1}
              currentPrice={currentPrice}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HolderRow({
  holder,
  rank,
  currentPrice,
}: {
  holder: Holder;
  rank: number;
  currentPrice?: number;
}) {
  const pct = Number(holder.percentage);
  const isWhale = pct > 5;
  // Estimate USD value: balance is in 18-dec token units, price is USDC per token
  const balance = Number(holder.balance);
  const usdValue = currentPrice && balance > 0 ? balance * currentPrice : null;

  return (
    <div className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors text-sm group">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-text-muted text-xs w-5 tabular-nums">{rank}</span>
        <Link
          href={`/profile/${holder.wallet}`}
          className="font-mono text-text-secondary text-xs truncate hover:text-accent-blue hover:underline transition-colors"
          title={holder.wallet}
        >
          {shortenAddress(holder.wallet)}
        </Link>
        {isWhale && (
          <span className="badge-orange text-[10px] px-1.5 py-0.5">🐋</span>
        )}
        {/* ArcScan link — visible on hover */}
        <a
          href={`${ARCSCAN_BASE}/address/${holder.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent-blue"
          title="View on ArcScan"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
            <polyline points="15 3 21 3 21 9" />
            <line x1="10" y1="14" x2="21" y2="3" />
          </svg>
        </a>
      </div>
      <div className="flex items-center gap-3 flex-shrink-0">
        <span className="text-text-muted text-xs tabular-nums">
          {formatTokens(holder.balance)}
        </span>
        {usdValue !== null && usdValue > 0.01 && (
          <span className="text-text-muted text-[10px] tabular-nums">
            ${usdValue >= 1000 ? `${(usdValue / 1000).toFixed(1)}K` : usdValue.toFixed(2)}
          </span>
        )}
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

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
        active
          ? 'bg-text-primary/10 text-text-primary'
          : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
      }`}
    >
      {label}
    </button>
  );
}
