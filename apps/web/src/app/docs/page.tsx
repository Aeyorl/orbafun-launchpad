import Link from 'next/link';

const steps = [
  ['Create', 'Choose a token name, symbol, fixed treasury recipient, and milestone preset. The launchpad creates a NEP-141 token account and allocates curve and reserved supply.'],
  ['Trade', 'Buy with the configured NEAR testnet USDC through NEP-141 transfer-call. Sells transfer tokens back to the curve and credit claimable USDC proceeds.'],
  ['Reach milestones', 'Cumulative curve volume crosses preset thresholds. The contract burns only reserved inventory and unlocks part of the treasury pool.'],
  ['Claim', 'The treasury recipient selected at launch claims unlocked funds. Sellers claim their sale proceeds separately. Failed asynchronous payouts restore claimable accounting.'],
];

export default function DocsPage() {
  return <main className="mx-auto min-h-[70vh] max-w-4xl px-5 py-12 md:px-8"><p className="text-sm uppercase tracking-[0.2em] text-accent-blue">Protocol guide · NEAR testnet</p><h1 className="mt-2 text-4xl font-semibold">How Orba works</h1><p className="mt-3 text-text-secondary">Orba combines a bonding curve with reserved supply burns and rule-based treasury unlocks.</p><div className="mt-8 space-y-4">{steps.map(([title, description], index) => <section key={title} className="border border-bg-border p-5"><p className="text-xs text-accent-blue">STEP {index + 1}</p><h2 className="mt-1 text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-text-secondary">{description}</p></section>)}</div><div className="mt-8 flex gap-4 text-sm"><Link href="/fees" className="text-accent-blue">Fees and supply →</Link><Link href="/explore" className="text-accent-blue">Explore launches →</Link></div><p className="mt-8 border-l-2 border-accent-orange/50 pl-4 text-sm text-text-secondary">This is a testnet prototype. Use test assets only; contract deployment and economics require independent review before any mainnet use.</p></main>;
}
