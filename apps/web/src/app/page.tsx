'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Token, SortOption } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';
import { AgentBadge } from '@/components/AgentBadge';
import { LiveActivityRail } from '@/components/LiveActivityRail';
import { useTokenEvents } from '@/lib/useWebSocket';
import { formatUsdDirect, formatMarketCap, tokenEmoji, ipfsToGateway } from '@/lib/utils';
import { ArrowRight, ArrowUpRight, Robot, Sparkle, UsersThree } from '@phosphor-icons/react';

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

  // Fetch recently agent-launched tokens for the AI section
  const { data: agentTokensData } = useQuery({
    queryKey: ['agent-tokens-homepage'],
    queryFn: () => api.listTokens({ is_agent: 'true', sort: 'newest', limit: 4 }),
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
      <section className="grid min-h-[680px] gap-10 border-b border-bg-border py-12 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-20 animate-fade-in">
        <div>
          <div className="mb-6 flex items-center gap-2 text-[11px] font-extrabold tracking-[0.14em] text-accent-green">
            <Sparkle size={17} weight="fill" />
            <span>A BRIGHTER KIND OF LAUNCHPAD</span>
          </div>
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
        <div className="relative min-h-[500px] rotate-[1deg] overflow-hidden rounded-3xl border border-text-primary bg-accent-peach p-6 shadow-[14px_14px_0_rgb(var(--color-accent-blue))]">
          <div className="flex items-center justify-between font-mono text-[9px] font-bold tracking-[0.14em] text-accent-sienna"><span>TODAY&apos;S SUNNY ONE</span><span>68% GROWN</span></div>
          <div className="absolute left-1/2 top-[43%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-primary bg-accent-green shadow-[10px_10px_0_rgba(23,33,60,.18)]" />
          <div className="absolute left-1/2 top-[43%] grid h-44 w-44 -translate-x-1/2 -translate-y-1/2 place-content-center text-6xl">☀</div>
          <svg viewBox="0 0 620 380" className="absolute inset-x-[5%] bottom-[7%] h-[76%] w-[90%]" fill="none" aria-hidden="true">
            <path d="M18 340 C175 336 226 304 294 228 C369 145 452 92 602 28" stroke="rgb(var(--color-accent-blue))" strokeWidth="4" />
          </svg>
          <span className="absolute left-[8%] top-[25%] -rotate-3 rounded-md border border-text-primary bg-[#9fe2c2] px-3 py-2 font-mono text-[9px] font-bold text-[#17213c] shadow-[4px_4px_0_#17213c]">184 BELIEVERS</span>
          <span className="absolute bottom-[20%] right-[8%] rotate-3 rounded-md border border-text-primary bg-accent-blue px-3 py-2 font-mono text-[9px] font-bold text-white shadow-[4px_4px_0_#17213c]">+38% TODAY</span>
          <div className="absolute inset-x-6 bottom-5 flex items-center justify-between rounded-xl border border-text-primary bg-bg-card px-5 py-4 text-text-primary">
            <div><strong className="block font-serif text-2xl font-normal text-accent-blue">Sundae Club</strong><span className="font-mono text-[9px] text-text-muted">$SUN · ARC</span></div>
            <span className="flex items-center gap-2 text-sm font-bold">Meet the community <UsersThree size={19} /></span>
          </div>
        </div>
      </section>

      {/* Compact platform pulse. */}
      <section className="grid grid-cols-3 gap-2 sm:gap-3">
        <StatCard
          label="TOKENS"
          value={stats ? String(stats.total_tokens) : '—'}
          helper="Launched"
        />
        <StatCard
          label="24H VOLUME"
          value={stats ? formatUsdDirect(stats.volume_24h) : '—'}
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
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-accent-green">Fresh from the bazaar</p>
            <h2 className="text-3xl text-accent-blue">Ideas with good energy.</h2>
            <p className="text-xs text-text-muted mt-1">Live launches finding their people on Arc</p>
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

      <LiveActivityRail />

      {/* AI Agent Tokens */}
      {agentTokensData && agentTokensData.tokens.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif font-normal flex items-center gap-2">
              <Robot size={20} weight="fill" className="text-indigo-500" aria-hidden="true" />
              <span>AI Agent Tokens</span>
              <span className="text-xs font-mono text-indigo-500/60 font-semibold tracking-wider">LIVE</span>
            </h2>
            <Link
              href="/explore?is_agent=true"
              className="text-xs font-medium text-text-muted hover:text-indigo-500 transition-colors"
            >
              View all agent tokens →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {agentTokensData.tokens.map((token) => (
              <Link
                key={token.contract_address}
                href={`/trade/${token.contract_address}`}
                className="card bg-gradient-to-br from-bg-card to-bg-input border border-indigo-500/10 hover:border-indigo-500/30 p-4 rounded-2xl shadow-subtle-1 hover:shadow-subtle-2 transition-all space-y-2.5 group"
              >
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center text-lg overflow-hidden flex-shrink-0 shadow-xs">
                    {token.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={ipfsToGateway(token.image)} alt={token.symbol} className="w-full h-full object-cover" />
                    ) : (
                      tokenEmoji(token.symbol)
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-sm text-text-primary group-hover:text-accent-blue transition-colors truncate">
                        {token.name}
                      </span>
                      <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} linkToAgent={false} />
                    </div>
                    <span className="text-[11px] font-mono text-text-muted">${token.symbol}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-bg-base/60 p-2 rounded-lg border border-bg-border/60">
                  <div>
                    <div className="text-[10px] text-text-muted">Market Cap</div>
                    <div className="font-bold text-text-primary tabular-nums">{formatMarketCap(token.market_cap)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-text-muted">24h Vol</div>
                    <div className="font-bold text-accent-blue tabular-nums">{formatUsdDirect(token.volume_24h)}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

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
