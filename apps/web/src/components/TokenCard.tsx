'use client';

import Link from 'next/link';
import { Token } from '@/lib/api';
import {
  formatUsdc,
  formatUsdDirect,
  formatMarketCap,
  bondingCurveProgress,
  shortenAddress,
  tokenEmoji,
  timeAgo,
  ipfsToGateway,
} from '@/lib/utils';

/**
 * TokenCard — displays a token in the grid with bonding curve progress.
 * Links to the coin page on click.
 */
export function TokenCard({ token }: { token: Token }) {
  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';

  return (
    <Link href={`/trade/${token.contract_address}`} className="card card-hover group">
      {/* Header: emoji + name + status badge */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-full bg-bg-input flex items-center justify-center text-xl">
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
            <div className="font-semibold text-sm group-hover:text-accent-green transition-colors">
              {token.name}
            </div>
            <div className="text-xs text-text-muted">${token.symbol}</div>
          </div>
        </div>
        {isGraduated ? (
          <span className="badge-purple">DEX</span>
        ) : progress > 75 ? (
          <span className="badge-orange">Near</span>
        ) : (
          <span className="badge-green">Active</span>
        )}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 mb-3 text-xs">
        <div>
          <div className="text-text-muted">Market Cap</div>
          <div className="font-semibold tabular-nums">
            {formatMarketCap(token.market_cap)}
          </div>
        </div>
        <div>
          <div className="text-text-muted">Volume 24h</div>
          <div className="font-semibold tabular-nums">
            {formatUsdc(token.volume_24h)}
          </div>
        </div>
      </div>

      {/* Bonding curve progress */}
      <div className="mb-2">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-text-muted">Bonding curve</span>
          <span className="font-semibold tabular-nums">
            {isGraduated ? '100%' : `${progress.toFixed(0)}%`}
          </span>
        </div>
        <div className="progress-bar">
          <div
            className={`progress-fill ${isGraduated ? 'from-accent-purple to-accent-blue' : ''}`}
            style={{ width: `${isGraduated ? 100 : progress}%` }}
          />
        </div>
      </div>

      {/* Footer: creator + time */}
      <div className="flex items-center justify-between text-xs text-text-muted">
        <span>by {shortenAddress(token.creator_wallet)}</span>
        <span>{timeAgo(token.created_at)}</span>
      </div>
    </Link>
  );
}
