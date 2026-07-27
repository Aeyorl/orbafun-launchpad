'use client';

import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatUsdc, shortenAddress } from '@/lib/utils';
import { useAccount } from 'wagmi';

/**
 * ReferralPanel — shows on a user's profile page.
 *
 * For the profile owner (when viewing your own profile):
 *   - Your referral link (copyable)
 *   - Stats: total referred, active, volume, rewards
 *   - List of wallets you've referred
 *
 * For other profiles (viewing someone else):
 *   - Their referral stats (read-only)
 */
export function ReferralPanel({ wallet }: { wallet: string }) {
  const { address } = useAccount();
  const isOwnProfile = address?.toLowerCase() === wallet.toLowerCase();
  const [offset, setOffset] = useState(0);
  const limit = 10;

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['referralStats', wallet],
    queryFn: () => api.getReferralStats(wallet),
    refetchInterval: 60_000,
  });

  const { data: referredData, isLoading: referredLoading } = useQuery({
    queryKey: ['referredWallets', wallet, offset],
    queryFn: () => api.getReferredWallets(wallet, limit, offset),
    refetchInterval: 60_000,
    enabled: !!stats && stats.total_referred > 0,
  });

  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${wallet.toLowerCase()}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(referralLink);
      toast.success('Referral link copied');
    } catch {
      toast.error('Failed to copy link');
    }
  };

  const referrals = referredData?.referrals || [];
  const total = referredData?.total || 0;
  const hasMore = offset + limit < total;
  const hasPrev = offset > 0;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-lg">Referrals</h2>
        {isOwnProfile && (
          <button onClick={copyLink} className="btn-secondary text-xs">
            Copy referral link
          </button>
        )}
      </div>

      {/* Referral link (only on own profile) */}
      {isOwnProfile && (
        <div className="bg-bg-input rounded-lg p-3 text-xs text-text-muted break-all font-mono">
          {referralLink}
        </div>
      )}

      {/* Stats */}
      {statsLoading ? (
        <div className="text-sm text-text-secondary">Loading…</div>
      ) : stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
          <div>
            <div className="text-text-muted text-xs">Total Referred</div>
            <div className="font-bold tabular-nums">{stats.total_referred}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Active</div>
            <div className="font-bold tabular-nums">{stats.active_referred}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Volume</div>
            <div className="font-bold tabular-nums">{formatUsdc(stats.total_volume_usdc)}</div>
          </div>
          <div>
            <div className="text-text-muted text-xs">Rewards</div>
            <div className="font-bold tabular-nums text-accent-green">
              {formatUsdc(stats.reward_earned_usdc)}
            </div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-text-secondary">No referral data.</div>
      )}

      {/* Referred wallets list */}
      {stats && stats.total_referred > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-text-secondary">Referred Wallets</h3>
          {referredLoading ? (
            <div className="text-sm text-text-secondary">Loading…</div>
          ) : (
            <>
              <div className="space-y-1">
                {referrals.map((r) => (
                  <Link
                    key={r.referred_wallet}
                    href={`/profile/${r.referred_wallet}`}
                    className="flex items-center justify-between p-2 rounded-lg hover:bg-bg-hover transition-colors text-sm"
                  >
                    <span className="font-mono text-text-secondary">
                      {shortenAddress(r.referred_wallet)}
                    </span>
                    <div className="flex gap-4 text-xs text-text-muted tabular-nums">
                      <span>{r.trade_count} trades</span>
                      <span>{formatUsdc(r.total_volume_usdc)}</span>
                    </div>
                  </Link>
                ))}
              </div>
              {(hasMore || hasPrev) && (
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={() => setOffset((o) => Math.max(0, o - limit))}
                    disabled={!hasPrev}
                    className="btn-secondary text-xs disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    onClick={() => setOffset((o) => o + limit)}
                    disabled={!hasMore}
                    className="btn-secondary text-xs disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
