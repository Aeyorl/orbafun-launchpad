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
const MAX_BATCH_SIZE = 20;
const MAX_LOG_BLOCK_RANGE = 2_000n;
const MAX_LOG_ADDRESSES = 50;
const MAX_RPC_RESPONSE_BYTES = 2 * 1024 * 1024;

const RPC_URLS = (
  process.env.ARC_RPC_URLS ||
  process.env.ARC_RPC_URL ||
  (Number(process.env.ARC_CHAIN_ID || 5_042_002) === 5_042
    ? 'https://rpc.mainnet.arc.io,https://rpc.drpc.mainnet.arc.io,https://rpc.quicknode.mainnet.arc.io,https://rpc.blockdaemon.mainnet.arc.io'
    : 'https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io')
)
  .split(',')
  .map((u) => u.trim())
  .filter(Boolean);

if (RPC_URLS.length === 0) {
  throw new Error('Arc mainnet requires ARC_RPC_URLS');
}

@Controller('rpc')
export class RpcController {
  private rpcIndex = 0;

  @Post()
  @Throttle({ default: { ttl: 60_000, limit: 300 } })
  async proxy(@Body() body: any): Promise<any> {
    // Support single requests and JSON-RPC batches.
    const requests = Array.isArray(body) ? body : [body];
    if (requests.length === 0 || requests.length > MAX_BATCH_SIZE) {
      throw new HttpException(
        `JSON-RPC batch size must be between 1 and ${MAX_BATCH_SIZE}`,
        HttpStatus.BAD_REQUEST,
      );
    }
    for (const req of requests) {
      if (
        !req ||
        req.jsonrpc !== '2.0' ||
        typeof req.method !== 'string' ||
        !ALLOWED_METHODS.has(req.method) ||
        (req.params !== undefined && !Array.isArray(req.params))
      ) {
        throw new HttpException(
          `Method not allowed: ${req?.method ?? 'unknown'}`,
          HttpStatus.FORBIDDEN,
        );
      }
      if (req.method === 'eth_getLogs') this.validateLogFilter(req.params?.[0]);
    }

    // Try each provider once, rotating on rate-limit or network errors.
    let lastErr: Error | null = null;
    for (let i = 0; i < RPC_URLS.length; i++) {
      const rpcUrl = RPC_URLS[this.rpcIndex % RPC_URLS.length];
      this.rpcIndex++;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          lastErr = new Error(`RPC HTTP ${res.status} (${rpcUrl})`);
          continue;
        }
        const responseText = await this.readLimitedResponse(res);
        const json: any = JSON.parse(responseText);
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
      } finally {
        clearTimeout(timeout);
      }
    }
    throw new HttpException(
      lastErr?.message || 'All RPC providers failed',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private validateLogFilter(filter: any): void {
    if (!filter || typeof filter !== 'object' || Array.isArray(filter)) {
      throw new HttpException('eth_getLogs requires a filter object', HttpStatus.BAD_REQUEST);
    }
    const addresses = Array.isArray(filter.address) ? filter.address : [filter.address].filter(Boolean);
    if (addresses.length === 0 || addresses.length > MAX_LOG_ADDRESSES) {
      throw new HttpException(
        `eth_getLogs requires 1-${MAX_LOG_ADDRESSES} addresses`,
        HttpStatus.BAD_REQUEST,
      );
    }
    if (addresses.some((address: unknown) =>
      typeof address !== 'string' || !/^0x[0-9a-fA-F]{40}$/.test(address)
    )) {
      throw new HttpException('eth_getLogs contains an invalid address', HttpStatus.BAD_REQUEST);
    }
    if (filter.blockHash !== undefined) {
      if (
        typeof filter.blockHash !== 'string' ||
        !/^0x[0-9a-fA-F]{64}$/.test(filter.blockHash) ||
        filter.fromBlock !== undefined ||
        filter.toBlock !== undefined
      ) {
        throw new HttpException(
          'eth_getLogs blockHash must be valid and cannot be combined with a block range',
          HttpStatus.BAD_REQUEST,
        );
      }
      return;
    }
    const from = this.parseBlockNumber(filter.fromBlock);
    const to = this.parseBlockNumber(filter.toBlock);
    if (from === null || to === null || to < from || to - from > MAX_LOG_BLOCK_RANGE) {
      throw new HttpException(
        `eth_getLogs block range must be explicit and at most ${MAX_LOG_BLOCK_RANGE} blocks`,
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private parseBlockNumber(value: unknown): bigint | null {
    if (typeof value !== 'string' || !/^0x[0-9a-fA-F]+$/.test(value)) return null;
    try {
      return BigInt(value);
    } catch {
      return null;
    }
  }

  private async readLimitedResponse(res: Response): Promise<string> {
    const declaredLength = Number(res.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_RPC_RESPONSE_BYTES) {
      throw new Error(`RPC response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`);
    }
    if (!res.body) return '';

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let total = 0;
    let text = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_RPC_RESPONSE_BYTES) {
        await reader.cancel();
        throw new Error(`RPC response exceeded ${MAX_RPC_RESPONSE_BYTES} bytes`);
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  }
}
