import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { IndexerService } from './indexer.service';
import { getIndexedFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

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
 *   - LiquidityMigration.TokenMigrated → records authoritative LP burn state
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
  private ammPairAddresses: Set<string> = new Set();
  private readonly migratorAddresses: Set<string>;

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
      (Number(process.env.ARC_CHAIN_ID || 5_042_002) === 5_042
        ? ''
        : 'https://rpc.testnet.arc.network,https://rpc.drpc.testnet.arc.network,https://rpc.quicknode.testnet.arc.network,https://rpc.blockdaemon.testnet.arc.network')
    )
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean);

    if (envUrls.length === 0) {
      throw new Error('Arc mainnet requires ARC_RPC_URLS');
    }

    this.rpcUrls = envUrls;
    this.rpcUrl = this.rpcUrls[0]; // kept for backward-compat logging
    this.migratorAddresses = this.getMigratorAddresses();
  }

  private getMigratorAddresses(): Set<string> {
    const addresses = (process.env.ARC_MIGRATOR_ADDRESS || '')
      .split(',')
      .map((address) => address.trim().toLowerCase())
      .filter(Boolean);
    if (addresses.length === 0) {
      if (process.env.NODE_ENV === 'test') return new Set();
      throw new Error('ARC_MIGRATOR_ADDRESS is required for authoritative graduation indexing');
    }
    for (const address of addresses) {
      if (!/^0x[0-9a-f]{40}$/.test(address)) {
        throw new Error('ARC_MIGRATOR_ADDRESS contains an invalid address');
      }
    }
    return new Set(addresses);
  }

  private getFactoryAddresses(): string[] {
    return getIndexedFactoryAddresses();
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

    // A factory cutover may be configured after its deployment block has
    // already passed. Replaying from that exact block is safe because event
    // persistence is idempotent by transaction hash and log index. Remove the
    // override after the first successful catch-up deployment.
    const replayFrom = process.env.ARC_POLLER_REPLAY_FROM_BLOCK;
    const replayEnabled = process.env.ARC_POLLER_REPLAY_ENABLED === 'true';
    if (replayFrom && replayEnabled) {
      const replayBlock = BigInt(replayFrom);
      if (replayBlock < 1n) {
        throw new Error('ARC_POLLER_REPLAY_FROM_BLOCK must be at least 1');
      }
      const replayLastBlock = replayBlock - 1n;
      if (this.lastBlock === 0n || replayLastBlock < this.lastBlock) {
        this.logger.warn(
          `Replaying indexed events from configured cutover block ${replayBlock}`,
        );
        this.lastBlock = replayLastBlock;
      }
    } else if (replayFrom) {
      this.logger.warn(
        'Ignoring ARC_POLLER_REPLAY_FROM_BLOCK because ARC_POLLER_REPLAY_ENABLED is not "true"',
      );
    }

    // If no checkpoint exists, start at the deployment block. A moving
    // "current - 1000" window silently loses older launch history.
    if (this.lastBlock === 0n) {
      const configured = process.env.ARC_DEPLOYMENT_BLOCK;
      const chainId = Number(process.env.ARC_CHAIN_ID || 5_042_002);
      const deploymentBlock = configured
        ? BigInt(configured)
        : chainId === 5_042_002
          ? 52_509_682n
          : 0n;
      if (deploymentBlock <= 0n) {
        throw new Error('ARC_DEPLOYMENT_BLOCK is required when no indexer checkpoint exists');
      }
      this.lastBlock = deploymentBlock - 1n;
      this.logger.warn(
        `No sync state found — starting from deployment block ${deploymentBlock}`,
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
    const factoryAddresses = this.getFactoryAddresses();

    // 1. Fetch TokenFactory events (TokenCreated, TokenGraduated).
    const factoryLogs = await this.getLogsSafe(
      factoryAddresses,
      fromBlock,
      toBlock,
    );
    // Register curves created in this exact range before collecting curve logs,
    // so a same-block first buy is never skipped.
    for (const log of factoryLogs.filter((log) => log.topics[0] === TOPIC_TOKEN_CREATED).sort(compareLogs)) {
      await this.processLog(log);
    }
    await this.loadCurveAddresses();
    await this.loadAmmPairAddresses();

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
    let ammLogs: RpcLog[] = [];
    const pairs = Array.from(this.ammPairAddresses);
    for (let i = 0; i < pairs.length; i += 50) {
      ammLogs = ammLogs.concat(await this.getLogsSafe(pairs.slice(i, i + 50), fromBlock, toBlock));
    }
    const migratorLogs = this.migratorAddresses.size > 0
      ? await this.getLogsSafe(Array.from(this.migratorAddresses), fromBlock, toBlock)
      : [];

    // 3. Decode and process only factory-address and registered-curve logs,
    // deduplicated by txHash + logIndex.
    // and sorted by block + logIndex for correct ordering.
    const seen = new Set<string>();
    const allLogs = [
      ...factoryLogs.filter((log) => log.topics[0] !== TOPIC_TOKEN_CREATED),
      ...curveLogs,
      ...ammLogs,
      ...migratorLogs,
    ]
      .filter((log) => {
        const key = `${log.transactionHash}-${log.logIndex}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort(compareLogs);

    for (const log of allLogs) {
      await this.processLog(log);
    }

    if (allLogs.length > 0) {
      this.logger.log(
        `Processed ${allLogs.length} events from blocks ${fromBlock}-${toBlock} ` +
          `(${factoryLogs.length} factory, ${curveLogs.length} curve, ${ammLogs.length} AMM, ${migratorLogs.length} migration)`,
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

    const isFactoryEvent =
      topic === TOPIC_TOKEN_CREATED || topic === TOPIC_TOKEN_GRADUATED;
    if (isFactoryEvent && !this.getFactoryAddresses().includes(address)) {
      this.logger.warn(
        `Ignored factory event from untrusted emitter ${address} (tx ${txHash})`,
      );
      return;
    }

    const isCurveEvent =
      topic === TOPIC_BUY ||
      topic === TOPIC_BUY_V2 ||
      topic === TOPIC_SELL ||
      topic === TOPIC_SELL_V2 ||
      topic === TOPIC_GRADUATED;
    if (isCurveEvent && !this.curveAddresses.has(address)) {
      this.logger.warn(
        `Ignored curve event from unregistered emitter ${address} (tx ${txHash})`,
      );
      return;
    }
    if (topic === TOPIC_SWAP && !this.ammPairAddresses.has(address)) return;
    if (topic === TOPIC_TOKEN_MIGRATED && !this.migratorAddresses.has(address)) {
      this.logger.warn(`Ignored migration event from untrusted emitter ${address} (tx ${txHash})`);
      return;
    }

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
          factoryAddress: address,
          creator,
          name,
          symbol,
          image,
        } as any);
      } else if (topic === TOPIC_BUY_V2) {
        // BuyV2(address indexed buyer, uint256 usdcIn, uint256 fee,
        //       uint256 usdcToCurve, uint256 tokensOut, uint256 price)
        const buyer = topicToAddress(log.topics[1]);
        const decoded = decodeUintData(log.data);
        await this.indexerService.processEvent({
          type: 'Buy',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          curveAddress: address,
          buyer,
          usdcIn: decoded[0],
          fee: decoded[1],
          netUsdc: decoded[2],
          tokensOut: decoded[3],
          price: this.formatPrice(BigInt(decoded[4])),
          accountingVersion: 2,
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
      } else if (topic === TOPIC_SELL_V2) {
        // SellV2(address indexed seller, uint256 tokensIn, uint256 usdcGross,
        //        uint256 fee, uint256 usdcOut, uint256 price)
        const seller = topicToAddress(log.topics[1]);
        const decoded = decodeUintData(log.data);
        await this.indexerService.processEvent({
          type: 'Sell',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          curveAddress: address,
          seller,
          tokensIn: decoded[0],
          usdcGross: decoded[1],
          fee: decoded[2],
          usdcOut: decoded[3],
          price: this.formatPrice(BigInt(decoded[4])),
          accountingVersion: 2,
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
      } else if (topic === TOPIC_TOKEN_MIGRATED) {
        // TokenMigrated(address indexed token, address indexed ammPair, uint256 lpBurned)
        const decoded = decodeUintData(log.data);
        if (decoded.length < 1) throw new Error('Malformed TokenMigrated log');
        await this.indexerService.processEvent({
          type: 'TokenMigrated',
          txHash,
          blockNumber: Number(blockNumber),
          logIndex,
          token: topicToAddress(log.topics[1]),
          ammPair: topicToAddress(log.topics[2]),
          lpBurned: decoded[0],
        } as any);
      } else if (topic === TOPIC_SWAP) {
        const decoded = decodeUintData(log.data);
        if (decoded.length < 4) throw new Error('Malformed AMM Swap log');
        let [amount0In, amount1In] = decoded;
        const [, , amount0Out, amount1Out] = decoded;
        let trader: string | undefined;
        if (amount0In === '0' && amount1In === '0') {
          const inferred = await this.inferRouterSwapInput(log, amount0Out, amount1Out);
          amount0In = inferred.amount0In;
          amount1In = inferred.amount1In;
          trader = inferred.trader;
        }
        await this.indexerService.processEvent({ type: 'Swap', txHash, blockNumber: Number(blockNumber), logIndex, ammPairAddress: address, sender: topicToAddress(log.topics[1]), trader, to: topicToAddress(log.topics[2]), amount0In, amount1In, amount0Out, amount1Out } as any);
      }
    } catch (err) {
      this.logger.error(
        `Failed to process event (tx ${txHash}, log ${logIndex}, topic ${topic.slice(
          0,
          10,
        )}): ${err.message}`,
      );
      // Do not checkpoint beyond an event that failed to persist. Handlers are
      // idempotent, so replaying the range is safe.
      throw err;
    }
  }

  /**
   * AMMPair emits zero input fields, while the router transfers input into the
   * pair in the same transaction. Recover the exact input amount and trader
   * from that ERC-20 Transfer log. Output0 implies input1 and vice versa.
   */
  private async inferRouterSwapInput(
    swapLog: RpcLog,
    amount0Out: string,
    amount1Out: string,
  ): Promise<{ amount0In: string; amount1In: string; trader: string }> {
    const output0 = BigInt(amount0Out);
    const output1 = BigInt(amount1Out);
    if ((output0 === 0n) === (output1 === 0n)) {
      throw new Error(`Ambiguous AMM output for ${swapLog.transactionHash}`);
    }

    const swapIndex = hexToBigInt(swapLog.logIndex);
    const pairAddress = swapLog.address.toLowerCase();

    // Some public Arc providers return a null receipt for older transactions
    // even though other providers still retain it. A null response is valid
    // JSON-RPC, so rpcCall cannot distinguish it from an authoritative miss.
    // Retry the receipt lookup across the provider ring before failing the
    // event and holding the checkpoint at this block.
    for (let attempt = 0; attempt < this.rpcUrls.length; attempt++) {
      const receipt = await this.rpcCall<RpcTransactionReceipt | null>(
        'eth_getTransactionReceipt',
        [swapLog.transactionHash],
      );
      const transfer = receipt?.logs
        ?.filter((candidate) =>
          candidate.topics[0]?.toLowerCase() === TOPIC_TRANSFER
          && candidate.topics.length >= 3
          && topicToAddress(candidate.topics[2]) === pairAddress
          && hexToBigInt(candidate.logIndex) < swapIndex,
        )
        .sort(compareLogs)
        .at(-1);
      if (!transfer) continue;

      const inputAmount = decodeUintData(transfer.data)[0];
      if (!inputAmount || inputAmount === '0') {
        throw new Error(`Invalid AMM input transfer for ${swapLog.transactionHash}`);
      }
      return {
        amount0In: output1 > 0n ? inputAmount : '0',
        amount1In: output0 > 0n ? inputAmount : '0',
        trader: topicToAddress(transfer.topics[1]),
      };
    }

    throw new Error(`Unable to infer AMM input transfer for ${swapLog.transactionHash}`);
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
   * The returned integer is USDC per token scaled by 1e18. Keep all 18
   * decimals so small bonding-curve moves remain visible on the chart.
   */
  private formatPrice(priceScaled: bigint): string {
    const scale = 10n ** 18n;
    const intPart = priceScaled / scale;
    const fracPart = priceScaled % scale;
    return `${intPart}.${fracPart.toString().padStart(18, '0')}`;
  }

  private async loadCurveAddresses(): Promise<void> {
    const rows = await this.db.queryRows<{ curve_address: string }>(
      `SELECT t.curve_address FROM tokens t
       WHERE t.curve_address IS NOT NULL
         AND ${publicFactoryClause('t', 1)}`,
      [this.getFactoryAddresses()],
    );
    for (const row of rows) {
      this.curveAddresses.add(row.curve_address.toLowerCase());
    }
  }
  private async loadAmmPairAddresses(): Promise<void> {
    const rows = await this.db.queryRows<{ amm_pair_address: string }>(`SELECT amm_pair_address FROM graduations WHERE amm_pair_address IS NOT NULL`);
    for (const row of rows) this.ammPairAddresses.add(row.amm_pair_address.toLowerCase());
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
function compareLogs(a: RpcLog, b: RpcLog): number {
  const aBlock = hexToBigInt(a.blockNumber); const bBlock = hexToBigInt(b.blockNumber);
  if (aBlock !== bBlock) return aBlock > bBlock ? 1 : -1;
  const aIndex = hexToBigInt(a.logIndex); const bIndex = hexToBigInt(b.logIndex);
  return aIndex === bIndex ? 0 : aIndex > bIndex ? 1 : -1;
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

interface RpcTransactionReceipt {
  logs: RpcLog[];
}

// ─── Pre-computed event topic hashes (keccak256 of event signatures) ────────
// These are the first 32 bytes of keccak256(EventSignature).
// Computed once at module load to avoid runtime hashing.

let TOPIC_TOKEN_CREATED = '';
let TOPIC_TOKEN_GRADUATED = '';
let TOPIC_BUY = '';
let TOPIC_BUY_V2 = '';
let TOPIC_SELL = '';
let TOPIC_SELL_V2 = '';
let TOPIC_GRADUATED = '';
let TOPIC_SWAP = '';
let TOPIC_TOKEN_MIGRATED = '';
let TOPIC_TRANSFER = '';

// Compute topics at module load using viem's keccak256.
// We import only the keccak256 function (no complex types).
const { keccak256, toBytes } = require('viem');

function computeTopic(sig: string): string {
  return keccak256(toBytes(sig));
}

TOPIC_TOKEN_CREATED = computeTopic(
  'TokenCreated(address,address,address,string,string,string,uint256)',
);
TOPIC_TOKEN_GRADUATED = computeTopic('TokenGraduated(address,address)');
TOPIC_BUY = computeTopic('Buy(address,uint256,uint256,uint256)');
TOPIC_BUY_V2 = computeTopic('BuyV2(address,uint256,uint256,uint256,uint256,uint256)');
TOPIC_SELL = computeTopic('Sell(address,uint256,uint256,uint256)');
TOPIC_SELL_V2 = computeTopic('SellV2(address,uint256,uint256,uint256,uint256,uint256)');
TOPIC_GRADUATED = computeTopic('Graduated(address,address,uint256,uint256)');
TOPIC_SWAP = computeTopic('Swap(address,address,uint256,uint256,uint256,uint256)');
TOPIC_TOKEN_MIGRATED = computeTopic('TokenMigrated(address,address,uint256)');
TOPIC_TRANSFER = computeTopic('Transfer(address,address,uint256)');
