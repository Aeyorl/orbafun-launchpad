'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { api, Token, Trade } from '@/lib/api';
import { TradePanel } from '@/components/TradePanel';
import { PriceChart } from '@/components/PriceChart';
import { TradeHistory } from '@/components/TradeHistory';
import { HoldersPanel } from '@/components/HoldersPanel';
import { TokenChat } from '@/components/TokenChat';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ShareButton } from '@/components/ShareButton';
import { SocialLinks } from '@/components/SocialLinks';
import { useTokenEvents } from '@/lib/useWebSocket';
import toast from 'react-hot-toast';
import {
  formatUsdc,
  formatUsdDirect,
  formatMarketCap,
  formatPrice,
  formatTokens,
  shortenAddress,
  bondingCurveProgress,
  tokenEmoji,
  timeAgo,
  ipfsToGateway,
} from '@/lib/utils';

export default function CoinPage() {
  const params = useParams();
  const address = params.address as string;
  const queryClient = useQueryClient();

  // Track whether we should keep retrying when the token isn't found yet.
  // After a fresh launch the indexer needs 5-10s to pick up the event.
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10; // 10 × 3s = 30s max wait

  const { data: token, isLoading } = useQuery({
    queryKey: ['token', address],
    queryFn: async () => {
      const res = await api.getToken(address);
      if (!res) throw new Error(`Token ${address} not found yet`);
      return res;
    },
    placeholderData: (previousData) => previousData,
    refetchInterval: 15_000, // fallback refetch
    retry: (failureCount) => failureCount < MAX_RETRIES,
    retryDelay: 3_000,
  });

  // If the token is still not found, auto-refetch every 3s up to 30s
  // (covers the indexer lag window after a fresh launch).
  const [waitingForIndexer, setWaitingForIndexer] = useState(true);
  useEffect(() => {
    if (token || isLoading) {
      setWaitingForIndexer(false);
      retryCountRef.current = 0;
      return;
    }
    // token is null and we're not loading — start polling
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
  }, [token, isLoading, address, queryClient]);

  const { data: tradesData } = useQuery({
    queryKey: ['tokenTrades', address],
    queryFn: () => api.getTokenTrades(address, { limit: 500, order: 'desc' }),
    refetchInterval: 5_000, // faster refetch so chart updates quickly after trades
    enabled: !!token, // only fetch trades once the token is indexed
  });

  // Off-chain metadata (banner cover + social links). Deduped with the
  // SocialLinks component via the shared query key.
  const { data: metadata } = useQuery({
    queryKey: ['token-metadata', address],
    queryFn: () => api.getTokenMetadata(address),
    staleTime: 30_000,
  });
  const bannerUri = metadata?.banner || null;

  // WebSocket: update token + trades in real time
  const handleEvent = useCallback(
    (event: any) => {
      if (event.type === 'NEW_BUY' || event.type === 'NEW_SELL') {
        // Invalidate trades and holders query to refetch, but preserve token page
        queryClient.invalidateQueries({ queryKey: ['tokenTrades', address] });
        queryClient.invalidateQueries({ queryKey: ['tokenHolders', address] });
      }
      if (event.type === 'TOKEN_GRADUATED') {
        queryClient.invalidateQueries({ queryKey: ['token', address] });
      }
    },
    [address, queryClient]
  );

  useTokenEvents(address, handleEvent);

  if (isLoading) {
    return <CoinPageSkeleton />;
  }

  if (!token && waitingForIndexer) {
    return (
      <div className="text-center py-16">
        <div className="inline-block w-8 h-8 border-3 border-accent-green border-t-transparent rounded-full animate-spin mb-4" />
        <h1 className="text-2xl font-bold mb-2">Indexing your token…</h1>
        <p className="text-text-secondary mb-4">
          Your token was launched successfully! It should appear here in a few seconds.
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="card text-center py-16 max-w-md mx-auto my-12 space-y-4">
        <div className="inline-block w-10 h-10 border-4 border-accent-peach border-t-accent-sienna rounded-full animate-spin" />
        <div>
          <h1 className="text-2xl font-serif font-normal mb-2">Connecting to Arc Blockchain…</h1>
          <p className="text-sm text-text-secondary">
            Fetching live token data directly from the network. This takes just a moment.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <button onClick={() => queryClient.invalidateQueries({ queryKey: ['token', address] })} className="btn-primary text-sm px-5 py-2">
            Retry now
          </button>
          <Link href="/explore" className="btn-secondary text-sm px-5 py-2">
            Explore tokens
          </Link>
        </div>
      </div>
    );
  }

  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';
  const trades = tradesData?.trades || [];

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Banner cover image (off-chain, from token_metadata) */}
      {bannerUri && (
        <div className="card overflow-hidden !p-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={ipfsToGateway(bannerUri)}
            alt={`${token.name} banner`}
            className="w-full h-40 sm:h-52 object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
        </div>
      )}

      {/* Token header */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-bg-input flex items-center justify-center text-2xl">
              {token.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ipfsToGateway(token.image)}
                  alt={token.symbol}
                  className="w-full h-full rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                tokenEmoji(token.symbol)
              )}
            </div>
            <div>
              <h1 className="text-2xl font-bold flex items-center gap-2 flex-wrap">
                {token.name}
                <span className="text-text-muted text-lg">${token.symbol}</span>
                {isGraduated ? (
                  <span className="badge-purple">Graduated</span>
                ) : (
                  <span className="badge-green">Active</span>
                )}
                <FavoriteButton tokenAddress={token.contract_address} />
                <ShareButton tokenName={token.name} tokenSymbol={token.symbol} />
              </h1>
              <div className="text-sm text-text-muted flex items-center gap-2 mt-1">
                <span>by</span>
                <Link
                  href={`/profile/${token.creator_wallet}`}
                  className="text-accent-blue hover:underline"
                >
                  {shortenAddress(token.creator_wallet)}
                </Link>
                <span>·</span>
                <span>{timeAgo(token.created_at)}</span>
              </div>
              {/* Contract address — prominently visible with copy + ArcScan link */}
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs text-text-muted font-medium">CA:</span>
                <a
                  href={`https://testnet.arcscan.app/address/${token.contract_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-mono text-accent-blue hover:underline truncate max-w-[200px] sm:max-w-none"
                  title={token.contract_address}
                >
                  {token.contract_address}
                </a>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(token.contract_address);
                    toast.success('Contract address copied!', { id: 'copy-ca', duration: 1500 });
                  }}
                  className="flex-shrink-0 p-1 rounded hover:bg-bg-hover transition-colors text-text-muted hover:text-text-primary"
                  title="Copy contract address"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {/* Key stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-text-muted text-xs">Market Cap</div>
              <div className="font-bold text-lg tabular-nums">
                {formatMarketCap(token.market_cap)}
              </div>
            </div>
            <div>
              <div className="text-text-muted text-xs">Price</div>
              <div className="font-bold text-lg tabular-nums">
                {formatPrice(token.price)}
              </div>
            </div>
            <div>
              <div className="text-text-muted text-xs">Volume 24h</div>
              <div className="font-bold text-lg tabular-nums">
                {formatUsdDirect(token.volume_24h)}
              </div>
            </div>
          </div>
        </div>

        {/* Bonding curve progress */}
        <div className="mt-4">
          <div className="flex justify-between text-xs mb-1">
            <span className="text-text-muted">
              {isGraduated ? 'Migrated to DEX' : 'Bonding curve progress'}
            </span>
            <span className="font-semibold tabular-nums">
              {isGraduated ? '100%' : `${progress.toFixed(1)}%`}
              {!isGraduated && ` · $${(30000 - Number(token.market_cap)).toFixed(0)} to graduation`}
            </span>
          </div>
          <div className="progress-bar h-3">
            <div
              className={`progress-fill ${isGraduated ? 'from-accent-purple to-accent-blue' : ''}`}
              style={{ width: `${isGraduated ? 100 : progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Main grid: chart + trade panel */}
      <div className="grid lg:grid-cols-3 gap-4">
        {/* Left: chart + trade history + chat */}
        <div className="lg:col-span-2 space-y-4">
          <PriceChart trades={trades} currentMarketCap={Number(token.market_cap)} />
          <TradeHistory initialTrades={trades} tokenAddress={address} />
          <HoldersPanel tokenAddress={address} currentPrice={Number(token.price)} />
          <TokenChat tokenAddress={address} />
        </div>

        {/* Right: trade panel + token info */}
        <div className="space-y-4">
          <TradePanel token={token} />

          {/* Token info */}
          <div className="card">
            <h3 className="font-semibold mb-3">Token Info</h3>
            <div className="space-y-2 text-sm">
              <InfoRow label="Contract" value={shortenAddress(token.contract_address)} />
              <InfoRow label="Curve" value={shortenAddress(token.curve_address)} />
              {token.amm_pair_address && (
                <InfoRow label="AMM Pair" value={shortenAddress(token.amm_pair_address)} />
              )}
              <InfoRow
                label="USDC in curve"
                value={formatUsdc(token.real_usdc)}
              />
              <InfoRow
                label="Tokens sold"
                value={formatTokens(token.tokens_sold)}
              />
              <InfoRow
                label="Creator fees"
                value={formatUsdc(token.creator_fees_accrued)}
              />
              <InfoRow
                label="Protocol fees"
                value={formatUsdc(token.protocol_fees_accrued)}
              />
              {token.lp_burned && (
                <InfoRow
                  label="LP burned"
                  value={`${formatTokens(token.lp_burned)} LP`}
                />
              )}
            </div>
          </div>

          {/* Description */}
          {token.description && (
            <div className="card">
              <h3 className="font-semibold mb-2">About</h3>
              <p className="text-sm text-text-secondary">{token.description}</p>
            </div>
          )}

          {/* Social links (off-chain, creator-editable) */}
          <SocialLinks tokenAddress={address} creatorWallet={token.creator_wallet} />
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-text-muted">{label}</span>
      <span className="font-medium tabular-nums">{value}</span>
    </div>
  );
}

/**
 * CoinPageSkeleton — structured loading state matching the real layout.
 * Shows the header, chart, trade panel, and info card shapes with pulse.
 */
function CoinPageSkeleton() {
  return (
    <div className="max-w-6xl mx-auto space-y-4 animate-pulse">
      {/* Header skeleton */}
      <div className="card">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-bg-input" />
            <div className="space-y-2">
              <div className="h-6 w-40 bg-bg-input rounded" />
              <div className="h-3 w-32 bg-bg-input rounded" />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-1">
                <div className="h-3 w-16 bg-bg-input rounded" />
                <div className="h-5 w-20 bg-bg-input rounded" />
              </div>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <div className="h-3 w-full bg-bg-input rounded-full" />
        </div>
      </div>

      {/* Main grid skeleton */}
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <div className="card h-72 bg-bg-card" />
          <div className="card h-64 bg-bg-card" />
        </div>
        <div className="space-y-4">
          <div className="card h-80 bg-bg-card" />
          <div className="card h-48 bg-bg-card" />
        </div>
      </div>
    </div>
  );
}
