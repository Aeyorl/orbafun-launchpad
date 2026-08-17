import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';
import { updateWalletPosition } from '../users/position-accounting';
import { refreshWalletStats } from '../users/wallet-intelligence';
import { getIndexedFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

const CURVE_SUPPLY = 880_000_000n * 10n ** 18n;
const CURVE_VIRTUAL_USDC = 5_866_666_700n;
const CURVE_VIRTUAL_TOKENS = 1_466_666_667n * 10n ** 18n;
const CURVE_K = CURVE_VIRTUAL_USDC * CURVE_VIRTUAL_TOKENS;
const CURVE_FEE_BPS = 100n;
const BPS_DENOMINATOR = 10_000n;

/**
 * IndexerService — receives decoded events from the Envio HyperIndex indexer
 * and writes them to Postgres + publishes to Redis pub/sub.
 *
 * Two integration modes:
 *  1. Webhook (recommended): Envio calls our POST /indexer/event endpoint
 *     for each decoded event. This is real-time.
 *  2. Polling (fallback): We poll Envio's GraphQL API every few seconds
 *     for new events. Higher latency but simpler.
 *
 * This service implements the webhook handler logic. The polling mode is
 * a TODO (see pollEnvioGraphql below).
 *
 * All writes are idempotent — if the same event is delivered twice (e.g.
 * on indexer restart), the unique constraint on (tx_hash, log_index)
 * prevents duplicate rows.
 */
@Injectable()
export class IndexerService {
  private readonly logger = new Logger(IndexerService.name);
  private readonly cacheInvalidationTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  /**
   * Process a single decoded event from Envio.
   * Called by the IndexerController's webhook handler.
   */
  async processEvent(event: IndexerEvent): Promise<void> {
    switch (event.type) {
      case 'TokenCreated':
        await this.handleTokenCreated(event as TokenCreatedEvent);
        break;
      case 'Buy':
        await this.handleBuy(event as BuyEvent);
        break;
      case 'Sell':
        await this.handleSell(event as SellEvent);
        break;
      case 'Graduated':
        await this.handleGraduated(event as GraduatedEvent);
        break;
      case 'TokenMigrated':
        await this.handleTokenMigrated(event as TokenMigratedEvent);
        break;
      case 'Swap':
        await this.handleAmmSwap(event as SwapEvent);
        break;
      default:
        this.logger.warn(`Unknown event type: ${event.type}`);
    }
  }

  // ─── TokenCreated ────────────────────────────────────────────────────────
  private async handleTokenCreated(event: TokenCreatedEvent): Promise<void> {
    const factoryAddress = event.factoryAddress?.toLowerCase() || null;
    if (!factoryAddress || !getIndexedFactoryAddresses().includes(factoryAddress)) {
      this.logger.warn(`Ignored TokenCreated from untrusted factory ${factoryAddress || 'unknown'}`);
      return;
    }
    const uncappedFactories = new Set(
      (process.env.UNCAPPED_TOKEN_FACTORY_ADDRESSES || '')
        .split(',')
        .map((address) => address.trim().toLowerCase())
        .filter(Boolean),
    );
    const transferPolicy =
      factoryAddress && uncappedFactories.has(factoryAddress)
        ? 'uncapped'
        : 'legacy_capped';
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Insert the token first. A replay stops here so creator counters and
      // indexer statistics are not incremented twice.
      const tokenInsert = await client.query(
        `INSERT INTO tokens (
           contract_address, curve_address, factory_address, transfer_policy, creator_wallet,
           name, symbol, image, description,
           price, market_cap, volume_24h,
           real_usdc, tokens_sold, creator_fees_accrued, protocol_fees_accrued,
           status, created_block, created_tx_hash, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8, NULL,
           '0.000004545454545', '4000', '0',
           0, 0, 0, 0,
           'active', $9, $10, NOW()
         )
         ON CONFLICT (contract_address) DO NOTHING
         RETURNING id`,
        [
          event.token.toLowerCase(),
          event.curve.toLowerCase(),
          factoryAddress,
          transferPolicy,
          event.creator.toLowerCase(),
          event.name,
          event.symbol,
          event.image,
          event.blockNumber.toString(),
          event.txHash,
        ],
      );

      if (tokenInsert.rowCount !== 1) {
        await client.query('ROLLBACK');
        return;
      }

      // Upsert user (creator) only for a newly indexed token.
      await client.query(
        `INSERT INTO users (wallet, tokens_launched, created_at)
         VALUES ($1, 1, NOW())
         ON CONFLICT (wallet) DO UPDATE
         SET tokens_launched = users.tokens_launched + 1`,
        [event.creator.toLowerCase()],
      );

      // Update indexer state
      await client.query(
        `UPDATE indexer_state
         SET last_block = GREATEST(last_block, $1),
             last_event_timestamp = NOW(),
             events_indexed = events_indexed + 1,
             updated_at = NOW()
         WHERE id = 1`,
        [event.blockNumber.toString()],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleTokenCreated failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    // Publish WebSocket event
    const token = await this.db.queryOne(
      `SELECT * FROM tokens t
       WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}`,
      [event.token.toLowerCase(), getIndexedFactoryAddresses()],
    );
    if (token) {
      await this.redis.publishTokenEvent(event.token.toLowerCase(), 'NEW_TOKEN', token);
      // Invalidate cache
      await this.redis.delPattern('tokens:list:*');
    }
  }

  // ─── Buy ─────────────────────────────────────────────────────────────────
  private async handleBuy(event: BuyEvent): Promise<void> {
    const client = await this.db.connect();
    let tokenContractAddress: string | null = null;
    let indexedTrade: Record<string, unknown> | null = null;
    try {
      await client.query('BEGIN');

      // Find token by curve address
      const tokenResult = await client.query(
        `SELECT t.id, t.contract_address, t.real_usdc, t.tokens_sold
         FROM tokens t
         WHERE curve_address = $1 AND ${publicFactoryClause('t', 2)}
         FOR UPDATE`,
        [event.curveAddress.toLowerCase(), getIndexedFactoryAddresses()],
      );
      if (tokenResult.rows.length === 0) {
        this.logger.warn(`Buy: token not found for curve ${event.curveAddress}`);
        await client.query('ROLLBACK');
        return;
      }
      const tokenId = tokenResult.rows[0].id;
      tokenContractAddress = tokenResult.rows[0].contract_address;

      // Compute price and market cap
      const tokenAmount = BigInt(event.tokensOut);
      let usdcAmount = BigInt(event.usdcIn);
      let fee = event.accountingVersion === 2 ? BigInt(event.fee) : usdcAmount / 100n;
      let netUsdc = event.accountingVersion === 2
        ? BigInt(event.netUsdc)
        : usdcAmount - fee;
      const priorTokensSold = BigInt(tokenResult.rows[0].tokens_sold);
      if (event.accountingVersion !== 2 && priorTokensSold + tokenAmount >= CURVE_SUPPLY) {
        const oldX = CURVE_VIRTUAL_USDC + BigInt(tokenResult.rows[0].real_usdc);
        const finalY = CURVE_VIRTUAL_TOKENS - CURVE_SUPPLY;
        const netNeeded = CURVE_K / finalY - oldX;
        usdcAmount =
          (netNeeded * BPS_DENOMINATOR) /
          (BPS_DENOMINATOR - CURVE_FEE_BPS);
        fee = usdcAmount - netNeeded;
        netUsdc = netNeeded;
      }
      // Use the contract's price field (spot price after trade) when available,
      // falling back to computed price from trade amounts.
      const price =
        event.price && Number(event.price) > 0
          ? event.price
          : this.computePrice(usdcAmount, tokenAmount);
      const marketCap = (parseFloat(price) * 1e9).toFixed(6);

      // Update curve state (fee = 1% of input, split 50/50)
      const creatorFee = fee / 2n;
      const protocolFee = fee - creatorFee;

      // 1. Insert trade (idempotent)
      const tradeInsert = await client.query(
        `INSERT INTO trades (
           token_id, wallet, type,
           usdc_amount, gross_usdc_amount, fee_usdc_amount, net_usdc_amount,
           token_amount, price,
           market_cap_after, real_usdc_after, tokens_sold_after,
           tx_hash, block_number, log_index, timestamp
         )
         VALUES ($1, $2, 'buy', $3, $3, $4, $5, $6, $7, $8,
           (SELECT real_usdc + $9 FROM tokens WHERE id = $1),
           (SELECT tokens_sold + $10 FROM tokens WHERE id = $1),
           $11, $12, $13, NOW()
         )
         ON CONFLICT (tx_hash, log_index) DO NOTHING
         RETURNING *`,
        [
          tokenId,
          event.buyer.toLowerCase(),
          usdcAmount.toString(),
          fee.toString(),
          netUsdc.toString(),
          tokenAmount.toString(),
          price,
          marketCap,
          netUsdc.toString(),
          tokenAmount.toString(),
          event.txHash,
          event.blockNumber.toString(),
          event.logIndex,
        ],
      );
      if (tradeInsert.rowCount !== 1) {
        await client.query('ROLLBACK');
        return;
      }
      indexedTrade = tradeInsert.rows[0];

      await updateWalletPosition(client, {
        wallet: event.buyer.toLowerCase(),
        tokenId,
        tradeId: tradeInsert.rows[0].id,
        source: 'curve',
        trade: {
          type: 'buy',
          tokenAmountBaseUnits: tokenAmount,
          grossMicroUsdc: usdcAmount,
          netMicroUsdc: netUsdc,
        },
      });

      // 2. Update token state (price, market cap, real usdc, tokens sold, fees, volume_24h in dollars)
      await client.query(
        `UPDATE tokens SET
           price = $2,
           market_cap = $3,
           real_usdc = real_usdc + $4,
           tokens_sold = tokens_sold + $5,
           creator_fees_accrued = creator_fees_accrued + $6,
           protocol_fees_accrued = protocol_fees_accrued + $7,
           volume_24h = COALESCE((
             SELECT (SUM(usdc_amount)::numeric / 1000000.0)::numeric(20,6)
             FROM trades
             WHERE token_id = $1
               AND timestamp > NOW() - INTERVAL '24 hours'
           ), 0)
         WHERE id = $1`,
        [
          tokenId,
          price,
          marketCap,
          netUsdc.toString(),
          tokenAmount.toString(),
          creatorFee.toString(),
          protocolFee.toString(),
        ],
      );

      // Update user volume
      await client.query(
        `INSERT INTO users (wallet, total_volume_usdc, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wallet) DO UPDATE
         SET total_volume_usdc = users.total_volume_usdc + $2`,
        [event.buyer.toLowerCase(), usdcAmount.toString()],
      );

      // Update referral stats for the buyer (if they were referred).
      // Reward = volume * REFERRAL_REWARD_PCT_BPS / 10000 (default 10 bps = 0.1%).
      await client.query(
        `UPDATE referrals
         SET trade_count = trade_count + 1,
             total_volume_usdc = total_volume_usdc + $2,
             reward_earned_usdc = reward_earned_usdc + ($2 * $3 / 10000),
             first_token_address = COALESCE(first_token_address, $4)
         WHERE referred_wallet = $1`,
        [
          event.buyer.toLowerCase(),
          usdcAmount.toString(),
          process.env.REFERRAL_REWARD_PCT_BPS || '10',
          event.curveAddress.toLowerCase(),
        ],
      );

      // Record price snapshot for leaderboard gain calculation.
      await this.recordPriceSnapshot(client, tokenId, price, marketCap);

      // Update indexer state
      await client.query(
        `UPDATE indexer_state
         SET last_block = GREATEST(last_block, $1),
             last_event_timestamp = NOW(),
             events_indexed = events_indexed + 1,
             updated_at = NOW()
         WHERE id = 1`,
        [event.blockNumber.toString()],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleBuy failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    // Publish WebSocket event
    if (indexedTrade && tokenContractAddress) {
      await this.refreshWalletDerivedData(event.buyer.toLowerCase());
      await this.redis.publishTokenEvent(
        tokenContractAddress.toLowerCase(),
        'NEW_BUY',
        indexedTrade,
      );
      this.scheduleTokenCacheInvalidation(tokenContractAddress);
    }
  }

  // ─── Sell ────────────────────────────────────────────────────────────────
  private async handleSell(event: SellEvent): Promise<void> {
    const client = await this.db.connect();
    let tokenContractAddress: string | null = null;
    let indexedTrade: Record<string, unknown> | null = null;
    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
        `SELECT t.id, t.contract_address FROM tokens t
         WHERE curve_address = $1 AND ${publicFactoryClause('t', 2)}
         FOR UPDATE`,
        [event.curveAddress.toLowerCase(), getIndexedFactoryAddresses()],
      );
      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }
      const tokenId = tokenResult.rows[0].id;
      tokenContractAddress = tokenResult.rows[0].contract_address;

      const netUsdcOut = BigInt(event.usdcOut);
      const usdcAmount = event.accountingVersion === 2
        ? BigInt(event.usdcGross)
        : this.grossFromNet(netUsdcOut, CURVE_FEE_BPS);
      const tokenAmount = BigInt(event.tokensIn);
      const price =
        event.price && Number(event.price) > 0
          ? event.price
          : this.computePrice(usdcAmount, tokenAmount);
      const marketCap = (parseFloat(price) * 1e9).toFixed(6);

      const fee = event.accountingVersion === 2
        ? BigInt(event.fee)
        : usdcAmount - netUsdcOut;
      const creatorFee = fee / 2n;
      const protocolFee = fee - creatorFee;

      // 1. Insert trade (idempotent)
      const tradeInsert = await client.query(
        `INSERT INTO trades (
           token_id, wallet, type,
           usdc_amount, gross_usdc_amount, fee_usdc_amount, net_usdc_amount,
           token_amount, price,
           market_cap_after, real_usdc_after, tokens_sold_after,
           tx_hash, block_number, log_index, timestamp
         )
         VALUES ($1, $2, 'sell', $3, $3, $4, $5, $6, $7, $8,
           (SELECT GREATEST(0, real_usdc - $9) FROM tokens WHERE id = $1),
           (SELECT GREATEST(0, tokens_sold - $10) FROM tokens WHERE id = $1),
           $11, $12, $13, NOW()
         )
         ON CONFLICT (tx_hash, log_index) DO NOTHING
         RETURNING *`,
        [
          tokenId,
          event.seller.toLowerCase(),
          usdcAmount.toString(),
          fee.toString(),
          netUsdcOut.toString(),
          tokenAmount.toString(),
          price,
          marketCap,
          usdcAmount.toString(),
          tokenAmount.toString(),
          event.txHash,
          event.blockNumber.toString(),
          event.logIndex,
        ],
      );
      if (tradeInsert.rowCount !== 1) {
        await client.query('ROLLBACK');
        return;
      }
      indexedTrade = tradeInsert.rows[0];

      const positionUpdate = await updateWalletPosition(client, {
        wallet: event.seller.toLowerCase(),
        tokenId,
        tradeId: tradeInsert.rows[0].id,
        source: 'curve',
        trade: {
          type: 'sell',
          tokenAmountBaseUnits: tokenAmount,
          grossMicroUsdc: usdcAmount,
          netMicroUsdc: netUsdcOut,
        },
      });
      await client.query(
        `UPDATE trades
         SET allocated_cost_usdc = $2, realized_pnl_usdc = $3
         WHERE id = $1`,
        [
          tradeInsert.rows[0].id,
          positionUpdate.allocatedCostMicroUsdc.toString(),
          positionUpdate.realizedPnlIncrementMicroUsdc.toString(),
        ],
      );

      // 2. Update token state (price, market cap, real usdc, tokens sold, fees, volume_24h in dollars)
      await client.query(
        `UPDATE tokens SET
           price = $2,
           market_cap = $3,
           real_usdc = GREATEST(0, real_usdc - $4),
           tokens_sold = GREATEST(0, tokens_sold - $5),
           creator_fees_accrued = creator_fees_accrued + $6,
           protocol_fees_accrued = protocol_fees_accrued + $7,
           volume_24h = COALESCE((
             SELECT (SUM(usdc_amount)::numeric / 1000000.0)::numeric(20,6)
             FROM trades
             WHERE token_id = $1
               AND timestamp > NOW() - INTERVAL '24 hours'
           ), 0)
         WHERE id = $1`,
        [
          tokenId,
          price,
          marketCap,
          usdcAmount.toString(),
          tokenAmount.toString(),
          creatorFee.toString(),
          protocolFee.toString(),
        ],
      );

      await client.query(
        `INSERT INTO users (wallet, total_volume_usdc, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wallet) DO UPDATE
         SET total_volume_usdc = users.total_volume_usdc + $2`,
        [event.seller.toLowerCase(), usdcAmount.toString()],
      );

      // Update referral stats for the seller (if they were referred).
      await client.query(
        `UPDATE referrals
         SET trade_count = trade_count + 1,
             total_volume_usdc = total_volume_usdc + $2,
             reward_earned_usdc = reward_earned_usdc + ($2 * $3 / 10000),
             first_token_address = COALESCE(first_token_address, $4)
         WHERE referred_wallet = $1`,
        [
          event.seller.toLowerCase(),
          usdcAmount.toString(),
          process.env.REFERRAL_REWARD_PCT_BPS || '10',
          event.curveAddress.toLowerCase(),
        ],
      );

      // Record price snapshot for leaderboard gain calculation.
      await this.recordPriceSnapshot(client, tokenId, price, marketCap);

      await client.query(
        `UPDATE indexer_state
         SET last_block = GREATEST(last_block, $1),
             events_indexed = events_indexed + 1,
             updated_at = NOW()
         WHERE id = 1`,
        [event.blockNumber.toString()],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleSell failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    if (indexedTrade && tokenContractAddress) {
      await this.refreshWalletDerivedData(event.seller.toLowerCase());
      await this.redis.publishTokenEvent(
        tokenContractAddress.toLowerCase(),
        'NEW_SELL',
        indexedTrade,
      );
      this.scheduleTokenCacheInvalidation(tokenContractAddress);
    }
  }

  // ─── Graduated ───────────────────────────────────────────────────────────
  private async handleGraduated(event: GraduatedEvent): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
        `SELECT t.id FROM tokens t
         WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}`,
        [event.token.toLowerCase(), getIndexedFactoryAddresses()],
      );
      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }
      const tokenId = tokenResult.rows[0].id;
      await client.query(
        `INSERT INTO graduations (
           token_id, amm_pair_address, lp_usdc, lp_tokens, lp_burned,
           tx_hash, block_number, timestamp
         ) VALUES ($1, $2, $3, $4, 0, $5, $6, NOW())
         ON CONFLICT (token_id) DO UPDATE SET
           amm_pair_address = EXCLUDED.amm_pair_address,
           lp_usdc = CASE WHEN EXCLUDED.lp_usdc::numeric > 0 THEN EXCLUDED.lp_usdc ELSE graduations.lp_usdc END,
           lp_tokens = CASE WHEN EXCLUDED.lp_tokens::numeric > 0 THEN EXCLUDED.lp_tokens ELSE graduations.lp_tokens END,
           tx_hash = CASE
             WHEN EXCLUDED.lp_usdc::numeric > 0 OR EXCLUDED.lp_tokens::numeric > 0 THEN EXCLUDED.tx_hash
             ELSE graduations.tx_hash
           END,
           block_number = GREATEST(graduations.block_number, EXCLUDED.block_number)
         RETURNING id`,
        [
          tokenId,
          event.ammPair.toLowerCase(),
          event.lpUsdc.toString(),
          event.lpTokens.toString(),
          event.txHash,
          event.blockNumber.toString(),
        ],
      );
      await client.query(
        `UPDATE tokens SET
           status = 'graduated',
           amm_pair_address = $2,
           graduated_at = NOW()
         WHERE id = $1`,
        [tokenId, event.ammPair.toLowerCase()],
      );

      await client.query(
        `UPDATE indexer_state
         SET last_block = GREATEST(last_block, $1),
             events_indexed = events_indexed + 1,
             updated_at = NOW()
         WHERE id = 1`,
        [event.blockNumber.toString()],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleGraduated failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    await this.redis.publishTokenEvent(event.token.toLowerCase(), 'TOKEN_GRADUATED', {
      ammPair: event.ammPair,
      lpUsdc: event.lpUsdc,
      lpTokens: event.lpTokens,
    });
  }

  // ─── TokenMigrated ───────────────────────────────────────────────────────
  private async handleTokenMigrated(event: TokenMigratedEvent): Promise<void> {
    const tokenAddr = event.token.toLowerCase();
    const lpBurned = event.lpBurned.toString();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE tokens SET lp_burned = $2 WHERE contract_address = $1`,
        [tokenAddr, lpBurned],
      );
      await client.query(
        `UPDATE graduations SET lp_burned = $2
         WHERE token_id = (
           SELECT t.id FROM tokens t
           WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 3)}
         )`,
        [tokenAddr, lpBurned, getIndexedFactoryAddresses()],
      );
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleTokenMigrated failed for ${tokenAddr}: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── AMM Swap ────────────────────────────────────────────────────────────
  /**
   * Handle an AMM Swap event from a graduated token's pair.
   *
   * Determines swap direction (buy = USDC→token, sell = token→USDC) by
   * comparing the token contract address against the known USDC address.
   * In Uniswap V2-style pairs, token0 is the lower-address token, token1
   * is the higher-address token. We compare addresses to determine which
   * is which, then decode the Swap log amounts accordingly.
   */
  private async handleAmmSwap(event: SwapEvent): Promise<void> {
    const client = await this.db.connect();
    let tokenId: number | null = null;
    let isBuy = false;
    try {
      await client.query('BEGIN');

      // Find the graduation record by AMM pair address to get the token_id.
      const gradResult2 = await client.query(
        `SELECT token_id FROM graduations WHERE amm_pair_address = $1 LIMIT 1`,
        [event.ammPairAddress.toLowerCase()],
      );
      if (gradResult2.rows.length === 0) {
        this.logger.warn(
          `AMM Swap: no graduation found for pair ${event.ammPairAddress}`,
        );
        await client.query('ROLLBACK');
        return;
      }
      tokenId = gradResult2.rows[0].token_id;

      // Get the token's contract address.
      const tokenResult2 = await client.query(
        `SELECT t.contract_address FROM tokens t
         WHERE t.id = $1 AND ${publicFactoryClause('t', 2)}`,
        [tokenId, getIndexedFactoryAddresses()],
      );
      if (tokenResult2.rows.length === 0) {
        this.logger.warn(`AMM Swap: token not found for id ${tokenId}`);
        await client.query('ROLLBACK');
        return;
      }
      const tokenAddress = tokenResult2.rows[0].contract_address.toLowerCase();

      // In Uniswap V2, token0 is the lower-address token.
      // USDC on Arc testnet: 0x3600000000000000000000000000000000000000
      const configuredUsdc = process.env.ARC_USDC_ADDRESS;
      if (!configuredUsdc && Number(process.env.ARC_CHAIN_ID || 5_042_002) === 5_042) {
        throw new Error('Arc mainnet requires ARC_USDC_ADDRESS');
      }
      const usdcAddress = (
        configuredUsdc || '0x3600000000000000000000000000000000000000'
      ).toLowerCase();

      const usdcIsToken0 = usdcAddress < tokenAddress;

      // Parse amounts from hex strings.
      const amount0In = BigInt(event.amount0In);
      const amount1In = BigInt(event.amount1In);
      const amount0Out = BigInt(event.amount0Out);
      const amount1Out = BigInt(event.amount1Out);

      // Determine direction and extract USDC/token amounts.
      let usdcIn = 0n;
      let usdcOut = 0n;
      let tokenIn = 0n;
      let tokenOut = 0n;

      if (usdcIsToken0) {
        // token0 = USDC, token1 = meme token
        isBuy = amount0In > 0n; // USDC comes in → buy
        if (isBuy) {
          usdcIn = amount0In;
          tokenOut = amount1Out;
        } else {
          tokenIn = amount1In;
          usdcOut = amount0Out;
        }
      } else {
        // token0 = meme token, token1 = USDC
        isBuy = amount1In > 0n; // USDC comes in (as token1) → buy
        if (isBuy) {
          usdcIn = amount1In;
          tokenOut = amount0Out;
        } else {
          tokenIn = amount0In;
          usdcOut = amount1Out;
        }
      }

      // Compute price after swap (USDC per token, 6-dec).
      // Uses the same computePrice method as bonding curve trades.
      const price = this.computePrice(
        isBuy ? usdcIn : usdcOut,   // usdc amount (6-dec raw)
        isBuy ? tokenOut : tokenIn,  // token amount (18-dec raw)
      );
      const positionWallet = isBuy
        ? event.to.toLowerCase()
        : event.sender.toLowerCase();

      // 1. Insert swap record and stop before side effects on replay.
      const swapInsert = await client.query(
        `INSERT INTO amm_swaps (
           token_id, amm_pair_address, sender, to_address,
           is_buy, usdc_in, usdc_out, token_in, token_out,
           price_after,
           tx_hash, block_number, log_index, timestamp
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())
         ON CONFLICT (tx_hash, log_index) DO NOTHING
         RETURNING id`,
        [
          tokenId,
          event.ammPairAddress.toLowerCase(),
          event.sender.toLowerCase(),
          event.to.toLowerCase(),
          isBuy,
          usdcIn.toString(),
          usdcOut.toString(),
          tokenIn.toString(),
          tokenOut.toString(),
          price,
          event.txHash,
          event.blockNumber.toString(),
          event.logIndex,
        ],
      );
      if (swapInsert.rowCount !== 1) {
        await client.query('ROLLBACK');
        return;
      }

      const positionUpdate = await updateWalletPosition(client, {
        wallet: positionWallet,
        tokenId,
        tradeId: swapInsert.rows[0].id,
        source: 'amm',
        trade: {
          type: isBuy ? 'buy' : 'sell',
          tokenAmountBaseUnits: isBuy ? tokenOut : tokenIn,
          grossMicroUsdc: isBuy ? usdcIn : usdcOut,
          netMicroUsdc: isBuy ? usdcIn : usdcOut,
        },
      });
      await client.query(
        `UPDATE amm_swaps
         SET allocated_cost_usdc = $2, realized_pnl_usdc = $3
         WHERE id = $1`,
        [
          swapInsert.rows[0].id,
          positionUpdate.allocatedCostMicroUsdc.toString(),
          positionUpdate.realizedPnlIncrementMicroUsdc.toString(),
        ],
      );
      await client.query(
        `INSERT INTO users (wallet, total_volume_usdc, created_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (wallet) DO UPDATE
         SET total_volume_usdc = users.total_volume_usdc + $2`,
        [positionWallet, (isBuy ? usdcIn : usdcOut).toString()],
      );
      await client.query(
        `UPDATE tokens SET volume_24h = COALESCE((SELECT SUM(volume_raw)::numeric / 1000000.0 FROM (SELECT usdc_amount AS volume_raw FROM trades WHERE token_id = $1 AND timestamp > NOW() - INTERVAL '24 hours' UNION ALL SELECT CASE WHEN is_buy THEN usdc_in ELSE usdc_out END FROM amm_swaps WHERE token_id = $1 AND timestamp > NOW() - INTERVAL '24 hours') volumes), 0) WHERE id = $1`,
        [tokenId],
      );

      // 2. Update token price and market cap (for AMM, use swap output as price).
      // Only update if price is non-zero.
      if (parseFloat(price) > 0) {
        const marketCap = (parseFloat(price) * 1e9).toFixed(6);
        await client.query(
          `UPDATE tokens SET
             price = $2,
             market_cap = $3
           WHERE id = $1`,
          [tokenId, price, marketCap],
        );
      }

      // 3. Record a price snapshot for gain calculation.
      await client.query(
        `INSERT INTO price_snapshots (token_id, price, market_cap, snapshot_at)
         VALUES ($1, $2, $3, NOW())`,
        [tokenId, price, (parseFloat(price) * 1e9).toFixed(6)],
      );

      // 4. Update indexer state.
      await client.query(
        `UPDATE indexer_state
         SET last_block = GREATEST(last_block, $1),
             last_event_timestamp = NOW(),
             events_indexed = events_indexed + 1,
             updated_at = NOW()
         WHERE id = 1`,
        [event.blockNumber.toString()],
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      this.logger.error(`handleAmmSwap failed: ${err.message}`);
      throw err;
    } finally {
      client.release();
    }

    // Publish WebSocket event (look up token contract address again).
    const tokenAddr2 = await this.db.queryOne<{ contract_address: string }>(
      `SELECT t.contract_address FROM tokens t WHERE t.id = (
         SELECT token_id FROM graduations WHERE amm_pair_address = $1
       ) AND ${publicFactoryClause('t', 2)}`,
      [event.ammPairAddress.toLowerCase(), getIndexedFactoryAddresses()],
    );
    if (tokenAddr2) {
      const positionWallet = isBuy
        ? event.to.toLowerCase()
        : event.sender.toLowerCase();
      await this.refreshWalletDerivedData(positionWallet);
      await this.redis.publishTokenEvent(
        tokenAddr2.contract_address.toLowerCase(),
        isBuy ? 'AMM_BUY' : 'AMM_SELL',
        { ammPairAddress: event.ammPairAddress.toLowerCase(), sender: event.sender.toLowerCase(), isBuy },
      );
      // Invalidate caches
      await this.redis.delPattern(`token:*:${tokenAddr2.contract_address.toLowerCase()}`);
      await this.redis.delPattern(`candles:*:${tokenAddr2.contract_address.toLowerCase()}:*`);
      await this.redis.delPattern('tokens:list:*');
      await this.redis.delPattern('leaderboard:*');
    }
  }

  /**
   * Record a price snapshot for the given token after a trade.
   * Called from handleBuy and handleSell.
   */
  private async recordPriceSnapshot(
    client: { query: (text: string, params?: any[]) => Promise<any> },
    tokenId: number,
    price: string,
    marketCap: string,
  ): Promise<void> {
    await client.query(
      `INSERT INTO price_snapshots (token_id, price, market_cap, snapshot_at)
       VALUES ($1, $2, $3, NOW())`,
      [tokenId, price, marketCap],
    );
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Invalidate all Redis caches that surface token data (lists, leaderboard,
   * individual token detail). Called after every buy/sell so updated volume,
   * price, and market cap propagate immediately to the frontend.
   */
  private scheduleTokenCacheInvalidation(tokenContractAddress: string): void {
    const address = tokenContractAddress.toLowerCase();
    const existing = this.cacheInvalidationTimers.get(address);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      this.cacheInvalidationTimers.delete(address);
      void this.invalidateTokenCaches(address);
    }, 1_000);
    timer.unref?.();
    this.cacheInvalidationTimers.set(address, timer);
  }

  private async invalidateTokenCaches(tokenContractAddress: string): Promise<void> {
    try {
      await this.redis.delPattern(`token:*:${tokenContractAddress}`);
      await this.redis.delPattern(`candles:*:${tokenContractAddress}:*`);
      // Invalidate token list caches (explore page, all sort/filter combos)
      await this.redis.delPattern('tokens:list:*');
      // Invalidate leaderboard caches
      await this.redis.delPattern('leaderboard:*');
      // Invalidate platform stats
      await this.redis.delPattern('stats:platform:*');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${err.message}`);
    }
  }

  private async refreshWalletDerivedData(wallet: string): Promise<void> {
    try {
      await refreshWalletStats(this.db, wallet);
      await Promise.all([
        this.redis.delPattern(`user:*:${wallet}`),
        this.redis.delPattern(`user-holdings:*:${wallet}`),
        this.redis.delPattern(`user-stats:*:${wallet}`),
        this.redis.delPattern(`user-pnl:*:${wallet}:*`),
      ]);
    } catch (err) {
      // Derived intelligence must never make confirmed trade ingestion fail.
      this.logger.warn(`Wallet stats refresh failed for ${wallet}: ${err.message}`);
    }
  }

  /**
   * Compute price (USDC per token) from 6-dec USDC and 18-dec token amounts.
   * Returns a string suitable for NUMERIC(38,18) columns.
   *
   * Uses 1e18 scaling (not 1e12) to preserve precision for sub-micro prices.
   * Without the extra 1e6 factor, integer division truncates to 0 when the
   * price is < 1e-6 USDC/token (common for early bonding curve buys).
   */
  private grossFromNet(netAmount: bigint, feeBps: bigint): bigint {
    const denominator = BPS_DENOMINATOR - feeBps;
    let gross =
      (netAmount * BPS_DENOMINATOR + denominator - 1n) / denominator;
    while (gross - (gross * feeBps) / BPS_DENOMINATOR < netAmount) {
      gross += 1n;
    }
    return gross;
  }

  private computePrice(usdcAmount: bigint, tokenAmount: bigint): string {
    if (tokenAmount === 0n) return '0';
    // price = (usdcAmount / 1e6) / (tokenAmount / 1e18)
    //       = usdcAmount * 1e12 / tokenAmount
    const scale = 10n ** 18n;
    const scaled = (usdcAmount * 10n ** 30n) / tokenAmount;
    const integerPart = scaled / scale;
    const fractionalPart = scaled % scale;
    return `${integerPart}.${fractionalPart.toString().padStart(18, '0')}`;
  }

  /**
   * Poll Envio's GraphQL API for new events (fallback mode).
   * TODO: Implement if webhook mode is not available.
   */
  async pollEnvioGraphql(): Promise<void> {
    // const endpoint = process.env.INDEXER_GRAPHQL_URL || 'http://localhost:8080/graphql';
    // Query for events after the last processed block.
    // For each event, call this.processEvent().
    this.logger.warn('pollEnvioGraphql not yet implemented');
  }
}

