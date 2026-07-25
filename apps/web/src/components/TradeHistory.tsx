'use client';

import { useState, useEffect, useCallback } from 'react';
import { api, Trade } from '@/lib/api';
import { formatUsdc, formatTokens, shortenAddress, timeAgo } from '@/lib/utils';

const PAGE_SIZE = 50;

/**
 * TradeHistory — paginated, live-updating list of trades for a token.
 *
 * Props:
 *  - initialTrades: first page (already fetched by the parent for the chart)
 *  - tokenAddress: used to fetch additional pages via the API
 *
 * Pagination: "Load more" button appends older trades (descending order).
 * Live updates: when `initialTrades` changes (e.g. WebSocket invalidation
 * refetches the parent query), we reset to the new first page.
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

  // When the parent's initial trades change (WS refetch), reset to page 1.
  // Compare by first trade's tx_hash+log_index to avoid extra resets.
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
      // Token had trades, now none (rare — token deleted?). Reset.
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

  // Estimate total from initial fetch if we don't have it yet.
  const totalTrades = total ?? (initialTrades.length >= 100 ? null : initialTrades.length);
  const hasMore = totalTrades === null ? trades.length >= 100 : trades.length < totalTrades;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">Transaction History</h3>
        {totalTrades !== null && (
          <span className="text-xs text-text-muted tabular-nums">
            {trades.length} / {totalTrades}
          </span>
        )}
      </div>

      {trades.length === 0 ? (
        <div className="text-center py-8 text-text-muted text-sm">
          No transactions yet
        </div>
      ) : (
        <>
          <div className="space-y-1 max-h-[28rem] overflow-y-auto pr-1">
            {trades.map((trade) => (
              <div
                key={`${trade.tx_hash}-${trade.log_index}`}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-hover transition-colors text-sm"
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
                  <span>{shortenAddress(trade.wallet)}</span>
                  <span>·</span>
                  <span>{timeAgo(trade.timestamp)}</span>
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
