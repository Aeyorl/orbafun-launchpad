'use client';

import { memo } from 'react';
import { TradePanel } from '@/components/TradePanel';
import { Token } from '@/lib/api';

/**
 * TradeTerminal — sleek trading panel container for the professional terminal layout.
 */
export const TradeTerminal = memo(function TradeTerminal({ token }: { token: Token }) {
  return (
    <div className="h-full bg-bg-card">
      <TradePanel token={token} />
    </div>
  );
});
