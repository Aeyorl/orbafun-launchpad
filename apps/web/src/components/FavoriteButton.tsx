'use client';

import { useEffect, useState } from 'react';
import { useAccount } from 'wagmi';
import toast from 'react-hot-toast';
import { Star } from '@phosphor-icons/react';

import { api } from '@/lib/api';
import { useAuth } from '@/lib/use-auth';

export function FavoriteButton({ tokenAddress }: { tokenAddress: string }) {
  const { address } = useAccount();
  const { getAuthToken, authenticate } = useAuth();
  const [favorited, setFavorited] = useState(false);
  const [loading, setLoading] = useState(false);

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
    api.checkFavorite(address, tokenAddress, token).then((result) => setFavorited(result.favorited)).catch(() => undefined);
  }, [address, tokenAddress, getAuthToken]);

  if (!address) return null;

  const toggle = async () => {
    if (loading) return;
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
    setFavorited(!wasFavorited);
    setLoading(true);
    try {
      if (wasFavorited) {
        await api.removeFavorite(address, tokenAddress, token);
        toast('Removed from watchlist');
      } else {
        await api.addFavorite(address, tokenAddress, token);
        toast.success('Added to watchlist');
      }
    } catch (error) {
      setFavorited(wasFavorited);
      toast.error('Failed to update watchlist');
      console.error('[favorite] toggle failed:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={loading}
      aria-label={favorited ? 'Remove token from watchlist' : 'Add token to watchlist'}
      aria-pressed={favorited}
      className="observatory-action"
      title={favorited ? 'Remove from watchlist' : 'Add to watchlist'}
    >
      <Star
        size={17}
        weight={favorited ? 'fill' : 'bold'}
        className={favorited ? 'text-accent-yellow' : 'text-text-secondary'}
        aria-hidden="true"
      />
      <span>{favorited ? 'Watched' : 'Watch'}</span>
    </button>
  );
}
