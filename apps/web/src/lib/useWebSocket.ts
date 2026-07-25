'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { WS_URL } from './config';

export interface TokenEvent {
  type: 'NEW_TOKEN' | 'NEW_BUY' | 'NEW_SELL' | 'TOKEN_GRADUATED';
  tokenAddress: string;
  data: any;
  timestamp: number;
}

/**
 * WebSocket hook for real-time token events.
 *
 * @param tokenAddress - If provided, subscribes to per-token events.
 *                       If null, subscribes to global events only.
 * @param onEvent - Callback fired for each event.
 *
 * Usage:
 *   // Global feed (landing page):
 *   useTokenEvents(null, (event) => console.log(event));
 *
 *   // Per-token feed (coin page):
 *   useTokenEvents(tokenAddress, (event) => console.log(event));
 */
export function useTokenEvents(
  tokenAddress: string | null,
  onEvent: (event: TokenEvent) => void
) {
  const socketRef = useRef<Socket | null>(null);
  const callbackRef = useRef(onEvent);
  const [isConnected, setIsConnected] = useState(false);

  // Keep callback ref updated without re-establishing connection
  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const room = tokenAddress
      ? `token:${tokenAddress.toLowerCase()}`
      : 'tokens:global';

    const socket = io(WS_URL, {
      transports: ['websocket'],
      // Robust reconnection: infinite attempts, exponential backoff capped
      // at 10s. Socket.io handles this automatically — we just rejoin the
      // room on every (re)connect.
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000, // initial wait before first retry
      reconnectionDelayMax: 10_000, // cap backoff at 10s
      randomizationFactor: 0.3, // spread retries to avoid thundering herd
    });
    socketRef.current = socket;

    const joinRoom = () => socket.emit('join', room);

    socket.on('connect', () => {
      setIsConnected(true);
      joinRoom(); // (re)join on every connect, including reconnects
    });
    socket.on('disconnect', (reason) => {
      setIsConnected(false);
      // 'io server disconnect' is the only reason that doesn't auto-reconnect.
      // In that case, force a manual reconnect.
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });
    socket.on('connect_error', (err) => {
      // Don't spam console — socket.io retries silently.
      // Log once at debug level for visibility during development.
      if (process.env.NODE_ENV !== 'production') {
        console.debug('[ws] connect_error:', err.message);
      }
    });
    socket.on('token:event', (event: TokenEvent) => {
      callbackRef.current(event);
    });

    return () => {
      socket.emit('leave', room);
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [tokenAddress]);

  return { isConnected };
}
