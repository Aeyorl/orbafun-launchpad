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
    <div className="overflow-hidden border-b border-accent-blue/25 bg-accent-blue text-white" aria-label="Live token ticker" role="status">
      <div className="mx-auto flex max-w-[1440px] items-center gap-4 overflow-x-auto px-4 py-2 font-mono scrollbar-none lg:px-6">
        <span className="flex items-center gap-2 whitespace-nowrap text-[10px] font-bold tracking-[0.14em] text-[#f6dc55]" aria-hidden="true">
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
    <span className={`flex whitespace-nowrap text-[10px] font-semibold tracking-[0.06em] text-white`}>
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
