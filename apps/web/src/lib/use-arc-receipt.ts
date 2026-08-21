'use client';

import { useState, useEffect } from 'react';
import type { Log } from 'viem';
import { API_URL, ARC_RPC_URLS as DIRECT_ARC_RPC_URLS } from './config';

/**
 * Fallback receipt poller for the Arc testnet.
 *
 * wagmi's `useWaitForTransactionReceipt` polls the RPC every few seconds,
 * but the Arc testnet RPC is heavily rate-limited and often returns
 * `-32011 request limit reached`, causing the hook to never resolve.
 *
 * This hook polls the receipt directly as a safety net, rotating between
 * all 4 public Arc testnet RPC providers on each attempt so a rate-limited
 * provider is skipped. It returns `true` once the receipt is found and the
 * tx succeeded, or `false` if the tx failed / was not found after `timeoutMs`.
 *
 * Providers (from https://docs.arc.io/arc/references/rpc-endpoints):
 *   Circle, dRPC, QuickNode, Blockdaemon — each with independent rate limits.
 */
const API_RPC_PROXY = `${API_URL}/rpc`;

const RECEIPT_RPC_URLS = [
  // Our API's same-origin RPC proxy first — never blocked by browser
  // shields/adblockers, and it rotates providers server-side.
  API_RPC_PROXY,
  ...DIRECT_ARC_RPC_URLS,
];

export function useArcReceiptFallback(
  txHash: `0x${string}` | undefined,
  timeoutMs = 120_000
): { confirmed: boolean; failed: boolean; timedOut: boolean; logs: Pick<Log, 'data' | 'topics'>[] } {
  const [confirmed, setConfirmed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const [logs, setLogs] = useState<Pick<Log, 'data' | 'topics'>[]>([]);

  // Reset state whenever the tx hash changes (e.g. approval -> buy),
  // so a previous confirmation doesn't leak into the next transaction.
  useEffect(() => {
    setConfirmed(false);
    setFailed(false);
    setTimedOut(false);
    setLogs([]);
  }, [txHash]);

  useEffect(() => {
    if (!txHash || confirmed || failed) return;

    let cancelled = false;
    const startTime = Date.now();
    let rpcIndex = 0;

    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - startTime > timeoutMs) {
        setTimedOut(true);
        return;
      }
      // Rotate to the next RPC provider on each attempt.
      const rpcUrl = RECEIPT_RPC_URLS[rpcIndex % RECEIPT_RPC_URLS.length];
      rpcIndex++;
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getTransactionReceipt',
            params: [txHash],
          }),
        });
        const json = await res.json();
        if (json.result) {
          if (cancelled) return;
          // Some RPCs return "0x1", others may return "0x01" — normalize.
          const status = BigInt(json.result.status ?? '0x0');
          if (status === 1n) {
            setLogs((json.result.logs || []).map((log: { data: Log['data']; topics: Log['topics'] }) => ({
              data: log.data,
              topics: log.topics,
            })));
            setConfirmed(true);
          } else {
            setFailed(true);
          }
          return;
        }
        if (json.error) {
          console.warn(`[arc-receipt] ${rpcUrl} error:`, json.error);
        }
      } catch (err) {
        // network/rate-limit/adblock error — retry next interval with next RPC.
        // Logged so silent failures (e.g. browser shields blocking the RPC
        // domain) are visible in the console instead of hanging forever.
        console.warn(`[arc-receipt] ${rpcUrl} fetch failed:`, err);
      }
      // Shorter interval (4s) since we rotate providers — each provider
      // only gets hit once every (4s * numProviders) = 16s, well under
      // any individual provider's rate limit.
      setTimeout(poll, 4_000);
    };

    // Start polling after a short delay (give wagmi a chance first)
    const initial = setTimeout(poll, 5_000);

    return () => {
      cancelled = true;
      clearTimeout(initial);
    };
  }, [txHash, confirmed, failed, timeoutMs]);

  return { confirmed, failed, timedOut, logs };
}
