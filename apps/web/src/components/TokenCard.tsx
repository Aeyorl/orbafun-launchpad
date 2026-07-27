'use client';

import Link from 'next/link';
import { Token } from '@/lib/api';
import {
  formatUsdc,
  formatMarketCap,
  bondingCurveProgress,
  shortenAddress,
  tokenEmoji,
  timeAgo,
  ipfsToGateway,
} from '@/lib/utils';

export function TokenCard({ token }: { token: Token }) {
  const progress = bondingCurveProgress(token.market_cap);
  const isGraduated = token.status === 'graduated';
  const remainingForGraduation = Math.max(0, 30000 - parseFloat(token.market_cap || '4000'));
  
  // Real percentage gain calculated from starting $4,000 market cap
  const mcapNum = parseFloat(token.market_cap || '4000');
  const pctChange = mcapNum > 4000 ? ((mcapNum - 4000) / 4000) * 100 : 0;
  const isPositive = pctChange >= 0;

  return (
    <Link
      href={`/trade/${token.contract_address}`}
      className="card bg-bg-card border border-bg-border shadow-subtle-1 hover:border-accent-blue/50 hover:shadow-subtle-2 transition-all p-4 rounded-2xl flex flex-col justify-between group"
    >
      <div>
        {/* Header: avatar + symbol + status badge */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-bg-base border border-bg-border flex items-center justify-center text-xl overflow-hidden flex-shrink-0 shadow-xs">
              {token.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={ipfsToGateway(token.image)}
                  alt={token.symbol}
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
              <div className="font-bold text-sm text-text-primary group-hover:text-accent-blue transition-colors truncate">
                {token.name}
              </div>
              <div className="text-xs text-text-muted font-medium">${token.symbol}</div>
            </div>
          </div>

          {isGraduated ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
              Graduated 🎓
            </span>
          ) : progress > 75 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
              🔥 Near Grad
            </span>
          ) : progress <= 0 ? (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
              <span className="w-1 h-1 rounded-full bg-blue-500" />
              New
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
              <span className="w-1 h-1 rounded-full bg-emerald-500" />
              Bonding
            </span>
          )}
        </div>

        {/* Price & Market Cap Grid */}
        <div className="grid grid-cols-2 gap-2 mb-3 bg-bg-input p-2.5 rounded-xl border border-bg-border/60 text-xs font-mono">
          <div>
            <div className="text-[10px] text-text-muted">Market Cap</div>
            <div className="font-bold text-text-primary">{formatMarketCap(token.market_cap)}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-text-muted">24h Vol</div>
            <div className="font-bold text-text-primary">{formatUsdc(token.volume_24h)}</div>
          </div>
        </div>

        {/* Real Gain Trend SVG */}
        <div className="flex items-center justify-between mb-3 text-[11px]">
          <span className={`font-mono font-bold ${isPositive ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {isPositive ? '+' : ''}{pctChange.toFixed(2)}%
          </span>
          <svg className="w-16 h-5" viewBox="0 0 60 20" fill="none">
            <path
              d={isPositive ? "M2 16 L18 12 L34 14 L50 4 L58 6" : "M2 4 L18 10 L34 8 L50 16 L58 14"}
              stroke={isPositive ? "#10B981" : "#EF4444"}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        {/* Bonding Curve Progress */}
        <div className="space-y-1 mb-3">
          <div className="flex justify-between items-center text-[11px] font-mono">
            <span className="text-text-muted">Bonding Progress</span>
            <span className="font-bold text-accent-blue">{isGraduated ? '100%' : `${progress.toFixed(0)}%`}</span>
          </div>
          <div className="w-full h-1.5 bg-bg-border rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                isGraduated ? 'bg-purple-500' : 'bg-accent-blue'
              }`}
              style={{ width: `${isGraduated ? 100 : Math.min(100, progress)}%` }}
            />
          </div>
          {!isGraduated && (
            <div className="text-[10px] text-text-muted text-right font-mono">
              ${(remainingForGraduation / 1000).toFixed(1)}K to $30K DEX
            </div>
          )}
        </div>
      </div>

      {/* Footer info */}
      <div className="pt-2 border-t border-bg-border/60 flex items-center justify-between text-[11px] text-text-muted font-mono">
        <span>by {shortenAddress(token.creator_wallet)}</span>
        <span>{timeAgo(token.created_at)}</span>
      </div>
    </Link>
  );
}
