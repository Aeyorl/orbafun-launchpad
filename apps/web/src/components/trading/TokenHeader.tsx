'use client';

import { memo } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { Token } from '@/lib/api';
import {
  formatMarketCap,
  formatPrice,
  formatUsdc,
  shortenAddress,
  bondingCurveProgress,
  tokenEmoji,
  ipfsToGateway,
} from '@/lib/utils';

/**
 * TokenHeader — compact horizontal header for the trading terminal.
 * Single row: image + name + symbol + CA + key stats inline.
 */
export const TokenHeader = memo(function TokenHeader({
  token,
  change24h,
  totalHolders,
}: {
  token: Token;
  change24h: { pct: number; isPositive: boolean };
  totalHolders: number;
}) {
  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';

  return (
    <div className="terminal-panel bg-bg-card border-b border-bg-border">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Token identity */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-bg-input flex items-center justify-center text-lg overflow-hidden flex-shrink-0">
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
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm text-text-primary">{token.name}</span>
              <span className="text-xs text-text-muted">${token.symbol}</span>
              {isGraduated ? (
                <span className="badge-purple text-[10px]">DEX</span>
              ) : (
                <span className="badge-green text-[10px]">Active</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono text-text-muted truncate max-w-[120px]">
                {token.contract_address}
              </span>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(token.contract_address);
                  toast.success('CA copied!', { id: 'copy-ca', duration: 1200 });
                }}
                className="text-text-muted hover:text-text-primary transition-colors"
                title="Copy contract address"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
              <a
                href={`https://testnet.arcscan.app/address/${token.contract_address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-text-muted hover:text-accent-blue transition-colors"
                title="View on ArcScan"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px h-8 bg-bg-border" />

        {/* Stats row */}
        <div className="flex items-center gap-4 flex-wrap text-xs">
          <StatItem label="Price" value={formatPrice(token.price)} />
          <StatItem label="Market Cap" value={formatMarketCap(token.market_cap)} />
          <StatItem
            label="24h"
            value={`${change24h.isPositive ? '+' : ''}${change24h.pct.toFixed(2)}%`}
            className={change24h.isPositive ? 'text-green-500' : 'text-red-500'}
          />
          <StatItem label="Vol 24h" value={formatUsdc(token.volume_24h)} />
          <StatItem label="Holders" value={String(totalHolders)} />

          {/* Bonding curve mini progress */}
          {!isGraduated && (
            <div className="flex items-center gap-1.5">
              <span className="text-text-muted">Curve</span>
              <div className="w-16 h-1.5 bg-bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-accent-blue transition-all"
                  style={{ width: `${Math.min(100, progress)}%` }}
                />
              </div>
              <span className="text-text-primary font-medium tabular-nums">{progress.toFixed(0)}%</span>
            </div>
          )}
        </div>

        {/* Creator link */}
        <div className="hidden lg:flex items-center gap-1 ml-auto text-xs text-text-muted">
          <span>by</span>
          <Link
            href={`/profile/${token.creator_wallet}`}
            className="text-accent-blue hover:underline font-mono"
          >
            {shortenAddress(token.creator_wallet)}
          </Link>
        </div>
      </div>
    </div>
  );
});

function StatItem({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-text-muted">{label}</span>
      <span className={`font-semibold tabular-nums text-text-primary ${className}`}>{value}</span>
    </div>
  );
}
