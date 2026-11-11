'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Token = {
  account_id: string;
  name: string;
  symbol: string;
  description?: string | null;
  image_url?: string | null;
  cumulative_volume_usdc: string;
  treasury_unlocked: string;
  treasury_claimed: string;
  milestones_completed: number;
  graduated: boolean;
};

const api = process.env.NODE_ENV === 'development'
  ? process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001'
  : '';

export default function ExplorePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'newest' | 'volume'>('newest');
  const search = query.trim().toLowerCase();
  const visible = tokens.filter((token) =>
    [token.name, token.symbol, token.account_id].some((value) => value.toLowerCase().includes(search))
  );
  if (sort === 'volume') visible.sort((a, b) => Number(b.cumulative_volume_usdc) - Number(a.cumulative_volume_usdc));

  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const response = await fetch(`${api}/api/tokens?limit=100`, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Token API returned ${response.status}`);
        const payload = await response.json();
        if (active) { setTokens(payload.items ?? []); setError(''); }
      } catch {
        if (active) setError('Token listings are unavailable. Check that the Rust API and indexer are running.');
      }
    };
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, []);

  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 md:px-8">
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="mt-2 text-4xl font-semibold">Orba testnet tokens</h1></div><Link href="/launch" className="rounded-full bg-accent-green px-5 py-3 font-semibold text-text-primary">Launch a token</Link></div>
    <Link href="/explore/meme-cooking" className="mb-5 inline-block text-sm font-semibold text-accent-blue underline">Browse Meme.cooking · NEAR mainnet</Link>
    <div className="mb-5 flex flex-wrap gap-3">
      <input className="input min-w-0 flex-1" aria-label="Search tokens" placeholder="Search by name, ticker or address" value={query} onChange={(event) => setQuery(event.target.value)} />
      <select className="input" aria-label="Sort tokens" value={sort} onChange={(event) => setSort(event.target.value === 'volume' ? 'volume' : 'newest')}>
        <option value="newest">Newest</option><option value="volume">Most buy volume</option>
      </select>
    </div>
    {error && <p role="status" className="mb-5 border border-accent-orange/40 p-4 text-sm text-accent-orange">{error}</p>}
    {visible.length ? <div className="grid gap-3 md:grid-cols-2">{visible.map((token) => <Link href={`/token/${encodeURIComponent(token.account_id)}`} key={token.account_id} className="card block">
      <div className="flex items-start gap-3">
        {token.image_url && <img src={token.image_url} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-12 w-12 rounded-lg object-cover" />}
        <div className="min-w-0 flex-1">
          <h2 className="break-words text-lg font-semibold">{token.name} <span className="text-text-secondary">${token.symbol}</span></h2>
          <p className="mt-1 break-all font-mono text-xs text-text-secondary">{token.account_id}</p>
        </div>
        <span className="shrink-0 text-xs text-accent-blue">{token.graduated ? 'Graduated · locked' : 'Tradeable'}</span>
      </div>
      {token.description && <p className="mt-3 line-clamp-2 break-words text-sm text-text-secondary">{token.description}</p>}
      <div className="mt-5 grid grid-cols-3 gap-3 text-sm"><Metric label="Buy volume" value={`${(Number(token.cumulative_volume_usdc) / 1e6).toFixed(2)} USDC`} /><Metric label="Milestones" value={`${token.milestones_completed}/3`} /><Metric label="Treasury claimable" value={`${((Number(token.treasury_unlocked) - Number(token.treasury_claimed)) / 1e6).toFixed(2)} USDC`} /></div>
    </Link>)}</div> : !error && <p className="border border-bg-border p-10 text-center text-text-secondary">{search ? 'No matching tokens.' : 'No tokens yet.'}</p>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
