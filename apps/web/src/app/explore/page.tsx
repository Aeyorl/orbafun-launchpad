'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api, SortOption, StatusFilter } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';

export default function ExplorePage() {
  const [sort, setSort] = useState<SortOption>('newest');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 24;

  const { data, isLoading } = useQuery({
    queryKey: ['explore', sort, status, search, offset],
    queryFn: () =>
      api.listTokens({ sort, status, limit, offset, search: search || undefined }),
    refetchInterval: 30_000,
  });

  const tokens = data?.tokens || [];
  const total = data?.total || 0;
  const hasMore = offset + limit < total;
  const hasPrev = offset > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Explore Tokens</h1>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOffset(0);
          }}
          placeholder="Search by name or symbol..."
          className="input max-w-xs"
          aria-label="Search tokens by name or symbol"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1" role="tablist" aria-label="Sort tokens">
          {(['newest', 'market_cap', 'volume'] as SortOption[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={sort === s}
              onClick={() => {
                setSort(s);
                setOffset(0);
              }}
              className={`tab ${sort === s ? 'tab-active' : ''}`}
            >
              {s === 'market_cap' ? 'Market Cap' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Filter by status">
          {(['active', 'graduated', 'all'] as StatusFilter[]).map((s) => (
            <button
              key={s}
              role="tab"
              aria-selected={status === s}
              onClick={() => {
                setStatus(s);
                setOffset(0);
              }}
              className={`tab ${status === s ? 'tab-active' : ''}`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Token grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className="card animate-pulse h-48" />
          ))}
        </div>
      ) : (
        <TokenGrid tokens={tokens} />
      )}

      {/* Pagination */}
      {total > limit && (
        <nav className="flex items-center justify-center gap-4" aria-label="Token pagination">
          <button
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={!hasPrev}
            aria-disabled={!hasPrev}
            aria-label="Previous page"
            className="btn-secondary"
          >
            ← Previous
          </button>
          <span className="text-sm text-text-muted tabular-nums" aria-current="page">
            {offset + 1}–{Math.min(offset + limit, total)} of {total}
          </span>
          <button
            onClick={() => setOffset(offset + limit)}
            disabled={!hasMore}
            aria-disabled={!hasMore}
            aria-label="Next page"
            className="btn-secondary"
          >
            Next →
          </button>
        </nav>
      )}
    </div>
  );
}
