'use client';

import { useParams, useRouter } from 'next/navigation';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';

import { api, CandleTimeframe } from '@/lib/api';
import { useTokenStats } from '@/hooks/useTokenStats';
import { useCandles } from '@/hooks/useCandles';

import { TokenHeader } from '@/components/trading/TokenHeader';
import { TradingChart } from '@/components/trading/TradingChart';
import { TradeTerminal } from '@/components/trading/TradeTerminal';

import { TradeHistory } from '@/components/TradeHistory';
import { HoldersPanel } from '@/components/HoldersPanel';
import { TokenChat } from '@/components/TokenChat';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ShareButton } from '@/components/ShareButton';
import { SocialLinks } from '@/components/SocialLinks';
import {
  formatUsdc,
  formatTokens,
  formatMarketCap,
  bondingCurveProgress,
  shortenAddress,
  ipfsToGateway,
} from '@/lib/utils';

type TerminalTab = 'trades' | 'holders' | 'info' | 'chat';

export default function TradePage() {
  const params = useParams();
  const address = (params.address as string)?.toLowerCase();
  const queryClient = useQueryClient();

  const [timeframe, setTimeframe] = useState<CandleTimeframe>('5m');
  const [metricMode, setMetricMode] = useState<'price' | 'mcap'>('price');
  const [activeTab, setActiveTab] = useState<TerminalTab>('trades');

  // Load token stats & live trades
  const {
    token,
    trades,
    totalTrades,
    holders,
    totalHolders,
    change24h,
    isLoading: isStatsLoading,
  } = useTokenStats(address);

  // Load OHLCV candles with live websocket updates
  const { candles, isConnected, isLoading: isCandlesLoading } = useCandles(
    address,
    timeframe,
    metricMode
  );

  // Off-chain metadata (banner cover + social links)
  const { data: metadata } = useQuery({
    queryKey: ['token-metadata', address],
    queryFn: () => api.getTokenMetadata(address),
    staleTime: 30_000,
    enabled: !!address,
  });

  // Retry polling for fresh launches indexing
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10;
  const [waitingForIndexer, setWaitingForIndexer] = useState(true);

  useEffect(() => {
    if (token || isStatsLoading) {
      setWaitingForIndexer(false);
      retryCountRef.current = 0;
      return;
    }
    if (retryCountRef.current >= MAX_RETRIES) {
      setWaitingForIndexer(false);
      return;
    }
    setWaitingForIndexer(true);
    const timer = setInterval(() => {
      retryCountRef.current++;
      queryClient.invalidateQueries({ queryKey: ['token', address] });
      if (retryCountRef.current >= MAX_RETRIES) {
        setWaitingForIndexer(false);
        clearInterval(timer);
      }
    }, 3_000);
    return () => clearInterval(timer);
  }, [token, isStatsLoading, address, queryClient]);

  if (isStatsLoading && !token) {
    return <TradingTerminalSkeleton />;
  }

  if (!token && waitingForIndexer) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-3 border-accent-blue border-t-transparent rounded-full animate-spin mb-4" />
        <h1 className="text-2xl font-bold mb-2">Indexing token on Arc…</h1>
        <p className="text-text-secondary mb-4">
          Your token was launched! Setting up live chart and terminal…
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="card text-center py-16 max-w-md mx-auto my-12 space-y-4">
        <div className="inline-block w-10 h-10 border-4 border-accent-peach border-t-accent-sienna rounded-full animate-spin" />
        <div>
          <h1 className="text-2xl font-serif mb-2">Connecting to Arc Blockchain…</h1>
          <p className="text-sm text-text-secondary">
            Fetching live token data directly from the network.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['token', address] })}
            className="btn-primary text-sm px-5 py-2"
          >
            Retry now
          </button>
          <Link href="/explore" className="btn-secondary text-sm px-5 py-2">
            Explore tokens
          </Link>
        </div>
      </div>
    );
  }

  const bannerUri = metadata?.banner || null;

  return (
    <div className="max-w-[1600px] mx-auto space-y-3 pb-20 lg:pb-8">
      {/* Banner cover image if present */}
      {bannerUri && (
        <div className="card overflow-hidden !p-0 max-h-36 sm:max-h-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ipfsToGateway(bannerUri)}
            alt={`${token.name} banner`}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Top Token Header & Hero Price */}
      <TokenHeader
        token={token}
        change24h={change24h}
        totalHolders={totalHolders}
        onSelectInfoTab={() => setActiveTab('info')}
      />

      {/* Main Terminal Section: Chart (~70%) + Buy/Sell (~30%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
        {/* Chart Column */}
        <div className="lg:col-span-8 space-y-3">
          <TradingChart
            candles={candles}
            tokenSymbol={token.symbol}
            timeframe={timeframe}
            isConnected={isConnected}
            onTimeframeChange={setTimeframe}
            metricMode={metricMode}
            onMetricModeChange={setMetricMode}
          />
        </div>

        {/* Trade Terminal Column + Bonding Curve Progress */}
        <div id="trading-terminal-panel" className="lg:col-span-4 space-y-3 scroll-mt-20">
          <TradeTerminal token={token} />

          {/* Dedicated Bonding Curve Progress Card */}
          <div className="card space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-text-primary">Bonding Curve Progress</span>
              <span className="font-bold text-accent-blue tabular-nums">
                {token.status === 'graduated' ? '100% (Graduated)' : `${bondingCurveProgress(token.market_cap).toFixed(1)}%`}
              </span>
            </div>

            <div className="progress-bar h-2.5 rounded-full overflow-hidden">
              <div
                className="progress-fill h-full bg-accent-blue transition-all duration-500"
                style={{ width: `${token.status === 'graduated' ? 100 : bondingCurveProgress(token.market_cap)}%` }}
              />
            </div>

            <div className="flex items-center justify-between text-[11px] text-text-muted tabular-nums">
              <span>{formatMarketCap(token.market_cap)} Current MC</span>
              <span>$30.0K Graduation</span>
            </div>

            {token.status !== 'graduated' && (
              <div className="text-right text-[11px] font-mono text-accent-blue font-medium">
                {formatUsdc(Math.max(0, 30000000000 - Number(token.market_cap || '0')))} until DEX graduation
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Tabs Section: Trades / Holders / Info / Chat */}
      <div className="card space-y-4">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 border-b border-bg-border pb-2 overflow-x-auto text-sm">
          <button
            onClick={() => setActiveTab('trades')}
            className={`tab ${activeTab === 'trades' ? 'tab-active' : ''}`}
          >
            Trades ({totalTrades})
          </button>
          <button
            onClick={() => setActiveTab('holders')}
            className={`tab ${activeTab === 'holders' ? 'tab-active' : ''}`}
          >
            Holders ({totalHolders})
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`tab ${activeTab === 'info' ? 'tab-active' : ''}`}
          >
            Token Info & About
          </button>
          <button
            onClick={() => setActiveTab('chat')}
            className={`tab ${activeTab === 'chat' ? 'tab-active' : ''}`}
          >
            Agent Chat
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'trades' && (
          <TradeHistory initialTrades={trades} tokenAddress={address} />
        )}

        {activeTab === 'holders' && (
          <HoldersPanel tokenAddress={address} currentPrice={Number(token.price)} />
        )}

        {activeTab === 'info' && (
          <div className="grid md:grid-cols-2 gap-6 pt-2">
            <div className="space-y-3">
              <h3 className="font-semibold text-base">Token Details</h3>
              <div className="space-y-2 text-sm">
                <InfoRow label="Contract Address" value={shortenAddress(token.contract_address)} copyValue={token.contract_address} />
                <InfoRow label="Bonding Curve" value={shortenAddress(token.curve_address)} copyValue={token.curve_address} />
                {token.amm_pair_address && (
                  <InfoRow label="AMM Pair (DEX)" value={shortenAddress(token.amm_pair_address)} copyValue={token.amm_pair_address} />
                )}
                <InfoRow label="USDC in Curve" value={formatUsdc(token.real_usdc)} />
                <InfoRow label="Tokens Sold" value={formatTokens(token.tokens_sold)} />
                <InfoRow label="Creator Fees Accrued" value={formatUsdc(token.creator_fees_accrued)} />
                <InfoRow label="Protocol Fees Accrued" value={formatUsdc(token.protocol_fees_accrued)} />
                {token.lp_burned && (
                  <InfoRow label="LP Burned" value={`${formatTokens(token.lp_burned)} LP`} />
                )}
              </div>
            </div>

            <div className="space-y-4">
              {token.description && (
                <div>
                  <h3 className="font-semibold text-base mb-2">About {token.name}</h3>
                  <p className="text-sm text-text-secondary leading-relaxed">{token.description}</p>
                </div>
              )}

              <SocialLinks tokenAddress={address} creatorWallet={token.creator_wallet} />
            </div>
          </div>
        )}

        {activeTab === 'chat' && (
          <TokenChat tokenAddress={address} />
        )}
      </div>

      {/* Sticky Mobile Trade Action Bar */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-bg-base/95 backdrop-blur-md border-t border-bg-border p-3 flex gap-2.5 shadow-subtle-3">
        <button
          onClick={() => {
            const tradePanel = document.getElementById('trading-terminal-panel');
            tradePanel?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="btn-buy flex-1 py-3 text-sm font-bold shadow-sm rounded-lg"
        >
          Buy ${token.symbol}
        </button>
        <button
          onClick={() => {
            const tradePanel = document.getElementById('trading-terminal-panel');
            tradePanel?.scrollIntoView({ behavior: 'smooth' });
          }}
          className="btn-sell flex-1 py-3 text-sm font-bold shadow-sm rounded-lg"
        >
          Sell ${token.symbol}
        </button>
      </div>
    </div>
  );
}

function InfoRow({ label, value, copyValue }: { label: string; value: string; copyValue?: string }) {
  return (
    <div className="flex justify-between items-center">
      <span className="text-text-muted">{label}</span>
      <div className="flex items-center gap-1.5 font-medium tabular-nums">
        <span>{value}</span>
        {copyValue && (
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyValue);
            }}
            className="text-text-muted hover:text-text-primary text-xs"
            title="Copy address"
          >
            📋
          </button>
        )}
      </div>
    </div>
  );
}

function TradingTerminalSkeleton() {
  return (
    <div className="max-w-[1600px] mx-auto space-y-3 animate-pulse">
      <div className="card h-14 bg-bg-card" />
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-8 card h-[520px] bg-bg-card" />
        <div className="lg:col-span-4 card h-[520px] bg-bg-card" />
      </div>
      <div className="card h-64 bg-bg-card" />
    </div>
  );
}
