import { Body, Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';

/**
 * RpcController — JSON-RPC read proxy for the frontend.
 *
 * Why this exists:
 *   Browser extensions / shields (Brave, adblockers, privacy tools) can block
 *   cross-origin fetches to third-party RPC domains, which silently breaks
 *   every wagmi read in the dApp (balances show $0, quotes never load,
 *   receipt polling hangs on "Confirming..." forever).
 *
 *   Routing reads through our own API (same origin as the rest of the app's
 *   data) is never blocked, and also lets us rotate between all 4 Arc testnet
 *   RPC providers server-side to dodge per-provider rate limits.
 *
 * Security:
 *   Only whitelisted READ methods are forwarded. Transactions are signed and
 *   broadcast by the user's wallet, never through this proxy.
 *
 * Rate limiting:
 *   300 req / 60s per IP — wagmi fires many parallel reads on page load
 *   (balance, allowance, quotes, multiple contract reads). The default
 *   120/min global limit would throttle a normal dApp page load.
 */
const ALLOWED_METHODS = new Set([
  'eth_blockNumber',
  'eth_call',
  'eth_chainId',
  'eth_estimateGas',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getBlockByHash',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getLogs',
  'eth_getStorageAt',
  'eth_getTransactionByHash',
  'eth_getTransactionCount',
  'eth_getTransactionReceipt',
  'eth_maxPriorityFeePerGas',
  'eth_feeHistory',
  'net_version',
  'web3_clientVersion',
]);

const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

@Controller('rpc')
export class RpcController {
  private rpcIndex = 0;

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  async proxy(@Body() body: any): Promise<any> {
    // Support single requests and JSON-RPC batches.
    const requests = Array.isArray(body) ? body : [body];
    for (const req of requests) {
      if (!req || typeof req.method !== 'string' || !ALLOWED_METHODS.has(req.method)) {
        throw new HttpException(
          `Method not allowed: ${req?.method ?? 'unknown'}`,
          HttpStatus.FORBIDDEN,
        );
      }
    }

    // Try each provider once, rotating on rate-limit or network errors.
    let lastErr: Error | null = null;
    for (let i = 0; i < RPC_URLS.length; i++) {
      const rpcUrl = RPC_URLS[this.rpcIndex % RPC_URLS.length];
      this.rpcIndex++;
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          lastErr = new Error(`RPC HTTP ${res.status} (${rpcUrl})`);
          continue;
        }
        const json: any = await res.json();
        // On a rate-limit error, rotate to the next provider.
        const err = Array.isArray(json) ? json.find((j: any) => j.error)?.error : json.error;
        if (err) {
          const msg = `${err.code}: ${err.message || ''}`;
          if (msg.includes('request limit') || msg.includes('-32011') || msg.includes('rate')) {
            lastErr = new Error(`RPC rate-limited (${rpcUrl})`);
            continue;
          }
        }
        return json;
      } catch (err) {
        lastErr = err as Error;
        continue;
      }
    }
    throw new HttpException(
      lastErr?.message || 'All RPC providers failed',
      HttpStatus.BAD_GATEWAY,
    );
  }
}
