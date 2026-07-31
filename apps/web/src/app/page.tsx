'use client';

import { useQuery } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, Token, SortOption } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';
import { AgentBadge } from '@/components/AgentBadge';
import { useTokenEvents } from '@/lib/useWebSocket';
import { formatUsdDirect, formatMarketCap, tokenEmoji, ipfsToGateway } from '@/lib/utils';

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
          value={stats ? formatUsdDirect(stats.volume_24h) : '—'}
          helper="Settled in USDC"
        />
        <StatCard
          label="GRADUATED TO DEX"
          value={stats ? String(stats.graduated_tokens) : '—'}
          helper="$30K MC DEX threshold"
        />
      </section>

      {/* AI Agent Tokens */}
      {agentTokensData && agentTokensData.tokens.length > 0 && (
        <section>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-serif font-normal flex items-center gap-2">
              <span className="text-indigo-500">🤖</span>
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
