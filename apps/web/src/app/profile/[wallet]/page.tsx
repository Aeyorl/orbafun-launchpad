'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api, UserHolding } from '@/lib/api';
import { TokenCard } from '@/components/TokenCard';
import { ReferralPanel } from '@/components/ReferralPanel';
import {
  formatUsdc,
  shortenAddress,
  formatTokens,
  formatMarketCap,
  bondingCurveProgress,
  ipfsToGateway,
  tokenEmoji,
} from '@/lib/utils';

type PnlPeriod = '7d' | '30d' | 'all';

export default function ProfilePage() {
  const params = useParams();
  const wallet = params.wallet as string;
  const [pnlPeriod, setPnlPeriod] = useState<PnlPeriod>('all');

  const { data: profile, isLoading } = useQuery({
    queryKey: ['user', wallet],
    queryFn: () => api.getUserProfile(wallet),
    enabled: !!wallet,
  });

  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ['user-pnl', wallet, pnlPeriod],
    queryFn: () => api.getUserPnl(wallet, pnlPeriod),
    enabled: !!wallet,
    staleTime: 30_000,
  });

  const { data: holdingsData, isLoading: holdingsLoading } = useQuery({
    queryKey: ['user-holdings', wallet],
    queryFn: () => api.getUserHoldings(wallet),
    enabled: !!wallet,
    staleTime: 15_000,
  });

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="card animate-pulse h-32" />
        <div className="card animate-pulse h-64" />
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="text-center py-12">
        <h1 className="text-2xl font-bold mb-2">User not found</h1>
        <p className="text-text-secondary mb-4">
          This wallet hasn&apos;t launched any tokens or made any trades.
        </p>
        <Link href="/explore" className="btn-secondary">
          ← Back to Explore
        </Link>
      </div>
    );
  }

  // Parse PnL values (stored as micro-USDC strings)
  const pnlValue = pnlData ? Number(pnlData.realized_pnl) : 0;
  const isPositivePnl = pnlValue >= 0;
  const totalBought = pnlData ? Number(pnlData.total_bought) : 0;
  const totalSold = pnlData ? Number(pnlData.total_sold) : 0;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Profile header */}
      <div className="card">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-accent-green to-accent-blue flex items-center justify-center text-2xl font-bold">
            {shortenAddress(profile.wallet).slice(0, 2)}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{shortenAddress(profile.wallet)}</h1>
            <p className="text-sm text-text-muted">
              Joined {new Date(profile.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4">
          <Stat label="Tokens launched" value={String(profile.tokens_launched)} />
          <Stat label="Total trades" value={String(profile.trade_stats.total_trades)} />
          <Stat
            label="Buys"
            value={String(profile.trade_stats.total_buys)}
            color="green"
          />
          <Stat
            label="Sells"
            value={String(profile.trade_stats.total_sells)}
            color="red"
          />
        </div>
        <div className="mt-2">
          <Stat
            label="Total volume"
            value={formatUsdc(profile.total_volume_usdc)}
            full
          />
        </div>
      </div>

      {/* PnL Card */}
      <div className="card">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h2 className="text-base font-bold">Profit & Loss</h2>
          <div className="flex items-center gap-1" role="tablist" aria-label="PnL period">
            {(['7d', '30d', 'all'] as PnlPeriod[]).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={pnlPeriod === p}
                onClick={() => setPnlPeriod(p)}
                className={`px-2.5 py-0.5 text-xs font-medium rounded-full transition-colors ${
                  pnlPeriod === p
                    ? 'bg-accent-blue text-white'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {pnlLoading ? (
          <div className="h-24 animate-pulse bg-bg-input rounded-lg" />
        ) : (
          <div className="space-y-3">
            {/* Realized PnL summary header */}
            <div className="flex items-baseline justify-between pt-1">
              <span className="text-xs text-text-muted font-medium">
                Realized PnL ({pnlPeriod === 'all' ? 'All Time' : pnlPeriod.toUpperCase()})
              </span>
              <span
                className={`text-2xl font-bold tabular-nums tracking-tight ${
                  pnlValue === 0
                    ? 'text-text-primary'
                    : isPositivePnl
                    ? 'text-accent-green'
                    : 'text-accent-red'
                }`}
              >
                {isPositivePnl && pnlValue > 0 ? '+' : ''}
                {formatUsdc(pnlValue)}
              </span>
            </div>

            {/* Unified Compact Trading Flow Component (Buy / Sell summary) */}
            <div className="grid grid-cols-2 rounded-lg border border-bg-border bg-bg-base overflow-hidden relative">
              {/* BUY Side */}
              <div className="p-3 bg-red-500/[0.03] dark:bg-red-500/[0.04] space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[11px] font-semibold tracking-wider text-red-600 dark:text-red-400 flex items-center gap-1 uppercase">
                    Buy
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <polyline points="19 12 12 19 5 12" />
                    </svg>
                  </span>
                  <span className="text-[11px] text-text-muted tabular-nums">
                    {pnlData?.buy_count ?? 0} {pnlData?.buy_count === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
                <div className="text-lg font-bold tabular-nums text-text-primary">
                  {formatUsdc(totalBought)}
                </div>
              </div>

              {/* Subtle Vertical Divider */}
              <div className="absolute left-1/2 top-2 bottom-2 w-px bg-bg-border -translate-x-1/2 pointer-events-none" />

              {/* SELL Side */}
              <div className="p-3 bg-green-500/[0.03] dark:bg-green-500/[0.04] space-y-1">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <span className="text-[11px] font-semibold tracking-wider text-green-600 dark:text-green-400 flex items-center gap-1 uppercase">
                    Sell
                    <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-green-500">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  </span>
                  <span className="text-[11px] text-text-muted tabular-nums">
                    {pnlData?.sell_count ?? 0} {pnlData?.sell_count === 1 ? 'trade' : 'trades'}
                  </span>
                </div>
                <div className="text-lg font-bold tabular-nums text-text-primary">
                  {formatUsdc(totalSold)}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio / Coins Holding section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">Coins Holding</h2>
            {holdingsData && holdingsData.holdings.length > 0 && (
              <span className="bg-text-primary/10 text-text-primary text-xs font-semibold px-2.5 py-0.5 rounded-full">
                {holdingsData.holdings.length}
              </span>
            )}
          </div>
          {holdingsData && Number(holdingsData.total_value_usdc) > 0 && (
            <div className="text-right">
              <span className="text-xs text-text-muted">Total Value: </span>
              <span className="font-bold text-base text-accent-green tabular-nums">
                {formatUsdc(holdingsData.total_value_usdc)}
              </span>
            </div>
          )}
        </div>

        {holdingsLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[1, 2].map((i) => (
              <div key={i} className="card animate-pulse h-36" />
            ))}
          </div>
        ) : holdingsData && holdingsData.holdings.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {holdingsData.holdings.map((holding) => (
              <HoldingCard key={holding.token.contract_address} holding={holding} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-8 text-text-muted">
            <p>No coins held in portfolio currently.</p>
            <Link href="/explore" className="btn-secondary mt-3 inline-block">
              Explore Tokens →
            </Link>
          </div>
        )}
      </div>

      {/* Launched tokens */}
      <div>
        <h2 className="text-xl font-bold mb-4">Launched Tokens</h2>
        {profile.launched_tokens.tokens.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {profile.launched_tokens.tokens.map((token) => (
              <TokenCard key={token.contract_address} token={token} />
            ))}
          </div>
        ) : (
          <div className="card text-center py-8 text-text-muted">
            <p>No tokens launched yet.</p>
            <Link href="/launch" className="btn-primary mt-3 inline-block">
              Launch your first token →
            </Link>
          </div>
        )}
      </div>

      {/* Referral panel */}
      <ReferralPanel wallet={wallet} />
    </div>
  );
}

function HoldingCard({ holding }: { holding: UserHolding }) {
  const { token, balance, value_usdc, total_bought_usdc, total_sold_usdc } = holding;
  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';

  // Compute unrealized/position PnL if trades exist
  const bought = Number(total_bought_usdc);
  const sold = Number(total_sold_usdc);
  const currentValue = Number(value_usdc);
  const netPnlUsdc = currentValue + sold - bought;
  const hasTraded = bought > 0 || sold > 0;

  return (
    <div className="card hover:shadow-subtle-2 transition-all flex flex-col justify-between p-4">
      <div>
        {/* Token info header */}
        <div className="flex items-center justify-between mb-3">
          <Link
            href={`/trade/${token.contract_address}`}
            className="flex items-center gap-2.5 min-w-0 hover:opacity-80 transition-opacity"
          >
            {token.image ? (
              <img
                src={ipfsToGateway(token.image)}
                alt={token.name}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0 bg-bg-input"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent-peach to-accent-sienna/20 flex items-center justify-center font-bold text-base flex-shrink-0">
                {tokenEmoji(token.symbol)}
              </div>
            )}
            <div className="min-w-0">
              <div className="font-bold text-sm truncate flex items-center gap-1.5">
                <span>{token.name}</span>
                <span className="text-xs text-text-muted font-normal">${token.symbol}</span>
              </div>
              <div className="text-xs text-text-muted">
                MCap {formatMarketCap(token.market_cap)}
              </div>
            </div>
          </Link>

          <span
            className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${
              isGraduated
                ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300'
                : 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300'
            }`}
          >
            {isGraduated ? 'Graduated' : 'Active'}
          </span>
        </div>

        {/* Balance & Value Stats */}
        <div className="grid grid-cols-2 gap-2 bg-bg-input rounded-xl p-2.5 mb-3">
          <div>
            <div className="text-[11px] text-text-muted">Tokens Held</div>
            <div className="font-bold text-sm tabular-nums text-text-primary">
              {formatTokens(balance)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] text-text-muted">Est. Value</div>
            <div className="font-bold text-sm tabular-nums text-text-primary">
              {formatUsdc(value_usdc)}
            </div>
          </div>
        </div>

        {/* PnL indicator */}
        {hasTraded && (
          <div className="flex items-center justify-between text-xs mb-3 px-1">
            <span className="text-text-muted">Position PnL:</span>
            <span
              className={`font-semibold tabular-nums ${
                netPnlUsdc >= 0 ? 'text-green-600' : 'text-red-600'
              }`}
            >
              {netPnlUsdc >= 0 ? '+' : ''}
              {formatUsdc(netPnlUsdc)}
            </span>
          </div>
        )}

        {/* Bonding curve progress bar (if active) */}
        {!isGraduated && (
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-[11px] text-text-muted">
              <span>Bonding Curve</span>
              <span className="tabular-nums font-medium">{progress.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-bg-input rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-accent-peach to-accent-sienna transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* Action button */}
      <Link
        href={`/trade/${token.contract_address}`}
        className="btn-secondary text-xs py-1.5 w-full text-center block mt-2"
      >
        Trade {token.symbol} →
      </Link>
    </div>
  );
}

function Stat({
  label,
  value,
  full,
  color,
}: {
  label: string;
  value: string;
  full?: boolean;
  color?: 'green' | 'red';
}) {
  const textColor = color === 'green'
    ? 'text-green-600'
    : color === 'red'
    ? 'text-red-600'
    : '';

  return (
    <div className={`bg-bg-input rounded-lg p-3 ${full ? '' : ''}`}>
      <div className="text-xs text-text-muted">{label}</div>
      <div className={`font-bold text-lg tabular-nums ${textColor}`}>{value}</div>
    </div>
  );
}
