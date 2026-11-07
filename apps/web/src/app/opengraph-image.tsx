import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Default Open Graph image for the site root and non-token pages.
 * Renders the Orba brand on a dark background.
 */
export default function OgImage() {
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
          background: '#0a0a0b',
          color: '#f4f4f5',
          fontFamily: 'system-ui',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 80, color: '#00ff9d' }}>◆</span>
          <span style={{ fontSize: 72, fontWeight: 800 }}>
            Orba
          </span>
        </div>
        <div style={{ fontSize: 32, color: '#71717a', marginTop: 20 }}>
          Launch tokens on NEAR
        </div>
        <div
          style={{
            display: 'flex',
            gap: 40,
            marginTop: 40,
            fontSize: 24,
            color: '#a1a1aa',
          }}
        >
          <span>Bonding curves</span>
          <span>·</span>
          <span>Milestone mechanics</span>
          <span>·</span>
          <span>Treasury unlocks</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
