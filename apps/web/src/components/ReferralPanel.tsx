'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { formatUsdc, shortenAddress } from '@/lib/utils';
import { useAccount } from 'wagmi';
import { useAuth } from '@/lib/use-auth';

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
export function ReferralPanel({
  wallet,
  username,
  referralCode,
}: {
  wallet: string;
  username: string | null;
  referralCode: string | null;
}) {
  const { address } = useAccount();
  const { authenticate, authenticating, getAuthToken } = useAuth();
  const queryClient = useQueryClient();
  const isOwnProfile = address?.toLowerCase() === wallet.toLowerCase();
  const [offset, setOffset] = useState(0);
  const [nameInput, setNameInput] = useState(username || '');
  const [savingName, setSavingName] = useState(false);
  const limit = 10;

  useEffect(() => setNameInput(username || ''), [username]);

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

  const referralValue =
    referralCode || stats?.referral_code || stats?.referral_slug || wallet.toLowerCase();
  const referralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/?ref=${referralValue}`;

  const saveUsername = async () => {
    const nextName = nameInput.trim().replace(/^@/, '');
    if (!nextName) return;
    setSavingName(true);
    try {
      let token = getAuthToken();
      if (!token) {
        await authenticate();
        token = getAuthToken();
      }
      if (!token) throw new Error('Wallet authentication did not complete');
      await api.updateUserProfile(wallet, nextName, token);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['user', wallet] }),
        queryClient.invalidateQueries({ queryKey: ['referralStats', wallet] }),
      ]);
      toast.success('Profile name updated. Your referral link is unchanged.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile name');
    } finally {
      setSavingName(false);
    }
  };

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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label htmlFor="referral-name" className="text-xs font-medium text-text-secondary">
              Profile name
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                id="referral-name"
                value={nameInput}
                onChange={(event) => setNameInput(event.target.value)}
                placeholder="Choose a profile name"
                autoComplete="username"
                maxLength={32}
                className="input flex-1 text-sm"
              />
              <button
                onClick={saveUsername}
                disabled={
                  savingName ||
                  authenticating ||
                  !nameInput.trim() ||
                  nameInput.trim() === username
                }
                className="btn-secondary text-xs disabled:opacity-40"
              >
                {savingName || authenticating
                  ? 'Saving…'
                  : username
                    ? 'Update name'
                    : 'Set name'}
              </button>
            </div>
            <p className="text-[11px] text-text-muted">
              3–32 letters, numbers, underscores, or hyphens. Display names may repeat.
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-text-secondary">
              Permanent referral code
            </p>
            <p className="text-[11px] text-text-muted">
              Created from your first profile name. It never changes when you
              rename your profile.
            </p>
          </div>
          <div className="bg-bg-input rounded-lg p-3 text-xs text-text-muted break-all font-mono">
            {referralLink}
          </div>
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
