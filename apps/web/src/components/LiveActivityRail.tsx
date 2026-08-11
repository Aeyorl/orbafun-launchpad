'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Pulse } from '@phosphor-icons/react';
import { api } from '@/lib/api';
import { formatUsdc, shortenAddress, timeAgo } from '@/lib/utils';
import { WalletBadge } from '@/components/WalletBadge';

export function LiveActivityRail() {
  const { data, isLoading } = useQuery({
    queryKey: ['recent-activity', 12],
    queryFn: () => api.getRecentActivity(12),
    refetchInterval: 10_000,
  });
  const activity = data?.activity || [];

  return (
    <section className="card !p-0 overflow-hidden" aria-labelledby="live-activity-heading">
      <div className="flex items-center justify-between px-4 py-3 border-b border-bg-border">
        <h2 id="live-activity-heading" className="text-sm font-semibold inline-flex items-center gap-2">
          <Pulse size={16} weight="bold" className="text-accent-blue" aria-hidden="true" />
          Live activity
        </h2>
        <span className="text-[10px] uppercase tracking-wider text-text-muted">Orba trades</span>
      </div>
      {isLoading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-bg-border" aria-busy="true">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-14 bg-bg-card animate-pulse" />
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="px-4 py-5 text-xs text-text-muted">No indexed trades yet.</p>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-bg-border">
          {activity.map((item) => (
            <div key={`${item.tx_hash}-${item.log_index}`} className="bg-bg-card px-3 py-2.5 flex items-center justify-between gap-3 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className={item.type === 'buy' ? 'badge-green' : 'badge-red'}>
                  {item.type.toUpperCase()}
                </span>
                <Link href={`/trade/${item.token_address}`} className="font-semibold text-xs truncate hover:text-accent-blue">
                  ${item.token_symbol}
                </Link>
                <span className="font-mono text-xs text-text-secondary">{formatUsdc(item.usdc_amount)}</span>
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <Link href={`/profile/${item.wallet}`} className="font-mono text-[10px] text-text-muted hover:text-accent-blue">
                  {shortenAddress(item.wallet)}
                </Link>
                {item.wallet_tier && item.wallet_tier_label && item.wallet_tier_calculated_at && (
                  <WalletBadge tier={{
                    key: item.wallet_tier,
                    label: item.wallet_tier_label,
                    basis: 'orba_activity',
                    calculated_at: item.wallet_tier_calculated_at,
                  }} />
                )}
                <span className="text-[10px] text-text-muted">{timeAgo(item.timestamp)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
