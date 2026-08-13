'use client';

import { memo, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  ArrowSquareOut,
  ArrowsLeftRight,
  CaretDown,
  CaretUp,
  Circle,
  Copy,
  DotsThreeVertical,
  Flag,
  Lightning,
  ShareNetwork,
  XLogo,
} from '@phosphor-icons/react';

import { AgentBadge } from '@/components/AgentBadge';
import { FavoriteButton } from '@/components/FavoriteButton';
import { SocialLinks } from '@/components/SocialLinks';
import { WalletBadge } from '@/components/WalletBadge';
import { Token, api } from '@/lib/api';
import { ARC_EXPLORER_URL } from '@/lib/config';
import {
  bondingCurveProgress,
  formatMarketCap,
  formatPrice,
  formatUsdDirect,
  formatUsdc,
  ipfsToGateway,
  shortenAddress,
  timeAgo,
} from '@/lib/utils';

interface TokenHeaderProps {
  token: Token;
  change24h: { diff: number; pct: number; isPositive: boolean };
  totalHolders: number;
  onSelectInfoTab?: () => void;
}

export const TokenHeader = memo(function TokenHeader({
  token,
  change24h,
  totalHolders,
  onSelectInfoTab,
}: TokenHeaderProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const [primaryMetric, setPrimaryMetric] = useState<'marketCap' | 'price'>('marketCap');
  const progress = token.status === 'graduated' ? 100 : bondingCurveProgress(token.market_cap);
  const showingMarketCap = primaryMetric === 'marketCap';

  const { data: creatorTier } = useQuery({
    queryKey: ['user-tier', token.creator_wallet],
    queryFn: () => api.getWalletTier(token.creator_wallet),
    staleTime: 60_000,
    retry: false,
  });
  const { data: tokenMetadata } = useQuery({
    queryKey: ['token-metadata', token.contract_address],
    queryFn: () => api.getTokenMetadata(token.contract_address),
    staleTime: 30_000,
  });
  const xProfile = getXProfile(tokenMetadata?.twitter);

  const statusLabel = token.status === 'graduated'
    ? 'Graduated'
    : token.status === 'paused'
      ? 'Paused'
      : progress >= 90
        ? 'Near graduation'
        : 'Instant Launch';

  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(token.contract_address);
      toast.success('Contract copied');
    } catch {
      toast.error('Could not copy contract');
    }
  };

  const shareToken = async () => {
    const url = window.location.href;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${token.name} ($${token.symbol}) - Orba`,
          text: `Trade $${token.symbol} on Orba`,
          url,
        });
        return;
      } catch {
        return;
      }
    }

    try {
      await navigator.clipboard.writeText(url);
      toast.success('Token link copied');
    } catch {
      toast.error('Could not copy token link');
    }
  };

  return (
    <section className="overflow-hidden rounded-xl border border-bg-border bg-bg-card shadow-subtle">
      <div className="grid gap-5 px-5 py-5 sm:px-6 sm:py-6 lg:min-h-[144px] lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="flex min-w-0 gap-4 sm:gap-5">
          <div className="h-16 w-16 flex-none overflow-hidden rounded-full border border-bg-border bg-bg-input shadow-subtle sm:h-[76px] sm:w-[76px]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={token.image ? ipfsToGateway(token.image) : '/orba-bloom-icon.svg'}
              alt={`${token.name} token artwork`}
              className="h-full w-full object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="truncate font-sans text-xl font-bold tracking-[-0.03em] text-text-primary sm:text-2xl">
                {token.name}
              </h1>
              <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-2 text-xs text-text-secondary">
              <span className="font-mono font-semibold uppercase text-text-primary">${token.symbol}</span>
              <button
                type="button"
                onClick={copyContract}
                className="inline-flex items-center gap-1 font-mono font-medium transition-colors hover:text-accent-blue"
                aria-label="Copy token contract address"
                title="Copy contract address"
              >
                {shortenAddress(token.contract_address)}
                <Copy size={13} weight="bold" aria-hidden="true" />
              </button>
              <span className="mx-1 hidden h-5 w-px bg-bg-border sm:block" aria-hidden="true" />
              <span
                className={token.status === 'paused'
                  ? 'inline-flex items-center gap-1 rounded-full border border-accent-red/25 bg-accent-red/10 px-2 py-1 font-semibold text-accent-red'
                  : 'inline-flex items-center gap-1 rounded-full border border-accent-blue/20 bg-accent-blue/10 px-2 py-1 font-semibold text-accent-blue'}
              >
                <Lightning size={12} weight="fill" aria-hidden="true" />
                {statusLabel}
              </span>
              {creatorTier && <WalletBadge tier={creatorTier} />}
              {xProfile ? (
                <a
                  href={xProfile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-full border border-bg-border bg-bg-input px-2 py-1 font-semibold text-text-primary transition-colors hover:border-accent-blue/35 hover:text-accent-blue"
                  aria-label={`Open ${xProfile.label} on X`}
                >
                  <XLogo size={12} weight="bold" aria-hidden="true" />
                  {xProfile.label}
                </a>
              ) : token.is_agent === 'true' && token.agent_uuid ? (
                <Link href={`/agents/${token.agent_uuid}`} className="rounded-full border border-bg-border bg-bg-input px-2 py-1 font-semibold text-text-primary hover:text-accent-blue">
                  @{token.agent_name || 'AI agent'}
                </Link>
              ) : (
                <Link href={`/profile/${token.creator_wallet}`} className="rounded-full border border-bg-border bg-bg-input px-2 py-1 font-mono font-semibold text-text-primary hover:text-accent-blue">
                  {shortenAddress(token.creator_wallet)}
                </Link>
              )}
              <span className="text-text-muted">{timeAgo(token.created_at)} on Arc</span>
            </div>

            <div className="mt-3">
              <SocialLinks tokenAddress={token.contract_address} creatorWallet={token.creator_wallet} variant="inline" hideTwitter />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <ActionButton label="Share" onClick={shareToken} icon={<ShareNetwork size={17} weight="bold" />} />
          <FavoriteButton tokenAddress={token.contract_address} />
          <a
            href={`${ARC_EXPLORER_URL}/address/${token.contract_address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="observatory-action"
          >
            <ArrowSquareOut size={17} weight="bold" aria-hidden="true" />
            <span>Explorer</span>
          </a>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMoreOpen((open) => !open)}
              className="icon-button h-10 w-10"
              aria-label="More token actions"
              aria-expanded={moreOpen}
            >
              <DotsThreeVertical size={19} weight="bold" />
            </button>
            {moreOpen && (
              <>
                <button className="fixed inset-0 z-10 cursor-default" onClick={() => setMoreOpen(false)} aria-label="Close token actions" />
                <div className="absolute right-0 top-12 z-20 min-w-44 rounded-lg border border-bg-border bg-bg-card p-1.5 shadow-subtle-2">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectInfoTab?.();
                      setMoreOpen(false);
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-xs font-medium text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                  >
                    Token details
                  </button>
                  <a
                    href={`mailto:support@orba.fun?subject=${encodeURIComponent(`Report token ${token.contract_address}`)}`}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium text-accent-red hover:bg-bg-hover"
                  >
                    <Flag size={15} weight="bold" /> Report token
                  </a>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 border-t border-bg-border md:grid-cols-4">
        <MetricCell
          label={(
            <button
              type="button"
              onClick={() => setPrimaryMetric(showingMarketCap ? 'price' : 'marketCap')}
              className="group inline-flex items-center gap-1.5 rounded-sm text-left font-semibold transition-colors hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/50"
              aria-label={`Show ${showingMarketCap ? 'price' : 'market cap'}`}
              title={`Switch to ${showingMarketCap ? 'price' : 'market cap'}`}
            >
              {showingMarketCap ? 'Market cap' : 'Price'}
              <ArrowsLeftRight size={14} weight="bold" className="transition-transform group-hover:rotate-180" aria-hidden="true" />
            </button>
          )}
          prominent
        >
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
            <span key={primaryMetric} className="animate-[metric-reveal_160ms_ease-out] whitespace-nowrap font-mono text-2xl font-bold tracking-[-0.04em] text-text-primary sm:text-[28px]">
              {showingMarketCap ? formatMarketCap(token.market_cap) : formatPrice(token.price)}
            </span>
            {showingMarketCap && (
              <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${change24h.isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-accent-red'}`}>
                {change24h.isPositive
                  ? <CaretUp size={12} weight="fill" aria-hidden="true" />
                  : <CaretDown size={12} weight="fill" aria-hidden="true" />}
                {Math.abs(change24h.pct).toFixed(2)}%
              </span>
            )}
          </div>
        </MetricCell>
        <MetricCell label="24h volume" value={formatUsdDirect(token.volume_24h)} secondary={Number(token.volume_24h) === 0 ? 'No trades' : 'Live'} />
        <MetricCell label="Curve liquidity" value={formatUsdc(token.real_usdc)} secondary={token.status === 'graduated' ? 'Migrated' : 'In curve'} />
        <MetricCell label="Holders" mobileWide>
          <div className="mt-2 flex items-center gap-3">
            <span className="font-mono text-2xl font-bold tracking-[-0.04em] text-text-primary sm:text-[28px]">
              {totalHolders.toLocaleString()}
            </span>
            {totalHolders > 0 && (
              <span className="flex -space-x-2" aria-label={`${totalHolders.toLocaleString()} verified holders`}>
                {Array.from({ length: Math.min(totalHolders, 3) }, (_, index) => (
                  <Circle
                    key={index}
                    size={24}
                    weight="fill"
                    className={index === 0 ? 'text-accent-purple' : index === 1 ? 'text-accent-blue' : 'text-emerald-500'}
                    aria-hidden="true"
                  />
                ))}
              </span>
            )}
          </div>
        </MetricCell>
      </div>
    </section>
  );
});

function ActionButton({ label, onClick, icon }: { label: string; onClick: () => void; icon: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="observatory-action">
      {icon}
      <span>{label}</span>
    </button>
  );
}

function getXProfile(value?: string | null): { href: string; label: string } | null {
  const input = value?.trim();
  if (!input) return null;

  let handle = input.replace(/^@/, '');
  if (/^https?:\/\//i.test(input)) {
    try {
      const url = new URL(input);
      if (!['x.com', 'www.x.com', 'twitter.com', 'www.twitter.com'].includes(url.hostname.toLowerCase())) return null;
      handle = url.pathname.split('/').filter(Boolean)[0] || '';
    } catch {
      return null;
    }
  }

  handle = handle.split(/[/?#]/)[0];
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle)) return null;
  return { href: `https://x.com/${handle}`, label: `@${handle}` };
}

function MetricCell({
  label,
  value,
  secondary,
  prominent = false,
  mobileWide = false,
  children,
}: {
  label: React.ReactNode;
  value?: string;
  secondary?: string;
  prominent?: boolean;
  mobileWide?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`min-w-0 min-h-[116px] overflow-hidden border-t border-bg-border px-5 py-5 md:col-span-1 md:border-l md:border-t-0 ${prominent ? 'col-span-2 md:border-l-0' : ''} ${mobileWide ? 'col-span-2' : ''}`}>
      <div className="text-xs font-medium text-text-secondary">{label}</div>
      {children || (
        <>
          <div className="mt-2 whitespace-nowrap font-mono text-[15px] font-bold tracking-[-0.04em] text-text-primary sm:text-[28px]">{value}</div>
          {secondary && <div className="mt-1 text-xs font-medium text-text-muted">{secondary}</div>}
        </>
      )}
    </div>
  );
}
