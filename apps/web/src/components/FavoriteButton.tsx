'use client';

import { useState, useEffect } from 'react';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

/**
 * FavoriteButton — toggle a token in the connected wallet's watchlist.
 *
 * Shows a ★ (favorited) or ☆ (not favorited) icon. Calls the /favorites
 * API with wallet signature auth. Optimistic UI: flips the star immediately,
 * reverts on error.
 */
export function FavoriteButton({ tokenAddress }: { tokenAddress: string }) {
  const { address } = useAccount();
  const { getAuthToken, authenticate } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

  // Check initial state.
  useEffect(() => {
    if (!address) {
      setFavorited(false);
      return;
    }
    const token = getAuthToken();
    if (!token) {
      setFavorited(false);
      return;
    }
    api
      .checkFavorite(address, tokenAddress, token)
      .then((r) => setFavorited(r.favorited))
      .catch(() => {});
  }, [address, tokenAddress, getAuthToken]);

  if (!address) return null;

  const toggle = async () => {
    if (loading) return;
    // Ensure authenticated
    let token = getAuthToken();
    if (!token) {
      try {
        await authenticate();
        token = getAuthToken();
      } catch {
        toast.error('Authentication required to update watchlist');
        return;
      }
    }
    const wasFavorited = favorited;
    setFavorited(!wasFavorited); // optimistic
    setLoading(true);
    try {
      if (wasFavorited) {
        await api.removeFavorite(address, tokenAddress, token);
        toast('Removed from watchlist', { icon: '☆' });
      } else {
        await api.addFavorite(address, tokenAddress, token);
        toast.success('Added to watchlist');
      }
    } catch (err) {
      setFavorited(wasFavorited); // revert
      toast.error('Failed to update watchlist');
      console.error('[favorite] toggle failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={toggle}
      disabled={loading}
      aria-disabled={loading}
      aria-label={favorited ? `Remove ${tokenAddress.slice(0, 6)} from watchlist` : `Add ${tokenAddress.slice(0, 6)} to watchlist`}
      aria-pressed={favorited}
      className="btn-secondary text-sm px-3 py-1.5 flex items-center gap-1.5"
      title={favorited ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      <span className={favorited ? 'text-accent-yellow' : 'text-text-muted'}>
        {favorited ? '★' : '☆'}
      </span>
      <span className="hidden sm:inline">
        {favorited ? 'Watched' : 'Watch'}
      </span>
    </button>
  );
}