// ─── Event type definitions (from Envio webhook) ───────────────────────────

interface IndexerEvent {
  type: string;
  txHash: string;
  blockNumber: number;
  logIndex: number;
}

interface TokenCreatedEvent extends IndexerEvent {
  type: 'TokenCreated';
  token: string;
  curve: string;
  creator: string;
  name: string;
  symbol: string;
  image: string;
  factoryAddress?: string;
}

interface BuyEvent extends IndexerEvent {
  type: 'Buy';
  curveAddress: string;
  buyer: string;
  usdcIn: string;
  fee?: string;
  netUsdc?: string;
  tokensOut: string;
  price: string;
  accountingVersion?: 2;
}

interface SellEvent extends IndexerEvent {
  type: 'Sell';
  curveAddress: string;
  seller: string;
  tokensIn: string;
  usdcGross?: string;
  fee?: string;
  usdcOut: string;
  price: string;
  accountingVersion?: 2;
}

interface GraduatedEvent extends IndexerEvent {
  type: 'Graduated';
  token: string;
  ammPair: string;
  lpUsdc: string;
  lpTokens: string;
}

interface TokenMigratedEvent extends IndexerEvent {
  type: 'TokenMigrated';
  token: string;
  ammPair: string;
  lpBurned: string;
}

interface SwapEvent extends IndexerEvent {
  type: 'Swap';
  ammPairAddress: string;
  sender: string;
  to: string;
  amount0In: string;
  amount1In: string;
  amount0Out: string;
  amount1Out: string;
}
