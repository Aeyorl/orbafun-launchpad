'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type Profile = {
  launches: [string, string, string, string | null, boolean][];
  trades: { token_id: string; side: string; usdc_amount: string; tx_hash: string; event_index: number }[];
};
const api = process.env.NODE_ENV === 'development'
  ? process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001'
  : '';

export default function WalletProfilePage() {
  const { wallet } = useParams<{ wallet?: string[] }>();
  const address = wallet?.[0] ?? '';
  const router = useRouter();
  const [input, setInput] = useState(address);
  const [lastAccount, setLastAccount] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    try { setLastAccount(localStorage.getItem('orba-last-near-account') || ''); } catch {}
  }, []);

  useEffect(() => {
    setInput(address);
    setProfile(null);
    setError('');
    if (!address) return;
    const controller = new AbortController();
    void fetch(`${api}/api/profiles/${encodeURIComponent(address)}`, { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Profile data is unavailable.');
        return await response.json() as Profile;
      })
      .then((data) => { if (!controller.signal.aborted) setProfile(data); })
      .catch(() => { if (!controller.signal.aborted) setError('Profile data is unavailable. Check the NEAR account ID and try again.'); });
    return () => controller.abort();
  }, [address]);

  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 md:px-8">
    <h1 className="font-serif text-4xl">Wallet profile</h1>
    <form className="my-5 flex flex-wrap items-end gap-3" onSubmit={(event) => {
      event.preventDefault();
      router.push(`/profile/${encodeURIComponent(input.trim())}`);
    }}>
      <label className="min-w-0 flex-1">NEAR account ID
        <input className="input mt-1 w-full" value={input} onChange={(event) => setInput(event.target.value)}
          required minLength={2} maxLength={64} pattern="[a-z0-9._\-]+" placeholder="account.testnet" />
      </label>
      <button className="btn-primary">View profile</button>
      {lastAccount && lastAccount !== address && <Link className="btn-secondary" href={`/profile/${encodeURIComponent(lastAccount)}`}>My profile</Link>}
    </form>
    {error && <p role="status">{error}</p>}
    {address && <p className="break-all font-mono text-sm text-text-secondary">{address} · NEAR testnet</p>}
    {address && !profile && !error && <p role="status" className="mt-4">Loading profile…</p>}
    {profile && <div className="mt-6 grid gap-5 md:grid-cols-2">
      <section className="card">
        <h2 className="mb-4 text-xl">Token launches</h2>
        {profile.launches.length === 0 && <p className="text-text-secondary">No indexed launches.</p>}
        <ul className="divide-y divide-bg-border">{profile.launches.map(([id, name, symbol, image, graduated]) =>
          <li key={id} className="py-3"><Link href={`/token/${encodeURIComponent(id)}`} className="flex items-center gap-3">
            {image && <img src={image} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-10 w-10 rounded-md object-cover" />}
            <span className="min-w-0 break-words"><strong>{name}</strong> · {symbol}<span className="block text-xs text-text-secondary">{graduated ? 'Graduated · locked' : 'Tradeable'}</span></span>
          </Link></li>)}</ul>
      </section>
      <section className="card">
        <h2 className="mb-4 text-xl">Recent trades</h2>
        {profile.trades.length === 0 && <p className="text-text-secondary">No indexed trades.</p>}
        <ul className="divide-y divide-bg-border">{profile.trades.map((trade) =>
          <li key={`${trade.tx_hash}-${trade.event_index}`} className="py-3">
            <p><span className="capitalize">{trade.side}</span> · {Number(trade.usdc_amount) / 1e6} USDC</p>
            <Link className="break-all text-xs text-accent-blue" href={`/token/${encodeURIComponent(trade.token_id)}`}>{trade.token_id}</Link>
            <a className="ml-2 text-xs text-accent-blue" href={`https://testnet.nearblocks.io/txns/${trade.tx_hash}`} target="_blank" rel="noreferrer">Transaction</a>
          </li>)}</ul>
      </section>
    </div>}
  </main>;
}
