'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  formatUsdDirect,
  formatMarketCap,
  formatUsdc,
  shortenAddress,
  ipfsToGateway,
  tokenEmoji,
} from '@/lib/utils';

type LeaderboardType = 'top_creators' | 'top_gainers' | 'top_volume';

const TABS: { key: LeaderboardType; label: string; description: string }[] = [
  { key: 'top_gainers', label: 'Top Gainers', description: 'Tokens ranked by market cap' },
  { key: 'top_volume', label: 'Top Volume', description: 'Tokens ranked by 24h volume' },
  { key: 'top_creators', label: 'Top Creators', description: 'Wallets ranked by total volume launched' },
];

export default function LeaderboardPage() {
  const [type, setType] = useState<LeaderboardType>('top_gainers');
  const limit = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard', type],
    queryFn: () => api.getLeaderboard(type, limit),
    refetchInterval: 30_000,
  });

  const rows = data || [];
  const activeTab = TABS.find((t) => t.key === type)!;

  return (
    <div className="max-w-5xl mx-auto py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold mb-1">Leaderboard</h1>
        <p className="text-text-secondary text-sm">{activeTab.description}</p>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-2 border-b border-bg-border">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setType(tab.key)}
            className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              type === tab.key
                ? 'border-accent-green text-accent-green'
                : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="card p-8 text-center text-text-secondary">Loading leaderboard…</div>
      ) : rows.length === 0 ? (
        <div className="card p-8 text-center text-text-secondary">
          No data yet. Launch and trade tokens to populate the leaderboard.
        </div>
      ) : type === 'top_creators' ? (
        <CreatorsLeaderboard rows={rows} />
      ) : (
        <TokensLeaderboard rows={rows} showVolume={type === 'top_volume'} />
      )}
    </div>
  );
}

/* ─── Creators leaderboard ─────────────────────────────────────────── */

function CreatorsLeaderboard({ rows }: { rows: any[] }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bg-border text-text-muted text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 w-12">#</th>
            <th className="text-left py-3 px-4">Creator</th>
            <th className="text-right py-3 px-4">Tokens Launched</th>
            <th className="text-right py-3 px-4">Active</th>
            <th className="text-right py-3 px-4">Total Volume</th>
            <th className="text-right py-3 px-4">Combined MC</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.wallet}
              className="border-b border-bg-border/50 last:border-0 hover:bg-bg-hover transition-colors"
            >
              <td className="py-3 px-4">
                <span className={`font-bold ${i < 3 ? 'text-accent-green' : 'text-text-muted'}`}>
                  {i + 1}
                </span>
              </td>
              <td className="py-3 px-4">
                <Link
                  href={`/profile/${row.wallet}`}
                  className="font-medium hover:text-accent-green transition-colors"
                >
                  {row.username || shortenAddress(row.wallet)}
                </Link>
                <div className="text-xs text-text-muted">{shortenAddress(row.wallet)}</div>
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {row.tokens_launched || 0}
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {row.active_tokens || 0}
              </td>
              <td className="py-3 px-4 text-right tabular-nums font-semibold">
                {formatUsdc(row.total_volume_usdc || 0)}
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {formatMarketCap(row.total_market_cap || 0)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─── Tokens leaderboard (gainers + volume) ────────────────────────── */

function TokensLeaderboard({ rows, showVolume }: { rows: any[]; showVolume: boolean }) {
  return (
    <div className="card overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-bg-border text-text-muted text-xs uppercase tracking-wider">
            <th className="text-left py-3 px-4 w-12">#</th>
            <th className="text-left py-3 px-4">Token</th>
            <th className="text-right py-3 px-4">Market Cap</th>
            <th className="text-right py-3 px-4">{showVolume ? 'Volume 24h' : 'Price'}</th>
            <th className="text-right py-3 px-4">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((token, i) => (
            <tr
              key={token.contract_address}
              className="border-b border-bg-border/50 last:border-0 hover:bg-bg-hover transition-colors"
            >
              <td className="py-3 px-4">
                <span className={`font-bold ${i < 3 ? 'text-accent-green' : 'text-text-muted'}`}>
                  {i + 1}
                </span>
              </td>
              <td className="py-3 px-4">
                <Link
                  href={`/coin/${token.contract_address}`}
                  className="flex items-center gap-3 hover:text-accent-green transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-bg-input flex items-center justify-center text-base flex-shrink-0">
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
                  <div className="min-w-0">
                    <div className="font-medium truncate">{token.name}</div>
                    <div className="text-xs text-text-muted">${token.symbol}</div>
                  </div>
                </Link>
              </td>
              <td className="py-3 px-4 text-right tabular-nums font-semibold">
                {formatMarketCap(token.market_cap)}
              </td>
              <td className="py-3 px-4 text-right tabular-nums">
                {showVolume
                  ? formatUsdc(token.volume_24h)
                  : `$${Number(token.price || 0).toExponential(2)}`}
              </td>
              <td className="py-3 px-4 text-right">
                {token.status === 'graduated' ? (
                  <span className="badge-purple">DEX</span>
                ) : (
                  <span className="badge-green">Active</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
