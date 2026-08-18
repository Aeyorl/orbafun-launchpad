'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowUpRight, ChartLineUp, UsersThree } from '@phosphor-icons/react';
import { Line, LineChart, ResponsiveContainer, XAxis, YAxis } from 'recharts';
import { api, Token } from '@/lib/api';
import { bondingCurveProgress, formatMarketCap, ipfsToGateway } from '@/lib/utils';
import { calculateMarketChange24h, hasUsableTokenImage } from '@/lib/sunny-spotlight';

interface SunnySpotlightProps {
  token?: Token;
  isLoading?: boolean;
}

export function SunnySpotlight({ token, isLoading = false }: SunnySpotlightProps) {
  const address = token?.contract_address;

  const { data: holders } = useQuery({
    queryKey: ['sunny-spotlight-holders', address],
    queryFn: () => api.getTokenHolders(address!, 1),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });

  const { data: candles = [] } = useQuery({
    queryKey: ['sunny-spotlight-candles', address],
    queryFn: () => api.getCandles(address!, '1h', 'mcap', 24),
    enabled: Boolean(address),
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return (
      <SpotlightShell>
        <div className="grid min-h-[500px] place-items-center px-8 text-center">
          <div>
            <span className="mx-auto mb-4 block h-10 w-10 animate-spin rounded-full border-2 border-accent-blue border-t-transparent" />
            <p className="font-mono text-[10px] font-bold tracking-[0.14em] text-accent-sienna">FINDING TODAY&apos;S SUNNY ONE</p>
          </div>
        </div>
      </SpotlightShell>
    );
  }

  if (!token) {
    return (
      <SpotlightShell>
        <div className="grid min-h-[500px] place-items-center px-8 text-center">
          <div className="max-w-sm">
            <ChartLineUp size={38} className="mx-auto text-accent-blue" aria-hidden="true" />
            <h2 className="mt-4 font-serif text-3xl text-accent-blue">The bazaar is warming up.</h2>
            <p className="mt-2 text-sm text-text-secondary">Today&apos;s most active launch will appear here as soon as trading begins.</p>
            <Link href="/explore" className="btn-secondary mt-5 inline-flex items-center gap-2">Explore launches <ArrowUpRight size={16} /></Link>
          </div>
        </div>
      </SpotlightShell>
    );
  }

  const progress = bondingCurveProgress(token.market_cap);
  const change24h = calculateMarketChange24h(candles);
  const hasMarketHistory = candles.length > 1;
  const isPositive = (change24h ?? 0) >= 0;
  const imageSrc = hasUsableTokenImage(token.image) ? ipfsToGateway(token.image) : '/orba-bloom-icon.svg';
  const tradeHref = `/trade/${token.contract_address}`;

  return (
    <SpotlightShell>
      <div className="relative min-h-[500px] overflow-hidden p-5 sm:p-6">
        <div className="relative z-20 flex items-center justify-between font-mono text-[9px] font-bold tracking-[0.14em] text-accent-sienna">
          <span>TODAY&apos;S SUNNY ONE</span>
          <span>{token.status === 'graduated' ? 'GRADUATED' : `${Math.round(progress)}% GROWN`}</span>
        </div>

        <div
          className="absolute inset-x-[4%] bottom-[24%] top-[14%] z-0"
          role="img"
          aria-label={`${token.name} 24-hour market cap curve`}
        >
          {hasMarketHistory ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={candles} margin={{ top: 28, right: 18, bottom: 18, left: 18 }}>
                <XAxis dataKey="timestamp" hide />
                <YAxis domain={['dataMin', 'dataMax']} hide />
                <Line
                  type="monotone"
                  dataKey="close"
                  stroke="rgb(var(--color-accent-blue))"
                  strokeWidth={5}
                  dot={false}
                  activeDot={{ r: 5, fill: 'rgb(var(--color-accent-blue))', stroke: 'rgb(var(--color-bg-card))', strokeWidth: 2 }}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="grid h-full place-items-center">
              <span className="font-mono text-[9px] font-bold tracking-[0.12em] text-accent-sienna/70">WAITING FOR 24H MARKET HISTORY</span>
            </div>
          )}
        </div>

        <div className="absolute left-1/2 top-[43%] z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-text-primary bg-bg-card shadow-[10px_10px_0_rgba(23,33,60,.18)] sm:h-44 sm:w-44">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageSrc}
            alt={`${token.name} token artwork`}
            className="h-full w-full object-cover"
            onError={(event) => {
              event.currentTarget.onerror = null;
              event.currentTarget.src = '/orba-bloom-icon.svg';
            }}
          />
        </div>

        <span className="absolute left-[6%] top-[24%] z-20 -rotate-3 rounded-md border border-text-primary bg-[#9fe2c2] px-3 py-2 font-mono text-[9px] font-bold text-[#17213c] shadow-[4px_4px_0_#17213c]">
          {(holders?.total ?? 0).toLocaleString()} BELIEVERS
        </span>

        <span className={`absolute bottom-[34%] right-[6%] z-20 rotate-3 rounded-md border border-text-primary px-3 py-2 font-mono text-[9px] font-bold shadow-[4px_4px_0_#17213c] ${isPositive ? 'bg-accent-blue text-white' : 'bg-accent-red text-white'}`}>
          {change24h === null ? 'NO 24H TRADES' : `${isPositive ? '+' : ''}${change24h.toFixed(2)}% 24H`}
        </span>

        <div className="absolute inset-x-5 bottom-5 z-30 flex flex-col gap-4 rounded-xl border border-text-primary bg-bg-card px-5 py-4 text-text-primary sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6">
          <div className="min-w-0">
            <strong className="block truncate font-serif text-2xl font-normal text-accent-blue sm:text-3xl">{token.name}</strong>
            <span className="font-mono text-[9px] text-text-muted">${token.symbol} · ARC · {formatMarketCap(token.market_cap)} MC</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href={tradeHref} aria-label={`Trade $${token.symbol}`} className="btn-primary inline-flex items-center gap-2 px-4 py-2 text-xs">
              Trade <ArrowUpRight size={15} />
            </Link>
            <Link href={`${tradeHref}#community`} className="inline-flex items-center gap-2 px-2 py-2 text-xs font-bold text-accent-blue">
              Community <UsersThree size={17} />
            </Link>
          </div>
        </div>
      </div>
    </SpotlightShell>
  );
}

function SpotlightShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-w-0 overflow-hidden rounded-3xl border border-text-primary bg-accent-peach shadow-[14px_14px_0_rgb(var(--color-accent-blue))] xl:mr-5 xl:rotate-[1deg]">
      {children}
    </div>
  );
}
