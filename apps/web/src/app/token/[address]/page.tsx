'use client';

import Link from 'next/link';
import PriceChart from '../../../components/PriceChart';
import { WatchToken } from '../../../components/Watchlist';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import NearDemoClient from '../../near-demo/NearDemoClient';

type Token = {
  account_id: string;
  creator: string;
  treasury_recipient: string;
  name: string;
  symbol: string;
  description?: string | null;
  image_url?: string | null;
  cumulative_volume_usdc: string;
  reserved_remaining: string;
  treasury_unlocked: string;
  treasury_claimed: string;
  milestones_completed: number;
  graduated: boolean;
  preset: { thresholds: string[]; burn_bps: number[]; treasury_unlock_bps: number[] };
};
type Trade = { created_at: string; trader: string; side: string; usdc_amount: string; token_amount: string; tx_hash: string; block_height: number; event_index: number };
type Mechanics = {
  milestones: [number, string, string, string, string, number, number][];
  claims?: [string, string, number, number][];
};
const api = process.env.NODE_ENV === 'development'
  ? process.env.NEXT_PUBLIC_NEAR_API_URL || 'http://localhost:4001'
  : '';

function formatUsdc(amount: string | number) {
  return (Number(amount) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 });
}

export default function TokenPage() {
  const params = useParams<{ address: string }>();
  const address = decodeURIComponent(params.address);
  const [token, setToken] = useState<Token | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [mechanics, setMechanics] = useState<Mechanics | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setMechanics(null);
    async function refreshMechanics() {
      try {
        const response = await fetch(`${api}/api/tokens/${encodeURIComponent(address)}/mechanics`, { cache: 'no-store' });
        if (!response.ok) return;
        const data: Mechanics = await response.json();
        if (active) setMechanics(data);
      } catch {
        // The next refresh can recover without hiding the token or its trades.
      }
    }
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
    void refreshMechanics();
    const timer = window.setInterval(() => { void refresh(); void refreshMechanics(); }, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [address]);

  return <main className="mx-auto min-h-[70vh] max-w-6xl px-5 py-12 md:px-8">
    <Link href="/explore" className="text-sm text-accent-blue">← Explore tokens</Link>
    {error && <p role="status" className="mt-5 border border-accent-orange/40 p-4 text-sm text-accent-orange">{error}</p>}
    {token && <><div className="mt-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {token.image_url && <img src={token.image_url} alt="" referrerPolicy="no-referrer" className="h-20 w-20 rounded-lg object-cover" />}
        <h1 className="mt-2 text-4xl font-semibold">{token.name} <span className="text-text-secondary">${token.symbol}</span></h1>
        <p className="mt-2 break-all font-mono text-xs text-text-secondary">{token.account_id}</p>
        {token.description && <p className="mt-3 whitespace-pre-wrap break-words text-text-secondary">{token.description}</p>}
      </div>
      <WatchToken token={{ accountId: token.account_id, name: token.name, symbol: token.symbol }} />
    </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <PriceChart key={address} trades={trades} />
        <NearDemoClient key={token.account_id} mode="trade" tokenId={token.account_id} />
      </div>
      <MilestoneProgress token={token} mechanics={mechanics} />
      <section className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Cumulative volume" value={`${(Number(token.cumulative_volume_usdc) / 1e6).toFixed(2)} USDC`} /><Metric label="Reserved supply remaining" value={`${(Number(token.reserved_remaining) / 1e24).toFixed(2)}M`} /><Metric label="Trading state" value={token.graduated ? 'Graduated · locked' : 'Curve active'} /><Metric label="Creator" value={token.creator} href={`/profile/${encodeURIComponent(token.creator)}`} /><Metric label="Fixed treasury recipient" value={token.treasury_recipient} /><Metric label="Milestones completed" value={`${token.milestones_completed}/${token.preset.thresholds.length}`} /></section>
      <section className="mt-8"><h2 className="mb-3 text-xl font-semibold">Milestone rules</h2><div className="grid gap-3 md:grid-cols-3">{token.preset.thresholds.map((threshold, index) => <div key={index} className="border border-bg-border p-4"><p className="text-sm text-text-secondary">{(Number(threshold) / 1e6).toLocaleString()} USDC cumulative volume</p><p className="mt-2">Burn {token.preset.burn_bps[index] / 100}%</p><p>Unlock {token.preset.treasury_unlock_bps[index] / 100}%</p></div>)}</div></section>
      <section className="mt-8"><h2 className="mb-3 text-xl font-semibold">Recent trades</h2>{trades.length ? <div className="overflow-x-auto border border-bg-border"><table className="w-full text-left text-sm"><thead className="text-text-secondary"><tr><th className="p-3">Side</th><th className="p-3">Trader</th><th className="p-3">USDC</th><th className="p-3">Block</th><th className="p-3">Transaction</th></tr></thead><tbody>{trades.map((trade) => <tr key={`${trade.tx_hash}-${trade.event_index}`} className="border-t border-bg-border"><td className="p-3 capitalize">{trade.side}</td><td className="p-3 font-mono">{trade.trader}</td><td className="p-3">{(Number(trade.usdc_amount) / 1e6).toFixed(4)}</td><td className="p-3">{trade.block_height}</td><td className="p-3"><a className="text-accent-blue" href={`https://testnet.nearblocks.io/txns/${trade.tx_hash}`} target="_blank" rel="noreferrer">View ↗</a></td></tr>)}</tbody></table></div> : <p className="border border-bg-border p-6 text-text-secondary">No indexed trades yet.</p>}</section>
    </>}
  </main>;
}

