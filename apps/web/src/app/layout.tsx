import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';
import { Navbar } from '@/components/Navbar';
import { LiveTicker } from '@/components/LiveTicker';
import { Footer } from '@/components/Footer';
import { Toaster } from 'react-hot-toast';

export const metadata: Metadata = {
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
    <html lang="en" className="dark">
      <head>
        <link
          rel="preconnect"
          href="https://fonts.googleapis.com"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen">
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
                background: '#131316',
                color: '#e5e7eb',
                border: '1px solid #1f1f23',
                borderRadius: '12px',
                fontSize: '14px',
              },
              success: {
                iconTheme: { primary: '#00ff9d', secondary: '#0a0a0b' },
                ariaProps: { role: 'status', 'aria-live': 'polite' },
              },
              error: {
                iconTheme: { primary: '#ef4444', secondary: '#0a0a0b' },
                ariaProps: { role: 'alert', 'aria-live': 'assertive' },
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
