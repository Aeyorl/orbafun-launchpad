'use client';

import { useQuery } from '@tanstack/react-query';
import { useAccount } from 'wagmi';
import { api, Token } from '@/lib/api';
import { TokenGrid } from '@/components/TokenGrid';
import { useAuth } from '@/lib/use-auth';

/**
 * Watchlist page — shows the connected wallet's favorited tokens.
 * Accessible from the navbar (added below) or directly at /watchlist.
 */
export default function WatchlistPage() {
  const { address, isConnected } = useAccount();
  const { getAuthToken, authedWallet } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['favorites', address],
    queryFn: () => api.listFavorites(address!, 100, 0, getAuthToken()),
    enabled: !!address && !!authedWallet,
  });

  if (!isConnected) {
    return (
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">My Watchlist</h1>
        <div className="card p-8 text-center text-text-muted">
          Connect your wallet to see your watchlist.
        </div>
      </div>
    );
  }

  const tokens = data?.tokens || [];

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">My Watchlist</h1>
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card animate-pulse h-48" />
          ))}
        </div>
      ) : tokens.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">☆</div>
          <h2 className="font-semibold text-lg mb-2">No favorites yet</h2>
          <p className="text-text-muted text-sm mb-4">
            Click the ☆ button on any token page to add it to your watchlist.
          </p>
          <a href="/explore" className="btn-primary inline-block">
            Explore tokens →
          </a>
        </div>
      ) : (
        <TokenGrid tokens={tokens} />
      )}
    </div>
  );
}
