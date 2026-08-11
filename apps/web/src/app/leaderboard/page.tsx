'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { api, Token } from '@/lib/api';
import { GraduationCap, MagnifyingGlass, WarningCircle, X } from '@phosphor-icons/react';
import { WalletBadge } from '@/components/WalletBadge';
import {
  formatMarketCap,
  formatUsdc,
  formatUsdDirect,
  shortenAddress,
  ipfsToGateway,
  tokenEmoji,
  bondingCurveProgress,
} from '@/lib/utils';

type LeaderboardTab = 'top_gainers' | 'top_volume' | 'market_cap' | 'new' | 'top_creators';

const TABS: { key: LeaderboardTab; label: string; mobileLabel: string; description: string }[] = [
  { key: 'top_gainers', label: 'Top Gainers', mobileLabel: 'Gainers', description: 'Tokens moving highest on Orba' },
  { key: 'top_volume', label: 'Top Volume', mobileLabel: 'Volume', description: 'Tokens ranked by 24h trading volume' },
  { key: 'market_cap', label: 'Market Cap', mobileLabel: 'MC', description: 'Tokens ranked by total market capitalization' },
  { key: 'new', label: 'New Tokens', mobileLabel: 'New', description: 'Recently launched tokens on Arc' },
  { key: 'top_creators', label: 'Top Creators', mobileLabel: 'Creators', description: 'Creators ranked by volume and launched tokens' },
];

