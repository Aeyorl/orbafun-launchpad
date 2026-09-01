'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { api, Token, SortOption } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';
import { SunnySpotlight } from '@/components/SunnySpotlight';
import { useTokenEvents } from '@/lib/useWebSocket';
import { formatUsdCompact, formatMarketCap } from '@/lib/utils';
import { ArrowRight, ArrowUpRight } from '@phosphor-icons/react';

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

  // The daily spotlight is earned by current activity, never paid placement.
  const { data: spotlightData, isLoading: isSpotlightLoading } = useQuery({
    queryKey: ['sunny-spotlight-token', 'all'],
    queryFn: () => api.listTokens({ sort: 'volume', status: 'all', limit: 1 }),
    refetchInterval: 30_000,
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
    <div className="space-y-14">
      <section className="grid min-h-[680px] gap-10 border-b border-bg-border py-12 xl:grid-cols-[1.05fr_0.95fr] xl:items-center xl:py-20 animate-fade-in">
        <div className="min-w-0">
          <h1 className="max-w-3xl text-[clamp(3.7rem,7vw,7rem)] leading-[0.86] tracking-[-0.065em] text-accent-blue">
            Make a coin<br />people want to<br /><em className="font-normal text-accent-green">pass around.</em>
          </h1>
          <p className="mt-8 max-w-xl text-base leading-relaxed text-text-secondary">
            Launch an idea, find its first believers, and grow it into a real market.
            Fast, transparent, and delightfully simple on Arc.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/launch" className="btn-primary inline-flex items-center gap-6 px-6 py-3.5 text-base font-semibold shadow-[5px_5px_0_rgb(var(--color-text-primary))]">Bring an idea to life <ArrowUpRight size={18} /></Link>
            <Link href="/explore" className="inline-flex items-center gap-2 px-4 py-3 text-sm font-bold text-accent-blue">See what is growing <ArrowRight size={18} /></Link>
          </div>
          {tickerTokens.length > 0 && (
            <div className="mt-10 flex max-w-xl items-center gap-3 overflow-x-auto border-t border-bg-border px-1 pt-5 font-mono text-[10px] scrollbar-none">
              <span className="flex shrink-0 items-center gap-2 font-semibold tracking-[0.12em] text-accent-green"><i className="h-1.5 w-1.5 rounded-full bg-accent-green" /> GROWING NOW</span>
              {tickerTokens.map((t) => (
                <Link key={t.contract_address} href={`/trade/${t.contract_address}`} className="shrink-0 text-text-secondary hover:text-accent-blue"><b className="text-text-primary">${t.symbol}</b> {formatMarketCap(t.market_cap)}</Link>
              ))}
            </div>
          )}
        </div>
        <SunnySpotlight token={spotlightData?.tokens[0]} isLoading={isSpotlightLoading} />
      </section>

      {/* Compact platform pulse. */}
      <section className="grid min-w-0 grid-cols-3 gap-2 sm:gap-3">
        <StatCard
          label="TOKENS"
          value={stats ? String(stats.total_tokens) : '—'}
          helper="Launched"
        />
        <StatCard
          label="24H VOLUME"
          value={stats ? formatUsdCompact(stats.volume_24h) : '—'}
          helper="USDC"
        />
        <StatCard
          label="GRADUATED"
          value={stats ? String(stats.graduated_tokens) : '—'}
          helper="To DEX"
        />
      </section>

      {/* Live market state comes immediately after the shallow hero. */}
      <section>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
          <div>
            <h2 className="text-3xl text-accent-blue">Ideas with good energy.</h2>
          </div>
          <div className="flex gap-1 overflow-x-auto" role="tablist" aria-label="Token board sorting">
            {(['newest', 'market_cap', 'volume', 'graduated'] as Tab[]).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                onClick={() => {
                  setTab(t);
                  setLiveTokens([]);
                }}
                className={`tab flex-shrink-0 ${tab === t ? 'tab-active' : ''}`}
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
          desc="Every trade moves a constant-product curve priced in USDC."
        />
        <HowItStep
          num="03"
          title="Bond, then migrate"
          desc="At $30K market cap the curve bonds and migrates to a DEX automatically, seeding permanent liquidity with LP burned."
        />
      </section>

    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: string; helper?: string }) {
  return (
    <div className="card-elevated min-w-0 overflow-hidden !px-2 py-4 text-center sm:!px-5">
      <div className="whitespace-nowrap text-lg font-bold leading-none tabular-nums tracking-tight sm:text-2xl md:text-3xl">
        {value}
      </div>
      <div className="mt-1 text-[9px] font-semibold uppercase tracking-wide text-text-muted sm:text-[11px] sm:tracking-wider">
        {label}
      </div>
      {helper && (
        <div className="mt-0.5 text-[10px] font-mono text-accent-blue opacity-85 sm:text-[11px]">
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
