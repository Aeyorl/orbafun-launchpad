import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Footer } from '../components/Footer';
import { ThemeToggle } from '../components/ThemeToggle';
import './globals.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || 'https://orba.fun'),
  title: 'Orba — NEAR Token Launchpad',
  description: 'Explore Meme.cooking auctions on NEAR mainnet and try Orba’s launch and trading mechanics on testnet.',
  openGraph: {
    title: 'Orba — NEAR Token Launchpad',
    description: 'Explore Meme.cooking auctions on NEAR mainnet and try Orba’s launch and trading mechanics on testnet.',
    type: 'website',
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body>
    <script dangerouslySetInnerHTML={{ __html: "try{if(localStorage.getItem('orba-theme')==='dark'){document.documentElement.classList.add('dark');document.documentElement.style.colorScheme='dark'}}catch{}" }} />
    <header className="border-b border-bg-border bg-bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-5 py-4 md:px-8">
        <Link href="/" aria-label="Orba home">
          <Image src="/orba-wordmark-bloom.svg" alt="Orba" width={99} height={32} className="dark:hidden" />
          <Image src="/orba-wordmark-bloom-dark.svg" alt="Orba" width={99} height={32} className="hidden dark:block" />
        </Link>
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
          <Link href="/" className="hidden text-text-secondary hover:text-text-primary sm:inline">Discover</Link>
          <Link href="/explore/meme-cooking" className="text-text-secondary hover:text-text-primary">Market</Link>
          <Link href="/explore/meme-cooking?sort=deposits" className="hidden text-text-secondary hover:text-text-primary md:inline">Top auctions</Link>
          <a href="/docs" className="hidden text-text-secondary hover:text-text-primary md:inline">Docs</a>
          <a href="/fees" className="hidden text-text-secondary hover:text-text-primary md:inline">Fees</a>
          <a href="/launch" className="font-semibold text-accent-blue hover:underline">Testnet launch</a>
          <Link href="/settlement" className="text-text-secondary hover:text-text-primary">Recovery</Link>
          <Link href="/profile" className="text-text-secondary hover:text-text-primary">Testnet profile</Link>
          <ThemeToggle />
          <span className="hidden text-xs uppercase tracking-[0.18em] text-text-secondary sm:inline">NEAR</span>
          <div id="near-wallet-slot" className="empty:hidden" />
        </nav>
      </div>
    </header>
    {children}
    <Footer />
  </body></html>;
}
