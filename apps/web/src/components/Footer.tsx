import Link from 'next/link';
import { AddArcNetworkButton } from './AddArcNetworkButton';

/**
 * Footer — site footer with Resources and Legal sections.
 */
export function Footer() {
  return (
    <footer className="border-t border-bg-border mt-12 py-8">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-sm">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/orba-logo-light.svg"
                alt="Orba"
                className="h-8 w-auto dark:hidden"
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/orba-logo-dark.svg"
                alt="Orba"
                className="hidden h-8 w-auto dark:block"
              />
            </div>
            <p className="text-text-muted text-xs leading-relaxed">
              The stablecoin-native launchpad on Arc. Built on Circle&apos;s
              USDC-native L1. Not affiliated with Circle.
            </p>
            {/* Add Arc network to wallet — one-click via EIP-3085 instead of
                manual configuration in wallet settings */}
            <AddArcNetworkButton />
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-semibold mb-3 text-text-secondary">Resources</h4>
            <ul className="space-y-2 text-text-muted">
              <li>
                <Link href="/docs" className="hover:text-text-primary transition-colors">
                  Docs
                </Link>
              </li>
              <li>
                <Link href="/fees" className="hover:text-text-primary transition-colors">
                  Fees
                </Link>
              </li>
              <li>
                <Link href="/blog" className="hover:text-text-primary transition-colors">
                  Blog
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold mb-3 text-text-secondary">Legal</h4>
            <ul className="space-y-2 text-text-muted">
              <li>
                <Link href="/legal/privacy-policy" className="hover:text-text-primary transition-colors">
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/terms" className="hover:text-text-primary transition-colors">
                  Terms &amp; Conditions
                </Link>
              </li>
              <li>
                <Link href="/legal/tokenized-agent-disclaimer" className="hover:text-text-primary transition-colors">
                  Tokenized Agent Disclaimer
                </Link>
              </li>
              <li>
                <Link href="/legal/dmca-policy" className="hover:text-text-primary transition-colors">
                  DMCA Policy
                </Link>
              </li>
              <li>
                <Link href="/legal/trademark-guidelines" className="hover:text-text-primary transition-colors">
                  Trademark Guidelines
                </Link>
              </li>
            </ul>
          </div>

          {/* Community / Social */}
          <div>
            <h4 className="font-semibold mb-3 text-text-secondary">Community</h4>
            <ul className="space-y-2 text-text-muted">
              <li>
                <a
                  href="https://faucet.circle.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-text-primary transition-colors"
                  aria-label="Testnet Faucet (opens in new tab)"
                >
                  Testnet Faucet <span className="sr-only">(opens in new tab)</span>
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-bg-border mt-8 pt-6 text-center text-text-muted text-xs">
          <p>
            &copy; {new Date().getFullYear()} Orba. All rights reserved. Built on{' '}
            <a
              href="https://arc.io"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent-green hover:underline"
              aria-label="Arc.io (opens in new tab)"
            >
              Arc <span className="sr-only">(opens in new tab)</span>
            </a>
            .
          </p>
          <p className="mt-1">
            Orba is an independent project and is not affiliated with or endorsed by
            Circle Internet Financial. USDC is a registered trademark of Circle.
          </p>
        </div>
      </div>
    </footer>
  );
}
