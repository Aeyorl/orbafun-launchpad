'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { api, Token, Trade } from '@/lib/api';
import { useTokenEvents, TokenEvent } from '@/lib/useWebSocket';

/**
 * useTokenStats — live token stats with real-time WebSocket updates.
 *
 * Returns token data + computed stats (24h change, holders count, etc.)
 * and auto-invalidates when trades arrive via WebSocket.
 */
export function useTokenStats(tokenAddress: string | null) {
  const queryClient = useQueryClient();

  const { data: token, isLoading: tokenLoading } = useQuery({
    queryKey: ['token', tokenAddress],
    queryFn: () => api.getToken(tokenAddress!),
    enabled: !!tokenAddress,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  const { data: tradesData, isLoading: tradesLoading } = useQuery({
    queryKey: ['tokenTrades', tokenAddress],
    queryFn: () => api.getTokenTrades(tokenAddress!, { limit: 500, order: 'desc' }),
    enabled: !!tokenAddress && !!token,
    refetchInterval: 10_000,
  });

  const { data: holdersData } = useQuery({
    queryKey: ['tokenHolders', tokenAddress],
    queryFn: () => api.getTokenHolders(tokenAddress!, 50),
    enabled: !!tokenAddress && !!token,
    refetchInterval: 30_000,
  });

  // Compute 24h change
  const change24h = useMemo(() => {
    if (!token || !tradesData?.trades?.length) {
      return { pct: 0, isPositive: true };
    }
    const cutoff = Date.now() - 24 * 60 * 60_000;
    const trades24h = tradesData.trades.filter(
      (t) => new Date(t.timestamp).getTime() >= cutoff
    );
    if (trades24h.length === 0) return { pct: 0, isPositive: true };

    const currentPrice = Number(token.price);
    // trades24h is desc — last element is the oldest in the 24h window
    const oldestPrice = Number(trades24h[trades24h.length - 1].price);
    const diff = currentPrice - oldestPrice;
    const pct = oldestPrice > 0 ? (diff / oldestPrice) * 100 : 0;
    return { pct, isPositive: diff >= 0 };
  }, [token, tradesData]);

  // WebSocket: invalidate on trade events
  const handleEvent = useCallback(
    (event: TokenEvent) => {
      if (event.type === 'NEW_BUY' || event.type === 'NEW_SELL') {
        queryClient.invalidateQueries({ queryKey: ['token', tokenAddress] });
        queryClient.invalidateQueries({ queryKey: ['tokenTrades', tokenAddress] });
        queryClient.invalidateQueries({ queryKey: ['tokenHolders', tokenAddress] });
        queryClient.invalidateQueries({ queryKey: ['balance'] });
        queryClient.invalidateQueries({ queryKey: ['readContract'] });
      }
      if (event.type === 'TOKEN_GRADUATED') {
        queryClient.invalidateQueries({ queryKey: ['token', tokenAddress] });
      }
    },
    [tokenAddress, queryClient],
  );

  useTokenEvents(tokenAddress, handleEvent);

  return {
    token,
    trades: tradesData?.trades || [],
    totalTrades: tradesData?.total || 0,
    holders: holdersData?.holders || [],
    totalHolders: holdersData?.total || 0,
    change24h,
    isLoading: tokenLoading || tradesLoading,
  };
}
