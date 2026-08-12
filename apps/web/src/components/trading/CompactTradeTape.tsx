'use client';

import { Trade } from '@/lib/api';
import { formatTokens, formatUsdc, shortenAddress, timeAgo } from '@/lib/utils';

export function CompactTradeTape({ trades, symbol }: { trades: Trade[]; symbol: string }) {
  const recent = trades.slice(0, 10);

  return (
    <section className="card !p-0 overflow-hidden h-full min-h-[300px]" aria-labelledby="live-tape-title">
      <div className="flex items-center justify-between border-b border-bg-border px-3 py-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Streaming</p>
          <h2 id="live-tape-title" className="font-semibold text-sm">Live trades</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> Live
        </span>
      </div>

      {recent.length === 0 ? (
        <div className="flex min-h-56 items-center justify-center px-5 text-center text-xs leading-relaxed text-text-muted">
          No trades yet. The first confirmed buy or sell will appear here.
        </div>
      ) : (
        <ol className="divide-y divide-bg-border/70" aria-live="off">
          {recent.map((trade) => {
            const isBuy = trade.type === 'buy';
            return (
              <li key={`${trade.tx_hash}-${trade.log_index}`} className="px-3 py-2.5 hover:bg-bg-hover">
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-[10px] font-extrabold tracking-wide ${isBuy ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {isBuy ? 'BUY' : 'SELL'}
                  </span>
                  <time className="text-[10px] text-text-muted" dateTime={trade.timestamp}>{timeAgo(trade.timestamp)}</time>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <span className="font-semibold text-xs tabular-nums">{formatUsdc(trade.usdc_amount)}</span>
                  <span className="truncate font-mono text-[10px] text-text-muted">{shortenAddress(trade.wallet)}</span>
                </div>
                <p className="mt-0.5 truncate text-[10px] text-text-muted tabular-nums">
                  {formatTokens(trade.token_amount)} {symbol}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
