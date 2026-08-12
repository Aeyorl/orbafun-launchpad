'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, MarketFlowWindow } from '@/lib/api';
import { formatUsdc, formatUsdDirect } from '@/lib/utils';

const WINDOWS: MarketFlowWindow[] = ['5m', '1h', '6h', '24h'];

export function MarketFlowCard({ tokenAddress }: { tokenAddress: string }) {
  const [window, setWindow] = useState<MarketFlowWindow>('24h');
  const { data, isLoading } = useQuery({
    queryKey: ['marketFlow', tokenAddress, window],
    queryFn: () => api.getMarketFlow(tokenAddress, window),
    refetchInterval: 10_000,
  });

  const buyVolume = Number(data?.buy_volume_usdc || 0);
  const sellVolume = Number(data?.sell_volume_usdc || 0);
  const totalVolume = buyVolume + sellVolume;
  const buyShare = totalVolume > 0 ? (buyVolume / totalVolume) * 100 : 50;
  const change = Number(data?.price_change_pct || 0);

  return (
    <section className="card !p-4 space-y-4 overflow-hidden" aria-labelledby="market-flow-title">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Live signal</p>
          <h2 id="market-flow-title" className="font-serif text-xl leading-tight">Market flow</h2>
        </div>
        <div className="flex gap-1" role="tablist" aria-label="Market flow timeframe">
          {WINDOWS.map((item) => (
            <button
              key={item}
              role="tab"
              aria-selected={window === item}
              onClick={() => setWindow(item)}
              className={`rounded-full px-2 py-1 text-[10px] font-semibold transition-colors ${
                window === item ? 'bg-text-primary text-bg-base' : 'text-text-muted hover:bg-bg-hover'
              }`}
            >
              {item}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs text-text-muted">Current market cap</p>
          <p className="text-3xl font-extrabold tracking-tight tabular-nums">
            {isLoading ? '—' : formatUsdDirect(data?.current_market_cap || 0)}
          </p>
        </div>
        <span className={`text-sm font-bold tabular-nums ${change >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)}%
        </span>
      </div>

      <div className="space-y-2" aria-label={`Buy volume ${buyShare.toFixed(0)} percent, sell volume ${(100 - buyShare).toFixed(0)} percent`}>
        <div className="flex h-2 overflow-hidden rounded-full bg-bg-input">
          <div className="bg-emerald-500 transition-[width]" style={{ width: `${buyShare}%` }} />
          <div className="bg-rose-500 transition-[width]" style={{ width: `${100 - buyShare}%` }} />
        </div>
        <div className="flex justify-between text-[11px] font-medium">
          <span className="text-emerald-700">BUY {buyShare.toFixed(0)}%</span>
          <span className="text-rose-700">SELL {(100 - buyShare).toFixed(0)}%</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-bg-border pt-3 text-xs">
        <Metric label="Buys" value={`${data?.buy_count || 0} · ${formatUsdc(data?.buy_volume_usdc || 0)}`} />
        <Metric label="Sells" value={`${data?.sell_count || 0} · ${formatUsdc(data?.sell_volume_usdc || 0)}`} />
        <Metric label="Unique buyers" value={String(data?.unique_buyers || 0)} />
        <Metric label="Unique sellers" value={String(data?.unique_sellers || 0)} />
        <Metric label="All-time high" value={formatUsdDirect(data?.all_time_high || 0)} />
        <Metric label="Window" value={window.toUpperCase()} />
      </div>

      <p className="text-[11px] leading-relaxed text-text-muted">
        Direction follows trade size, ordering, and available liquidity—not trade count alone.
      </p>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-text-muted">{label}</p>
      <p className="font-semibold tabular-nums text-text-primary">{value}</p>
    </div>
  );
}
