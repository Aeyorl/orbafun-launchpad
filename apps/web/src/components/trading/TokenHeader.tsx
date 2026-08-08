'use client';

import { memo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Token } from '@/lib/api';
import { ARC_EXPLORER_URL } from '@/lib/config';
import { FavoriteButton } from '@/components/FavoriteButton';
import { AgentBadge } from '@/components/AgentBadge';
import {
  formatMarketCap,
  formatPrice,
  formatUsdCompact,
  formatUsdDirect,
  shortenAddress,
  bondingCurveProgress,
  tokenEmoji,
  ipfsToGateway,
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
  const [shareOpen, setShareOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [copiedCa, setCopiedCa] = useState(false);
  const [isSticky, setIsSticky] = useState(false);

  const headerRef = useRef<HTMLDivElement>(null);

  // Monitor scroll position to toggle collapsed sticky header
  useEffect(() => {
    const handleScroll = () => {
      if (!headerRef.current) return;
      const rect = headerRef.current.getBoundingClientRect();
      // Activate sticky bar when main header scrolls out of top view
      setIsSticky(rect.bottom < 60);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';
  const isPaused = token.status === 'paused';

  // Dynamic lifecycle status derivation
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

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${token.name} ($${token.symbol}) — Orba`,
          text: `Check out $${token.symbol} on Orba launchpad!`,
          url,
        });
      } catch {
        // User cancelled
      }
    } else {
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Token link copied to clipboard!');
      } catch {
        toast.error('Failed to copy link');
      }
    }
  };

  const shareUrl = typeof window !== 'undefined' ? window.location.href : '';
  const tweetText = `Check out $${token.symbol} on Orba — ${shareUrl}`;
  const tweetUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`;

  const scrollToTradeTerminal = () => {
    const el = document.getElementById('trading-terminal-panel');
    el?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <>
      {/* Primary Header Card */}
      <div
        ref={headerRef}
        className="card !p-4 sm:!p-5 space-y-4 bg-bg-card border border-bg-border shadow-subtle-1 relative overflow-hidden"
      >
        {/* DESKTOP LAYOUT (md and up) */}
        <div className="hidden md:block space-y-4">
          {/* ROW 1: Identity + Bonding Progress + Actions */}
          <div className="flex items-center justify-between gap-4">
            {/* Token Identity */}
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-bg-base border border-bg-border flex items-center justify-center text-xl overflow-hidden flex-shrink-0 shadow-sm">
                {token.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ipfsToGateway(token.image)}
                    alt={token.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  tokenEmoji(token.symbol)
                )}
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h1 className="font-bold text-lg text-text-primary tracking-tight leading-none">
                    {token.name}
                  </h1>
                  <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                  <span className="text-xs font-semibold text-text-muted">
                    ${token.symbol}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium border ${statusBadgeStyle}`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${statusDotStyle}`} />
                    {statusText}
                  </span>
                </div>

                <div className="flex items-center gap-2 text-xs text-text-muted pt-0.5">
                  <span>
                    by{' '}
                    {token.is_agent === 'true' && token.agent_uuid ? (
                      <Link
                        href={`/agents/${token.agent_uuid}`}
                        className="font-mono text-indigo-500 hover:text-indigo-400 hover:underline"
                      >
                        {token.agent_name || 'AI Agent'}
                      </Link>
                    ) : (
                      <Link
                        href={`/profile/${token.creator_wallet}`}
                        className="font-mono text-accent-sienna hover:underline"
                      >
                        {shortenAddress(token.creator_wallet)}
                      </Link>
                    )}
                  </span>
                  <span>·</span>
                  <span className="font-medium text-text-secondary">Arc · USDC</span>
                </div>
              </div>
            </div>

            {/* Bonding Curve Header Status Indicator */}
            <div className="flex items-center gap-4 bg-bg-base/70 px-3.5 py-2 rounded-xl border border-bg-border">
              <div className="text-right">
                <div className="text-[11px] font-medium text-text-muted">
                  {isGraduated ? 'DEX Liquidity' : 'Bonding Status'}
                </div>
                <div className="text-xs font-bold text-text-primary tabular-nums">
                  {isGraduated ? 'Graduated ✓' : `Bonding ${progress.toFixed(0)}%`}
                </div>
              </div>

              {!isGraduated && (
                <div className="w-24 h-2 bg-bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent-blue transition-all duration-500 rounded-full"
                    style={{ width: `${Math.min(100, progress)}%` }}
                  />
                </div>
              )}
            </div>

            {/* Actions: Copy, Share, Watch, More */}
            <div className="flex items-center gap-2">
              {/* Copy Contract */}
              <button
                onClick={copyContract}
                className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium rounded-full"
                title="Copy contract address"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="13"
                  height="13"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                <span>{copiedCa ? 'Copied!' : 'Copy'}</span>
              </button>

              {/* Share */}
              <div className="relative">
                <button
                  onClick={() => setShareOpen((v) => !v)}
                  className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1.5 font-medium rounded-full"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
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
                        <span>🔗</span> Copy link / Share
                      </button>
                      <a
                        href={tweetUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setShareOpen(false)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2 block"
                      >
                        <span>𝕏</span> Post on X
                      </a>
                    </div>
                  </>
                )}
              </div>

              {/* Watchlist Star */}
              <FavoriteButton tokenAddress={token.contract_address} />

              {/* More Actions Menu (⋮) */}
              <div className="relative">
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  className="btn-secondary text-xs px-2.5 py-1.5 font-bold rounded-full"
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
                          copyContract();
                          setMoreOpen(false);
                        }}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2"
                      >
                        📋 Copy contract address
                      </button>
                      <a
                        href={`${ARC_EXPLORER_URL}/address/${token.contract_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() => setMoreOpen(false)}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2 block"
                      >
                        ↗ View on ArcScan
                      </a>
                      {onSelectInfoTab && (
                        <button
                          onClick={() => {
                            onSelectInfoTab();
                            setMoreOpen(false);
                          }}
                          className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium flex items-center gap-2"
                        >
                          ℹ️ Token details & info
                        </button>
                      )}
                      <button
                        onClick={() => {
                          toast.success('Report submitted to moderators');
                          setMoreOpen(false);
                        }}
                        className="w-full text-left text-xs px-3 py-2 rounded-lg hover:bg-bg-hover transition-colors font-medium text-rose-500 flex items-center gap-2"
                      >
                        🚩 Report token
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* ROW 2: Market cap as Hero Metric + Inline Supporting Data */}
          <div className="pt-2 flex items-baseline justify-between gap-6 border-t border-bg-border/60">
            {/* Market Cap Hero */}
            <div>
              <div className="mb-0.5 text-xs font-medium text-text-muted">Market cap.</div>
              <div className="flex items-baseline gap-3">
                <span className="text-3xl font-extrabold tracking-tight text-text-primary tabular-nums">
                  {formatUsdCompact(token.market_cap)}
                </span>
                <span
                  className={`text-sm font-semibold tabular-nums ${
                    change24h.isPositive ? 'text-emerald-500' : 'text-rose-500'
                  }`}
                >
                  {change24h.isPositive ? '+' : '-'}
                  {formatUsdCompact(Math.abs(change24h.diff))} ({change24h.isPositive ? '+' : '-'}
                  {Math.abs(change24h.pct).toFixed(2)}%) <span className="text-text-muted">/ 24hr</span>
                </span>
              </div>
            </div>

            {/* Supporting Metrics Inline */}
            <div className="flex items-center gap-6 text-xs text-text-muted">
              <div>
                <span className="block text-[10px] uppercase font-semibold text-text-muted">Token Price</span>
                <span className="font-mono font-bold text-sm text-text-primary tabular-nums">
                  {formatPrice(token.price)}
                </span>
              </div>
              <div className="h-6 w-px bg-bg-border" />
              <div>
                <span className="block text-[10px] uppercase font-semibold text-text-muted">24h Volume</span>
                <span className="font-bold text-sm text-text-primary tabular-nums">
                  {formatUsdDirect(token.volume_24h)}
                </span>
              </div>
              <div className="h-6 w-px bg-bg-border" />
              <div>
                <span className="block text-[10px] uppercase font-semibold text-text-muted">Holders</span>
                <span className="font-bold text-sm text-text-primary tabular-nums">
                  {totalHolders}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE LAYOUT (sm and down) */}
        <div className="md:hidden space-y-3">
          {/* Top Identity Row */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-bg-base border border-bg-border flex items-center justify-center text-lg overflow-hidden flex-shrink-0">
                {token.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ipfsToGateway(token.image)}
                    alt={token.name}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                ) : (
                  tokenEmoji(token.symbol)
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 truncate">
                  <span className="font-bold text-base text-text-primary truncate">{token.name}</span>
                  <AgentBadge agentUuid={token.agent_uuid} agentName={token.agent_name} />
                  <span className="text-xs text-text-muted font-medium flex-shrink-0">${token.symbol}</span>
                </div>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded-full text-[10px] font-medium border ${statusBadgeStyle}`}>
                    <span className={`w-1 h-1 rounded-full ${statusDotStyle}`} />
                    {statusText}
                  </span>
                  <span className="text-[10px] text-text-muted truncate">
                    by{' '}
                    {token.is_agent === 'true' && token.agent_uuid ? (
                      <Link
                        href={`/agents/${token.agent_uuid}`}
                        className="text-indigo-500 hover:text-indigo-400 transition-colors"
                      >
                        {token.agent_name || 'AI Agent'}
                      </Link>
                    ) : (
                      <Link
                        href={`/profile/${token.creator_wallet}`}
                        className="hover:text-text-primary transition-colors"
                      >
                        {shortenAddress(token.creator_wallet)}
                      </Link>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Mobile Actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={handleShare}
                className="btn-secondary text-xs p-2 rounded-full"
                title="Share token"
              >
                ↗
              </button>
              <button
                onClick={copyContract}
                className="btn-secondary text-xs p-2 rounded-full"
                title="Copy contract"
              >
                📋
              </button>
            </div>
          </div>

          {/* Market Cap Block */}
          <div className="flex items-baseline justify-between gap-2 pt-1 border-t border-bg-border/60">
            <div>
              <div className="text-[10px] font-medium text-text-muted">Market cap.</div>
              <div className="text-2xl font-extrabold text-text-primary tabular-nums">
                {formatUsdCompact(token.market_cap)}
              </div>
              <div
                className={`text-xs font-semibold tabular-nums inline-block ${
                  change24h.isPositive ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {change24h.isPositive ? '+' : '-'}
                {formatUsdCompact(Math.abs(change24h.diff))} ({change24h.isPositive ? '+' : '-'}
                {Math.abs(change24h.pct).toFixed(2)}%) / 24hr
              </div>
            </div>

            <div className="text-right text-xs">
              <div className="text-text-muted text-[10px]">Price / Vol</div>
              <div className="font-mono font-bold text-text-primary tabular-nums">
                {formatPrice(token.price)}
              </div>
              <div className="text-text-muted text-[11px] tabular-nums">
                Vol {formatUsdDirect(token.volume_24h)}
              </div>
            </div>
          </div>

          {/* Bonding curve status bar */}
          <div className="bg-bg-base p-2.5 rounded-xl border border-bg-border space-y-1.5">
            <div className="flex justify-between items-center text-xs">
              <span className="font-medium text-text-muted">Bonding Curve</span>
              <span className="font-bold text-accent-blue tabular-nums">
                {isGraduated ? '100% (Graduated)' : `${progress.toFixed(1)}%`}
              </span>
            </div>
            <div className="w-full h-2 bg-bg-border rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-blue transition-all duration-500 rounded-full"
                style={{ width: `${isGraduated ? 100 : progress}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* COLLAPSED STICKY HEADER (Appears on scroll) */}
      {isSticky && (
        <div className="fixed top-0 left-0 right-0 z-40 bg-bg-base/95 backdrop-blur-md border-b border-bg-border py-2.5 px-4 shadow-subtle-2 transition-all duration-300 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-bg-card border border-bg-border flex items-center justify-center text-sm overflow-hidden flex-shrink-0">
              {token.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ipfsToGateway(token.image)}
                  alt={token.symbol}
                  className="w-full h-full object-cover"
                />
              ) : (
                tokenEmoji(token.symbol)
              )}
            </div>
            <div className="flex items-baseline gap-2">
              <span className="font-bold text-sm text-text-primary">${token.symbol}</span>
              <span className="text-sm font-extrabold text-text-primary tabular-nums">
                {formatUsdCompact(token.market_cap)} MC
              </span>
              <span
                className={`text-xs font-semibold tabular-nums hidden sm:inline ${
                  change24h.isPositive ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {change24h.isPositive ? '+' : ''}
                {change24h.pct.toFixed(2)}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={copyContract}
              className="btn-secondary text-xs px-2.5 py-1 rounded-full hidden sm:flex items-center gap-1"
            >
              📋 Copy
            </button>
            <button
              onClick={handleShare}
              className="btn-secondary text-xs px-2.5 py-1 rounded-full"
            >
              ↗ Share
            </button>
            <button
              onClick={scrollToTradeTerminal}
              className="btn-primary text-xs px-3.5 py-1 font-bold rounded-full"
            >
              Trade
            </button>
          </div>
        </div>
      )}
    </>
  );
});
