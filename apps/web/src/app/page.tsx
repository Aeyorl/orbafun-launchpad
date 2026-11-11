import Link from 'next/link';
import { MemeCookingCard } from '../components/MemeCookingCard';
import { units } from './settlement/data';
import { getCatalog, imageUrl, statusOf, wrappedNearDeposit } from '../components/meme-cooking-data';
import { MemeCookingImage } from '../components/MemeCookingImage';

export default async function HomePage() {
  const catalog = await getCatalog().catch(() => null);
  const now = Date.now();
  const featured = catalog?.find((listing) => statusOf(listing, now) === 'launched' && imageUrl(listing.image));
  const recent = catalog?.filter((listing) => listing.meme_id !== featured?.meme_id).slice(0, 6) ?? [];

  const stats = catalog && [
    ['Auctions', catalog.length.toLocaleString('en-US')],
    ['wNEAR deposited in launched auctions', units(catalog.reduce((sum, listing) =>
      statusOf(listing, now) === 'launched' ? sum + (wrappedNearDeposit(listing) ?? 0n) : sum, 0n).toString(), 24)],
    ['Launched', catalog.filter((listing) => statusOf(listing, now) === 'launched').length.toLocaleString('en-US')],
  ];

  return (
    <main className="mx-auto max-w-6xl px-5 md:px-8">
      <section className="grid items-center gap-12 border-b border-bg-border py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <h1 className="text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.9] tracking-[-0.065em] text-accent-blue">
            Make a coin<br />people want to<br /><em className="font-normal text-accent-green">pass around.</em>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/launch" className="btn-primary shadow-subtle">Launch on testnet</Link>
            <Link href="/explore/meme-cooking" className="font-bold text-accent-blue hover:underline">See what is growing</Link>
          </div>
        </div>
        {featured && <a
          href={'https://meme.cooking/meme/' + featured.meme_id}
          className="relative block min-h-[360px] rotate-[1deg] overflow-hidden rounded-3xl border border-text-primary bg-accent-peach p-6 shadow-[14px_14px_0_rgb(var(--color-accent-blue))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-blue sm:min-h-[500px]"
        >
          <MemeCookingImage src={imageUrl(featured.image)} symbol={featured.symbol} eager
            className="absolute inset-0 text-6xl" />
          <div className="absolute inset-x-6 bottom-5 rounded-xl border border-text-primary bg-bg-card px-5 py-4">
            <strong className="block font-serif text-2xl font-normal text-accent-blue">{featured.name} · ${featured.symbol}</strong>
          </div>
        </a>}
      </section>
      <div className="space-y-12 py-12">
        <section aria-labelledby="meme-cooking-listings" className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="meme-cooking-listings" className="text-3xl text-accent-blue">Meme.cooking · NEAR mainnet</h2>
            <Link href="/explore/meme-cooking" className="font-semibold text-accent-blue underline">Explore all auctions</Link>
          </div>
          {stats && <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {stats.map(([label, value]) => <div className="card-elevated text-center" key={label}>
              <dt className="text-xs text-text-secondary">{label}</dt>
              <dd className="break-all text-2xl font-bold tabular-nums">{value}</dd>
            </div>)}
          </dl>}
          {recent.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((listing) => <MemeCookingCard key={listing.meme_id} listing={listing} now={now} />)}
          </div> : <p role="status" className="card">{catalog ? 'No auctions to display.' : 'Meme.cooking listings are temporarily unavailable.'}</p>}
        </section>
        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-4 text-3xl text-accent-blue">How the Orba testnet demo works</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {[
              ['Launch a token', 'Choose a name, symbol, fixed treasury recipient, and milestone preset.'],
              ['Trade on the curve', 'Buy and sell with testnet USDC while the bonding curve is active.'],
              ['Reach milestones', 'Trading volume triggers burns from the reserved supply and unlocks treasury funds for the fixed recipient.'],
            ].map(([title, description]) => <article key={title} className="card">
              <h3 className="mb-2 mt-2 text-lg font-semibold">{title}</h3>
              <p className="text-sm text-text-secondary">{description}</p>
            </article>)}
          </div>
        </section>
      </div>
    </main>
  );
}
