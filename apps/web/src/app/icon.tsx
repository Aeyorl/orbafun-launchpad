import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Favicon — diamond logo on brand-green rounded square.
 * Matches the ◇ symbol used in the Navbar.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#00ff9d',
          color: '#0a0a0b',
          fontSize: 22,
          fontWeight: 800,
          fontFamily: 'system-ui',
          borderRadius: 8,
        }}
      >
        ◆
      </div>
    ),
    { ...size },
  );
}
