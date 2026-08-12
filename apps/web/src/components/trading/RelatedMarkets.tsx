'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, Token } from '@/lib/api';
import { formatUsdDirect } from '@/lib/utils';
import { TokenArtwork } from '@/components/TokenArtwork';

export function RelatedMarkets({ token }: { token: Token }) {
  const { data } = useQuery({
    queryKey: ['relatedMarkets', token.status],
    queryFn: () => api.listTokens({ status: token.status === 'graduated' ? 'graduated' : 'active', sort: 'volume', limit: 7 }),
    staleTime: 30_000,
  });
  const related = (data?.tokens || []).filter((item) => item.contract_address !== token.contract_address).slice(0, 4);
  if (related.length === 0) return null;

  return (
    <section className="card" aria-labelledby="related-markets-title">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-text-muted">Same lifecycle</p>
          <h2 id="related-markets-title" className="font-serif text-xl">Related markets</h2>
        </div>
        <Link href="/explore" className="text-xs font-semibold text-accent-sienna hover:underline">View all</Link>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {related.map((item) => (
          <Link key={item.contract_address} href={`/trade/${item.contract_address}`} className="flex items-center gap-3 rounded-xl border border-bg-border bg-bg-base p-3 hover:bg-bg-hover">
            <TokenArtwork src={item.image} alt={item.name} className="h-10 w-10 flex-none rounded-lg" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{item.name}</p>
              <p className="truncate text-[11px] text-text-muted">${item.symbol} · {formatUsdDirect(item.market_cap)} MC</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
