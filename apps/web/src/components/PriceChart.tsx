'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickSeries, ColorType, createChart, HistogramSeries } from 'lightweight-charts';
import type { CandlestickData, HistogramData, IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts';

type ChartTrade = {
  created_at: string;
  block_height: number;
  event_index: number;
  usdc_amount: string;
  token_amount: string;
};

const intervals = [['1m', 60], ['5m', 300], ['15m', 900], ['1h', 3600], ['1D', 86400]] as const;

export default function PriceChart({ trades }: { trades: ChartTrade[] }) {
  const [bucket, setBucket] = useState<number>(300);
  const container = useRef<HTMLDivElement>(null);
  const series = useRef<{ chart: IChartApi; price: ISeriesApi<'Candlestick'>; volume: ISeriesApi<'Histogram'> } | null>(null);
  const bars = useMemo(() => {
    const groups = new Map<UTCTimestamp, { candle: CandlestickData<UTCTimestamp>; volume: number }>();
    const ordered = [...trades].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at)
      || a.block_height - b.block_height || a.event_index - b.event_index);
    for (const trade of ordered) {
      const indexedAt = Date.parse(trade.created_at);
      const usdc = Number(trade.usdc_amount) / 1e6;
      const tokens = Number(trade.token_amount) / 1e18;
      const price = usdc / tokens;
      if (!Number.isFinite(indexedAt) || !Number.isFinite(price) || price <= 0) continue;
      const time = (Math.floor(indexedAt / (bucket * 1000)) * bucket) as UTCTimestamp;
      const bar = groups.get(time);
      if (bar) {
        bar.candle.high = Math.max(bar.candle.high, price);
        bar.candle.low = Math.min(bar.candle.low, price);
        bar.candle.close = price;
        bar.volume += usdc;
      } else {
        groups.set(time, { candle: { time, open: price, high: price, low: price, close: price }, volume: usdc });
      }
    }
    return [...groups.values()];
  }, [trades, bucket]);

  const hasBars = bars.length > 0;
  useEffect(() => {
    if (!hasBars || !container.current) return;
    const chart = createChart(container.current, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: '#fffdf6' }, textColor: '#4e566c', attributionLogo: true },
      grid: { vertLines: { color: '#eee8db' }, horzLines: { color: '#eee8db' } },
      timeScale: { timeVisible: true },
    });
    const price = chart.addSeries(CandlestickSeries, {
      upColor: '#187c62', downColor: '#bc3925', wickUpColor: '#187c62', wickDownColor: '#bc3925',
      borderVisible: false,
      priceFormat: { type: 'custom', minMove: 1e-12, formatter: (value: number) => value.toPrecision(5) },
    });
    const volume = chart.addSeries(HistogramSeries, { priceScaleId: '', priceFormat: { type: 'volume' }, lastValueVisible: false });
    volume.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
    series.current = { chart, price, volume };
    return () => { series.current = null; chart.remove(); };
  }, [hasBars]);

  useEffect(() => {
    if (!series.current) return;
    const { chart, price, volume } = series.current;
    const fit = price.data().length === 0;
    price.setData(bars.map(bar => bar.candle));
    const values: HistogramData<UTCTimestamp>[] = bars.map(({ candle, volume: value }) => ({
      time: candle.time, value, color: candle.close >= candle.open ? '#187c6250' : '#bc392550',
    }));
    volume.setData(values);
    if (fit) chart.timeScale().fitContent();
  }, [bars]);

  return <section aria-labelledby="trading-chart" className="card mt-8 min-w-0">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id="trading-chart" className="text-xl">Trading chart</h2>
      <div className="flex flex-wrap gap-1" aria-label="Chart interval">
        {intervals.map(([label, seconds]) => <button key={label} type="button" aria-pressed={bucket === seconds}
          className={`tab ${bucket === seconds ? 'tab-active' : ''}`} onClick={() => setBucket(seconds)}>{label}</button>)}
      </div>
    </div>
    {hasBars ? <div ref={container} className="h-[320px] w-full md:h-[430px]" aria-label="USDC price candles and trade volume" />
      : <p className="py-10 text-center text-text-secondary">No indexed trades to chart yet.</p>}
    <p className="mt-3 text-xs text-text-secondary">
      USDC per token from the latest indexed trades, grouped by index time. Chart by{' '}
      <a className="underline" href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a>.
    </p>
  </section>;
}
