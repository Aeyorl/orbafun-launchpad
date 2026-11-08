'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const storageKey = 'orba-near-testnet-watchlist';

type SavedToken = { accountId: string; name: string; symbol: string };

function readWatchlist(): SavedToken[] {
  try {
    return JSON.parse(localStorage.getItem(storageKey) ?? '[]');
  } catch {
    return [];
  }
}

export function WatchToken({ token }: { token: SavedToken }) {
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    setSaved(readWatchlist().some(item => item.accountId === token.accountId));
  }, [token.accountId]);

  return <button className="btn-secondary" type="button" aria-pressed={saved} onClick={() => {
    const current = readWatchlist();
    const exists = current.some(item => item.accountId === token.accountId);
    const next = exists ? current.filter(item => item.accountId !== token.accountId) : [...current, token];
    localStorage.setItem(storageKey, JSON.stringify(next));
    setSaved(!exists);
  }}>{saved ? 'Remove from watchlist' : 'Add to watchlist'}</button>;
}

export function Watchlist() {
  const [tokens, setTokens] = useState<SavedToken[] | null>(null);
  useEffect(() => { setTokens(readWatchlist()); }, []);

  if (tokens === null) return <p role="status">Loading watchlist…</p>;
  if (!tokens.length) return <p className="card">No saved tokens yet. <Link className="text-accent-blue underline" href="/explore">Explore tokens</Link></p>;

  return <ul className="grid gap-3 sm:grid-cols-2">
    {tokens.map(token => <li key={token.accountId} className="card flex flex-wrap items-center justify-between gap-3">
      <Link className="min-w-0 break-words text-accent-blue hover:underline" href={`/token/${encodeURIComponent(token.accountId)}`}>
        {token.name} · {token.symbol}
      </Link>
      <button type="button" className="btn-secondary" aria-label={`Remove ${token.name} from watchlist`} onClick={() => {
        const next = readWatchlist().filter(item => item.accountId !== token.accountId);
        localStorage.setItem(storageKey, JSON.stringify(next));
        setTokens(next);
      }}>Remove</button>
    </li>)}
  </ul>;
}
