'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

type Token = {
  account_id: string;
  name: string;
  symbol: string;
  cumulative_volume_usdc: string;
  treasury_unlocked: string;
  treasury_claimed: string;
  milestones_completed: number;
  graduated: boolean;
};

const api = process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001';

export default function ExplorePage() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [error, setError] = useState('');

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
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4"><div><h1 className="mt-2 text-4xl font-semibold">Explore tokens</h1></div><Link href="/near-demo" className="rounded-full bg-accent-green px-5 py-3 font-semibold text-text-primary">Launch a token</Link></div>
    {error && <p role="status" className="mb-5 border border-accent-orange/40 p-4 text-sm text-accent-orange">{error}</p>}
    {tokens.length ? <div className="grid gap-3 md:grid-cols-2">{tokens.map((token) => <Link href={`/token/${encodeURIComponent(token.account_id)}`} key={token.account_id} className="border border-bg-border bg-bg-card p-5 transition hover:border-accent-blue/50"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-semibold">{token.name} <span className="text-text-secondary">${token.symbol}</span></h2><p className="mt-1 break-all font-mono text-xs text-text-secondary">{token.account_id}</p></div><span className="shrink-0 text-xs text-accent-blue">{token.graduated ? 'Graduated' : 'Curve active'}</span></div><div className="mt-5 grid grid-cols-3 gap-3 text-sm"><Metric label="Volume" value={`${(Number(token.cumulative_volume_usdc) / 1e6).toFixed(2)} USDC`} /><Metric label="Milestones" value={`${token.milestones_completed}/3`} /><Metric label="Treasury claimable" value={`${((Number(token.treasury_unlocked) - Number(token.treasury_claimed)) / 1e6).toFixed(2)} USDC`} /></div></Link>)}</div> : !error && <p className="border border-bg-border p-10 text-center text-text-secondary">No tokens yet.</p>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
