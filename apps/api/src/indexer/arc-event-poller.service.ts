import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { IndexerService } from './indexer.service';

/**
 * ArcEventPollerService — polls Arc RPC directly for contract events.
 *
 * Replaces the Envio HyperIndex + Hasura GraphQL + EnvioPollerService stack
 * with a single, lightweight service that calls eth_getLogs every few seconds.
 *
 * Architecture:
 *   Arc RPC → eth_getLogs (this service, every 5s) → IndexerService.processEvent()
 *                                                          ↓
 *                                                   Postgres + Redis pub/sub → WebSocket → Frontend
 *
 * Why this instead of Envio:
 *   - No Docker/WSL/Hasura dependency (runs in the NestJS process)
 *   - No extra GraphQL intermediate layer
 *   - Full control over RPC frequency (Arc testnet is aggressively rate-limited)
 *   - Arc's deterministic finality (N=1, no reorgs) makes polling safe and simple
 *   - Low event volume (launchpad, not a DEX) — no need for parallel partition indexing
 *
 * Implementation note:
 *   Uses raw JSON-RPC via fetch (not viem) to avoid viem's heavy TypeScript generics
 *   that conflict with this project's tsconfig. Event topics are computed manually
 *   with keccak256 (pre-computed constants) and decoded with simple slice/parse logic.
 *
 * Events indexed:
 *   - TokenFactory.TokenCreated → registers BondingCurve address dynamically
 *   - TokenFactory.TokenGraduated → marks token as graduated
 *   - BondingCurve.Buy → inserts trade, updates token aggregate state
 *   - BondingCurve.Sell → inserts trade, updates token aggregate state
 *   - BondingCurve.Graduated → records graduation details
 *
 * Idempotency:
 *   - Tracks last synced block in indexer_sync_state (entity = 'ArcEventPoller')
 *   - IndexerService handlers use ON CONFLICT DO NOTHING for trades/tokens
 *   - Safe to restart or re-process blocks
 */
@Injectable()
export class ArcEventPollerService implements OnModuleInit {
  private readonly logger = new Logger(ArcEventPollerService.name);
  private readonly rpcUrl: string;
  private readonly tokenFactoryAddress: string;

  /** Curve addresses to watch for Buy/Sell/Graduated events (dynamic). */
  private curveAddresses: Set<string> = new Set();

  /** Last block we've fully processed. */
  private lastBlock = 0n;

  /** Whether polling is active. */
  private enabled = false;

  /** Re-entrancy guard — prevents overlapping poll cycles. */
  private polling = false;

  /** Max blocks per eth_getLogs call (avoids RPC response size limits). */
  private readonly maxBlockRange = 2000n;

  /** Blocks to stay behind the tip (safety margin; Arc has N=1 finality so 0 is safe). */
  private readonly confirmations = 0n;

  /** JSON-RPC request ID counter. */
  private rpcId = 1;

  /**
   * All available Arc testnet RPC endpoints. We rotate between them on
   * rate-limit errors (-32011) so a single provider's quota doesn't block
   * indexing. Providers (from https://docs.arc.io/arc/references/rpc-endpoints):
   *   1. Circle (primary)       — https://rpc.testnet.arc.io
   *   2. dRPC                   — https://rpc.drpc.testnet.arc.io
   *   3. QuickNode              — https://rpc.quicknode.testnet.arc.io
   *   4. Blockdaemon            — https://rpc.blockdaemon.testnet.arc.io
   *
   * Override via ARC_RPC_URLS (comma-separated) in .env.
   */
  private readonly rpcUrls: string[];
  private rpcIndex = 0;

  constructor(
    private db: DatabaseService,
    private indexerService: IndexerService,
  ) {
    // Parse RPC URLs from env (ARC_RPC_URLS preferred, fall back to ARC_RPC_URL,
    // then to the hardcoded list of all 4 public providers).
    const envUrls = (
      process.env.ARC_RPC_URLS ||
      process.env.ARC_RPC_URL ||
      'https://arc-testnet.g.alchemy.com/v2/HMKXQ2KwDrFO0nwFthZm0,https://rpc.testnet.arc.io,https://rpc.drpc.testnet.arc.io,https://rpc.quicknode.testnet.arc.io,https://rpc.blockdaemon.testnet.arc.io'
    )
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    this.rpcUrls = envUrls;
    this.rpcUrl = this.rpcUrls[0]; // kept for backward-compat logging
  }

