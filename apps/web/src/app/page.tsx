'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Token, SortOption } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';
import { useTokenEvents } from '@/lib/useWebSocket';
import { formatUsdc, formatUsdDirect, formatMarketCap } from '@/lib/utils';

type Tab = 'newest' | 'market_cap' | 'volume' | 'graduated';

export default function LandingPage() {
  const [tab, setTab] = useState<Tab>('newest');
  const [liveTokens, setLiveTokens] = useState<Token[]>([]);

  const sortMap: Record<Tab, SortOption | undefined> = {
    newest: 'newest',
    market_cap: 'market_cap',
    volume: 'volume',
    graduated: undefined, // graduated uses status filter
  };

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['tokens', tab],
    queryFn: () =>
      api.listTokens({
        sort: sortMap[tab] as SortOption,
        status: tab === 'graduated' ? 'graduated' : 'active',
        limit: 24,
      }),
    refetchInterval: 30_000, // fallback refetch every 30s
  });

  // Global platform stats (total tokens, 24h volume, graduated count).
  const { data: stats } = useQuery({
    queryKey: ['platform-stats'],
    queryFn: () => api.getStats(),
    refetchInterval: 30_000,
  });

  // Fetch top 4 tokens for the live market pulse ticker
  const { data: tickerData } = useQuery({
    queryKey: ['tokens-ticker'],
    queryFn: () => api.listTokens({ sort: 'market_cap', limit: 4 }),
    refetchInterval: 15_000,
  });

  // WebSocket: add new tokens to the top of the list in real time
  useTokenEvents(null, (event) => {
    if (event.type === 'NEW_TOKEN' && tab === 'newest') {
      setLiveTokens((prev) => {
        if (prev.some((t) => t.contract_address === event.data.contract_address)) {
          return prev;
        }
        return [event.data as Token, ...prev].slice(0, 24);
      });
    }
  });

  // Merge live tokens with fetched tokens
  const tokens = [...liveTokens, ...(data?.tokens || [])];
  const seen = new Set<string>();
  const deduped = tokens.filter((t) => {
    if (seen.has(t.contract_address)) return false;
    seen.add(t.contract_address);
    return true;
  });

  const tickerTokens = tickerData?.tokens || deduped.slice(0, 4);

  return (
    <div className="space-y-10">
      {/* Hero */}
      <section className="text-center py-12 lg:py-16 animate-fade-in">
        {/* Arc positioning badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-blue/10 text-accent-blue text-xs font-mono font-semibold mb-4 tracking-wider">
          <span>USDC-NATIVE</span>
          <span className="opacity-40">·</span>
          <span>POWERED BY ARC</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-serif font-normal tracking-tight mb-5 leading-tight">
          Launch a token on{' '}
          <em className="not-italic text-accent-blue">Orba</em>
        </h1>
        <p className="text-lg text-text-secondary max-w-2xl mx-auto mb-8 leading-relaxed">
          The stablecoin-native launchpad. Fair bonding curves priced in USDC,
          automatic DEX graduation, sub-second finality. No presale, no team
          allocation.
        </p>
        <div className="flex gap-3 justify-center">
          <Link href="/launch" className="btn-primary text-base px-6 py-3">
            Launch a token
          </Link>
          <Link href="/explore" className="btn-secondary text-base px-6 py-3">
            Explore the board
          </Link>
        </div>

        {/* Live Market Activity Ticker */}
        {tickerTokens.length > 0 && (
          <div className="mt-8 inline-flex items-center gap-3 px-4 py-2 rounded-full bg-bg-card border border-bg-border text-xs max-w-full overflow-x-auto">
            <div className="flex items-center gap-1.5 font-mono text-accent-blue flex-shrink-0">
              <span className="w-2 h-2 rounded-full bg-accent-blue animate-pulse" />
              <span className="font-semibold tracking-wider">LIVE ON ARC</span>
            </div>
            <span className="text-text-muted opacity-40">|</span>
            <div className="flex items-center gap-4 text-text-secondary whitespace-nowrap overflow-x-auto scrollbar-none">
              {tickerTokens.map((t) => (
                <Link
                  key={t.contract_address}
                  href={`/trade/${t.contract_address}`}
                  className="flex items-center gap-1.5 hover:text-text-primary transition-colors"
                >
                  <span className="font-bold text-text-primary">${t.symbol}</span>
                  <span className="font-mono text-text-muted tabular-nums">
                    {formatMarketCap(t.market_cap)} MC
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Stats bar — data-terminal metric cards */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="TOKENS LAUNCHED"
          value={stats ? String(stats.total_tokens) : '—'}
          helper="USDC-Native bonding"
        />
        <StatCard
          label="24H VOLUME"
          value={stats ? formatUsdc(stats.volume_24h) : '—'}
          helper="Settled in USDC"
        />
        <StatCard
          label="GRADUATED TO DEX"
          value={stats ? String(stats.graduated_tokens) : '—'}
          helper="$30K MC DEX threshold"
        />
      </section>

      {/* How it works */}
      <section className="grid md:grid-cols-3 gap-4">
        <HowItStep
          num="01"
          title="Launch in one transaction"
          desc="Name it, add an image, optionally make the first buy. The token and its bonding curve deploy together."
        />
        <HowItStep
          num="02"
          title="Price discovery on the curve"
          desc="Every trade moves a constant-product curve priced in USDC. Market cap starts at $4K and rises as people buy."
        />
        <HowItStep
          num="03"
          title="Bond, then migrate"
          desc="At $30K market cap the curve bonds and migrates to a DEX automatically, seeding permanent liquidity with LP burned."
        />
      </section>

      {/* Token board */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-serif font-normal">Token Board</h2>
          <div className="flex gap-1" role="tablist" aria-label="Token board sorting">
            {(['newest', 'market_cap', 'volume', 'graduated'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setLiveTokens([]);
                }}
                className={`tab ${tab === t ? 'tab-active' : ''}`}
              >
                {t === 'market_cap' ? 'Market Cap' : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3" aria-busy="true" aria-label="Loading tokens">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card animate-pulse h-48" />
            ))}
          </div>
        ) : (
          <TokenGrid tokens={deduped} />
        )}

        {data && data.total > 24 && (
          <div className="text-center mt-6">
            <Link href="/explore" className="btn-secondary">
              View all {data.total} tokens →
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card-elevated text-center py-4">
      <div className="text-2xl md:text-3xl font-bold tabular-nums tracking-tight">
        {value}
      </div>
      <div className="text-[11px] font-semibold tracking-wider text-text-muted mt-1 uppercase">
        {label}
      </div>
      {helper && (
        <div className="text-[11px] font-mono text-accent-blue mt-0.5 opacity-85">
          {helper}
        </div>
      )}
    </div>
  );
}

function HowItStep({
  num,
  title,
  desc,
}: {
  num: string;
  title: string;
  desc: string;
}) {
  return (
    <div className="card">
      <div className="text-text-muted text-sm font-mono mb-2">{num}</div>
      <h3 className="font-medium text-lg mb-2">{title}</h3>
      <p className="text-sm text-text-secondary">{desc}</p>
    </div>
  );
}
