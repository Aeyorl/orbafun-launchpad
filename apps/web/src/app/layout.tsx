import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://orba.fun'),
  title: 'Orba — NEAR Token Launchpad',
  description: 'Launch and trade tokens on NEAR with milestone based reserved supply burns and treasury unlocks.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>
    <header className="border-b border-white/10 bg-black/70">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 md:px-8">
        <a href="/" className="font-semibold tracking-wide text-white">ORBA</a>
        <nav className="flex items-center gap-4 text-sm">
          <a href="/explore" className="text-white/65 hover:text-white">Explore</a>
          <a href="/docs" className="hidden text-white/65 hover:text-white md:inline">Docs</a>
          <a href="/fees" className="hidden text-white/65 hover:text-white md:inline">Fees</a>
          <a href="/near-demo" className="text-emerald-300 hover:text-emerald-200">Launch app</a>
          <span className="hidden text-xs uppercase tracking-[0.18em] text-white/40 sm:inline">NEAR · Testnet</span>
        </nav>
      </div>
    </header>
    {children}
    <footer className="mx-auto mt-12 max-w-6xl border-t border-white/10 px-5 py-6 text-xs text-white/45 md:px-8">
      Orba is a NEAR testnet prototype. Use test tokens only.
    </footer>
  </body></html>;
}
