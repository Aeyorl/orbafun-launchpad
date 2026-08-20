'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useRef, useEffect, useState } from 'react';
import { api, OhlcvCandle, CandleTimeframe } from '@/lib/api';
import { useTokenEvents, TokenEvent } from '@/lib/useWebSocket';

export interface LiveMarketMove {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  marketCap: number;
  value: number;
  volume: number;
  timestamp: number;
}

const TIMEFRAME_SECONDS: Record<CandleTimeframe, number> = {
  '10s': 10,
  '1m': 60, '5m': 300, '15m': 900, '30m': 1800,
  '1h': 3600, '4h': 14400, '1d': 86400,
};

/**
 * Reconcile a background history response with the bars already updated by
 * WebSocket events. History is authoritative for older buckets, but a cached
 * response must never roll the active candle backwards or make the chart snap.
 */
export function reconcileCandles(
  historical: OhlcvCandle[],
  live: OhlcvCandle[],
): OhlcvCandle[] {
  if (live.length === 0) return [...historical];

  const liveByTimestamp = new Map(live.map((candle) => [candle.timestamp, candle]));
  const reconciled = new Map<number, OhlcvCandle>();

  for (const candle of historical) {
    const liveCandle = liveByTimestamp.get(candle.timestamp);
    if (!liveCandle) {
      reconciled.set(candle.timestamp, candle);
      continue;
    }

    const liveIsNewer = liveCandle.volume >= candle.volume;
    reconciled.set(candle.timestamp, {
      timestamp: candle.timestamp,
      open: candle.open,
      high: Math.max(candle.high, liveCandle.high),
      low: Math.min(candle.low, liveCandle.low),
      close: liveIsNewer ? liveCandle.close : candle.close,
      volume: Math.max(candle.volume, liveCandle.volume),
    });
    liveByTimestamp.delete(candle.timestamp);
  }

  for (const candle of liveByTimestamp.values()) {
    reconciled.set(candle.timestamp, candle);
  }

  return [...reconciled.values()].sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * useCandles — fetches historical OHLCV candles from the API and
 * incrementally updates the current candle from WebSocket trade events.
 *
 * Architecture:
 *   1. Initial load: GET /tokens/:address/candles?timeframe=5m
 *   2. Live updates: WebSocket NEW_BUY/NEW_SELL events update the
 *      last candle's high/low/close/volume without refetching.
 *   3. Periodic refetch every 30s as a consistency backstop.
 */
export function useCandles(
  tokenAddress: string | null,
  timeframe: CandleTimeframe = '5m',
  mode: 'price' | 'mcap' = 'price',
) {
  const queryClient = useQueryClient();
  const candlesRef = useRef<OhlcvCandle[]>([]);
  const seriesKeyRef = useRef(`${tokenAddress}:${timeframe}:${mode}`);
  const [liveCandles, setLiveCandles] = useState<OhlcvCandle[]>([]);
  const [latestMove, setLatestMove] = useState<LiveMarketMove | null>(null);

  const { data: historicalCandles, isLoading, error } = useQuery({
    queryKey: ['candles', tokenAddress, timeframe, mode],
    queryFn: () => api.getCandles(tokenAddress!, timeframe, mode),
    enabled: !!tokenAddress,
    refetchInterval: 30_000, // backstop refetch
    staleTime: 10_000,
  });

  // Bars from different tokens, resolutions, or metric modes cannot be merged.
  useEffect(() => {
    const seriesKey = `${tokenAddress}:${timeframe}:${mode}`;
    if (seriesKeyRef.current === seriesKey) return;
    seriesKeyRef.current = seriesKey;
    candlesRef.current = [];
    setLiveCandles([]);
  }, [mode, timeframe, tokenAddress]);

  // Reconcile history without replacing newer bars received over WebSocket.
  useEffect(() => {
    if (historicalCandles) {
      setLiveCandles((current) => {
        const next = reconcileCandles(historicalCandles, current);
        candlesRef.current = next;
        return next;
      });
    }
  }, [historicalCandles]);

  // WebSocket: update current candle incrementally
  const handleEvent = useCallback(
    (event: TokenEvent) => {
      if (event.type !== 'NEW_BUY' && event.type !== 'NEW_SELL') return;
      if (!event.data) return;

      const trade = event.data;
      const tradePrice = Number(trade.price || 0);
      const tradeMcap = Number(trade.market_cap_after || 0);
      const tradeVolume = Number(trade.usdc_amount || 0) / 1e6;
      const value = mode === 'price' ? tradePrice : tradeMcap;
      if (value <= 0) return;

      const tradeTime = trade.timestamp ? new Date(trade.timestamp).getTime() : Date.now();
      const nowSec = Math.floor((Number.isFinite(tradeTime) ? tradeTime : Date.now()) / 1000);
      const bucketSec = TIMEFRAME_SECONDS[timeframe];
      const currentBucket = Math.floor(nowSec / bucketSec) * bucketSec;

      setLiveCandles((prev) => {
        const candles = [...prev];
        if (candles.length === 0) {
          // First candle
          candles.push({
            timestamp: currentBucket,
            open: value,
            high: value,
            low: value,
            close: value,
            volume: tradeVolume,
          });
        } else {
          const last = candles[candles.length - 1];
          if (last.timestamp === currentBucket) {
            // Update existing candle
            candles[candles.length - 1] = {
              ...last,
              high: Math.max(last.high, value),
              low: Math.min(last.low, value),
              close: value,
              volume: last.volume + tradeVolume,
            };
          } else if (currentBucket > last.timestamp) {
            // New candle bucket
            candles.push({
              timestamp: currentBucket,
              open: last.close,
              high: Math.max(last.close, value),
              low: Math.min(last.close, value),
              close: value,
              volume: tradeVolume,
            });
          }
        }
        candlesRef.current = candles;
        return candles;
      });

      setLatestMove({
        id: String(trade.tx_hash || `${event.type}-${tradeTime}`),
        side: event.type === 'NEW_BUY' ? 'buy' : 'sell',
        price: tradePrice,
        marketCap: tradeMcap,
        value,
        volume: tradeVolume,
        timestamp: Number.isFinite(tradeTime) ? tradeTime : Date.now(),
      });

      // Also invalidate token data so stats update
      queryClient.invalidateQueries({ queryKey: ['token', tokenAddress] });
    },
    [mode, timeframe, tokenAddress, queryClient],
  );

  const { isConnected, connectionStatus } = useTokenEvents(tokenAddress, handleEvent);

  return {
    candles: liveCandles,
    isLoading,
    isConnected,
    connectionStatus,
    latestMove,
    error,
  };
}
