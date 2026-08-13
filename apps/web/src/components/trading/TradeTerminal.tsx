'use client';

import { memo } from 'react';
import { TradePanel } from '@/components/TradePanel';
import { Token } from '@/lib/api';

/**
 * TradeTerminal — sleek trading panel container for the professional terminal layout.
 */
export const TradeTerminal = memo(function TradeTerminal({ token }: { token: Token }) {
  return (
    <div className="bg-bg-card lg:h-[500px] lg:min-h-0 lg:max-h-[500px] lg:overflow-hidden">
      <TradePanel token={token} />
    </div>
  );
});