  private getFactoryAddress(): string {
    return (
      process.env.ARC_TOKEN_FACTORY_ADDRESS ||
      process.env.NEXT_PUBLIC_TOKEN_FACTORY_ADDRESS ||
      '0x8b59B3c4B7A634d8599e4DFB6891CEefd5CA424b'
    ).toLowerCase();
  }

  async onModuleInit(): Promise<void> {
    if (process.env.ARC_POLLER_ENABLED !== 'true') {
      this.logger.log('ARC_POLLER_ENABLED != "true" — direct poller disabled');
      return;
    }
    this.enabled = true;

    // Load known curve addresses from DB (for tokens already indexed).
    await this.loadCurveAddresses();

    // Load last synced block from indexer_sync_state.
    await this.loadLastBlock();

    // If no last block, start from a recent block (current - 1000) to avoid
    // re-indexing the entire chain history on first run.
    if (this.lastBlock === 0n) {
      const currentBlock = await this.getCurrentBlock();
      this.lastBlock = currentBlock > 1000n ? currentBlock - 1000n : 1n;
      this.logger.warn(
        `No sync state found — starting from block ${this.lastBlock} (current - 1000)`,
      );
      await this.saveLastBlock(this.lastBlock);
    }

    this.logger.log(
      `Arc event poller enabled — ${this.curveAddresses.size} curves watched, ` +
        `last block ${this.lastBlock}, ${this.rpcUrls.length} RPC providers`,
    );

    // Do an initial poll on startup.
    this.poll().catch((err) =>
      this.logger.error(`Initial poll failed: ${err.message}`),
    );
  }

  /**
   * Poll every 5 seconds for new events.
   * Arc block time is ~0.5s, so this catches ~10 new blocks per cycle.
   * Safe at 5s because rpcCall rotates between 4 RPC providers on rate-limit,
   * giving us 4 independent rate-limit buckets.
   */
  @Cron('*/5 * * * * *')
  async pollCron(): Promise<void> {
    if (!this.enabled || this.polling) return;
    await this.poll();
  }

  async poll(): Promise<void> {
    this.polling = true;
    try {
      // Reload curve addresses from DB on every poll cycle so newly launched
      // tokens are instantly recognized without waiting for a server restart.
      await this.loadCurveAddresses();

      const currentBlock = await this.getCurrentBlock();
      const targetBlock =
        currentBlock > this.confirmations
          ? currentBlock - this.confirmations
          : currentBlock;

      if (targetBlock <= this.lastBlock) return; // nothing new

      // Fetch logs in chunks to respect RPC limits.
      let fromBlock = this.lastBlock + 1n;
      while (fromBlock <= targetBlock) {
        const toBlock =
          fromBlock + this.maxBlockRange > targetBlock
            ? targetBlock
            : fromBlock + this.maxBlockRange;

        await this.fetchAndProcessRange(fromBlock, toBlock);

        this.lastBlock = toBlock;
        await this.saveLastBlock(toBlock);

        fromBlock = toBlock + 1n;
      }
    } catch (err) {
      this.logger.error(`Poll failed: ${err.message}`);
    } finally {
      this.polling = false;
    }
  }

  // ─── Log fetching & decoding ──────────────────────────────────────────────

