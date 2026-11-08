'use client';

import Image from 'next/image';
import Link from 'next/link';
import styles from './TokenCard.module.css';
import { useEffect, useState } from 'react';

type Token = {
  account_id: string;
  name: string;
  symbol: string;
  real_usdc: string;
  tokens_sold: string;
  cumulative_volume_usdc: string;
  graduated: boolean;
};

const api = (process.env.NEXT_PUBLIC_NEAR_API_URL ?? '').replace(/\/$/, '');
const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const artwork = ['sunroom', 'cloud-choir', 'noodle-oracle', 'moon-moth', 'peach-engine', 'relay-garden'];
const tabs = ['Newest', 'Market Cap', 'Volume', 'Graduated'] as const;
type Tab = (typeof tabs)[number];

function marketCap(token: Token) {
  // Matches the NEAR launchpad market_cap function in micro-USDC.
  return (5_866_666_700n + BigInt(token.real_usdc)) * (10n ** 27n)
    / (1_466_666_667n * 10n ** 18n - BigInt(token.tokens_sold));
}

function rank(tokens: Token[], metric: (token: Token) => bigint) {
  return [...tokens].sort((a, b) => {
    const first = metric(a);
    const second = metric(b);
    return first === second ? 0 : first > second ? -1 : 1;
  });
}

export default function MarketBoard({ leaderboard = false }: { leaderboard?: boolean }) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tab, setTab] = useState<Tab>(leaderboard ? 'Volume' : 'Newest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    let running = false;
    async function refresh() {
      if (running) return;
      running = true;
      try {
        const items = new Map<string, Token>();
        for (let offset = 0; ; offset += 100) {
          const response = await fetch(`${api}/api/tokens?limit=100&offset=${offset}`, {
            cache: 'no-store', signal: controller.signal,
          });
          if (!response.ok) throw new Error('Token request failed');
          const page: { items: Token[] } = await response.json();
          for (const token of page.items) items.set(token.account_id, token);
          if (page.items.length < 100) break;
        }
        if (!controller.signal.aborted) {
          setTokens([...items.values()]);
          setError(false);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        running = false;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void refresh();
    const timer = window.setInterval(refresh, 30_000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, []);

  const volume = (token: Token) => BigInt(token.cumulative_volume_usdc);
  const leaders = rank(tokens, volume);
  const displayed = tab === 'Volume' ? leaders : tab === 'Market Cap' ? rank(tokens, marketCap)
    : tab === 'Graduated' ? tokens.filter(token => token.graduated) : tokens;

  return <div className="space-y-8">
    {!leaderboard && <>
      {leaders.length > 0 && <section aria-label="Market pulse" className="flex flex-wrap gap-3">
        {leaders.slice(0, 4).map(token => <Link className="btn-secondary" key={token.account_id} href={`/token/${encodeURIComponent(token.account_id)}`}>
          ${token.symbol} · {usd.format(Number(volume(token)) / 1e6)} volume
        </Link>)}
      </section>}
      <section aria-label="Platform stats" className="grid grid-cols-3 gap-2 sm:gap-3">
        {[
          ['Tokens', tokens.length],
          ['Total volume', usd.format(Number(tokens.reduce((sum, token) => sum + volume(token), 0n)) / 1e6)],
          ['Graduated', tokens.filter(token => token.graduated).length],
        ].map(([label, value]) => <div key={label} className="card-elevated px-2 text-center">
          <p className="break-words text-lg font-bold tabular-nums sm:text-2xl">{loading || error ? '—' : value}</p>
          <p className="text-xs text-text-secondary">{label}</p>
        </div>)}
      </section>
    </>}
    <section aria-label={leaderboard ? 'Token rankings' : 'Token board'}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        {!leaderboard && <div>
          <h2 className="mt-1 text-3xl text-accent-blue">Ideas with good energy.</h2></div>}
        <div className="flex flex-wrap gap-1" aria-label="Sort tokens">
          {tabs.map(item => <button type="button" key={item} aria-pressed={tab === item}
            onClick={() => setTab(item)} className={`tab ${tab === item ? 'tab-active' : ''}`}>{item}</button>)}
        </div>
      </div>
      {loading ? <p role="status" className="card">Loading tokens…</p>
        : error ? <p role="status" className="card">Market data is temporarily unavailable.</p>
        : displayed.length === 0 ? <p className="card">{tab === 'Graduated' ? 'No graduated tokens yet.' : 'No indexed launches yet.'}</p>
        : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayed.slice(0, leaderboard ? 50 : 12).map((token, index) => {
            const artworkIndex = Array.from(token.symbol).reduce((sum, character) => sum + character.charCodeAt(0), 0) % artwork.length;
            return <article key={token.account_id} className={styles.tokenCard}>
              <Link href={`/token/${encodeURIComponent(token.account_id)}`} className={styles.cardButton}>
                {!leaderboard && <div className={styles.artwork}>
                  <Image src={`/token-board-lab/${artwork[artworkIndex]}.webp`} alt="" width={640} height={480} />
                  <span className={styles.signalBadge}>{token.graduated ? 'Graduated' : 'Curve active'}</span>
                </div>}
                <div className={styles.cardCopy}>
                  <div className={styles.identityRow}><span>
                    <strong>{leaderboard && `#${index + 1} · `}{token.name}</strong>
                    <small>${token.symbol}</small>
                  </span></div>
                  <div className={styles.marketRow}>
                    <span><strong>{usd.format(Number(marketCap(token)) / 1e6)}</strong><small>MCAP</small></span>
                  </div>
                  <p className="mt-2 text-sm text-text-secondary">{usd.format(Number(volume(token)) / 1e6)} total volume</p>
                </div>
              </Link>
            </article>;
          })}
        </div>}
      {!leaderboard && <Link href="/explore" className="btn-secondary mt-4 inline-block">Explore all tokens</Link>}
    </section>
  </div>;
}
