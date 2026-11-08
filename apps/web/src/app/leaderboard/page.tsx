import MarketBoard from '../../components/MarketBoard';

export default function LeaderboardPage() {
  return <main className="mx-auto min-h-[70vh] max-w-6xl space-y-6 px-5 py-12 md:px-8">
    <h1 className="text-4xl text-accent-blue">Leaderboard</h1>
    <MarketBoard leaderboard />
  </main>;
}
