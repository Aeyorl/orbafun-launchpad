'use client';

import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { TokenCard } from '@/components/TokenCard';
import { ReferralPanel } from '@/components/ReferralPanel';
import { formatUsdc, shortenAddress } from '@/lib/utils';

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
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="text-lg font-bold">Profit & Loss</h2>
          <div className="flex items-center gap-1" role="tablist" aria-label="PnL period">
            {(['7d', '30d', 'all'] as PnlPeriod[]).map((p) => (
              <button
                key={p}
                role="tab"
                aria-selected={pnlPeriod === p}
                onClick={() => setPnlPeriod(p)}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  pnlPeriod === p
                    ? 'bg-text-primary/10 text-text-primary'
                    : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
                }`}
              >
                {p === 'all' ? 'All Time' : p.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {pnlLoading ? (
          <div className="h-20 animate-pulse bg-bg-input rounded-lg" />
        ) : (
          <div className="space-y-4">
            {/* Main PnL number */}
            <div className="text-center py-3">
              <div className="text-xs text-text-muted mb-1">
                Realized PnL ({pnlPeriod === 'all' ? 'All Time' : pnlPeriod.toUpperCase()})
              </div>
              <div
                className={`text-3xl font-bold tabular-nums ${
                  pnlValue === 0
                    ? 'text-text-primary'
                    : isPositivePnl
                    ? 'text-green-600'
                    : 'text-red-600'
                }`}
              >
                {isPositivePnl && pnlValue > 0 ? '+' : ''}
                {formatUsdc(pnlValue)}
              </div>
            </div>

            {/* Breakdown */}
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-red-50 rounded-lg p-3">
                <div className="text-xs text-red-600 font-medium mb-0.5">Total Bought</div>
                <div className="font-bold tabular-nums text-red-700">{formatUsdc(totalBought)}</div>
                <div className="text-xs text-red-500 tabular-nums mt-0.5">
                  {pnlData?.buy_count ?? 0} trades
                </div>
              </div>
              <div className="bg-green-50 rounded-lg p-3">
                <div className="text-xs text-green-600 font-medium mb-0.5">Total Sold</div>
                <div className="font-bold tabular-nums text-green-700">{formatUsdc(totalSold)}</div>
                <div className="text-xs text-green-500 tabular-nums mt-0.5">
                  {pnlData?.sell_count ?? 0} trades
                </div>
              </div>
            </div>
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
