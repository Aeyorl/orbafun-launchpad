'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { api, UserHolding, Token } from '@/lib/api';
import { TokenCard } from '@/components/TokenCard';
import { ReferralPanel } from '@/components/ReferralPanel';
import { ImageUploader } from '@/components/ImageUploader';
import { WalletBadge } from '@/components/WalletBadge';
import {
  ArrowSquareOut,
  Briefcase,
  Camera,
  Copy,
  Flag,
  LinkSimple,
  RocketLaunch,
  Scroll,
  UserCircle,
} from '@phosphor-icons/react';
import { ARC_EXPLORER_URL } from '@/lib/config';
import { useAccount } from 'wagmi';
import { useAuth } from '@/lib/use-auth';
import {
  formatUsdc,
  shortenAddress,
  formatTokens,
  formatMarketCap,
  formatPrice,
  bondingCurveProgress,
  ipfsToGateway,
  tokenEmoji,
} from '@/lib/utils';

type ProfileTab = 'overview' | 'created' | 'holdings' | 'activity';
type PnlPeriod = '7d' | '30d' | 'all';

export default function ProfilePage() {
  const params = useParams();
  const wallet = (params.wallet as string)?.toLowerCase();
  const { address } = useAccount();
  const { authenticate, authenticating, getAuthToken } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<ProfileTab>('overview');
  const [pnlPeriod, setPnlPeriod] = useState<PnlPeriod>('all');
  const [copiedAddress, setCopiedAddress] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [savingSetup, setSavingSetup] = useState(false);
  const [editingAvatar, setEditingAvatar] = useState(false);
  const [avatarDraft, setAvatarDraft] = useState('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [savingAvatar, setSavingAvatar] = useState(false);
  const isOwnProfile = address?.toLowerCase() === wallet;

  // Profile data
  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ['user', wallet],
    queryFn: () => api.getUserProfile(wallet),
    enabled: !!wallet,
  });

  // PnL data
  const { data: pnlData, isLoading: isPnlLoading } = useQuery({
    queryKey: ['user-pnl', wallet, pnlPeriod],
    queryFn: () => api.getUserPnl(wallet, pnlPeriod),
    enabled: !!wallet,
    staleTime: 30_000,
  });

  // Holdings data
  const { data: holdingsData, isLoading: isHoldingsLoading } = useQuery({
    queryKey: ['user-holdings', wallet],
    queryFn: () => api.getUserHoldings(wallet),
    enabled: !!wallet,
    staleTime: 15_000,
  });

  const { data: walletTier } = useQuery({
    queryKey: ['user-tier', wallet],
    queryFn: () => api.getWalletTier(wallet),
    enabled: !!wallet,
    staleTime: 30_000,
    retry: false,
  });

  const copyWalletAddress = async () => {
    if (!wallet) return;
    try {
      await navigator.clipboard.writeText(wallet);
      setCopiedAddress(true);
      toast.success('Wallet address copied!');
      setTimeout(() => setCopiedAddress(false), 2000);
    } catch {
      toast.error('Failed to copy address');
    }
  };

  const createProfile = async () => {
    const username = setupName.trim().replace(/^@/, '');
    if (!username) return;
    setSavingSetup(true);
    try {
      let token = getAuthToken();
      if (!token) {
        await authenticate();
        token = getAuthToken();
      }
      if (!token) throw new Error('Wallet authentication did not complete');
      await api.updateUserProfile(wallet, username, token);
      await queryClient.invalidateQueries({ queryKey: ['user', wallet] });
      toast.success('Profile created');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create profile');
    } finally {
      setSavingSetup(false);
    }
  };

  const saveAvatar = async () => {
    setSavingAvatar(true);
    try {
      let token = getAuthToken();
      if (!token) {
        await authenticate();
        token = getAuthToken();
      }
      if (!token) throw new Error('Wallet authentication did not complete');
      await api.updateUserProfile(wallet, { avatar: avatarDraft || null }, token);
      await queryClient.invalidateQueries({ queryKey: ['user', wallet] });
      setEditingAvatar(false);
      toast.success(avatarDraft ? 'Profile photo updated' : 'Profile photo removed');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile photo');
    } finally {
      setSavingAvatar(false);
    }
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Profile ${shortenAddress(wallet)} — Orba`,
          text: `Check out ${shortenAddress(wallet)}'s creator & trader profile on Orba!`,
          url,
        });
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Profile link copied to clipboard!');
      } catch {
        toast.error('Failed to copy link');
      }
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const tweetText = `Check out ${shortenAddress(wallet)}'s profile on Orba launchpad — ${shareUrl}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  // Construct Activity timeline items from user profile, launched tokens, and PnL trades
  const activityItems = useMemo(() => {
    if (!profile) return [];

    const items: Array<{
      id: string;
      type: 'CREATE' | 'BUY' | 'SELL' | 'GRADUATED';
      tokenName: string;
      tokenSymbol: string;
      tokenAddress: string;
      usdcAmount?: string;
      timestamp: string;
      txHash?: string;
    }> = [];

    // Launched tokens
    if (profile.launched_tokens?.tokens) {
      profile.launched_tokens.tokens.forEach((t) => {
        items.push({
          id: `create-${t.contract_address}`,
          type: 'CREATE',
          tokenName: t.name,
          tokenSymbol: t.symbol,
          tokenAddress: t.contract_address,
          timestamp: t.created_at,
          txHash: t.created_tx_hash,
        });

        if (t.status === 'graduated' && t.graduated_at) {
          items.push({
            id: `grad-${t.contract_address}`,
            type: 'GRADUATED',
            tokenName: t.name,
            tokenSymbol: t.symbol,
            tokenAddress: t.contract_address,
            timestamp: t.graduated_at,
          });
        }
      });
    }

    // Sort newest first
    return items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [profile]);

  if (isProfileLoading) {
    return <ProfileSkeleton />;
  }

  if (!profile) {
    return (
      <div className="card text-center py-16 max-w-md mx-auto my-12 space-y-4">
        <UserCircle size={40} className="mx-auto" aria-hidden="true" />
        <div>
          <h1 className="text-2xl font-serif mb-1">
            {isOwnProfile ? 'Create your Orba profile' : 'User not found'}
          </h1>
          <p className="text-sm text-text-muted">
            {isOwnProfile
              ? 'Choose a profile name. Orba will create a permanent unique referral code for you.'
              : 'This wallet address hasn\'t created an Orba profile yet.'}
          </p>
        </div>
        {isOwnProfile ? (
          <div className="space-y-3 px-6">
            <input
              value={setupName}
              onChange={(event) => setSetupName(event.target.value)}
              placeholder="Choose a profile name"
              autoComplete="username"
              maxLength={32}
              className="input w-full text-sm text-left"
            />
            <button
              onClick={createProfile}
              disabled={!setupName.trim() || savingSetup || authenticating}
              className="btn-primary w-full text-xs disabled:opacity-40"
            >
              {savingSetup || authenticating ? 'Creating…' : 'Create profile'}
            </button>
            <p className="text-[11px] text-text-muted">
              Your permanent link will look like orba.fun/?ref=your-name-7k3p.
            </p>
          </div>
        ) : (
          <Link href="/explore" className="btn-primary inline-block text-xs px-5 py-2.5 rounded-full font-bold">
            Explore Active Tokens →
          </Link>
        )}
      </div>
    );
  }

  const realizedPnl = pnlData?.realized_pnl || '0';
  const unrealizedPnl = pnlData?.unrealized_pnl;
  const totalPnl = pnlData?.total_pnl;
  const holdingsList = holdingsData?.holdings || [];
  const totalPortfolioValue = holdingsData?.total_value_usdc || '0';

  return (
    <div className="max-w-5xl mx-auto space-y-5 pb-16">
      {/* 1. CREATOR & TRADER PROFILE HEADER */}
      <div className="card !p-5 space-y-5 bg-bg-card border border-bg-border shadow-subtle-1 relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          {/* Identity & Avatar */}
          <div className="flex items-center gap-4">
            {/* Profile avatar — editable only by the connected wallet owner. */}
            <div className="relative flex-shrink-0">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-accent-blue via-accent-peach to-accent-sienna/40 border border-bg-border flex items-center justify-center text-2xl font-bold font-mono text-white shadow-sm overflow-hidden">
                {profile.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ipfsToGateway(profile.avatar)}
                    alt={`${profile.username || shortenAddress(wallet)} profile`}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  shortenAddress(wallet).slice(2, 4).toUpperCase()
                )}
              </div>
              {isOwnProfile && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarDraft(profile.avatar || '');
                    setEditingAvatar((open) => !open);
                  }}
                  className="absolute -right-2 -bottom-2 w-7 h-7 rounded-full bg-text-primary text-bg-base border-2 border-bg-card flex items-center justify-center shadow-subtle-1 hover:opacity-85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
                  aria-label="Change profile photo"
                  title="Change profile photo"
                >
                  <Camera size={14} weight="bold" aria-hidden="true" />
                </button>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex items-center gap-2">
                {profile.username ? (
                  <div>
                    <h1 className="text-xl font-bold text-text-primary leading-tight">
                      {profile.username}
                    </h1>
                    <span className="text-xs text-text-muted font-medium">@{profile.username}</span>
                  </div>
                ) : (
                  <h1 className="text-xl font-bold font-mono text-text-primary tracking-tight">
                    {shortenAddress(wallet)}
                  </h1>
                )}

                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-medium border bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Active · Arc
                </span>
                {walletTier && <WalletBadge tier={walletTier} />}
              </div>

              <div className="flex items-center gap-3 text-xs text-text-muted pt-0.5">
                <span className="font-mono">{shortenAddress(wallet)}</span>
                <span>·</span>
                <span>Joined {new Date(profile.created_at).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={copyWalletAddress}
              className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 font-medium rounded-full"
              title="Copy wallet address"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              <span>{copiedAddress ? 'Copied!' : 'Copy Address'}</span>
            </button>

            {/* Share */}
            <div className="relative">
              <button
                onClick={() => setShareOpen((v) => !v)}
                className="btn-secondary text-xs px-3.5 py-2 flex items-center gap-1.5 font-medium rounded-full"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                <span>Share</span>
              </button>

              {shareOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setShareOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-30 card p-1.5 min-w-[170px] space-y-1 shadow-subtle-2">
                    <button
                      onClick={() => {
                        handleShare();
                        setShareOpen(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2"
                    >
                      <LinkSimple size={14} aria-hidden="true" /> Copy link / Share
                    </button>
                    <a
                      href={tweetUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setShareOpen(false)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2 block"
                    >
                      𝕏 Post on X
                    </a>
                  </div>
                </>
              )}
            </div>

            {/* More Menu (⋮) */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className="btn-secondary text-xs px-3 py-2 font-bold rounded-full"
                title="More options"
              >
                ⋮
              </button>

              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-20" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full mt-1.5 z-30 card p-1.5 min-w-[180px] space-y-1 shadow-subtle-2">
                    <button
                      onClick={() => {
                        copyWalletAddress();
                        setMoreOpen(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2"
                    >
                      <Copy size={14} aria-hidden="true" /> Copy wallet address
                    </button>
                    <a
                      href={`${ARC_EXPLORER_URL}/address/${wallet}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => setMoreOpen(false)}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2 block"
                    >
                      <ArrowSquareOut size={14} aria-hidden="true" /> View on ArcScan
                    </a>
                    <button
                      onClick={() => {
                        toast.success('Profile report submitted');
                        setMoreOpen(false);
                      }}
                      className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium text-rose-500 flex items-center gap-2"
                    >
                      <Flag size={14} aria-hidden="true" /> Report profile
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {isOwnProfile && editingAvatar && (
          <div className="max-w-md space-y-4 border-t border-bg-border/60 pt-4">
            <ImageUploader
              value={avatarDraft}
              onChange={setAvatarDraft}
              onUploadingChange={setAvatarUploading}
              symbol={profile.username || shortenAddress(wallet)}
              label="Profile photo"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={saveAvatar}
                disabled={avatarUploading || savingAvatar || authenticating}
                className="btn-primary text-xs px-4 py-2 disabled:opacity-40"
              >
                {avatarUploading
                  ? 'Uploading…'
                  : savingAvatar || authenticating
                    ? 'Saving…'
                    : 'Save profile photo'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAvatarDraft(profile.avatar || '');
                  setEditingAvatar(false);
                }}
                disabled={avatarUploading || savingAvatar}
                className="btn-secondary text-xs px-4 py-2 disabled:opacity-40"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* 2. COMPACT CREATOR + TRADER STATS ROW */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-bg-border/60">
          <StatCard label="Tokens Created" value={String(profile.tokens_launched)} />
          <StatCard label="Trading Volume" value={formatUsdc(profile.total_volume_usdc)} />
          <StatCard label="Total Trades" value={String(profile.trade_stats.total_trades)} detail={`${profile.trade_stats.total_buys} buys · ${profile.trade_stats.total_sells} sells`} />
          <StatCard label="Portfolio Value" value={formatUsdc(totalPortfolioValue)} />
        </div>
      </div>

      {/* 3. PRIMARY NAVIGATION TABS */}
      <div className="border-b border-bg-border flex items-center gap-1 overflow-x-auto text-sm">
        <button
          onClick={() => setActiveTab('overview')}
          className={`tab ${activeTab === 'overview' ? 'tab-active' : ''}`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab('created')}
          className={`tab ${activeTab === 'created' ? 'tab-active' : ''}`}
        >
          Created ({profile.tokens_launched})
        </button>
        <button
          onClick={() => setActiveTab('holdings')}
          className={`tab ${activeTab === 'holdings' ? 'tab-active' : ''}`}
        >
          Holdings ({holdingsList.length})
        </button>
        <button
          onClick={() => setActiveTab('activity')}
          className={`tab ${activeTab === 'activity' ? 'tab-active' : ''}`}
        >
          Activity
        </button>
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-5 animate-fade-in">
          {/* PnL & Portfolio Summary Card */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <h2 className="text-base font-bold text-text-primary">Canonical position performance</h2>
                <p className="text-xs text-text-muted">Weighted-average cost basis from indexed Orba trades; gas excluded</p>
              </div>

              {/* Period selector */}
              <div className="flex items-center gap-1 bg-bg-input p-1 rounded-lg border border-bg-border/60">
                {(['7d', '30d', 'all'] as PnlPeriod[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPnlPeriod(p)}
                    className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors ${
                      pnlPeriod === p
                        ? 'bg-accent-blue text-white shadow-xs'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                  >
                    {p === 'all' ? 'All Time' : p.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {isPnlLoading ? (
              <div className="h-20 bg-bg-input rounded-xl animate-pulse" />
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <PnlMetric
                  label={pnlPeriod === 'all' ? 'Realized P&L' : `Realized in ${pnlPeriod}`}
                  amount={realizedPnl}
                  roi={pnlData?.realized_roi_pct || null}
                />
                {pnlPeriod === 'all' ? (
                  <>
                    <PnlMetric label="Unrealized P&L" amount={unrealizedPnl || '0'} roi={pnlData?.unrealized_roi_pct || null} />
                    <PnlMetric label="Total P&L" amount={totalPnl || '0'} roi={pnlData?.total_roi_pct || null} emphasis />
                  </>
                ) : (
                  <>
                    <ValueMetric label={`Bought (${pnlData?.buy_count ?? 0} trades)`} amount={pnlData?.total_bought || '0'} />
                    <ValueMetric label={`Sold (${pnlData?.sell_count ?? 0} trades)`} amount={pnlData?.total_sold || '0'} />
                  </>
                )}
              </div>
            )}
            {pnlData?.basis_status === 'incomplete' && (
              <p className="text-xs text-accent-orange">
                ROI is withheld because indexed trades do not fully explain this wallet&apos;s token balance.
              </p>
            )}
          </div>

          {/* Quick Created Tokens Preview */}
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <h2 className="text-base font-bold text-text-primary">Created Tokens ({profile.tokens_launched})</h2>
              {profile.tokens_launched > 0 && (
                <button
                  onClick={() => setActiveTab('created')}
                  className="text-xs font-bold text-accent-blue hover:underline"
                >
                  View all →
                </button>
              )}
            </div>

            {profile.launched_tokens.tokens.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {profile.launched_tokens.tokens.slice(0, 3).map((token) => (
                  <TokenCard key={token.contract_address} token={token} />
                ))}
              </div>
            ) : (
              <div className="card text-center py-8 text-text-muted space-y-2">
                <p className="text-xs">No tokens launched yet by this wallet.</p>
              </div>
            )}
          </div>

          {/* Referral Program Panel */}
          <ReferralPanel
            wallet={wallet}
            username={profile.username}
            referralCode={profile.referral_code || profile.referral_slug}
          />
        </div>
      )}

      {/* TAB 2: CREATED TOKENS */}
      {activeTab === 'created' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-text-primary">Tokens Launched by {shortenAddress(wallet)}</h2>
            <span className="text-xs text-text-muted">{profile.tokens_launched} launched</span>
          </div>

          {profile.launched_tokens.tokens.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {profile.launched_tokens.tokens.map((token) => (
                <TokenCard key={token.contract_address} token={token} />
              ))}
            </div>
          ) : (
            <div className="card text-center py-12 text-text-muted space-y-3">
              <RocketLaunch size={32} className="mx-auto" aria-hidden="true" />
              <p className="text-sm">No tokens launched yet.</p>
              <Link href="/launch" className="btn-primary inline-block text-xs px-4 py-2 rounded-full font-bold">
                Launch your token →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HOLDINGS */}
      {activeTab === 'holdings' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-text-primary">Current Token Positions</h2>
              <p className="text-xs text-text-muted">Total value: {formatUsdc(totalPortfolioValue)}</p>
            </div>
          </div>

          {isHoldingsLoading ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="card h-16 animate-pulse" />
              ))}
            </div>
          ) : holdingsList.length > 0 ? (
            <div className="card !p-0 overflow-hidden border border-bg-border">
              {/* DESKTOP TABLE */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-bg-input border-b border-bg-border text-text-muted font-semibold">
                    <tr>
                      <th className="py-3 px-4">Token</th>
                      <th className="py-3 px-4 text-right">Balance</th>
                      <th className="py-3 px-4 text-right">Est. Value</th>
                      <th className="py-3 px-4 text-right">Position PnL</th>
                      <th className="py-3 px-4 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border/60">
                    {holdingsList.map((holding) => {
                      const { token, balance, value_usdc, total_pnl_usdc, basis_status } = holding;
                      const isPositive = isNonNegativeMicroUsdc(total_pnl_usdc);

                      return (
                        <tr key={token.contract_address} className="hover:bg-bg-hover/50 transition-colors">
                          <td className="py-3 px-4">
                            <Link href={`/trade/${token.contract_address}`} className="flex items-center gap-2.5 hover:underline">
                              <div className="w-7 h-7 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0 text-sm">
                                {token.image ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={ipfsToGateway(token.image)} alt={token.name} className="w-full h-full object-cover" />
                                ) : (
                                  tokenEmoji(token.symbol)
                                )}
                              </div>
                              <div>
                                <div className="font-bold text-text-primary">{token.name}</div>
                                <div className="text-[11px] text-text-muted font-mono">${token.symbol}</div>
                              </div>
                            </Link>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                            {formatTokens(balance)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-text-primary tabular-nums">
                            {formatUsdc(value_usdc)}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold tabular-nums">
                            <span className={isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                              {formatSignedUsdc(total_pnl_usdc)}
                            </span>
                            {basis_status === 'incomplete' && <span className="ml-1 text-accent-orange" title="ROI withheld: incomplete indexed cost basis">*</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <Link
                              href={`/trade/${token.contract_address}`}
                              className="btn-secondary text-[11px] px-3 py-1 rounded-full font-bold inline-block"
                            >
                              Trade →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* MOBILE STACKED CARDS */}
              <div className="md:hidden divide-y divide-bg-border/60">
                {holdingsList.map((holding) => {
                  const { token, balance, value_usdc, total_pnl_usdc, basis_status } = holding;
                  const isPositive = isNonNegativeMicroUsdc(total_pnl_usdc);

                  return (
                    <div key={token.contract_address} className="p-3.5 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <Link href={`/trade/${token.contract_address}`} className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-lg bg-bg-base border border-bg-border flex items-center justify-center overflow-hidden flex-shrink-0">
                            {token.image ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={ipfsToGateway(token.image)} alt={token.name} className="w-full h-full object-cover" />
                            ) : (
                              tokenEmoji(token.symbol)
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-sm text-text-primary">{token.name}</div>
                            <div className="text-xs text-text-muted">${token.symbol}</div>
                          </div>
                        </Link>
                        <Link
                          href={`/trade/${token.contract_address}`}
                          className="btn-secondary text-xs px-3 py-1 rounded-full font-bold"
                        >
                          Trade
                        </Link>
                      </div>

                      <div className="grid grid-cols-3 gap-2 bg-bg-input p-2 rounded-lg text-xs font-mono">
                        <div>
                          <div className="text-[10px] text-text-muted">Balance</div>
                          <div className="font-bold text-text-primary">{formatTokens(balance)}</div>
                        </div>
                        <div className="text-center">
                          <div className="text-[10px] text-text-muted">Est. Value</div>
                          <div className="font-bold text-text-primary">{formatUsdc(value_usdc)}</div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-text-muted">PnL</div>
                          <div className={`font-bold ${isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {formatSignedUsdc(total_pnl_usdc)}{basis_status === 'incomplete' ? '*' : ''}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="card text-center py-12 text-text-muted space-y-3">
              <Briefcase size={32} className="mx-auto" aria-hidden="true" />
              <p className="text-sm">No token positions held in wallet.</p>
              <Link href="/explore" className="btn-secondary text-xs px-4 py-2 rounded-full font-bold inline-block">
                Explore Tokens →
              </Link>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: ACTIVITY TIMELINE */}
      {activeTab === 'activity' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex justify-between items-center">
            <h2 className="text-base font-bold text-text-primary">On-Chain Activity Timeline</h2>
            <span className="text-xs text-text-muted">{activityItems.length} events</span>
          </div>

          {activityItems.length > 0 ? (
            <div className="card !p-0 overflow-hidden border border-bg-border divide-y divide-bg-border/60">
              {activityItems.map((item) => (
                <div key={item.id} className="p-3.5 flex items-center justify-between gap-3 text-xs hover:bg-bg-hover/40 transition-colors">
                  <div className="flex items-center gap-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        item.type === 'CREATE'
                          ? 'bg-blue-500/10 text-accent-blue border border-blue-500/20'
                          : item.type === 'GRADUATED'
                          ? 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          : 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                      }`}
                    >
                      {item.type}
                    </span>

                    <div>
                      <Link href={`/trade/${item.tokenAddress}`} className="font-bold text-text-primary hover:underline">
                        {item.tokenName} (${item.tokenSymbol})
                      </Link>
                      <div className="text-[11px] text-text-muted">
                        {new Date(item.timestamp).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  {item.txHash && (
                    <a
                      href={`${ARC_EXPLORER_URL}/tx/${item.txHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-text-muted hover:text-accent-blue font-mono text-[11px]"
                    >
                      {shortenAddress(item.txHash)} ↗
                    </a>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="card text-center py-12 text-text-muted space-y-2">
              <Scroll size={32} className="mx-auto" aria-hidden="true" />
              <p className="text-sm">No activity recorded for this wallet yet.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PnlMetric({
  label,
  amount,
  roi,
  emphasis = false,
}: {
  label: string;
  amount: string;
  roi: string | null;
  emphasis?: boolean;
}) {
  const positive = isNonNegativeMicroUsdc(amount);
  return (
    <div className={`rounded-xl border p-3.5 space-y-1 ${emphasis ? 'border-accent-blue/30 bg-accent-blue/10' : 'border-bg-border/60 bg-bg-input'}`}>
      <div className="text-[11px] font-semibold uppercase text-text-muted">{label}</div>
      <div className={`font-mono text-2xl font-bold tabular-nums ${positive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
        {formatSignedUsdc(amount)}
      </div>
      <div className="text-xs text-text-muted">{roi === null ? 'ROI unavailable' : `${roi}% ROI`}</div>
    </div>
  );
}

function ValueMetric({ label, amount }: { label: string; amount: string }) {
  return (
    <div className="rounded-xl border border-bg-border/60 bg-bg-input p-3.5 space-y-1">
      <div className="text-[11px] font-semibold uppercase text-text-muted">{label}</div>
      <div className="font-mono text-xl font-bold tabular-nums text-text-primary">{formatUsdc(amount)}</div>
    </div>
  );
}

function isNonNegativeMicroUsdc(amount: string): boolean {
  try {
    return BigInt(amount) >= 0n;
  } catch {
    return true;
  }
}

function formatSignedUsdc(amount: string): string {
  try {
    const value = BigInt(amount);
    if (value > 0n) return `+${formatUsdc(value)}`;
    if (value < 0n) return `-${formatUsdc(-value)}`;
    return formatUsdc(0n);
  } catch {
    return formatUsdc(0n);
  }
}

function StatCard({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="bg-bg-input p-3 rounded-xl border border-bg-border/60 space-y-0.5">
      <div className="text-[11px] font-semibold text-text-muted">{label}</div>
      <div className="text-base font-bold font-mono text-text-primary tabular-nums">{value}</div>
      {detail && <div className="text-[10px] text-text-muted font-mono">{detail}</div>}
    </div>
  );
}

function ProfileSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-4 animate-pulse">
      <div className="card h-40 bg-bg-card" />
      <div className="h-10 bg-bg-card rounded-lg" />
      <div className="card h-64 bg-bg-card" />
    </div>
  );
}
