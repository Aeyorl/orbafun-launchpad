import Link from 'next/link';

const presets = [
  { name: 'Spark', thresholds: '$10 · $50 · $150', burn: '10% · 25% · 100%', unlock: '20% · 30% · 100%' },
  { name: 'Momentum', thresholds: '$25 · $100 · $500', burn: '10% · 25% · 100%', unlock: '20% · 30% · 100%' },
  { name: 'Marathon', thresholds: '$100 · $500 · $2,500', burn: '10% · 25% · 100%', unlock: '20% · 30% · 100%' },
];

export default function FeesPage() {
  return <main className="mx-auto min-h-[70vh] max-w-4xl px-5 py-12 md:px-8"><p className="text-sm uppercase tracking-[0.2em] text-emerald-300">NEAR testnet</p><h1 className="mt-2 text-4xl font-semibold">Supply, fees & milestones</h1><div className="mt-8 grid gap-3 sm:grid-cols-2"><Metric label="Total supply" value="1,000,000,000 tokens" /><Metric label="Bonding curve allocation" value="880,000,000 tokens" /><Metric label="Reserved allocation" value="120,000,000 tokens" /><Metric label="Trading fee" value="1% · split 50/50 creator and protocol" /></div><p className="mt-5 text-sm leading-6 text-white/55">Only reserved inventory can be burned. Burns do not alter curve inventory or virtual reserves. Treasury funding comes from the protocol share; each launch fixes its recipient and the milestone schedule.</p><h2 className="mb-3 mt-9 text-xl font-semibold">Milestone presets</h2><div className="space-y-3">{presets.map((preset) => <section key={preset.name} className="border border-white/10 p-4"><h3 className="font-semibold">{preset.name}</h3><p className="mt-2 text-sm text-white/55">Cumulative volume: {preset.thresholds}</p><p className="mt-1 text-sm">Reserved burn: {preset.burn}</p><p className="mt-1 text-sm">Treasury unlock: {preset.unlock}</p></section>)}</div><p className="mt-8 text-sm text-white/50">Token creation attaches NEAR to cover token account creation and contract storage. The unused amount is refunded. USDC and token storage registration may require a separate storage deposit.</p><Link href="/near-demo" className="mt-6 inline-flex rounded-full bg-emerald-300 px-5 py-3 font-semibold text-black">Open launchpad</Link></main>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="border border-white/10 p-4"><p className="text-xs text-white/45">{label}</p><p className="mt-1 font-medium">{value}</p></div>; }
