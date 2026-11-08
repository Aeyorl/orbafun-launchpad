import Image from 'next/image';
import Link from 'next/link';

const groups = [
  ['Launchpad', [['/launch', 'Launch a token'], ['/explore', 'Market'], ['/profile', 'Wallet profiles'], ['/watchlist', 'Watchlist']]],
  ['Resources', [['/docs', 'Docs'], ['/fees', 'Fees'], ['/blog', 'Blog'], ['/leaderboard', 'Leaderboard']]],
  ['NEAR testnet', [['https://testnet.nearblocks.io', 'Block explorer'], ['https://faucet.circle.com/', 'Testnet USDC faucet'], ['https://docs.near.org/', 'NEAR developer docs']]],
] as const;

export function Footer() {
  return <footer className="mt-16 border-t border-bg-border bg-bg-card py-10 text-sm text-text-secondary">
    <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-5 md:grid-cols-4 md:px-8">
      <div className="col-span-2 md:col-span-1">
        <Link href="/" aria-label="Orba home">
          <Image src="/orba-wordmark-bloom.svg" alt="Orba" width={99} height={32} className="dark:hidden" />
          <Image src="/orba-wordmark-bloom-dark.svg" alt="Orba" width={99} height={32} className="hidden dark:block" />
        </Link>
        <p className="mt-3">Launch and trade memecoins on NEAR testnet. Use test tokens only.</p>
      </div>
      {groups.map(([title, links]) => <nav key={title} aria-label={title}>
        <h2 className="mb-3 font-semibold text-text-primary">{title}</h2>
        <ul className="space-y-2">{links.map(([href, label]) => <li key={href}>
          <Link href={href} className="hover:underline">{label}</Link>
        </li>)}</ul>
      </nav>)}
    </div>
  </footer>;
}
