'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { api, Holder } from '@/lib/api';
import { formatTokens, shortenAddress, timeAgo } from '@/lib/utils';
import { ARC_EXPLORER_URL } from '@/lib/config';
import { WalletBadge } from '@/components/WalletBadge';
import { ArrowSquareOut, Waves } from '@phosphor-icons/react';

const ARCSCAN_BASE = ARC_EXPLORER_URL;

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
      <div className="min-w-0">
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
  const displayed = tab === 'whales'
    ? whales
    : tab === 'recent'
      ? [...holders].sort((a, b) => new Date(b.last_activity_at).getTime() - new Date(a.last_activity_at).getTime())
      : holders;
  const topTenConcentration = holders.slice(0, 10).reduce((sum, holder) => sum + Number(holder.percentage), 0);

  return (
    <div className="min-w-0">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold">Holders</h3>
        <span className="text-xs text-text-muted tabular-nums">
          {total} {total === 1 ? 'holder' : 'holders'}
        </span>
      </div>

      {/* Tabs */}
      <div className="mb-3 grid grid-cols-3 gap-1" role="tablist" aria-label="Holder view">
        <TabButton label="Top Holders" active={tab === 'top'} onClick={() => setTab('top')} />
        <TabButton
          label={`Whales (${whales.length})`}
          active={tab === 'whales'}
          onClick={() => setTab('whales')}
        />
        <TabButton label="Recent" active={tab === 'recent'} onClick={() => setTab('recent')} />
      </div>

      {holders.length > 0 && (
        <div className="mb-3 flex items-center justify-between rounded-lg bg-bg-input/60 px-3 py-2 text-xs">
          <span className="text-text-muted">Top 10 concentration</span>
          <span className="font-semibold tabular-nums">{topTenConcentration.toFixed(2)}%</span>
        </div>
      )}

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
        <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
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
  const balance = Number(holder.balance) / 1e18;
  const usdValue = currentPrice && balance > 0 ? balance * currentPrice : null;

  return (
    <div className="group grid grid-cols-[minmax(0,1fr)_auto] gap-x-2 gap-y-1 rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-bg-hover sm:flex sm:items-center sm:justify-between sm:px-3 sm:py-2">
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span className="w-5 shrink-0 pt-0.5 text-xs text-text-muted tabular-nums sm:pt-0">{rank}</span>
        <div className="min-w-0">
          <Link
            href={`/profile/${holder.wallet}`}
            className="block font-mono text-text-secondary text-xs truncate hover:text-accent-blue hover:underline transition-colors"
            title={holder.wallet}
          >
            {shortenAddress(holder.wallet)}
          </Link>
          <span className="block truncate text-[10px] text-text-muted">
            {timeAgo(holder.last_activity_at)} · {holder.buy_count} buys / {holder.sell_count} sells
          </span>
        </div>
        {holder.wallet_tier && holder.wallet_tier_label && holder.wallet_tier_calculated_at && (
          <WalletBadge tier={{
            key: holder.wallet_tier,
            label: holder.wallet_tier_label,
            basis: 'orba_activity',
            calculated_at: holder.wallet_tier_calculated_at,
          }} />
        )}
        {isWhale && (
          <span className="badge-orange px-1.5 py-0.5" title="Owns more than 5% of tracked holdings">
            <Waves size={12} weight="fill" aria-hidden="true" />
          </span>
        )}
        {/* ArcScan link — visible on hover */}
        <a
          href={`${ARCSCAN_BASE}/address/${holder.wallet}`}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 text-text-muted opacity-70 transition-opacity hover:text-accent-blue sm:opacity-0 sm:group-hover:opacity-100"
          title="View on ArcScan"
          aria-label={`View ${shortenAddress(holder.wallet)} on ArcScan`}
        >
          <ArrowSquareOut size={12} aria-hidden="true" />
        </a>
      </div>
      <div className="col-span-2 flex min-w-0 items-center justify-between gap-2 pl-7 sm:col-span-1 sm:shrink-0 sm:justify-end sm:gap-3 sm:pl-0">
        <span className="text-text-muted text-xs tabular-nums">
          {formatTokens(holder.balance)}
        </span>
        {usdValue !== null && usdValue > 0.01 && (
          <span className="text-text-muted text-[10px] tabular-nums">
            ${usdValue >= 1000 ? `${(usdValue / 1000).toFixed(1)}K` : usdValue.toFixed(2)}
          </span>
        )}
        <span
          className={`w-16 shrink-0 text-right text-xs font-semibold tabular-nums ${
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
      className={`min-w-0 whitespace-nowrap rounded-full px-1.5 py-1 text-[11px] font-medium transition-colors sm:px-3 sm:text-xs ${
        active
          ? 'bg-text-primary/10 text-text-primary'
          : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
      }`}
    >
      {label}
    </button>
  );
}
