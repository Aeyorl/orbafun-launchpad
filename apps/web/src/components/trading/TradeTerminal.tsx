'use client';

import { memo } from 'react';
import { TradePanel } from '@/components/TradePanel';
import { Token } from '@/lib/api';

/**
 * TradeTerminal — sleek trading panel container for the professional terminal layout.
 */
export const TradeTerminal = memo(function TradeTerminal({ token }: { token: Token }) {
  return (
    <div className="terminal-panel bg-bg-card border border-bg-border h-full flex flex-col justify-between">
      <TradePanel token={token} />
    </div>
  );
});
