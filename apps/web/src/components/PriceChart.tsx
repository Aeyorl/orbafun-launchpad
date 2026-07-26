'use client';

import { useState, useMemo } from 'react';
import { XAxis, YAxis, Tooltip, ResponsiveContainer, Area, AreaChart } from 'recharts';
import { Trade } from '@/lib/api';
import { formatUsdDirect, formatMarketCap, formatPrice, timeAgo } from '@/lib/utils';

type Timeframe = '5m' | '15m' | '1h' | '6h' | '24h' | 'all';

const TIMEFRAMES: { key: Timeframe; label: string; ms: number }[] = [
  { key: '5m', label: '5m', ms: 5 * 60_000 },
  { key: '15m', label: '15m', ms: 15 * 60_000 },
  { key: '1h', label: '1h', ms: 60 * 60_000 },
  { key: '6h', label: '6h', ms: 6 * 60 * 60_000 },
  { key: '24h', label: '24h', ms: 24 * 60 * 60_000 },
  { key: 'all', label: 'All', ms: Infinity },
];

/**
 * PriceChart — area chart of market cap over time, sourced from trades.
 * Uses recharts for rendering. Supports timeframe filtering (5m → All).
 */
export function PriceChart({ trades }: { trades: Trade[] }) {
  const [timeframe, setTimeframe] = useState<Timeframe>('all');

  // Filter trades by timeframe, then sort chronologically.
  const data = useMemo(() => {
    if (trades.length === 0) return [];
    const tf = TIMEFRAMES.find((t) => t.key === timeframe)!;
    const now = Date.now();
    const cutoff = tf.ms === Infinity ? 0 : now - tf.ms;
    const filtered = trades.filter(
      (t) => new Date(t.timestamp).getTime() >= cutoff,
    );
    // Always include at least the first trade so the chart isn't empty
    // when the timeframe is too narrow.
    if (filtered.length === 0 && trades.length > 0) {
      const sortedAll = [...trades].sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      );
      return [sortedAll[0]].map((t) => ({
        time: new Date(t.timestamp).getTime(),
        marketCap: Number(t.market_cap_after),
        price: Number(t.price),
        type: t.type,
      }));
    }
    return [...filtered]
      .sort(
        (a, b) =>
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
      )
      .map((t) => ({
        time: new Date(t.timestamp).getTime(),
        marketCap: Number(t.market_cap_after),
        price: Number(t.price),
        type: t.type,
      }));
  }, [trades, timeframe]);

  if (trades.length === 0) {
    return (
      <div className="card h-64 flex items-center justify-center text-text-muted">
        No trades yet — be the first to buy!
      </div>
    );
  }

  const minMcap = Math.min(...data.map((d) => d.marketCap));
  const maxMcap = Math.max(...data.map((d) => d.marketCap));
  const padding = (maxMcap - minMcap) * 0.1 || 1000;

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="font-semibold">Price Chart</h3>
        <div className="flex items-center gap-1" role="tablist" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.key}
              role="tab"
              aria-selected={timeframe === tf.key}
              onClick={() => setTimeframe(tf.key)}
              className={`px-2 py-1 text-xs rounded transition-colors ${
                timeframe === tf.key
                  ? 'bg-accent-green/20 text-accent-green'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-hover'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="text-xs text-text-muted mb-2">
        {data.length} trades · MC {formatMarketCap(data[data.length - 1].marketCap)}
      </div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="colorMcap" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#5d2a1a" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#5d2a1a" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="time"
            tickFormatter={(t) => timeAgo(t)}
            tick={{ fill: '#979799', fontSize: 11 }}
            axisLine={{ stroke: '#ececec' }}
            tickLine={false}
          />
          <YAxis
            domain={[minMcap - padding, maxMcap + padding]}
            tickFormatter={(v) => formatUsdDirect(v)}
            tick={{ fill: '#979799', fontSize: 11 }}
            axisLine={{ stroke: '#ececec' }}
            tickLine={false}
            width={60}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: '#ffffff',
              border: '1px solid #ececec',
              borderRadius: '0px',
              fontSize: '12px',
              color: '#17191c',
              boxShadow: '0 0 0 1px rgba(4, 23, 43, 0.05), 0 8px 40px 0 rgba(0, 0, 0, 0.1)',
            }}
            labelFormatter={(t) => new Date(t as number).toLocaleString()}
            formatter={(value: number, name: string) => [
              name === 'marketCap' ? formatMarketCap(value) : formatPrice(value),
              name === 'marketCap' ? 'Market Cap' : 'Price',
            ]}
          />
          <Area
            type="monotone"
            dataKey="marketCap"
            stroke="#5d2a1a"
            strokeWidth={2}
            fill="url(#colorMcap)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
