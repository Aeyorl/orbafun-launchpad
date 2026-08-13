'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy } from '@phosphor-icons/react';

import { HoldersPanel } from '@/components/HoldersPanel';
import { SocialLinks } from '@/components/SocialLinks';
import { TokenChat } from '@/components/TokenChat';
import { TradeHistory } from '@/components/TradeHistory';
import { AdvancedTradingChart } from '@/components/trading/AdvancedTradingChart';
import { TokenHeader } from '@/components/trading/TokenHeader';
import { TradeTerminal } from '@/components/trading/TradeTerminal';
import { useCandles } from '@/hooks/useCandles';
import { useTokenStats } from '@/hooks/useTokenStats';
import { api, CandleTimeframe, Trade } from '@/lib/api';
import { ARC_EXPLORER_URL } from '@/lib/config';
import {
  formatTokens,
  formatUsdc,
  shortenAddress,
} from '@/lib/utils';

type ObservatoryTab = 'activity' | 'holders' | 'traders' | 'chat' | 'details';

export default function TradePage() {
  const params = useParams();
  const address = (params.address as string)?.toLowerCase();
  const queryClient = useQueryClient();

  const [timeframe, setTimeframe] = useState<CandleTimeframe>('5m');
  const [metricMode, setMetricMode] = useState<'price' | 'mcap'>('price');
  const [activeTab, setActiveTab] = useState<ObservatoryTab>('activity');
  const timeframeChosenRef = useRef(false);

  const {
    token,
    trades,
    totalTrades,
    totalHolders,
    change24h,
    isLoading: isStatsLoading,
  } = useTokenStats(address);

  const { candles, isConnected, connectionStatus } = useCandles(address, timeframe, metricMode);

  const { data: metadata } = useQuery({
    queryKey: ['token-metadata', address],
    queryFn: () => api.getTokenMetadata(address),
    staleTime: 30_000,
    enabled: Boolean(address),
  });

  const retryCountRef = useRef(0);
  const [waitingForIndexer, setWaitingForIndexer] = useState(true);

  useEffect(() => {
    if (token || isStatsLoading) {
      setWaitingForIndexer(false);
      retryCountRef.current = 0;
      return;
    }
    if (retryCountRef.current >= 10) {
      setWaitingForIndexer(false);
      return;
    }

    setWaitingForIndexer(true);
    const timer = window.setInterval(() => {
      retryCountRef.current += 1;
      queryClient.invalidateQueries({ queryKey: ['token', address] });
      if (retryCountRef.current >= 10) {
        setWaitingForIndexer(false);
        window.clearInterval(timer);
      }
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [token, isStatsLoading, address, queryClient]);

  useEffect(() => {
    if (timeframeChosenRef.current || trades.length === 0) return;
    setTimeframe(initialTimeframeFromTrade(trades[0].timestamp));
    timeframeChosenRef.current = true;
  }, [trades]);

  const changeTimeframe = (next: CandleTimeframe) => {
    timeframeChosenRef.current = true;
    setTimeframe(next);
  };

  if (isStatsLoading && !token) return <TradingTerminalSkeleton />;

  if (!token && waitingForIndexer) {
    return (
      <div className="mx-auto max-w-md py-20 text-center">
        <div className="mx-auto mb-4 h-8 w-8 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
        <h1 className="text-2xl">Indexing token on Arc…</h1>
        <p className="mt-2 text-sm text-text-secondary">Setting up the live chart and trading workspace.</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="card mx-auto my-12 max-w-md space-y-4 py-12 text-center">
        <h1 className="text-2xl">Couldn’t load this token</h1>
        <p className="text-sm text-text-secondary">The indexer may still be catching up, or this address is not an Orba token.</p>
        <div className="flex justify-center gap-3">
          <button type="button" onClick={() => queryClient.invalidateQueries({ queryKey: ['token', address] })} className="btn-primary text-sm">
            Retry
          </button>
          <Link href="/explore" className="btn-secondary text-sm">Explore tokens</Link>
        </div>
      </div>
    );
  }

  const about = metadata?.description || token.description;

  return (
    <div className="observatory-page mx-auto max-w-[1480px] space-y-3 pb-24 lg:pb-10">
      <TokenHeader
        token={token}
        change24h={change24h}
        totalHolders={totalHolders}
        onSelectInfoTab={() => setActiveTab('details')}
      />

      <section className="overflow-hidden rounded-xl border border-bg-border bg-bg-card shadow-subtle">
        <div className="grid min-w-0 lg:h-[500px] lg:grid-cols-[minmax(0,7fr)_minmax(340px,3fr)]">
          <div className="min-w-0 border-b border-bg-border lg:border-b-0 lg:border-r">
            <AdvancedTradingChart
              candles={candles}
              tokenAddress={address}
              tokenName={token.name}
              tokenSymbol={token.symbol}
              timeframe={timeframe}
              isConnected={isConnected}
              connectionStatus={connectionStatus}
              onTimeframeChange={changeTimeframe}
              metricMode={metricMode}
              onMetricModeChange={setMetricMode}
            />
          </div>
          <div id="trading-terminal-panel" className="min-w-0 scroll-mt-20">
            <TradeTerminal token={token} />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-xl border border-bg-border bg-bg-card shadow-subtle">
        <div className="grid lg:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.72fr)]">
          <AboutPanel tokenName={token.name} description={about} />

          <div className="min-w-0 border-t border-bg-border lg:border-l lg:border-t-0">
            <div className="flex items-center gap-1 overflow-x-auto border-b border-bg-border px-3 pt-1">
              <TabButton active={activeTab === 'activity'} onClick={() => setActiveTab('activity')} label={`Activity (${totalTrades})`} />
              <TabButton active={activeTab === 'holders'} onClick={() => setActiveTab('holders')} label={`Holders (${totalHolders})`} />
              <TabButton active={activeTab === 'traders'} onClick={() => setActiveTab('traders')} label="Top traders" />
              <TabButton active={activeTab === 'chat'} onClick={() => setActiveTab('chat')} label="Agent chat" />
              <TabButton active={activeTab === 'details'} onClick={() => setActiveTab('details')} label="Details" />
            </div>

            <div className="min-h-[260px] p-3 sm:p-4">
              {activeTab === 'activity' && <TradeHistory initialTrades={trades} tokenAddress={address} embedded />}
              {activeTab === 'holders' && <HoldersPanel tokenAddress={address} currentPrice={Number(token.price)} />}
              {activeTab === 'traders' && <TopTraders trades={trades} />}
              {activeTab === 'chat' && <TokenChat tokenAddress={address} />}
              {activeTab === 'details' && (
                <div className="grid gap-5 md:grid-cols-2">
                  <div className="space-y-2 text-sm">
                    <DetailRow label="Token contract" value={shortenAddress(token.contract_address)} copyValue={token.contract_address} />
                    <DetailRow label="Bonding curve" value={shortenAddress(token.curve_address)} copyValue={token.curve_address} />
                    {token.amm_pair_address && <DetailRow label="AMM pair" value={shortenAddress(token.amm_pair_address)} copyValue={token.amm_pair_address} />}
                    <DetailRow label="USDC in curve" value={formatUsdc(token.real_usdc)} />
                    <DetailRow label="Tokens sold" value={formatTokens(token.tokens_sold)} />
                  </div>
                  <SocialLinks tokenAddress={address} creatorWallet={token.creator_wallet} />
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-t border-bg-border bg-bg-base/95 p-3 shadow-subtle-3 backdrop-blur-md lg:hidden">
        <button type="button" onClick={() => document.getElementById('trading-terminal-panel')?.scrollIntoView({ behavior: 'smooth' })} className="btn-buy flex-1 py-3 text-sm font-bold">
          Buy ${token.symbol}
        </button>
        <button type="button" onClick={() => document.getElementById('trading-terminal-panel')?.scrollIntoView({ behavior: 'smooth' })} className="btn-sell flex-1 py-3 text-sm font-bold">
          Sell ${token.symbol}
        </button>
      </div>
    </div>
  );
}

function initialTimeframeFromTrade(timestamp: string): CandleTimeframe {
  const ageMs = Math.max(0, Date.now() - new Date(timestamp).getTime());
  if (ageMs <= 12 * 60 * 60_000) return '5m';
  if (ageMs <= 3 * 24 * 60 * 60_000) return '15m';
  if (ageMs <= 14 * 24 * 60 * 60_000) return '1h';
  if (ageMs <= 60 * 24 * 60 * 60_000) return '4h';
  return '1d';
}

function AboutPanel({
  tokenName,
  description,
}: {
  tokenName: string;
  description: string | null | undefined;
}) {
  return (
    <aside className="p-5 sm:p-6">
      <h2 className="font-sans text-lg font-bold tracking-tight">About {tokenName}</h2>
      <p className="mt-4 max-w-xl text-sm leading-6 text-text-secondary">
        {description || 'The creator has not added a description yet.'}
      </p>
    </aside>
  );
}

function TabButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex-none px-3 py-3 text-xs font-semibold transition-colors ${active ? 'text-accent-blue' : 'text-text-secondary hover:text-text-primary'}`}
    >
      {label}
      {active && <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-accent-blue" />}
    </button>
  );
}

function TopTraders({ trades }: { trades: Trade[] }) {
  const rows = Object.values(trades.reduce<Record<string, { wallet: string; volume: number; trades: number }>>((acc, trade) => {
    const key = trade.wallet.toLowerCase();
    const row = acc[key] || { wallet: trade.wallet, volume: 0, trades: 0 };
    row.volume += Number(trade.usdc_amount);
    row.trades += 1;
    acc[key] = row;
    return acc;
  }, {})).sort((a, b) => b.volume - a.volume).slice(0, 8);

  if (rows.length === 0) return <EmptyPanel message="No trader activity yet" />;

  return (
    <div className="divide-y divide-bg-border">
      {rows.map((row, index) => (
        <div key={row.wallet} className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3 text-sm">
          <span className="font-mono text-xs text-text-muted">{String(index + 1).padStart(2, '0')}</span>
          <Link href={`/profile/${row.wallet}`} className="truncate font-mono text-text-primary hover:text-accent-blue">{shortenAddress(row.wallet)}</Link>
          <div className="text-right">
            <div className="font-mono font-semibold text-text-primary">{formatUsdc(row.volume)}</div>
            <div className="text-[11px] text-text-muted">{row.trades} trades</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function DetailRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-bg-border py-2.5 last:border-0">
      <span className="text-text-muted">{label}</span>
      <span className="flex items-center gap-1.5 font-mono font-medium text-text-primary">
        {value}
        {copyValue && <button type="button" onClick={() => navigator.clipboard.writeText(copyValue)} className="text-text-muted hover:text-accent-blue"><Copy size={13} /></button>}
      </span>
    </div>
  );
}

function EmptyPanel({ message }: { message: string }) {
  return <div className="grid min-h-52 place-items-center text-sm text-text-muted">{message}</div>;
}

function TradingTerminalSkeleton() {
  return (
    <div className="mx-auto max-w-[1480px] animate-pulse space-y-3">
      <div className="h-56 rounded-xl border border-bg-border bg-bg-card" />
      <div className="h-[690px] rounded-xl border border-bg-border bg-bg-card" />
      <div className="h-72 rounded-xl border border-bg-border bg-bg-card" />
    </div>
  );
}
