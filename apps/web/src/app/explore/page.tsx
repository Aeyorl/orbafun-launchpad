'use client';

import { useQuery } from '@tanstack/react-query';
import { Suspense, useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, SortOption, StatusFilter, Token } from '@/lib/api';
import { TokenCard } from '@/components/TokenCard';
import { AgentBadge } from '@/components/AgentBadge';
import {
  formatMarketCap,
  formatUsdDirect,
  bondingCurveProgress,
  ipfsToGateway,
  tokenEmoji,
} from '@/lib/utils';

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="card animate-pulse h-48" aria-label="Loading token explorer" />}>
      <ExplorePageContent />
    </Suspense>
  );
}

function ExplorePageContent() {
  const searchParams = useSearchParams();
  const [sort, setSort] = useState<SortOption>('newest');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [search, setSearch] = useState('');
  const [agentFilter, setAgentFilter] = useState<string>(''); // '' | 'true' | 'false'
  const [offset, setOffset] = useState(0);

  // Auto-activate/deactivate the AI Agent filter based on ?is_agent URL param
  useEffect(() => {
    setAgentFilter(searchParams.get('is_agent') === 'true' ? 'true' : '');
  }, [searchParams]);
  const limit = 24;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['explore', sort, status, search, offset],
    queryFn: () =>
      api.listTokens({ sort, status, is_agent: agentFilter || undefined, limit, offset, search: search || undefined }),
    refetchInterval: 15_000,
  });

  const tokens = data?.tokens || [];
  const total = data?.total || 0;
  const hasMore = offset + limit < total;
  const hasPrev = offset > 0;

  // Separate highlights for Discovery Sections
  const trendingTokens = useMemo(() => {
    return [...tokens]
      .sort((a, b) => parseFloat(b.volume_24h || '0') - parseFloat(a.volume_24h || '0'))
      .slice(0, 3);
  }, [tokens]);

  const nearGraduationTokens = useMemo(() => {
    return [...tokens]
      .filter((t) => t.status !== 'graduated')
      .sort((a, b) => bondingCurveProgress(b.market_cap) - bondingCurveProgress(a.market_cap))
      .slice(0, 3);
  }, [tokens]);

  const justLaunchedTokens = useMemo(() => {
    return [...tokens]
      .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
      .slice(0, 3);
  }, [tokens]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 pb-16">
      {/* PAGE HERO HEADER & SEARCH */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-bg-border pb-6">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-accent-blue/10 text-accent-blue border border-accent-blue/20 mb-2">
            🚀 Arc Memecoin Launchpad
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-text-primary">
            Explore
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Discover what's launching, moving, and graduating on Orba.
          </p>
        </div>

        {/* Search Bar */}
        <div className="relative max-w-md w-full">
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
            placeholder="Search tokens, symbols or creators..."
            className="input text-xs pl-9 pr-8 py-2.5 rounded-full border border-bg-border focus:border-accent-blue shadow-xs"
          />
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-text-muted">
            🔍
          </span>
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-primary"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* DISCOVERY SECTION: TRENDING NOW */}
      {trendingTokens.length > 0 && !search && offset === 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-text-primary flex items-center gap-2">
              <span>🔥 Trending Now</span>
            </h2>
            <span className="text-xs text-text-muted">Highest 24h market activity</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {trendingTokens.map((token) => (
              <TrendingHeroCard key={token.contract_address} token={token} />
            ))}
          </div>
        </div>
      )}

      {/* DISCOVERY SECTION: NEAR GRADUATION & JUST LAUNCHED */}
      {!search && offset === 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Near Graduation */}
          {nearGraduationTokens.length > 0 && (
            <div className="card space-y-3 bg-bg-card border border-bg-border p-4 rounded-2xl shadow-subtle-1">
              <div className="flex items-center justify-between border-b border-bg-border pb-2.5">
                <h3 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                  <span>🎓 Approaching DEX Graduation</span>
                </h3>
                <span className="text-[11px] font-mono text-accent-blue font-semibold">$30,000 Target</span>
              </div>
              <div className="space-y-2">
                {nearGraduationTokens.map((token) => {
                  const progress = bondingCurveProgress(token.market_cap);
                  return (
                    <Link
                      key={token.contract_address}
                      href={`/trade/${token.contract_address}`}
                      className="p-3 rounded-xl bg-bg-input hover:bg-bg-hover transition-colors flex items-center justify-between gap-3 group border border-bg-border/60"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="w-8 h-8 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
                          {token.image ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={ipfsToGateway(token.image)} alt={token.symbol} className="w-full h-full object-cover" />
                          ) : (
                            tokenEmoji(token.symbol)
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-xs text-text-primary group-hover:text-accent-blue transition-colors truncate">
                              {token.name}
                            </span>
                            <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                          </div>
                          <div className="text-[10px] text-text-muted font-mono">${token.symbol}</div>
                        </div>
                      </div>

                      <div className="text-right space-y-1 font-mono text-xs">
                        <div className="font-bold text-accent-blue">{progress.toFixed(0)}% Progress</div>
                        <div className="text-[10px] text-text-muted">{formatMarketCap(token.market_cap)} / $30K</div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Just Launched */}
          {justLaunchedTokens.length > 0 && (
            <div className="card space-y-3 bg-bg-card border border-bg-border p-4 rounded-2xl shadow-subtle-1">
              <div className="flex items-center justify-between border-b border-bg-border pb-2.5">
                <h3 className="font-bold text-sm text-text-primary flex items-center gap-1.5">
                  <span>✨ Just Launched</span>
                </h3>
                <span className="text-[11px] font-mono text-emerald-500 font-semibold">Arc Testnet</span>
              </div>
              <div className="space-y-2">
                {justLaunchedTokens.map((token) => (
                  <Link
                    key={token.contract_address}
                    href={`/trade/${token.contract_address}`}
                    className="p-3 rounded-xl bg-bg-input hover:bg-bg-hover transition-colors flex items-center justify-between gap-3 group border border-bg-border/60"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
                        {token.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={ipfsToGateway(token.image)} alt={token.symbol} className="w-full h-full object-cover" />
                        ) : (
                          tokenEmoji(token.symbol)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1">
                          <span className="font-bold text-xs text-text-primary group-hover:text-accent-blue transition-colors truncate">
                            {token.name}
                          </span>
                          <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                        </div>
                        <div className="text-[10px] text-text-muted font-mono">${token.symbol}</div>
                      </div>
                    </div>

                    <div className="text-right space-y-1 font-mono text-xs">
                      <div className="font-bold text-text-primary">{formatMarketCap(token.market_cap)}</div>
                      <div className="text-[10px] text-text-muted">Start $4,000 MC</div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ALL TOKENS TOOLBAR & GRID */}
      <div className="space-y-4 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-bg-border pb-3">
          <h2 className="text-lg font-bold text-text-primary">
            All Tokens
          </h2>

          {/* Filter Controls — Sort tabs + Status pills */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            {/* Sort options */}
            <div className="flex items-center gap-1 font-semibold">
              {(['newest', 'market_cap', 'volume'] as SortOption[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setSort(s);
                    setOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg transition-all capitalize ${
                    sort === s
                      ? 'bg-accent-blue text-white font-bold shadow-xs'
                      : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                  }`}
                >
                  {s === 'market_cap' ? 'Market Cap' : s}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-bg-border" />

            {/* Status filters */}
            <div className="flex items-center gap-1">
              {(['active', 'graduated', 'all'] as StatusFilter[]).map((s) => (
                <button
                  key={s}
                  onClick={() => {
                    setStatus(s);
                    setOffset(0);
                  }}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all capitalize ${
                    status === s
                      ? 'bg-accent-blue/15 text-accent-blue border border-accent-blue/30'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                  }`}
                >
                  {s === 'active' ? 'Bonding' : s}
                </button>
              ))}
            </div>

            <div className="h-4 w-px bg-bg-border" />

            {/* AI Agent filter */}
            <button
              onClick={() => {
                setAgentFilter(agentFilter === 'true' ? '' : 'true');
                setOffset(0);
              }}
              className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                agentFilter === 'true'
                  ? 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover border border-transparent'
              }`}
            >
              <span>🤖</span>
              <span>AI Agents</span>
              {agentFilter === 'true' && (
                <span className="ml-0.5 text-[10px]">✕</span>
              )}
            </button>
          </div>
        </div>

        {/* MAIN TOKEN GRID */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="card bg-bg-card border border-bg-border animate-pulse h-60 rounded-2xl" />
            ))}
          </div>
        ) : isError ? (
          <div className="card text-center py-12 space-y-3 bg-bg-card border border-bg-border">
            <div className="text-3xl">⚠️</div>
            <div className="font-bold text-sm text-text-primary">Unable to load tokens</div>
            <p className="text-xs text-text-muted">Network error fetching token list from Arc indexer.</p>
            <button onClick={() => refetch()} className="btn-primary text-xs px-4 py-2 rounded-full font-bold">
              Retry Loading
            </button>
          </div>
        ) : tokens.length === 0 ? (
          <div className="card text-center py-12 space-y-3 bg-bg-card border border-bg-border text-text-muted">
            <div className="text-3xl">🔍</div>
            <div className="font-bold text-sm text-text-primary">No tokens found</div>
            <p className="text-xs text-text-muted">Try clearing your search query or adjusting your filters.</p>
            <Link href="/launch" className="btn-primary text-xs px-4 py-2 rounded-full font-bold inline-block">
              Launch a Token →
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tokens.map((token) => (
              <TokenCard key={token.contract_address} token={token} />
            ))}
          </div>
        )}

        {/* PAGINATION */}
        {total > limit && (
          <div className="flex items-center justify-between pt-4 border-t border-bg-border text-xs">
            <button
              onClick={() => setOffset(Math.max(0, offset - limit))}
              disabled={!hasPrev}
              className="btn-secondary px-4 py-2 rounded-full disabled:opacity-40"
            >
              ← Previous
            </button>
            <span className="text-text-muted font-mono">
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </span>
            <button
              onClick={() => setOffset(offset + limit)}
              disabled={!hasMore}
              className="btn-secondary px-4 py-2 rounded-full disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── TRENDING HERO CARD COMPONENT ──────────────────────────────────── */

function TrendingHeroCard({ token }: { token: Token }) {
  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';

  return (
    <Link
      href={`/trade/${token.contract_address}`}
      className="card bg-gradient-to-br from-bg-card to-bg-input border border-bg-border hover:border-accent-blue/50 p-4 rounded-2xl shadow-subtle-2 transition-all space-y-3 group"
    >
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-2xl bg-bg-base border border-bg-border flex items-center justify-center text-2xl overflow-hidden flex-shrink-0 shadow-xs">
          {token.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={ipfsToGateway(token.image)} alt={token.symbol} className="w-full h-full object-cover" />
          ) : (
            tokenEmoji(token.symbol)
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base text-text-primary group-hover:text-accent-blue transition-colors truncate">
            {token.name}
          </h3>
          <div className="flex items-center gap-2">
            <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
            <span className="text-xs font-mono text-text-muted">${token.symbol}</span>
            <span className="inline-flex items-center gap-1 px-2 py-0.2 rounded-full text-[10px] font-semibold border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              {isGraduated ? 'DEX' : 'Bonding'}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-bg-base/60 p-2.5 rounded-xl border border-bg-border/60">
        <div>
          <div className="text-[10px] text-text-muted">Market Cap</div>
          <div className="font-bold text-text-primary">{formatMarketCap(token.market_cap)}</div>
        </div>
        <div className="text-right">
          <div className="text-[10px] text-text-muted">24h Vol</div>
          <div className="font-bold text-accent-blue">{formatUsdDirect(token.volume_24h)}</div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="flex justify-between items-center text-[10px] font-mono">
          <span className="text-text-muted">Bonding Progress</span>
          <span className="font-bold text-accent-blue">{progress.toFixed(0)}%</span>
        </div>
        <div className="w-full h-1.5 bg-bg-border rounded-full overflow-hidden">
          <div className="h-full bg-accent-blue rounded-full" style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      </div>
    </Link>
  );
}
