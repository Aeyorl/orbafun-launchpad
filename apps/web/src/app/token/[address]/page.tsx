'use client';

import Link from 'next/link';
import { WatchToken } from '../../../components/Watchlist';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type Token = {
  account_id: string;
  creator: string;
  treasury_recipient: string;
  name: string;
  symbol: string;
  cumulative_volume_usdc: string;
  reserved_remaining: string;
  treasury_unlocked: string;
  treasury_claimed: string;
  milestones_completed: number;
  graduated: boolean;
  preset: { thresholds: string[]; burn_bps: number[]; treasury_unlock_bps: number[] };
};
type Trade = { trader: string; side: string; usdc_amount: string; token_amount: string; tx_hash: string; block_height: number; event_index: number };
const api = process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001';

export default function TokenPage() {
  const params = useParams<{ address: string }>();
  const address = decodeURIComponent(params.address);
  const [token, setToken] = useState<Token | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function refresh() {
      try {
        const [tokenResponse, tradesResponse] = await Promise.all([
          fetch(`${api}/api/tokens/${encodeURIComponent(address)}`, { cache: 'no-store' }),
          fetch(`${api}/api/tokens/${encodeURIComponent(address)}/trades?limit=50`, { cache: 'no-store' }),
        ]);
        if (!tokenResponse.ok) throw new Error(tokenResponse.status === 404 ? 'Token is not indexed yet.' : `Token API returned ${tokenResponse.status}`);
        if (!tradesResponse.ok) throw new Error(`Trade API returned ${tradesResponse.status}`);
        const [tokenData, tradeData] = await Promise.all([tokenResponse.json(), tradesResponse.json()]);
        if (active) { setToken(tokenData); setTrades(tradeData.items ?? []); setError(''); }
      } catch (cause) {
        if (active) setError(cause instanceof Error ? cause.message : 'Token data unavailable.');
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [address]);

  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 md:px-8">
    <Link href="/explore" className="text-sm text-accent-blue">← Explore tokens</Link>
    {error && <p role="status" className="mt-5 border border-accent-orange/40 p-4 text-sm text-accent-orange">{error}</p>}
    {token && <><div className="mt-6 flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm uppercase tracking-[0.18em] text-accent-blue">NEAR token</p><h1 className="mt-2 text-4xl font-semibold">{token.name} <span className="text-text-secondary">${token.symbol}</span></h1><p className="mt-2 break-all font-mono text-xs text-text-secondary">{token.account_id}</p></div><Link href={`/near-demo?token=${encodeURIComponent(token.account_id)}`} className="rounded-full bg-accent-green px-5 py-3 font-semibold text-text-primary">Trade on launchpad</Link><WatchToken token={{ accountId: token.account_id, name: token.name, symbol: token.symbol }} /></div>
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Cumulative volume" value={`${(Number(token.cumulative_volume_usdc) / 1e6).toFixed(2)} USDC`} /><Metric label="Reserved supply remaining" value={`${(Number(token.reserved_remaining) / 1e24).toFixed(2)}M`} /><Metric label="Treasury unlocked / claimed" value={`${(Number(token.treasury_unlocked) / 1e6).toFixed(2)} / ${(Number(token.treasury_claimed) / 1e6).toFixed(2)} USDC`} /><Metric label="Trading state" value={token.graduated ? 'Graduated · locked' : 'Curve active'} /><Metric label="Creator" value={token.creator} /><Metric label="Fixed treasury recipient" value={token.treasury_recipient} /><Metric label="Milestones completed" value={`${token.milestones_completed}/3`} /></section>
      <section className="mt-8"><h2 className="mb-3 text-xl font-semibold">Milestone rules</h2><div className="grid gap-3 md:grid-cols-3">{token.preset.thresholds.map((threshold, index) => <div key={index} className="border border-bg-border p-4"><p className="text-sm text-text-secondary">{(Number(threshold) / 1e6).toLocaleString()} USDC cumulative volume</p><p className="mt-2">Burn {token.preset.burn_bps[index] / 100}%</p><p>Unlock {token.preset.treasury_unlock_bps[index] / 100}%</p></div>)}</div></section>
      <section className="mt-8"><h2 className="mb-3 text-xl font-semibold">Recent trades</h2>{trades.length ? <div className="overflow-x-auto border border-bg-border"><table className="w-full text-left text-sm"><thead className="text-text-secondary"><tr><th className="p-3">Side</th><th className="p-3">Trader</th><th className="p-3">USDC</th><th className="p-3">Block</th><th className="p-3">Transaction</th></tr></thead><tbody>{trades.map((trade) => <tr key={`${trade.tx_hash}-${trade.event_index}`} className="border-t border-bg-border"><td className="p-3 capitalize">{trade.side}</td><td className="p-3 font-mono">{trade.trader}</td><td className="p-3">{(Number(trade.usdc_amount) / 1e6).toFixed(4)}</td><td className="p-3">{trade.block_height}</td><td className="p-3"><a className="text-accent-blue" href={`https://testnet.nearblocks.io/txns/${trade.tx_hash}`} target="_blank" rel="noreferrer">View ↗</a></td></tr>)}</tbody></table></div> : <p className="border border-bg-border p-6 text-text-secondary">No indexed trades yet.</p>}</section>
    </>}
  </main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="min-w-0 border border-bg-border p-4"><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div>; }
