import Link from 'next/link';

const steps = [
  { id: 'wallet', title: 'Connect a testnet wallet', text: 'Open Launch or a token page and choose Connect NEAR wallet. You need testnet NEAR for gas and testnet USDC for buys. The NEAR CLI option lets you sign with a testnet key saved in your keychain, then paste the transaction hash back into Orba.' },
  { id: 'launch', title: 'Launch a token', text: 'Choose a name, ticker, treasury recipient, and milestone preset. Add a description and upload a PNG, JPEG, GIF, or WebP image up to 1 MB, or paste an HTTPS or IPFS image link. A launch attaches 4 testnet NEAR for account creation and storage. Once indexed, Orba gives you a shareable token page.' },
  { id: 'trade', title: 'Find and trade tokens', text: 'Search Market by name, ticker, or account ID. On a token page, enter USDC to buy or a token quantity to sell. The trade uses a quote with 1% slippage protection. Your wallet may first ask you to approve storage registration. Use the transaction link to confirm settlement and the chart to view indexed trades.' },
  { id: 'milestones', title: 'Burns and treasury unlocks', text: 'Settled buy volume advances the chosen preset. At each threshold, the contract burns part of the reserved token supply and unlocks USDC for the treasury recipient fixed at launch. After the final burn, new treasury fees become claimable as trades settle. The token page links to the burn and payout transactions.' },
  { id: 'claim', title: 'Claim USDC', text: 'Sellers claim USDC proceeds from the token page. The fixed treasury recipient can separately claim unlocked treasury funds. If an asynchronous payout fails, the contract restores the claimable balance.' },
  { id: 'profile', title: 'Wallet profiles and watchlists', text: 'Open Profile to look up a NEAR account and see its indexed launches and trades. Watch a token from its page to save it to your browser’s watchlist.' },
  { id: 'limits', title: 'Testnet limits', text: 'Trading ends on the bonding curve at graduation. The demo has no DEX handoff yet. Milestones count buy volume, so repeat buys can advance them. The testnet contract can still be upgraded, and the site may omit older activity while historical indexing catches up.' },
];

export default function DocsPage() {
  return <main className="mx-auto min-h-[70vh] max-w-4xl px-5 py-12 md:px-8">
    <p className="text-sm uppercase tracking-[0.2em] text-accent-blue">NEAR testnet</p>
    <h1 className="mt-2 text-4xl font-semibold">Orba docs</h1>
    <p className="mt-3 text-text-secondary">Launch, find, and trade memecoins with on-chain burns and treasury rules.</p>
    <nav aria-label="On this page" className="my-6 flex flex-wrap gap-3 text-sm text-accent-blue">
      {steps.map(({ id, title }) => <a className="underline" key={id} href={`#${id}`}>{title}</a>)}
    </nav>
    <div className="space-y-4">{steps.map(({ id, title, text }) => <section id={id} key={id} className="card scroll-mt-4">
      <h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{text}</p>
    </section>)}</div>
    <div className="mt-8 flex flex-wrap gap-4 text-sm text-accent-blue">
      <Link href="/launch">Launch a token</Link><Link href="/explore">Explore launches</Link><Link href="/fees">Fees and supply</Link>
      <a href="https://faucet.circle.com/">Get testnet USDC</a>
    </div>
  </main>;
}
