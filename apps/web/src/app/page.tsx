import Image from 'next/image';
import Link from 'next/link';
import MarketBoard from '../components/MarketBoard';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-6xl px-5 md:px-8">
      <section className="grid items-center gap-12 border-b border-bg-border py-16 lg:grid-cols-[1.05fr_0.95fr] lg:py-24">
        <div>
          <p className="mb-6 text-xs font-extrabold tracking-[0.14em] text-accent-blue">A BRIGHTER KIND OF LAUNCHPAD</p>
          <h1 className="text-[clamp(2.75rem,6vw,5.5rem)] leading-[0.9] tracking-[-0.065em] text-accent-blue">
            Make a coin<br />people want to<br /><em className="font-normal text-accent-green">pass around.</em>
          </h1>
          <p className="mt-8 max-w-lg text-base leading-relaxed text-text-secondary">
            Launch an idea, find its first believers, and grow it into a real market on NEAR testnet.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <Link href="/launch" className="btn-primary shadow-subtle">Bring an idea to life</Link>
            <Link href="/explore" className="font-bold text-accent-blue hover:underline">See what is growing</Link>
          </div>
        </div>
        <div className="relative min-h-[360px] sm:min-h-[500px] rotate-[1deg] overflow-hidden rounded-3xl border border-text-primary bg-accent-peach p-6 shadow-[14px_14px_0_rgb(var(--color-accent-blue))]">
          <div className="flex items-center justify-between font-mono text-[9px] font-bold tracking-[0.14em] text-accent-sienna"><span>THE SUNNY ONE</span><span>ILLUSTRATION</span></div>
          <div className="absolute left-1/2 top-[43%] h-44 w-44 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-primary bg-accent-green shadow-[10px_10px_0_rgba(23,33,60,.18)]" />
          <div className="absolute left-1/2 top-[43%] grid h-44 w-44 -translate-x-1/2 -translate-y-1/2 place-content-center "><Image src="/orba-bloom-icon.svg" alt="" width={120} height={120} priority /></div>
          <svg viewBox="0 0 620 380" className="absolute inset-x-[5%] bottom-[7%] h-[76%] w-[90%]" fill="none" aria-hidden="true">
            <path d="M18 340 C175 336 226 304 294 228 C369 145 452 92 602 28" stroke="rgb(var(--color-accent-blue))" strokeWidth="4" />
          </svg>
          <span className="absolute left-[8%] top-[25%] -rotate-3 rounded-md border border-text-primary bg-[#9fe2c2] px-3 py-2 font-mono text-[9px] font-bold text-[#17213c] shadow-[4px_4px_0_#17213c]">DAYBREAK BAZAAR</span>
          <span className="absolute bottom-[20%] right-[8%] rotate-3 rounded-md border border-text-primary bg-accent-blue px-3 py-2 font-mono text-[9px] font-bold text-white shadow-[4px_4px_0_#17213c]">NEAR TESTNET</span>
          <div className="absolute inset-x-6 bottom-5 flex items-center justify-between rounded-xl border border-text-primary bg-bg-card px-5 py-4 text-text-primary">
            <div><strong className="block font-serif text-2xl font-normal text-accent-blue">Sundae Club</strong><span className="font-mono text-[9px] text-text-muted">ORBA · DAYBREAK</span></div>
          </div>
        </div>
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
            ].map(([title, description], index) => <article key={title} className="card">
              <p className="font-mono text-sm text-text-secondary">0{index + 1}</p>
              <h3 className="mb-2 mt-2 text-lg font-semibold">{title}</h3>
              <p className="text-sm text-text-secondary">{description}</p>
            </article>)}
          </div>
        </section>
      </div>
    </main>
  );
}
