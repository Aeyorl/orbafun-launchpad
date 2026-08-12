'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpRight, ChartDonut, X } from '@phosphor-icons/react';
import { Token } from '@/lib/api';
import {
  bondingCurveProgress,
  formatMarketCap,
  formatUsdDirect,
  ipfsToGateway,
  shortenAddress,
  timeAgo,
} from '@/lib/utils';
import styles from './TokenCard.module.css';

const fallbackArtwork = [
  '/token-board-lab/sunroom.webp',
  '/token-board-lab/cloud-choir.webp',
  '/token-board-lab/noodle-oracle.webp',
  '/token-board-lab/moon-moth.webp',
  '/token-board-lab/peach-engine.webp',
  '/token-board-lab/relay-garden.webp',
];

function fallbackFor(symbol: string) {
  const score = Array.from(symbol).reduce((sum, character) => sum + character.charCodeAt(0), 0);
  return fallbackArtwork[score % fallbackArtwork.length];
}

function getSignal(token: Token, progress: number) {
  if (token.status === 'graduated') return 'Graduated';
  if (progress > 75) return 'Nearly there';
  if (progress <= 0) return 'New signal';
  return 'Blooming';
}

export function TokenCard({ token, featured = false }: { token: Token; featured?: boolean }) {
  const [quickLookOpen, setQuickLookOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const progress = bondingCurveProgress(token.market_cap);
  const signal = getSignal(token, progress);
  const age = timeAgo(token.created_at).replace(/\s+ago$/, '');
  const mcap = parseFloat(token.market_cap || '4000');
  const pctChange = mcap > 4000 ? ((mcap - 4000) / 4000) * 100 : 0;
  const creatorLabel = token.is_agent === 'true' && token.agent_name
    ? token.agent_name
    : shortenAddress(token.creator_wallet);
  const tokenArtwork = useMemo(
    () => token.image && !imageFailed ? ipfsToGateway(token.image) : fallbackFor(token.symbol),
    [imageFailed, token.image, token.symbol],
  );

  useEffect(() => {
    if (!quickLookOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setQuickLookOpen(false);
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [quickLookOpen]);

  return (
    <>
      <article className={`${styles.tokenCard} ${featured ? styles.featuredCard : ''}`}>
        <button
          className={styles.cardButton}
          type="button"
          onClick={() => setQuickLookOpen(true)}
          aria-label={`Open ${token.name}, ${formatMarketCap(token.market_cap)} market cap`}
        >
          <span className={styles.artwork}>
            {/* Dynamic IPFS URLs cannot use next/image without enumerating every gateway host. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={tokenArtwork}
              alt={`${token.name} token artwork`}
              onError={() => setImageFailed(true)}
            />
            <span className={styles.imageShade} aria-hidden="true" />
            <span className={styles.signalBadge}>
              <ChartDonut size={14} weight="fill" aria-hidden="true" />
              {signal}
            </span>
            <span className={styles.ageBadge}>{age}</span>
            <span className={styles.artworkAction}>
              Quick look <ArrowUpRight size={15} weight="bold" aria-hidden="true" />
            </span>
          </span>

          <span className={styles.cardCopy}>
            <span className={styles.identityRow}>
              <span>
                <strong>{token.name}</strong>
                <small>${token.symbol}</small>
              </span>
              <span className={styles.marketMove}>+{pctChange.toFixed(1)}%</span>
            </span>
            <span className={styles.marketRow}>
              <span><strong>{formatMarketCap(token.market_cap)}</strong><small>MC</small></span>
              <span className={styles.creator}>by {creatorLabel}</span>
            </span>
            <span className={styles.signalTrack} aria-label={`${Math.min(100, progress).toFixed(0)}% bonded`}>
              <span style={{ width: `${token.status === 'graduated' ? 100 : Math.min(100, progress)}%` }} />
            </span>
          </span>
        </button>
      </article>

      {quickLookOpen && (
        <div className={styles.quickLookBackdrop} role="presentation" onClick={() => setQuickLookOpen(false)}>
          <aside
            className={styles.quickLook}
            role="dialog"
            aria-modal="true"
            aria-label={`${token.name} quick look`}
            onClick={(event) => event.stopPropagation()}
          >
            <button className={styles.closeButton} type="button" onClick={() => setQuickLookOpen(false)} aria-label="Close quick look">
              <X size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={tokenArtwork} alt="" width={132} height={132} />
            <div className={styles.quickLookCopy}>
              <span className={styles.quickLabel}>{signal} · {age}</span>
              <h3>{token.name} <small>${token.symbol}</small></h3>
              <div className={styles.quickStats}>
                <span><small>Market cap</small><strong>{formatMarketCap(token.market_cap)}</strong></span>
                <span><small>24H volume</small><strong>{formatUsdDirect(token.volume_24h)}</strong></span>
                <span><small>Bonded</small><strong>{token.status === 'graduated' ? '100' : progress.toFixed(0)}%</strong></span>
              </div>
              <div className={styles.quickActions}>
                <Link
                  href={token.is_agent === 'true' && token.agent_uuid ? `/agents/${token.agent_uuid}` : `/profile/${token.creator_wallet}`}
                  className={styles.creatorLink}
                >
                  by {creatorLabel}
                </Link>
                <Link href={`/trade/${token.contract_address}`} className={styles.tradeButton}>
                  Open market <ArrowUpRight size={16} weight="bold" />
                </Link>
              </div>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
