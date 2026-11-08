import Image from 'next/image';
import Link from 'next/link';

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
            <Link href="/near-demo" className="btn-primary shadow-subtle">Bring an idea to life</Link>
            <Link href="/explore" className="font-bold text-accent-blue hover:underline">See what is growing</Link>
          </div>
        </div>
        <div className="card-peach grid min-h-[300px] place-items-center gap-6 border border-text-primary p-8 text-center shadow-subtle-3 lg:min-h-[420px]">
          <Image src="/orba-bloom-icon.svg" width={144} height={144} alt="" priority />
          <div>
            <p className="font-mono text-xs font-bold tracking-widest">ORBA ON NEAR</p>
            <p className="mt-2 font-serif text-3xl">Milestones with consequences.</p>
            <p className="mt-3 max-w-xs text-sm">Trading milestones burn reserved supply and unlock treasury funds for the recipient chosen at launch.</p>
          </div>
        </div>
      </section>
    </main>
  );
}
