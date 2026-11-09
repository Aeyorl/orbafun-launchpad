import Image from 'next/image';
import Link from 'next/link';
import MarketBoard from '../components/MarketBoard';
export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 md:px-8">
      <section className="grid items-center gap-12 border-b border-bg-border py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <h1 className="text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.9] tracking-[-0.065em] text-accent-blue">
            Make a coin<br />people want to<br /><em className="font-normal text-accent-green">pass around.</em>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/launch" className="btn-primary shadow-subtle">Bring an idea to life</Link>
            <Link href="/explore" className="font-bold text-accent-blue hover:underline">See what is growing</Link>
          </div>
        </div>
        <Link
          href="/token/token-3.launchpad.orba-near-demo-41c9.testnet"
          className="relative block min-h-[360px] rotate-[1deg] overflow-hidden rounded-3xl border border-text-primary bg-accent-peach p-6 shadow-[14px_14px_0_rgb(var(--color-accent-blue))] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-accent-blue sm:min-h-[500px]"
        >
          <Image
            src="/api/images/fd39d93561a41d43b3e144c0e45515f2bc29a577da29f8990325e0b8bcc42b1d"
            alt=""
            width={176}
            height={176}
            unoptimized
            className="absolute left-1/2 top-[43%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-primary bg-bg-card object-cover shadow-[10px_10px_0_rgba(23,33,60,.18)]"
          />
          <div className="absolute inset-x-6 bottom-5 rounded-xl border border-text-primary bg-bg-card px-5 py-4">
            <strong className="block font-serif text-2xl font-normal text-accent-blue">wifnear · $WIFNEAR</strong>
          </div>
        </Link>
      </section>
      <div className="space-y-12 py-12">
        <MarketBoard />
        <section aria-labelledby="how-it-works">
          <h2 id="how-it-works" className="mb-4 text-3xl text-accent-blue">How it works</h2>
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
