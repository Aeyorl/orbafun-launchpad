import { ImageResponse } from 'next/og';
import { api } from '@/lib/api';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Dynamic Open Graph image for each token page.
 *
 * Renders a 1200x630 card with the token name, symbol, market cap, and
 * bonding curve progress — so sharing a /coin/[address] link on Twitter/X,
 * Discord, or Telegram shows a rich preview instead of a blank card.
 *
 * Data is fetched server-side from the API at request time. If the token
 * can't be loaded (e.g. invalid address, API down), a fallback branded
 * card is rendered.
 */
export default async function OgImage({
  params,
}: {
  params: { address: string };
}) {
  const address = params.address;

  let token = null;
  try {
    token = await api.getToken(address);
  } catch {
    // fall through to fallback card
  }

  const bg = '#0a0a0b';
  const card = '#131316';
  const green = '#00ff9d';
  const blue = '#3b82f6';
  const purple = '#a855f7';
  const textPrimary = '#f4f4f5';
  const textMuted = '#71717a';

  if (!token) {
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: bg,
            color: textPrimary,
            fontFamily: 'system-ui',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <span style={{ fontSize: 72, color: green }}>◆</span>
            <span style={{ fontSize: 64, fontWeight: 800 }}>
              Orba
            </span>
          </div>
          <div style={{ fontSize: 28, color: textMuted, marginTop: 16 }}>
            Launch memecoins on Arc
          </div>
        </div>
      ),
      { ...size },
    );
  }

  const marketCap = Number(token.market_cap);
  const progress = Math.min(100, (marketCap / 30_000) * 100);
  const isGraduated = token.status === 'graduated';
  const accentColor = isGraduated ? purple : green;

  const formatMc = (v: number) => {
    if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
    if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
    return `$${v.toFixed(0)}`;
  };

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: bg,
          color: textPrimary,
          fontFamily: 'system-ui',
          padding: 60,
        }}
      >
        {/* Top bar: brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 36, color: green }}>◆</span>
          <span style={{ fontSize: 32, fontWeight: 700 }}>
            Orba
          </span>
          <span
            style={{
              marginLeft: 'auto',
              fontSize: 22,
              color: isGraduated ? purple : green,
              border: `1px solid ${isGraduated ? purple : green}`,
              borderRadius: 999,
              padding: '4px 16px',
            }}
          >
            {isGraduated ? 'GRADUATED' : 'ACTIVE'}
          </span>
        </div>

        {/* Token name + symbol */}
        <div style={{ display: 'flex', marginTop: 40, alignItems: 'baseline', gap: 20 }}>
          <span style={{ fontSize: 72, fontWeight: 800 }}>{token.name}</span>
          <span style={{ fontSize: 40, color: textMuted }}>${token.symbol}</span>
        </div>

        {/* Stats row */}
        <div style={{ display: 'flex', gap: 60, marginTop: 40 }}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, color: textMuted }}>Market Cap</span>
            <span style={{ fontSize: 48, fontWeight: 700, color: accentColor }}>
              {formatMc(marketCap)}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 22, color: textMuted }}>24h Volume</span>
            <span style={{ fontSize: 48, fontWeight: 700 }}>
              {formatMc(Number(token.volume_24h))}
            </span>
          </div>
        </div>

        {/* Bonding curve progress bar */}
        <div style={{ marginTop: 'auto' }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 20,
              color: textMuted,
              marginBottom: 12,
            }}
          >
            <span>{isGraduated ? 'Migrated to DEX' : 'Bonding curve'}</span>
            <span style={{ color: textPrimary, fontWeight: 600 }}>
              {isGraduated ? '100%' : `${progress.toFixed(1)}%`}
            </span>
          </div>
          <div
            style={{
              width: '100%',
              height: 16,
              background: card,
              borderRadius: 999,
              border: '1px solid #26262e',
            }}
          >
            <div
              style={{
                width: `${isGraduated ? 100 : progress}%`,
                height: '100%',
                background: `linear-gradient(90deg, ${green}, ${blue})`,
                borderRadius: 999,
              }}
            />
          </div>
        </div>
      </div>
    ),
    { ...size },
  );
}
