'use client';

import { List, MagnifyingGlass, Wallet, X } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  useAccount,
  useBalance,
  useConnect,
  useConnectors,
  useDisconnect,
} from 'wagmi';
import { ARC_CHAIN_ID } from '@/lib/config';
import { formatNativeUsdc, shortenAddress } from '@/lib/utils';
import { SearchBar } from './SearchBar';
import { ThemeToggle } from './ThemeToggle';

const PRIMARY_LINKS = [
  { href: '/', label: 'Discover' },
  { href: '/explore', label: 'Market' },
  { href: '/launch', label: 'Launch' },
  { href: '/agents', label: 'Agents' },
] as const;

export function Navbar() {
  const { address, isConnected, chain } = useAccount();
  const { disconnect } = useDisconnect();
  const [mounted, setMounted] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    setMobileSearchOpen(false);
    setMenuOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  const { data: balance } = useBalance({
    address,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address },
  });

  const menuLinks = [
    ...PRIMARY_LINKS,
    { href: '/leaderboard', label: 'Leaders' },
    ...(address
      ? [
          { href: '/watchlist', label: 'Watchlist' },
          { href: `/profile/${address}`, label: 'Profile' },
        ]
      : []),
  ];
  const isWrongChain = mounted && isConnected && chain?.id !== ARC_CHAIN_ID;

  return (
    <nav className="sticky top-0 z-50 border-b border-bg-border bg-bg-base/95 backdrop-blur-xl">
      <div className="mx-auto flex h-[72px] max-w-[1440px] items-center gap-4 px-4 lg:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="Orba home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/orba-wordmark-bloom.svg" alt="Orba" className="h-9 w-auto dark:hidden" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/orba-wordmark-bloom-dark.svg" alt="Orba" className="hidden h-9 w-auto dark:block" />
          <span className="hidden font-mono text-[8px] font-bold tracking-[0.16em] text-text-muted sm:inline">DAYBREAK / 02</span>
        </Link>

        <div className="hidden min-w-0 flex-1 sm:block xl:max-w-[280px] 2xl:max-w-md">
          <SearchBar compact />
        </div>

        <div className="hidden shrink-0 items-center gap-0.5 xl:flex">
          {PRIMARY_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`tab ${isActive(item.href) ? 'tab-active' : ''}`}
            >
              {item.label}
            </Link>
          ))}
          <Link
            href="/leaderboard"
            className={`tab hidden min-[1380px]:inline-flex ${isActive('/leaderboard') ? 'tab-active' : ''}`}
          >
            Leaders
          </Link>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-2 font-mono text-[9px] tracking-[0.14em] text-text-muted lg:flex">
            <i className="h-1.5 w-1.5 rounded-full bg-accent-green shadow-[0_0_10px_rgba(200,255,90,0.7)]" />
            ARC TESTNET
          </span>
          <button
            onClick={() => {
              setMobileSearchOpen((value) => !value);
              setMenuOpen(false);
            }}
            className="icon-button sm:hidden"
            aria-label="Search"
            aria-expanded={mobileSearchOpen}
            aria-controls="mobile-search"
          >
            <MagnifyingGlass size={18} aria-hidden="true" />
          </button>

          <ThemeToggle />

          {mounted && isConnected && (
            <>
              {isWrongChain ? (
                <span className="badge-red hidden sm:inline-flex">Wrong network</span>
              ) : (
                balance && (
                  <span className="badge-green hidden tabular-nums lg:inline-flex">
                    {formatNativeUsdc(balance.value)} USDC
                  </span>
                )
              )}
              <button
                onClick={() => disconnect()}
                className="hidden rounded border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover lg:inline-flex"
              >
                {shortenAddress(address!)}
              </button>
            </>
          )}

          <ConnectButton />
          <button
            onClick={() => {
              setMenuOpen((value) => !value);
              setMobileSearchOpen(false);
            }}
            className="icon-button"
            aria-label="Navigation menu"
            aria-expanded={menuOpen}
            aria-controls="primary-menu"
          >
            {menuOpen ? <X size={19} aria-hidden="true" /> : <List size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {mobileSearchOpen && (
        <div id="mobile-search" className="border-t border-bg-border px-4 py-2 sm:hidden">
          <SearchBar />
        </div>
      )}

      {menuOpen && (
        <div id="primary-menu" className="border-t border-bg-border bg-bg-base/95 px-4 py-3 backdrop-blur-xl">
          <div className="mx-auto grid max-w-[1440px] grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-7">
            {menuLinks.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded px-3 py-2 text-sm transition-colors ${
                  isActive(item.href)
                    ? 'bg-bg-card font-semibold text-accent-blue'
                    : 'text-text-primary hover:bg-bg-hover'
                }`}
              >
                {item.label}
              </Link>
            ))}
          </div>
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
      onClick={() => connectors[0] && connect({ connector: connectors[0] })}
      disabled={connectors.length === 0}
      className="btn-primary inline-flex items-center gap-2 whitespace-nowrap text-sm"
    >
      <Wallet size={17} aria-hidden="true" />
      <span className="hidden sm:inline">Connect Wallet</span>
      <span className="sm:hidden">Connect</span>
    </button>
  );
}