export default function LeaderboardPage() {
  const [activeTab, setActiveTab] = useState<LeaderboardTab>('top_gainers');
  const [searchQuery, setSearchQuery] = useState('');
  const limit = 50;

  // Fetch base leaderboard data based on query type
  const queryType = activeTab;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['leaderboard', queryType],
    queryFn: () => api.getLeaderboard(queryType, limit),
    refetchInterval: 15_000,
  });

  const rawRows = data || [];

  // Filter & sort data dynamically based on active tab & search query
  const filteredRows = useMemo(() => {
    let result = [...rawRows];

    // Tab specific sorting if needed
    if (activeTab === 'market_cap') {
      result.sort((a, b) => parseFloat(b.market_cap || '0') - parseFloat(a.market_cap || '0'));
    } else if (activeTab === 'new') {
      result.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    }

    // Search query filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      if (activeTab === 'top_creators') {
        result = result.filter(
          (r) =>
            (r.wallet && r.wallet.toLowerCase().includes(q)) ||
            (r.username && r.username.toLowerCase().includes(q))
        );
      } else {
        result = result.filter(
          (t: Token) =>
            t.name.toLowerCase().includes(q) ||
            t.symbol.toLowerCase().includes(q) ||
            t.contract_address.toLowerCase().includes(q)
        );
      }
    }

    return result;
  }, [rawRows, activeTab, searchQuery]);

  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="max-w-6xl mx-auto space-y-5 pb-16">
      {/* HEADER SECTION */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
              Leaderboard
            </h1>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Live · Arc
            </span>
          </div>
          <p className="text-xs text-text-muted mt-0.5">{activeTabMeta.description}</p>
        </div>

        {/* SEARCH FIELD */}
        <div className="relative max-w-xs w-full">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search tokens or creators..."
            className="input text-xs pl-8 py-2 rounded-full border border-bg-border focus:border-accent-blue"
          />
          <MagnifyingGlass size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted hover:text-text-primary"
            >
              <X size={13} aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* RANKING TABS TOOLBAR */}
      <div className="border-b border-bg-border flex items-center gap-1 overflow-x-auto pb-1 text-xs font-semibold">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-3.5 py-2 rounded-lg transition-all flex-shrink-0 ${
              activeTab === tab.key
                ? 'bg-accent-blue text-white font-bold shadow-xs'
                : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
            }`}
          >
            <span className="hidden sm:inline">{tab.label}</span>
            <span className="sm:hidden">{tab.mobileLabel}</span>
          </button>
        ))}
      </div>

      {/* MAIN CONTENT AREA */}
      {isLoading ? (
        <LeaderboardSkeleton />
      ) : isError ? (
        <div className="card text-center py-12 space-y-3 bg-bg-card border border-bg-border">
          <WarningCircle size={32} className="mx-auto text-accent-orange" aria-hidden="true" />
          <div className="font-bold text-sm text-text-primary">Unable to load market leaderboard</div>
          <p className="text-xs text-text-muted">Failed to connect to Orba indexer node.</p>
          <button onClick={() => refetch()} className="btn-primary text-xs px-4 py-2 rounded-full font-bold">
            Retry Loading
          </button>
        </div>
      ) : filteredRows.length === 0 ? (
        <div className="card text-center py-12 space-y-3 bg-bg-card border border-bg-border text-text-muted">
          <MagnifyingGlass size={32} className="mx-auto" aria-hidden="true" />
          <div className="font-bold text-sm text-text-primary">No matching records found</div>
          <p className="text-xs text-text-muted">Try clearing your search query or switching tabs.</p>
          <Link href="/launch" className="btn-primary text-xs px-4 py-2 rounded-full font-bold inline-block">
            Launch a Token →
          </Link>
        </div>
      ) : activeTab === 'top_creators' ? (
        <CreatorsLeaderboard rows={filteredRows} />
      ) : (
        <TokensLeaderboard rows={filteredRows} activeTab={activeTab} />
      )}
    </div>
  );
}

/* ─── CREATORS LEADERBOARD COMPONENT ──────────────────────────────── */

function CreatorsLeaderboard({ rows }: { rows: any[] }) {
  return (
    <div className="card !p-0 overflow-hidden border border-bg-border bg-bg-card shadow-subtle-1">
      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-input border-b border-bg-border text-text-muted font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Creator</th>
              <th className="py-3 px-4 text-right">Tokens Created</th>
              <th className="py-3 px-4 text-right">Active Tokens</th>
              <th className="py-3 px-4 text-right">Total Volume</th>
              <th className="py-3 px-4 text-right">Combined Market Cap</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border/60">
            {rows.map((row, i) => (
              <tr key={row.wallet} className="hover:bg-bg-hover/50 transition-colors">
                <td className="py-3.5 px-4 text-center font-bold font-mono">
                  <span className={i < 3 ? 'text-accent-blue font-extrabold text-sm' : 'text-text-muted'}>
                    {i + 1}
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <Link href={`/profile/${row.wallet}`} className="flex items-center gap-3 hover:underline">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-accent-blue to-accent-peach border border-bg-border flex items-center justify-center text-xs font-bold text-white font-mono flex-shrink-0">
                      {shortenAddress(row.wallet).slice(2, 4).toUpperCase()}
                    </div>
                    <div>
                      <div className="font-bold text-text-primary">
                        {row.username || shortenAddress(row.wallet)}
                      </div>
                      {row.wallet_tier && row.wallet_tier_label && row.wallet_tier_calculated_at && (
                        <WalletBadge tier={{
                          key: row.wallet_tier,
                          label: row.wallet_tier_label,
                          basis: 'orba_activity',
                          calculated_at: row.wallet_tier_calculated_at,
                        }} />
                      )}
                      <div className="text-[11px] font-mono text-text-muted">
                        {shortenAddress(row.wallet)}
                      </div>
                    </div>
                  </Link>
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                  {row.tokens_launched || 0}
                </td>
                <td className="py-3.5 px-4 text-right font-mono text-text-secondary tabular-nums">
                  {row.active_tokens || 0}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                  {formatUsdc(row.total_volume_usdc || 0)}
                </td>
                <td className="py-3.5 px-4 text-right font-mono font-bold text-accent-blue tabular-nums">
                  {formatMarketCap(row.total_market_cap || 0)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* MOBILE STACKED CARDS */}
      <div className="md:hidden divide-y divide-bg-border/60">
        {rows.map((row, i) => (
          <Link
            key={row.wallet}
            href={`/profile/${row.wallet}`}
            className="p-3.5 flex items-center justify-between gap-3 hover:bg-bg-hover/40 transition-colors block"
          >
            <div className="flex items-center gap-3">
              <span className={`font-bold font-mono text-sm w-5 text-center ${i < 3 ? 'text-accent-blue font-extrabold' : 'text-text-muted'}`}>
                #{i + 1}
              </span>
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-accent-blue to-accent-peach flex items-center justify-center text-xs font-bold text-white font-mono flex-shrink-0">
                {shortenAddress(row.wallet).slice(2, 4).toUpperCase()}
              </div>
              <div>
                <div className="font-bold text-sm text-text-primary">
                  {row.username || shortenAddress(row.wallet)}
                </div>
                {row.wallet_tier && row.wallet_tier_label && row.wallet_tier_calculated_at && (
                  <WalletBadge tier={{
                    key: row.wallet_tier,
                    label: row.wallet_tier_label,
                    basis: 'orba_activity',
                    calculated_at: row.wallet_tier_calculated_at,
                  }} />
                )}
                <div className="text-[11px] text-text-muted font-mono">
                  {row.tokens_launched || 0} launched · {formatUsdc(row.total_volume_usdc || 0)}
                </div>
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs font-bold font-mono text-accent-blue">
                {formatMarketCap(row.total_market_cap || 0)}
              </div>
              <div className="text-[10px] text-text-muted">Combined Cap</div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

/* ─── TOKENS LEADERBOARD COMPONENT (GAINERS / VOLUME / MC / NEW) ─────── */

function TokensLeaderboard({ rows, activeTab }: { rows: Token[]; activeTab: LeaderboardTab }) {
  return (
    <div className="card !p-0 overflow-hidden border border-bg-border bg-bg-card shadow-subtle-1">
      {/* DESKTOP TABLE */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead className="bg-bg-input border-b border-bg-border text-text-muted font-semibold uppercase tracking-wider">
            <tr>
              <th className="py-3 px-4 w-12 text-center">#</th>
              <th className="py-3 px-4">Token</th>
              <th className="py-3 px-4 text-right">Market Cap</th>
              <th className="py-3 px-4 text-right">24h Change</th>
              <th className="py-3 px-4 text-right">24h Volume</th>
              <th className="py-3 px-4 text-right w-44">Bonding Progress</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-bg-border/60">
            {rows.map((token, i) => {
              const progress = bondingCurveProgress(token.market_cap);
              const isGraduated = token.status === 'graduated';
              const rawGain = (token as Token & { gain_pct?: string }).gain_pct;
              const pct24h = rawGain === undefined ? null : Number(rawGain);
              const isPositive = pct24h !== null && pct24h >= 0;

              return (
                <tr key={token.contract_address} className="hover:bg-bg-hover/50 transition-colors">
                  <td className="py-3.5 px-4 text-center font-bold font-mono">
                    <span className={i < 3 ? 'text-accent-blue font-extrabold text-sm' : 'text-text-muted'}>
                      {i + 1}
                    </span>
                  </td>

                  {/* Token Identity */}
                  <td className="py-3.5 px-4">
                    <Link href={`/trade/${token.contract_address}`} className="flex items-center gap-3 group">
                      <div className="w-8 h-8 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0 text-base shadow-xs">
                        {token.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={ipfsToGateway(token.image)}
                            alt={token.symbol}
                            className="w-full h-full object-cover"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        ) : (
                          tokenEmoji(token.symbol)
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-bold text-text-primary group-hover:text-accent-blue transition-colors flex items-center gap-1.5">
                          <span>{token.name}</span>
                          <span className="text-[11px] font-normal text-text-muted">${token.symbol}</span>
                        </div>
                        <div className="text-[11px] font-mono text-text-muted">
                          by {shortenAddress(token.creator_wallet)}
                        </div>
                      </div>
                    </Link>
                  </td>

                  {/* Market Cap */}
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                    {formatMarketCap(token.market_cap)}
                  </td>

                  {/* 24h Change */}
                  <td className="py-3.5 px-4 text-right font-mono font-bold tabular-nums">
                    {pct24h === null ? (
                      <span className="text-text-muted">—</span>
                    ) : (
                      <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                        {isPositive ? '+' : ''}{pct24h.toFixed(2)}%
                      </span>
                    )}
                  </td>

                  {/* 24h Volume */}
                  <td className="py-3.5 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                    {formatUsdDirect(token.volume_24h)}
                  </td>

                  {/* Bonding Curve Progress */}
                  <td className="py-3.5 px-4 text-right">
                    {isGraduated ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                        Graduated <GraduationCap size={12} weight="fill" aria-hidden="true" />
                      </span>
                    ) : (
                      <div className="space-y-1">
                        <div className="flex justify-between items-center text-[10px] font-mono">
                          <span className="text-text-muted">Curve</span>
                          <span className="font-bold text-accent-blue">{progress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-bg-border rounded-full overflow-hidden">
                          <div
                            className="h-full bg-accent-blue transition-all duration-300 rounded-full"
                            style={{ width: `${Math.min(100, progress)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </td>

                  {/* Action */}
                  <td className="py-3.5 px-4 text-right">
                    <Link
                      href={`/trade/${token.contract_address}`}
                      className="btn-secondary text-[11px] px-3 py-1 rounded-full font-bold inline-block"
                    >
                      Trade
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* MOBILE STACKED CARDS */}
      <div className="md:hidden divide-y divide-bg-border/60">
        {rows.map((token, i) => {
          const progress = bondingCurveProgress(token.market_cap);
          const isGraduated = token.status === 'graduated';

          return (
            <Link
              key={token.contract_address}
              href={`/trade/${token.contract_address}`}
              className="p-3.5 space-y-2.5 hover:bg-bg-hover/40 transition-colors block"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  <span className={`font-bold font-mono text-xs w-4 text-center ${i < 3 ? 'text-accent-blue font-extrabold' : 'text-text-muted'}`}>
                    #{i + 1}
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
                    {token.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ipfsToGateway(token.image)} alt={token.symbol} className="w-full h-full object-cover" />
                    ) : (
                      tokenEmoji(token.symbol)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold text-sm text-text-primary truncate">{token.name}</div>
                    <div className="text-xs text-text-muted">${token.symbol}</div>
                  </div>
                </div>

                <span className="btn-secondary text-[11px] px-3 py-1 rounded-full font-bold flex-shrink-0">
                  Trade
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 bg-bg-input p-2 rounded-xl text-xs font-mono">
                <div>
                  <div className="text-[10px] text-text-muted">Market Cap</div>
                  <div className="font-bold text-text-primary">{formatMarketCap(token.market_cap)}</div>
                </div>
                <div className="text-center">
                  <div className="text-[10px] text-text-muted">24h Vol</div>
                  <div className="font-bold text-text-primary">{formatUsdDirect(token.volume_24h)}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] text-text-muted">Status</div>
                  <div className="font-bold text-accent-blue">{isGraduated ? 'Graduated' : `${progress.toFixed(0)}%`}</div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

function LeaderboardSkeleton() {
  return (
    <div className="card !p-0 overflow-hidden border border-bg-border bg-bg-card animate-pulse space-y-2 p-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <div key={i} className="h-12 bg-bg-input rounded-xl" />
      ))}
    </div>
  );
}
