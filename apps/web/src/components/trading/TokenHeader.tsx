'use client';

import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Copy, DiscordLogo, Globe, TelegramLogo, XLogo } from '@phosphor-icons/react';
import { Token, TokenMetadata } from '@/lib/api';
import { FavoriteButton } from '@/components/FavoriteButton';
import { ShareButton } from '@/components/ShareButton';
import { AgentBadge } from '@/components/AgentBadge';
import { TokenArtwork } from '@/components/TokenArtwork';
import {
  formatPrice,
  formatUsdCompact,
  formatUsdDirect,
  shortenAddress,
  bondingCurveProgress,
} from '@/lib/utils';

interface TokenHeaderProps {
  token: Token;
  metadata?: TokenMetadata;
  change24h: { diff: number; pct: number; isPositive: boolean };
  totalHolders: number;
}

function safeHttpUrl(value?: string | null, allowBareDomain = false): string | null {
  if (!value) return null;
  const candidate = allowBareDomain && !/^https?:\/\//i.test(value) ? `https://${value}` : value;

  try {
    const parsed = new URL(candidate);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function socialProfileUrl(value: string | null | undefined, baseUrl: string): string | null {
  if (!value) return null;
  const directUrl = safeHttpUrl(value);
  if (directUrl) return directUrl;

  const handle = value.trim().replace(/^@/, '').replace(/^\/+|\/+$/g, '');
  return handle ? `${baseUrl}${handle}` : null;
}

function SocialAction({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${label} (opens in new tab)`}
      title={label}
      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-bg-border bg-bg-base/75 text-text-secondary transition-colors hover:border-accent-blue/50 hover:text-accent-blue focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue/40"
    >
      {children}
    </a>
  );
}

function DisabledSocialAction({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span
      aria-disabled="true"
      aria-label={`${label} not provided`}
      title={`${label} not provided`}
      className="inline-flex h-9 w-9 cursor-not-allowed items-center justify-center rounded-full border border-bg-border bg-bg-base/45 text-text-muted/45"
    >
      {children}
    </span>
  );
}

export const TokenHeader = memo(function TokenHeader({ token, metadata, change24h, totalHolders }: TokenHeaderProps) {
  const [copiedCa, setCopiedCa] = useState(false);
  const [isSticky, setIsSticky] = useState(false);
  const headerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleScroll = () => {
      if (!headerRef.current) return;
      setIsSticky(headerRef.current.getBoundingClientRect().bottom < 60);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';
  const isPaused = token.status === 'paused';
  const displaySymbol = token.symbol.replace(/^\$+/, '');

  let statusText = 'Bonding';
  let statusBadgeStyle = 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20';
  let statusDotStyle = 'bg-emerald-500';

  if (isGraduated) {
    statusText = 'Graduated';
    statusBadgeStyle = 'bg-purple-500/10 text-purple-700 dark:text-purple-400 border-purple-500/20';
    statusDotStyle = 'bg-purple-500';
  } else if (isPaused) {
    statusText = 'Paused';
    statusBadgeStyle = 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/20';
    statusDotStyle = 'bg-rose-500';
  } else if (progress >= 90) {
    statusText = 'Near Graduation';
    statusBadgeStyle = 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/20';
    statusDotStyle = 'bg-amber-500 animate-pulse';
  } else if (progress <= 0) {
    statusText = 'New';
    statusBadgeStyle = 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/20';
    statusDotStyle = 'bg-blue-500';
  }

  const websiteHref = safeHttpUrl(metadata?.website, true);
  const twitterHref = socialProfileUrl(metadata?.twitter, 'https://x.com/');
  const telegramHref = socialProfileUrl(metadata?.telegram, 'https://t.me/');
  const discordHref = safeHttpUrl(metadata?.discord);

  const copyContract = async () => {
    try {
      await navigator.clipboard.writeText(token.contract_address);
      setCopiedCa(true);
      toast.success('Contract address copied!');
      setTimeout(() => setCopiedCa(false), 2000);
    } catch {
      toast.error('Failed to copy contract address');
    }
  };

  const scrollToTradeTerminal = () => {
    document.getElementById('trading-terminal-panel')?.scrollIntoView({ behavior: 'smooth' });
  };

  const socialActions = (
    <>
      {twitterHref ? (
        <SocialAction href={twitterHref} label="X / Twitter">
          <XLogo size={17} weight="bold" aria-hidden="true" />
        </SocialAction>
      ) : (
        <DisabledSocialAction label="X / Twitter">
          <XLogo size={17} weight="bold" aria-hidden="true" />
        </DisabledSocialAction>
      )}
      {telegramHref && (
        <SocialAction href={telegramHref} label="Telegram">
          <TelegramLogo size={18} weight="fill" aria-hidden="true" />
        </SocialAction>
      )}
      {discordHref && (
        <SocialAction href={discordHref} label="Discord">
          <DiscordLogo size={18} weight="fill" aria-hidden="true" />
        </SocialAction>
      )}
      {websiteHref ? (
        <SocialAction href={websiteHref} label="Website">
          <Globe size={18} weight="bold" aria-hidden="true" />
        </SocialAction>
      ) : (
        <DisabledSocialAction label="Website">
          <Globe size={18} weight="bold" aria-hidden="true" />
        </DisabledSocialAction>
      )}
    </>
  );

  return (
    <>
      <div ref={headerRef} className="card !p-3 sm:!p-4 bg-bg-card border border-bg-border shadow-subtle-1 relative overflow-hidden">
        <div className="hidden md:block">
          <div className="flex items-center justify-between gap-5">
            <div className="flex min-w-0 items-center gap-3.5">
              <TokenArtwork src={token.image} alt={token.name} className="h-14 w-14 flex-shrink-0 rounded-2xl shadow-sm" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="truncate text-xl font-bold leading-none tracking-tight text-text-primary">{token.name}</h1>
                  <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                  <span className="text-xs font-semibold text-text-muted">${displaySymbol}</span>
                  <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${statusBadgeStyle}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${statusDotStyle}`} />
                    {statusText}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                  <span>
                    by{' '}
                    <Link href={`/profile/${token.creator_wallet}`} className="font-mono text-accent-sienna hover:underline">
                      {shortenAddress(token.creator_wallet)}
                    </Link>
                  </span>
                  <span>·</span>
                  <span className="font-medium text-text-secondary">Arc · USDC</span>
                  <span>·</span>
                  <span className="tabular-nums">{totalHolders.toLocaleString()} holders</span>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-4 xl:gap-6">
              <div className="text-right">
                <div className="mb-0.5 text-[11px] font-medium text-text-muted">Price</div>
                <div className="font-mono text-3xl font-bold tracking-tight text-text-primary tabular-nums xl:text-4xl">{formatPrice(token.price)}</div>
              </div>

              <div className="flex max-w-[250px] flex-wrap items-center justify-end gap-2">
                <ShareButton tokenName={token.name} tokenSymbol={displaySymbol} />
                <button
                  onClick={copyContract}
                  className="btn-secondary flex h-9 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium"
                  title="Copy contract address"
                  aria-label="Copy contract address"
                >
                  <Copy size={15} aria-hidden="true" />
                  <span className="font-mono">{copiedCa ? 'Copied!' : shortenAddress(token.contract_address)}</span>
                </button>
                <FavoriteButton tokenAddress={token.contract_address} />
                {socialActions}
              </div>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[auto_auto_auto_minmax(180px,1fr)] items-center gap-5 border-t border-bg-border/70 pt-3 text-xs">
            <div>
              <span className="block text-[10px] font-semibold uppercase text-text-muted">Market cap</span>
              <span className="font-bold text-text-primary tabular-nums">{formatUsdCompact(token.market_cap)}</span>
              <span className={`ml-2 font-semibold tabular-nums ${change24h.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {change24h.isPositive ? '+' : '-'}{Math.abs(change24h.pct).toFixed(2)}%
              </span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase text-text-muted">24h volume</span>
              <span className="font-bold text-text-primary tabular-nums">{formatUsdDirect(token.volume_24h)}</span>
            </div>
            <div>
              <span className="block text-[10px] font-semibold uppercase text-text-muted">24h move</span>
              <span className={`font-semibold tabular-nums ${change24h.isPositive ? 'text-emerald-600' : 'text-rose-600'}`}>
                {change24h.isPositive ? '+' : '-'}{formatUsdCompact(Math.abs(change24h.diff))}
              </span>
            </div>
            <div className="ml-auto flex w-full max-w-sm items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex items-center justify-between gap-3 text-[10px] font-semibold uppercase text-text-muted">
                  <span>{isGraduated ? 'DEX liquidity' : 'Bonding progress'}</span>
                  <span className="text-text-primary tabular-nums">{isGraduated ? 'Graduated' : `${progress.toFixed(0)}%`}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-bg-border">
                  <div className="h-full rounded-full bg-accent-blue transition-all duration-500" style={{ width: `${isGraduated ? 100 : Math.min(100, progress)}%` }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-3 md:hidden">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <TokenArtwork src={token.image} alt={token.name} className="h-11 w-11 flex-shrink-0 rounded-xl" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-1.5">
                  <h1 className="truncate text-base font-bold text-text-primary">{token.name}</h1>
                  <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                  <span className="flex-shrink-0 text-[11px] font-semibold text-text-muted">${displaySymbol}</span>
                </div>
                <div className="mt-0.5 flex items-center gap-1.5 text-[10px] text-text-muted">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 font-medium ${statusBadgeStyle}`}>
                    <span className={`h-1 w-1 rounded-full ${statusDotStyle}`} />
                    {statusText}
                  </span>
                  <span>·</span>
                  <span className="tabular-nums">{totalHolders.toLocaleString()} holders</span>
                </div>
              </div>
            </div>

            <div className="flex flex-shrink-0 items-center gap-1.5">
              <ShareButton tokenName={token.name} tokenSymbol={displaySymbol} />
              <button onClick={copyContract} className="btn-secondary inline-flex h-9 w-9 items-center justify-center rounded-full p-0" title="Copy contract address" aria-label="Copy contract address">
                <Copy size={15} aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-bg-border/70 pt-3">
            <div>
              <div className="text-[10px] font-medium text-text-muted">Price</div>
              <div className="font-mono text-2xl font-bold tracking-tight text-text-primary tabular-nums">{formatPrice(token.price)}</div>
            </div>
            <div className="flex items-center gap-1.5">{socialActions}</div>
          </div>

          <div className="grid grid-cols-3 gap-2 border-t border-bg-border/60 pt-2.5 text-xs">
            <div>
              <span className="block text-[9px] font-semibold uppercase text-text-muted">Market cap</span>
              <span className="font-bold text-text-primary tabular-nums">{formatUsdCompact(token.market_cap)}</span>
            </div>
            <div>
              <span className="block text-[9px] font-semibold uppercase text-text-muted">24h volume</span>
              <span className="font-bold text-text-primary tabular-nums">{formatUsdDirect(token.volume_24h)}</span>
            </div>
            <div className="text-right">
              <span className="block text-[9px] font-semibold uppercase text-text-muted">Bonding</span>
              <span className="font-bold text-text-primary tabular-nums">{isGraduated ? '100%' : `${progress.toFixed(0)}%`}</span>
            </div>
          </div>
        </div>
      </div>

      {isSticky && (
        <div className="fixed left-0 right-0 top-0 z-40 flex items-center justify-between border-b border-bg-border bg-bg-base/95 px-4 py-2.5 shadow-subtle-2 backdrop-blur-md transition-all duration-300">
          <div className="flex min-w-0 items-center gap-3">
            <TokenArtwork src={token.image} alt={token.name} className="h-8 w-8 flex-shrink-0 rounded-lg" />
            <div className="min-w-0">
              <div className="truncate text-xs font-semibold text-text-muted">{token.name} · ${displaySymbol}</div>
              <div className="font-mono text-sm font-bold text-text-primary tabular-nums">{formatPrice(token.price)}</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 sm:flex">
              <ShareButton tokenName={token.name} tokenSymbol={displaySymbol} />
              <button onClick={copyContract} className="btn-secondary inline-flex h-8 items-center gap-1 rounded-full px-2.5 py-1 text-xs">
                <Copy size={14} aria-hidden="true" /> Copy
              </button>
            </div>
            <button onClick={scrollToTradeTerminal} className="btn-primary rounded-full px-3.5 py-1 text-xs font-bold">Trade</button>
          </div>
        </div>
      )}
    </>
  );
});
