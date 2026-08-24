import Link from 'next/link';
import { AddArcNetworkButton } from './AddArcNetworkButton';

/**
 * Footer — site footer with Resources and Legal sections.
 */
export function Footer() {
  return (
    <footer className="mt-20 border-t border-bg-border bg-bg-card py-12">
      <div className="mx-auto max-w-[1440px] px-4 lg:px-6">
        <div className="mb-8 flex items-center justify-between border-b border-bg-border pb-4 font-mono text-[9px] tracking-[0.18em] text-text-muted">
          <span>ORBA / DAYBREAK BAZAAR</span>
        </div>
        <div className="grid grid-cols-2 gap-8 text-sm md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <div className="mb-2">
              <div className="flex items-center gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/orba-wordmark-bloom.svg" alt="Orba" className="h-12 w-auto dark:hidden" />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/orba-wordmark-bloom-dark.svg" alt="Orba" className="hidden h-12 w-auto dark:block" />
              </div>
            </div>
            <p className="text-text-muted text-xs leading-relaxed">
              Make a little market. See where people take it. Built on Arc&apos;s
              USDC-native network.
            </p>
            {/* Add Arc network to wallet — one-click via EIP-3085 instead of
                manual configuration in wallet settings */}
            <AddArcNetworkButton />
          </div>

          {/* Resources */}
          <div>
            <h4 className="mb-3 font-mono text-[10px] font-semibold tracking-[0.16em] text-accent-blue">RESOURCES</h4>
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
            <h4 className="mb-3 font-mono text-[10px] font-semibold tracking-[0.16em] text-accent-blue">LEGAL</h4>
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
            <h4 className="mb-3 font-mono text-[10px] font-semibold tracking-[0.16em] text-accent-blue">NETWORK</h4>
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

        <div className="mt-8 flex flex-col gap-2 border-t border-bg-border pt-6 text-left font-mono text-[9px] tracking-[0.06em] text-text-muted md:flex-row md:items-end md:justify-between">
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
        </div>
      </div>
    </footer>
  );
}
