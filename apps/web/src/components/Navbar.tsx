'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAccount, useDisconnect, useBalance, useConnectors, useConnect } from 'wagmi';
import { formatUsdc, formatNativeUsdc, shortenAddress } from '@/lib/utils';
import { arcTestnet } from 'viem/chains';
import { useState, useEffect } from 'react';
import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';

export function Navbar() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);

  // Whether a given href is the active tab. "/" is only active on exact match;
  // other routes are active when the pathname starts with the href.
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const { data: balance } = useBalance({
    address: address,
    chainId: arcTestnet.id,
    query: { enabled: !!address },
  });

  const isWrongChain = mounted && isConnected && chain?.id !== arcTestnet.id;

  return (
    <nav className="sticky top-0 z-50 bg-bg-base/80 backdrop-blur-md border-b border-bg-border">
      <div className="max-w-7xl mx-auto px-4 h-14 flex items-center gap-3 justify-between">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 flex-shrink-0" aria-label="Orba home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/orba-logo-light.svg"
            alt="Orba"
            className="h-7 w-auto"
          />
        </Link>

        {/* Search — desktop (inline, takes available space) */}
        <div className="hidden md:block flex-1 max-w-md">
          <SearchBar compact />
        </div>

        {/* Nav links — desktop */}
        <div className="hidden md:flex items-center gap-1 flex-shrink-0">
          <Link href="/" className={`tab ${isActive('/') ? 'tab-active' : ''}`}>
            Board
          </Link>
          <Link href="/explore" className={`tab ${isActive('/explore') ? 'tab-active' : ''}`}>
            Explore
          </Link>
          <Link href="/launch" className={`tab ${isActive('/launch') ? 'tab-active' : ''}`}>
            Launch
          </Link>
          <Link href="/agents" className={`tab ${isActive('/agents') ? 'tab-active' : ''}`}>
            Agents
          </Link>
          <Link href="/leaderboard" className={`tab ${isActive('/leaderboard') ? 'tab-active' : ''}`}>
            Leaders
          </Link>
          {address && (
            <>
              <Link href="/watchlist" className={`tab ${isActive('/watchlist') ? 'tab-active' : ''}`}>
                Watchlist
              </Link>
              <Link href={`/profile/${address}`} className={`tab ${isActive('/profile/') ? 'tab-active' : ''}`}>
                Profile
              </Link>
            </>
          )}
        </div>

        {/* Wallet + mobile toggles */}
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Theme toggle (dark/light) */}
          <ThemeToggle />
          {/* Mobile search toggle button */}
          <button
            onClick={() => {
              setMobileSearchOpen((v) => !v);
              setMobileMenuOpen(false);
            }}
            className="md:hidden btn-secondary text-sm px-2"
            aria-label="Search"
          >
            🔍
          </button>
          {mounted && isConnected ? (
            <>
              {isWrongChain ? (
                <span className="badge-red">Wrong network</span>
              ) : (
                balance && (
                  <span className="badge-green tabular-nums hidden sm:inline">
                    {formatNativeUsdc(balance.value)} USDC
                  </span>
                )
              )}
              <button
                onClick={() => disconnect()}
                className="btn-secondary text-sm"
              >
                {shortenAddress(address!)}
              </button>
            </>
          ) : null}
          <ConnectButton />
          {/* Mobile hamburger menu button */}
          <button
            onClick={() => {
              setMobileMenuOpen((v) => !v);
              setMobileSearchOpen(false);
            }}
            className="md:hidden btn-secondary text-sm px-2"
            aria-label="Menu"
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? '✕' : '☰'}
          </button>
        </div>
      </div>

      {/* Mobile search row — toggled */}
      {mobileSearchOpen && (
        <div className="md:hidden border-t border-bg-border px-4 py-2">
          <SearchBar />
        </div>
      )}

      {/* Mobile nav menu — toggled */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-bg-border px-4 py-3 space-y-1 bg-bg-base/95 backdrop-blur-md">
          <Link
            href="/"
            className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Board
          </Link>
          <Link
            href="/explore"
            className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/explore') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Explore
          </Link>
          <Link
            href="/launch"
            className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/launch') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Launch
          </Link>
          <Link
            href="/agents"
            className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/agents') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Agents
          </Link>
          <Link
            href="/leaderboard"
            className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/leaderboard') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
            onClick={() => setMobileMenuOpen(false)}
          >
            Leaders
          </Link>
          {address && (
            <>
              <Link
                href="/watchlist"
                className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/watchlist') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Watchlist
              </Link>
              <Link
                href={`/profile/${address}`}
                className={`block py-2 px-3 rounded-lg transition-colors ${isActive('/profile/') ? 'bg-bg-card text-accent-blue font-semibold' : 'hover:bg-bg-card text-text-primary'}`}
                onClick={() => setMobileMenuOpen(false)}
              >
                Profile
              </Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}

function ConnectButton() {
  const { isConnected } = useAccount();
  const connectors = useConnectors();
  const { connect } = useConnect();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (mounted && isConnected) return null;

  return (
    <button
      onClick={() => connect({ connector: connectors[0] })}
      className="btn-primary text-sm"
    >
      Connect Wallet
    </button>
  );
}
