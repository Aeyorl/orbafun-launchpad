'use client';

import { List, MagnifyingGlass, UserCircle, Wallet, X } from '@phosphor-icons/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
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
  { href: '/launch', label: 'Create' },
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
    { href: '/leaderboard', label: 'Leaderboard' },
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
          <img src="/orba-wordmark-bloom.svg" alt="Orba" className="h-8 w-auto dark:hidden sm:h-9" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/orba-wordmark-bloom-dark.svg" alt="Orba" className="hidden h-8 w-auto dark:block sm:h-9" />
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
            Leaderboard
          </Link>
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {mounted && isConnected && address && (
            <Link
              href={`/profile/${address}`}
              className={`tab hidden items-center gap-1.5 lg:inline-flex ${
                isActive('/profile') ? 'tab-active' : ''
              }`}
            >
              <UserCircle size={17} aria-hidden="true" />
              Profile
            </Link>
          )}
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
                className="inline-flex items-center gap-2 rounded border border-bg-border bg-bg-card px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-hover"
                aria-label={`Disconnect wallet ${shortenAddress(address!)}`}
                title="Disconnect wallet"
              >
                <Wallet size={17} aria-hidden="true" />
                <span className="hidden sm:inline">{shortenAddress(address!)}</span>
              </button>
            </>
          )}

          <ConnectButton />
          <button
            onClick={() => {
              setMenuOpen((value) => !value);
              setMobileSearchOpen(false);
            }}
            className="icon-button xl:hidden"
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
        <div id="primary-menu" className="border-t border-bg-border bg-bg-base/95 px-4 py-3 backdrop-blur-xl xl:hidden">
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
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  if (mounted && isConnected) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        disabled={connectors.length === 0}
        className="btn-primary inline-flex items-center gap-2 whitespace-nowrap !px-3 text-sm sm:!px-4"
        aria-label="Connect wallet"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <Wallet size={17} aria-hidden="true" />
        <span className="hidden sm:inline">Connect Wallet</span>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Choose a wallet"
          className="absolute right-0 top-full z-[70] mt-2 w-64 rounded-xl border border-bg-border bg-bg-base p-2 shadow-subtle-3"
        >
          <p className="px-3 pb-2 pt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            Choose a wallet
          </p>
          {connectors.map((connector) => {
            const isWalletConnect = connector.type === 'walletConnect';
            const label = isWalletConnect
              ? 'WalletConnect'
              : connector.name === 'Injected'
                ? 'Browser wallet'
                : connector.name;
            return (
              <button
                key={connector.uid}
                role="menuitem"
                onClick={() => {
                  connect({ connector });
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-bg-hover"
              >
                <Wallet size={20} className="shrink-0 text-accent-blue" aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-text-primary">{label}</span>
                  <span className="block text-xs text-text-muted">
                    {isWalletConnect ? 'QR code or another device' : 'Browser extension or in-app wallet'}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
