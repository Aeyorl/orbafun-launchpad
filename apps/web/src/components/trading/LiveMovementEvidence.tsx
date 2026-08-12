'use client';

import type { LiveMarketMove } from '@/hooks/useCandles';
import { formatMarketCap, formatPrice, formatUsdDirect } from '@/lib/utils';
import { MetricMode } from './ChartToolbar';

export function LiveMovementEvidence({
  move,
  metricMode,
}: {
  move?: LiveMarketMove | null;
  metricMode: MetricMode;
}) {
  if (!move) {
    return (
      <span className="truncate text-[10px] text-[#66728a]">
        Awaiting market move
      </span>
    );
  }

  const displayedValue = metricMode === 'price'
    ? formatPrice(move.price)
    : formatMarketCap(move.marketCap);
  const sideLabel = move.side === 'buy' ? 'Buy' : 'Sell';

  return (
    <span
      className="inline-flex max-w-full animate-pulse items-center gap-1.5 overflow-hidden text-[10px] font-medium"
      aria-live="polite"
      aria-label={`${sideLabel} moved the chart to ${displayedValue} on ${formatUsdDirect(move.volume)} volume`}
    >
      <span className={move.side === 'buy' ? 'text-emerald-400' : 'text-red-400'}>
        {sideLabel} moved chart
      </span>
      <span className="truncate font-mono text-white">{displayedValue}</span>
      <span className="hidden text-[#66728a] md:inline">· {formatUsdDirect(move.volume)}</span>
    </span>
  );
}