  private async fetchAndProcessRange(
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<void> {
    const factoryAddress = this.getFactoryAddress();

    // 1. Fetch TokenFactory events (TokenCreated, TokenGraduated).
    const factoryLogs = await this.getLogsSafe(
      [factoryAddress],
      fromBlock,
      toBlock,
    );

    // Small delay between RPC calls.
    await sleep(200);

    // 2. Fetch BondingCurve events (Buy, Sell, Graduated) for all known curves.
    const curveAddresses = Array.from(this.curveAddresses);
    let curveLogs: RpcLog[] = [];
    if (curveAddresses.length > 0) {
      // eth_getLogs supports multiple addresses in a single call.
      // Batch in groups of 50 to be safe.
      const batchSize = 50;
      for (let i = 0; i < curveAddresses.length; i += batchSize) {
        const batch = curveAddresses.slice(i, i + batchSize);
        const logs = await this.getLogsSafe(batch, fromBlock, toBlock);
        curveLogs = curveLogs.concat(logs);
        if (i + batchSize < curveAddresses.length) await sleep(200);
      }
    }

    // 3. Fallback: Also fetch logs by topic (Buy / Sell / Graduated) without restricting
    // to curveAddresses, to catch trades on any curve that wasn't in memory yet.
    const topicLogs = await this.getLogsByTopicsSafe(
      [TOPIC_BUY, TOPIC_SELL, TOPIC_GRADUATED],
      fromBlock,
      toBlock,
    );

    // 4. Decode and process all logs, deduplicated by txHash + logIndex
    // and sorted by block + logIndex for correct ordering.
    const seen = new Set<string>();
    const allLogs = [...factoryLogs, ...curveLogs, ...topicLogs]
      .filter((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => {
        const aBlock = hexToBigInt(a.blockNumber);
        const bBlock = hexToBigInt(b.blockNumber);
        if (aBlock !== bBlock) return aBlock > bBlock ? 1 : -1;
        return hexToBigInt(a.logIndex) > hexToBigInt(b.logIndex) ? 1 : -1;
      });

    for (const log of allLogs) {
      await this.processLog(log);
    }

    if (allLogs.length > 0) {
      this.logger.log(
        `Processed ${allLogs.length} events from blocks ${fromBlock}-${toBlock} ` +
          `(${factoryLogs.length} factory, ${curveLogs.length} curve)`,
      );
    }
  }

  private async processLog(log: RpcLog): Promise<void> {
    const topic = log.topics[0];
    if (!topic) return;

    const txHash = log.transactionHash || '0x0';
    const blockNumber = hexToBigInt(log.blockNumber);
    const logIndex = Number(hexToBigInt(log.logIndex));
    const address = log.address.toLowerCase();

    try {
      if (topic === TOPIC_TOKEN_CREATED) {
        // TokenCreated(address indexed token, address indexed curve, address indexed creator,
        //              string name, string symbol, string image, uint256 createdAt)
        const tokenAddr = topicToAddress(log.topics[1]);
        const curveAddr = topicToAddress(log.topics[2]);
        const creator = topicToAddress(log.topics[3]);
        const decoded = decodeStringData(log.data);
        const name = decoded[0];
        const symbol = decoded[1];
        const image = decoded[2];

        // Register the new curve address for future Buy/Sell polling.
        if (!this.curveAddresses.has(curveAddr)) {
          this.curveAddresses.add(curveAddr);
          this.logger.log(
            `Registered BondingCurve at ${curveAddr} for token ${tokenAddr}`,
          );
        }

        await this.indexerService.processEvent({
          type: 'TokenCreated',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          token: tokenAddr,
          curve: curveAddr,
          creator,
          name,
          symbol,
          image,
        } as any);
      } else if (topic === TOPIC_BUY) {
        // Buy(address indexed buyer, uint256 usdcIn, uint256 tokensOut, uint256 price)
        const buyer = topicToAddress(log.topics[1]);
        const decoded = decodeUintData(log.data);
        const usdcIn = decoded[0];
        const tokensOut = decoded[1];
        const priceScaled = decoded[2];

        await this.indexerService.processEvent({
          type: 'Buy',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          curveAddress: address,
          buyer,
          usdcIn,
          tokensOut,
          price: this.formatPrice(BigInt(priceScaled)),
        } as any);
      } else if (topic === TOPIC_SELL) {
        // Sell(address indexed seller, uint256 tokensIn, uint256 usdcOut, uint256 price)
        const seller = topicToAddress(log.topics[1]);
        const decoded = decodeUintData(log.data);
        const tokensIn = decoded[0];
        const usdcOut = decoded[1];
        const priceScaled = decoded[2];

        await this.indexerService.processEvent({
          type: 'Sell',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          curveAddress: address,
          seller,
          tokensIn,
          usdcOut,
          price: this.formatPrice(BigInt(priceScaled)),
        } as any);
      } else if (topic === TOPIC_GRADUATED) {
        // Graduated(address indexed token, address indexed ammPair, uint256 lpUsdc, uint256 lpTokens)
        const token = topicToAddress(log.topics[1]);
        const ammPair = topicToAddress(log.topics[2]);
        const decoded = decodeUintData(log.data);
        const lpUsdc = decoded[0];
        const lpTokens = decoded[1];

        await this.indexerService.processEvent({
          type: 'Graduated',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          token,
          ammPair,
          lpUsdc,
          lpTokens,
        } as any);
      } else if (topic === TOPIC_TOKEN_GRADUATED) {
        // TokenGraduated(address indexed token, address indexed ammPair)
        const token = topicToAddress(log.topics[1]);
        const ammPair = topicToAddress(log.topics[2]);

        // Redundant with BondingCurve.Graduated but idempotent.
        await this.indexerService.processEvent({
          type: 'Graduated',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          token,
          ammPair,
          lpUsdc: '0',
          lpTokens: '0',
        } as any);
      }
    } catch (err) {
      this.logger.error(
        `Failed to process event (tx ${txHash}, log ${logIndex}, topic ${topic.slice(
          0,
          10,
        )}): ${err.message}`,
      );
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Fetch logs with retry. rpcCall already rotates between all RPC providers
   * on rate-limit; this outer loop adds a backoff for the rare case where
   * ALL providers are rate-limited simultaneously.
   */
  private async getLogsSafe(
    addresses: string[],
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<RpcLog[]> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const logs = await this.rpcCall<RpcLog[]>('eth_getLogs', [
          {
            address: addresses,
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
          },
        ]);
        return logs || [];
      } catch (err: any) {
        const msg = (err.message || '') + '';
        if (
          msg.includes('request limit reached') ||
          msg.includes('-32011') ||
          msg.includes('rate') ||
          msg.includes('All RPC providers failed')
        ) {
          if (attempt < 2) {
            const delay = 2000 * (attempt + 1);
            this.logger.warn(
              `getLogs rate-limited on all providers, retrying in ${delay}ms (attempt ${attempt + 1}/3)`,
            );
            await sleep(delay);
            continue;
          }
        }
        throw err;
      }
    }
    return [];
  }

  /**
   * Fetch logs matching specified topic hashes across all contracts.
   */
  private async getLogsByTopicsSafe(
    topics: string[],
    fromBlock: bigint,
    toBlock: bigint,
  ): Promise<RpcLog[]> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const logs = await this.rpcCall<RpcLog[]>('eth_getLogs', [
          {
            topics: [topics],
            fromBlock: '0x' + fromBlock.toString(16),
            toBlock: '0x' + toBlock.toString(16),
          },
        ]);
        return logs || [];
      } catch {
        if (attempt < 2) {
          await sleep(1000);
          continue;
        }
      }
    }
    return [];
  }

  private async getCurrentBlock(): Promise<bigint> {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const result = await this.rpcCall<string>('eth_blockNumber', []);
        return hexToBigInt(result);
      } catch (err: any) {
        const msg = (err.message || '') + '';
        if (
          msg.includes('request limit reached') ||
          msg.includes('-32011') ||
          msg.includes('rate') ||
          msg.includes('All RPC providers failed')
        ) {
          if (attempt < 2) {
            await sleep(2000 * (attempt + 1));
            continue;
          }
        }
        throw err;
      }
    }
    throw new Error('Failed to get current block after retries');
  }

  /**
   * Raw JSON-RPC call via fetch, with automatic RPC provider rotation.
   *
   * On a rate-limit error (-32011 / "request limit reached"), we advance to
   * the next RPC provider in `this.rpcUrls` and retry immediately. We try
   * each provider once before giving up. This effectively gives us
   * `rpcUrls.length` independent rate-limit buckets per call.
   *
   * Returns the `result` field, throws on `error` after all providers fail.
   */
  private async rpcCall<T>(method: string, params: any[]): Promise<T> {
    let lastErr: Error | null = null;
    // Try every provider once, starting from the current index.
    for (let i = 0; i < this.rpcUrls.length; i++) {
      const rpcUrl = this.rpcUrls[this.rpcIndex % this.rpcUrls.length];
      this.rpcIndex++; // rotate for next call
      const body = {
        jsonrpc: '2.0',
        id: this.rpcId++,
        method,
        params,
      };
      try {
        const res = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          lastErr = new Error(`RPC HTTP ${res.status} (${rpcUrl}): ${await res.text()}`);
          continue;
        }
        const json: any = await res.json();
        if (json.error) {
          const msg = `${json.error.code}: ${json.error.message || ''}`;
          if (
            msg.includes('request limit reached') ||
            msg.includes('-32011') ||
            msg.includes('rate')
          ) {
            // Rate-limited on this provider — rotate to the next one.
            lastErr = new Error(`RPC error ${msg} (${rpcUrl})`);
            continue;
          }
          // Non-rate-limit error — throw immediately, no point rotating.
          throw new Error(`RPC error ${msg} (${rpcUrl})`);
        }
        return json.result as T;
      } catch (err) {
        // Network error — try the next provider.
        lastErr = err as Error;
        continue;
      }
    }
    throw lastErr || new Error('All RPC providers failed');
  }

  /**
   * Convert the contract's price() field to a USDC-per-token decimal string.
   *
   * Contract price = (reserveUsdc_6dec * 1e30) / reserveTokens_18dec
   * This equals: USDC_per_token_in_micro * 1e12
   * (where micro = 1e-6 USDC)
   *
   * So: USDC_per_token_in_micro = price / 1e12
   * And: USDC_per_token string = format(micro / 1e6) with 6 decimal places
   */
  private formatPrice(priceScaled: bigint): string {
    if (priceScaled === 0n) return '0.000000';
    const microPerToken = priceScaled / 10n ** 12n;
    const intPart = microPerToken / 10n ** 6n;
    const fracPart = microPerToken % 10n ** 6n;
    return `${intPart}.${fracPart.toString().padStart(6, '0')}`;
  }

  private async loadCurveAddresses(): Promise<void> {
    const rows = await this.db.queryRows<{ curve_address: string }>(
      `SELECT curve_address FROM tokens WHERE curve_address IS NOT NULL`,
    );
    for (const row of rows) {
      this.curveAddresses.add(row.curve_address.toLowerCase());
    }
  }

  private async loadLastBlock(): Promise<void> {
    const row = await this.db.queryOne<{ last_block: string }>(
      `SELECT last_block FROM indexer_sync_state WHERE entity = 'ArcEventPoller'`,
    );
    if (row) {
      this.lastBlock = BigInt(row.last_block);
    }
  }

  private async saveLastBlock(block: bigint): Promise<void> {
    await this.db.query(
      `INSERT INTO indexer_sync_state (entity, last_block, updated_at)
       VALUES ('ArcEventPoller', $1, NOW())
       ON CONFLICT (entity) DO UPDATE SET last_block = $1, updated_at = NOW()`,
      [block.toString()],
    );
  }
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function hexToBigInt(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

/** Extract a 20-byte address from a 32-byte topic. */
function topicToAddress(topic: string): string {
  if (!topic || topic.length < 66) return '0x' + '0'.repeat(40);
  return '0x' + topic.slice(26).toLowerCase();
}

/**
 * Decode non-indexed uint256 fields from log data.
 * Each uint256 is 32 bytes (64 hex chars) in the data field.
 */
function decodeUintData(data: string): string[] {
  if (!data || data === '0x') return [];
  const clean = data.slice(2); // strip 0x
  const results: string[] = [];
  for (let i = 0; i + 64 <= clean.length; i += 64) {
    results.push(BigInt('0x' + clean.slice(i, i + 64)).toString());
  }
  return results;
}

/**
 * Decode non-indexed string fields from log data.
 * ABI encoding for dynamic types: each string is stored as
 * (offset, length, padded data). For our events with 3 consecutive strings,
 * we parse the offsets and extract each string.
 */
function decodeStringData(data: string): string[] {
  if (!data || data === '0x') return [];
  const clean = data.slice(2); // strip 0x
  if (clean.length < 64 * 6) return ['', '', '']; // too short

  // First 3 words are offsets to each string (relative to start of data).
  const offset0 = BigInt('0x' + clean.slice(0, 64));
  const offset1 = BigInt('0x' + clean.slice(64, 128));
  const offset2 = BigInt('0x' + clean.slice(128, 192));

  const strings: string[] = [];
  for (const offset of [offset0, offset1, offset2]) {
    const start = Number(offset) * 2; // bytes → hex chars
    if (start + 64 > clean.length) {
      strings.push('');
      continue;
    }
    const length = Number(BigInt('0x' + clean.slice(start, start + 64)));
    const dataStart = start + 64;
    const hexStr = clean.slice(dataStart, dataStart + length * 2);
    strings.push(hexToUtf8(hexStr));
  }
  return strings;
}

function hexToUtf8(hex: string): string {
  const bytes: number[] = [];
  for (let i = 0; i + 2 <= hex.length; i += 2) {
    bytes.push(parseInt(hex.slice(i, i + 2), 16));
  }
  try {
    return Buffer.from(bytes).toString('utf8');
  } catch {
    return '';
  }
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface RpcLog {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
}

// ─── Pre-computed event topic hashes (keccak256 of event signatures) ────────
// These are the first 32 bytes of keccak256(EventSignature).
// Computed once at module load to avoid runtime hashing.

const keccak = (sig: string): string => {
  // We can't compute keccak256 without a library, so hardcode the known hashes.
  // These are stable and verifiable via any keccak256 tool.
  const hashes: Record<string, string> = {
    'TokenCreated(address,address,address,string,string,string,uint256)':
      '0x9c3b9e3d8e7c4f3a5b1c2d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a',
    'TokenGraduated(address,address)':
      '0x7f0d2a4e3b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
    'Buy(address,uint256,uint256,uint256)':
      '0x7f0d2a4e3b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
    'Sell(address,uint256,uint256,uint256)':
      '0x9c3b9e3d8e7c4f3a5b1c2d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a',
    'Graduated(address,address,uint256,uint256)':
      '0x4c6f3a5b1c2d4e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f',
  };
  return hashes[sig] || '0x' + '0'.repeat(64);
};

// NOTE: The above hardcoded hashes are PLACEHOLDERS. We compute the real ones
// at runtime using viem's keccak256 (loaded lazily to avoid type issues).
// This is done once at module init.

let TOPIC_TOKEN_CREATED = '';
let TOPIC_TOKEN_GRADUATED = '';
let TOPIC_BUY = '';
let TOPIC_SELL = '';
let TOPIC_GRADUATED = '';

// Compute topics at module load using viem's keccak256.
// We import only the keccak256 function (no complex types).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { keccak256, toBytes } = require('viem');

function computeTopic(sig: string): string {
  return keccak256(toBytes(sig));
}

TOPIC_TOKEN_CREATED = computeTopic(
  'TokenCreated(address,address,address,string,string,string,uint256)',
);
TOPIC_TOKEN_GRADUATED = computeTopic('TokenGraduated(address,address)');
TOPIC_BUY = computeTopic('Buy(address,uint256,uint256,uint256)');
TOPIC_SELL = computeTopic('Sell(address,uint256,uint256,uint256)');
TOPIC_GRADUATED = computeTopic('Graduated(address,address,uint256,uint256)');
