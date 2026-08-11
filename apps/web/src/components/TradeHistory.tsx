'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, Trade } from '@/lib/api';
import { formatUsdc, formatTokens, shortenAddress, timeAgo } from '@/lib/utils';
import { ARC_EXPLORER_URL } from '@/lib/config';
import { WalletBadge } from '@/components/WalletBadge';

const PAGE_SIZE = 50;
const ARCSCAN_BASE = ARC_EXPLORER_URL;

type TradeFilter = 'all' | 'buy' | 'sell';

/**
 * TradeHistory — paginated, filterable, live-updating list of trades for a token.
 *
 * Features:
 *  - Filter by trade type: All / Buys / Sells
 *  - Wallet addresses link to internal profile + ArcScan
 *  - Each trade row links to ArcScan tx detail
 *  - Pagination with "Load more" button
 *  - Live updates via WebSocket query invalidation
 */
export function TradeHistory({
  initialTrades,
  tokenAddress,
}: {
  initialTrades: Trade[];
  tokenAddress: string;
}) {
  const [trades, setTrades] = useState<Trade[]>(initialTrades);
  const [offset, setOffset] = useState(initialTrades.length);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<TradeFilter>('all');

  // When the parent's initial trades change (WS refetch), reset to page 1.
  const firstKey = initialTrades[0]
    ? `${initialTrades[0].tx_hash}-${initialTrades[0].log_index}`
    : '';
  const lastKey = trades[0]
    ? `${trades[0].tx_hash}-${trades[0].log_index}`
    : '';

  useEffect(() => {
    if (firstKey && firstKey !== lastKey) {
      setTrades(initialTrades);
      setOffset(initialTrades.length);
      setTotal(null);
    } else if (!firstKey && trades.length > 0) {
      setTrades([]);
      setOffset(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstKey]);

  const loadMore = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getTokenTrades(tokenAddress, {
        limit: PAGE_SIZE,
        offset,
        order: 'desc',
      });
      setTrades((prev) => [...prev, ...res.trades]);
      setOffset((prev) => prev + res.trades.length);
      setTotal(res.total);
    } catch (err) {
      console.error('[trade-history] load more failed:', err);
      setError('Failed to load more. Try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, offset, tokenAddress]);

  // Apply client-side filter
  const filteredTrades = filter === 'all'
    ? trades
    : trades.filter((t) => t.type === filter);

  // Counts for filter badges
  const buyCount = trades.filter((t) => t.type === 'buy').length;
  const sellCount = trades.filter((t) => t.type === 'sell').length;

  const totalTrades = total ?? (initialTrades.length >= 100 ? null : initialTrades.length);
  const hasMore = totalTrades === null ? trades.length >= 100 : trades.length < totalTrades;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold">Transaction History</h3>
        <div className="flex items-center gap-2">
          {totalTrades !== null && (
            <span className="text-xs text-text-muted tabular-nums">
              {filteredTrades.length} / {totalTrades}
            </span>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 mb-3" role="tablist" aria-label="Filter trades">
        <FilterTab
          label="All"
          count={trades.length}
          active={filter === 'all'}
          onClick={() => setFilter('all')}
        />
        <FilterTab
          label="Buys"
          count={buyCount}
          active={filter === 'buy'}
          onClick={() => setFilter('buy')}
          color="green"
        />
        <FilterTab
          label="Sells"
          count={sellCount}
          active={filter === 'sell'}
          onClick={() => setFilter('sell')}
          color="red"
        />
      </div>

      {filteredTrades.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          {trades.length === 0 ? 'No transactions yet' : `No ${filter} transactions`}
        </div>
      ) : (
        <>
          <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {filteredTrades.map((trade) => (
              <div
                key={`${trade.tx_hash}-${trade.log_index}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors text-sm group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`badge ${
                      trade.type === 'buy' ? 'badge-green' : 'badge-red'
                    }`}
                  >
                    {trade.type === 'buy' ? 'BUY' : 'SELL'}
                  </span>
                  <span className="text-text-muted tabular-nums">
                    {formatUsdc(trade.usdc_amount)}
                  </span>
                  <span className="text-text-muted">→</span>
                  <span className="font-medium tabular-nums truncate">
                    {formatTokens(trade.token_amount)}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-muted flex-shrink-0">
                  {/* Wallet — links to both internal profile and ArcScan */}
                  <Link
                    href={`/profile/${trade.wallet}`}
                    className="hover:text-accent-blue hover:underline transition-colors"
                    title={`View profile: ${trade.wallet}`}
                  >
                    {shortenAddress(trade.wallet)}
                  </Link>
                  {trade.wallet_tier && trade.wallet_tier_label && trade.wallet_tier_calculated_at && (
                    <WalletBadge tier={{
                      key: trade.wallet_tier,
                      label: trade.wallet_tier_label,
                      basis: 'orba_activity',
                      calculated_at: trade.wallet_tier_calculated_at,
                    }} />
                  )}
                  <span>·</span>
                  <span>{timeAgo(trade.timestamp)}</span>
                  {/* ArcScan tx link */}
                  <a
                    href={`${ARCSCAN_BASE}/tx/${trade.tx_hash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-text-muted hover:text-accent-blue"
                    title="View on ArcScan"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <div className="mt-3 pt-3 border-t border-bg-border">
              <button
                onClick={loadMore}
                disabled={loading}
                aria-disabled={loading}
                aria-label="Load more trades"
                className="btn-secondary w-full text-sm"
              >
                {loading ? 'Loading…' : 'Load more'}
              </button>
              {error && (
                <p className="text-xs text-accent-red mt-2 text-center">{error}</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Filter tab pill for the trade type filter bar. */
function FilterTab({
  label,
  count,
  active,
  onClick,
  color,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  color?: 'green' | 'red';
}) {
  const activeClass = color === 'green'
    ? 'bg-green-600/15 text-green-700'
    : color === 'red'
    ? 'bg-red-600/15 text-red-700'
    : 'bg-text-primary/10 text-text-primary';

  return (
    <button
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
        active
          ? activeClass
          : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
      }`}
    >
      {label}
      <span className="ml-1 tabular-nums opacity-70">{count}</span>
    </button>
  );
}
