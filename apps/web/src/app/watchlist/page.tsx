import { Watchlist } from '../../components/Watchlist';

export default function WatchlistPage() {
  return <main className="mx-auto min-h-[70vh] max-w-6xl space-y-6 px-5 py-12 md:px-8">
    <h1 className="text-4xl text-accent-blue">Watchlist</h1>
    <p className="text-text-secondary">Saved on this browser.</p>
    <Watchlist />
  </main>;
}
