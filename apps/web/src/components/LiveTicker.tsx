'use client';

import { useTokenEvents } from '@/lib/useWebSocket';
import { useState, useCallback } from 'react';
import { formatUsdc, formatUsdDirect, shortenAddress, tokenEmoji } from '@/lib/utils';
import { TokenEvent } from '@/lib/useWebSocket';

interface TickerItem {
  event: TokenEvent;
  id: string;
}

/**
 * LiveTicker — scrolling ticker of real-time token events.
 * Shown at the top of every page (below navbar).
 * Subscribes to the global WebSocket channel.
 */
export function LiveTicker() {
  const [items, setItems] = useState<TickerItem[]>([]);

  const handleEvent = useCallback((event: TokenEvent) => {
    setItems((prev) => {
      const next = [{ event, id: `${event.timestamp}-${Math.random()}` }, ...prev];
      return next.slice(0, 20); // keep last 20 events
    });
  }, []);

  useTokenEvents(null, handleEvent);

  if (items.length === 0) return null;

  return (
    <div className="border-b border-bg-border bg-bg-card/50 overflow-hidden" aria-label="Live token ticker" role="status">
      <div className="max-w-7xl mx-auto px-4 py-1.5 flex items-center gap-2 overflow-x-auto scrollbar-none">
        <span className="text-accent-green text-xs font-semibold whitespace-nowrap flex items-center gap-1" aria-hidden="true">
          <span className="inline-block w-2 h-2 rounded-full bg-accent-green animate-pulse" />
          LIVE
        </span>
        {items.slice(0, 8).map((item) => (
          <TickerEntry key={item.id} event={item.event} />
        ))}
      </div>
    </div>
  );
}

function TickerEntry({ event }: { event: TokenEvent }) {
  const isBuy = event.type === 'NEW_BUY';
  const isSell = event.type === 'NEW_SELL';
  const isToken = event.type === 'NEW_TOKEN';
  const isGrad = event.type === 'TOKEN_GRADUATED';

  const color = isBuy
    ? 'text-accent-green'
    : isSell
    ? 'text-accent-red'
    : isGrad
    ? 'text-accent-purple'
    : 'text-accent-blue';

  const label = isBuy
    ? 'BUY'
    : isSell
    ? 'SELL'
    : isGrad
    ? 'GRAD'
    : 'NEW';

  const symbol = event.data?.symbol || event.data?.name?.slice(0, 4) || '???';
  const amount = event.data?.usdc_amount
    ? formatUsdc(event.data.usdc_amount)
    : event.data?.market_cap
    ? formatUsdDirect(event.data.market_cap)
    : '';

  return (
    <span className={`text-xs whitespace-nowrap ${color} flex items-center gap-1`}>
      <span className="font-semibold">{label}</span>
      <span className="text-text-muted">·</span>
      <span>{tokenEmoji(symbol)}</span>
      <span className="font-medium">{symbol}</span>
      {amount && (
        <>
          <span className="text-text-muted">·</span>
          <span className="tabular-nums">{amount}</span>
        </>
      )}
    </span>
  );
}
