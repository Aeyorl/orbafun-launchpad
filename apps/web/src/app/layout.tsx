import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://orba.fun'),
  title: 'Orba — NEAR Token Launchpad',
  description: 'Launch and trade tokens on NEAR with milestone based reserved supply burns and treasury unlocks.',
  openGraph: {
    title: 'Orba — NEAR Token Launchpad',
    description: 'Launch and trade tokens on NEAR with milestone based reserved supply burns and treasury unlocks.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="border-b border-bg-border bg-bg-card">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <Link href="/" aria-label="Orba home"><Image src="/orba-wordmark-bloom.svg" alt="Orba" width={99} height={32} /></Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="hidden text-text-secondary hover:text-text-primary sm:inline">Discover</Link>
          <a href="/explore" className="text-text-secondary hover:text-text-primary">Market</a>
          <Link href="/leaderboard" className="hidden text-text-secondary hover:text-text-primary md:inline">Leaders</Link>
          <a href="/docs" className="hidden text-text-secondary hover:text-text-primary md:inline">Docs</a>
          <a href="/fees" className="hidden text-text-secondary hover:text-text-primary md:inline">Fees</a>
          <a href="/launch" className="font-semibold text-accent-blue hover:underline">Launch</a>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-text-secondary sm:inline">NEAR · Testnet</span>
        </nav>
      </div>
    </header>
    {children}
    <footer className="mx-auto mt-12 max-w-6xl border-t border-bg-border px-5 py-6 text-xs text-text-secondary md:px-8">
      <nav aria-label="Footer" className="mb-3 flex flex-wrap gap-4">
        <Link href="/leaderboard" className="hover:underline">Leaderboard</Link>
        <Link href="/watchlist" className="hover:underline">Watchlist</Link>
        <Link href="/blog" className="hover:underline">Blog</Link>
        <Link href="/docs" className="hover:underline">Docs</Link>
        <Link href="/fees" className="hover:underline">Fees</Link>
      </nav>
      Orba is a NEAR testnet prototype. Use test tokens only.
    </footer>
  </body></html>;
}