function Metric({ label, value, href }: { label: string; value: string; href?: string }) { return <div className="min-w-0 border border-bg-border p-4"><p className="text-xs text-text-secondary">{label}</p><p className="mt-1 break-words font-medium">{href ? <Link href={href} className="text-accent-blue hover:underline">{value}</Link> : value}</p></div>; }

function MilestoneProgress({ token, mechanics }: { token: Token; mechanics: Mechanics | null }) {
  const volume = Number(token.cumulative_volume_usdc);
  const threshold = Number(token.preset.thresholds[token.milestones_completed] ?? 0);
  const burned = 120 - Number(token.reserved_remaining) / 1e24;
  const timeline = [
    ...(mechanics?.milestones ?? []).map(([index, , burn, unlock, tx, block, event]) => ({
      label: `Milestone ${index + 1}`,
      detail: `${(Number(burn) / 1e24).toLocaleString()}M ${token.symbol} burned · ${formatUsdc(unlock)} USDC unlocked`,
      tx, block, event,
    })),
    ...(mechanics?.claims ?? []).map(([amount, tx, block, event]) => ({
      label: 'Treasury payout',
      detail: `${formatUsdc(amount)} USDC claimed`,
      tx, block, event,
    })),
  ].sort((a, b) => a.block - b.block || a.event - b.event || a.tx.localeCompare(b.tx));

  return <section className="mt-8 space-y-4" aria-labelledby="milestone-progress">
    <h2 id="milestone-progress" className="text-xl font-semibold">Milestone progress</h2>
    <div className="border border-bg-border p-4">
      {threshold > 0 ? <>
        <p className="font-medium">Next target: {formatUsdc(threshold)} USDC</p>
        <progress aria-label="Volume toward the next milestone" className="mt-2 w-full accent-accent-blue"
          max={threshold} value={Math.min(volume, threshold)} />
        <p className="text-sm text-text-secondary">
          {formatUsdc(volume)} USDC in settled buy volume
          {volume >= threshold ? ' · target reached, awaiting indexed burn' : ` · ${formatUsdc(threshold - volume)} USDC to go`}
        </p>
      </> : <p>All milestones completed. Future treasury fees become claimable as trades settle.</p>}
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
      <Metric label="Supply burned" value={`${burned.toLocaleString()}M ${token.symbol}`} />
      <Metric label="Treasury unlocked" value={`${formatUsdc(token.treasury_unlocked)} USDC`} />
      <Metric label="Treasury paid out" value={`${formatUsdc(token.treasury_claimed)} USDC`} />
    </div>
    <h3 className="font-semibold">Mechanics timeline</h3>
    {timeline.length ? <ol className="divide-y divide-bg-border border border-bg-border">
      {timeline.map(({ label, detail, tx, block, event }) => <li key={`${tx}-${event}`} className="flex flex-wrap items-center justify-between gap-2 p-4">
        <div><p className="font-medium">{label}</p><p className="text-sm text-text-secondary">{detail}</p></div>
        <a className="text-sm text-accent-blue" href={`https://testnet.nearblocks.io/txns/${tx}`} target="_blank" rel="noreferrer">
          View transaction <span className="sr-only">for {label}</span>
        </a>
      </li>)}
    </ol> : <p className="text-sm text-text-secondary">{mechanics ? 'No milestone or payout events indexed yet.' : 'Mechanics history is loading.'}</p>}
  </section>;
}
