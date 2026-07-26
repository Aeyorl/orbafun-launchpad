import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { LiveTicker } from '@/components/LiveTicker';
import { Footer } from '@/components/Footer';
import { Toaster } from 'react-hot-toast';

// Canonical site URL — used by Next.js to resolve absolute OG/Twitter image
// URLs and other metadata. In production this is https://orba.fun; in dev it
// falls back to localhost:3000. Set NEXT_PUBLIC_SITE_URL in your hosting env
// (Vercel) to override.
const siteUrl =
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://orba.fun'
    : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: 'Orba — Launch memecoins on Arc',
  description:
    'Launch and trade memecoins on Arc, the USDC-native blockchain. Fair bonding curves, instant graduation to DEX, sub-second finality.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        {/* No-flash theme script — runs before hydration to set the correct
            theme class on <html> from localStorage (or default to dark).
            Must be inline + in <head> so it executes before the body renders. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('orba-theme');if(t==='light'){document.documentElement.classList.remove('dark');}else{document.documentElement.classList.add('dark');}}catch(e){document.documentElement.classList.add('dark');}})();`,
          }}
        />
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&family=Source+Serif+4:opsz,wght@8..60,400&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
        {/* Faint bonding-curve linework motif — traces an upward convex curve
            (the constant-product bonding-curve shape) behind the content,
            echoing the product without being literal. Fixed so it stays
            composed as you scroll; USDC-blue-tinted via CSS variables so it
            adapts to the active theme. A soft blurred duplicate underneath
            gives the line a barely-there halo. */}
        <div aria-hidden="true" className="fixed inset-0 -z-10 pointer-events-none overflow-hidden">
          <svg
            viewBox="0 0 1200 800"
            preserveAspectRatio="xMidYMid slice"
            className="absolute inset-0 w-full h-full"
          >
            <defs>
              <filter id="curve-blur" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="22" />
              </filter>
            </defs>
            {/* Bonding curve: convex upward, lower-left → upper-right.
                Q control near the start keeps it flat then accelerating —
                the signature price-discovery shape. T continues it smoothly. */}
            <path
              d="M -60 860 Q 280 860 580 520 T 1260 -60"
              fill="none"
              stroke="var(--curve-halo)"
              strokeWidth="48"
              filter="url(#curve-blur)"
            />
            <path
              d="M -60 860 Q 280 860 580 520 T 1260 -60"
              fill="none"
              stroke="var(--curve-stroke)"
              strokeWidth="1.25"
            />
          </svg>
        </div>
        <Providers>
          <a href="#main-content" className="skip-link">Skip to content</a>
          <Navbar />
          <LiveTicker />
          <main id="main-content" className="max-w-7xl mx-auto px-4 py-6">{children}</main>
          <Footer />
          <Toaster
            position="bottom-right"
            toastOptions={{
              duration: 4000,
              style: {
                background: 'var(--color-bg-card)',
                color: 'var(--color-text-primary)',
                border: '1px solid var(--color-bg-border)',
                borderRadius: '0px',
                fontSize: '14px',
                boxShadow: 'var(--shadow-subtle-2)',
              },
              success: {
                iconTheme: { primary: '#2775CA', secondary: '#ffffff' },
                ariaProps: { role: 'status', 'aria-live': 'polite' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#ffffff' },
                ariaProps: { role: 'alert', 'aria-live': 'assertive' },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
