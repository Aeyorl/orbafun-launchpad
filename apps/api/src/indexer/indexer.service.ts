import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

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
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Upsert user (creator)
      await client.query(
        `INSERT INTO users (wallet, created_at)
         VALUES ($1, NOW())
         ON CONFLICT (wallet) DO UPDATE
         SET tokens_launched = users.tokens_launched + 1`,
        [event.creator.toLowerCase()],
      );

      // Insert token (idempotent — ON CONFLICT does nothing)
      await client.query(
        `INSERT INTO tokens (
           contract_address, curve_address, creator_wallet,
           name, symbol, image, description,
           price, market_cap, volume_24h,
           real_usdc, tokens_sold, creator_fees_accrued, protocol_fees_accrued,
           status, created_block, created_tx_hash, created_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, NULL,
           '0.000004545454545', '4000', '0',
           0, 0, 0, 0,
           'active', $7, $8, NOW()
         )
         ON CONFLICT (contract_address) DO NOTHING`,
        [
          event.token.toLowerCase(),
          event.curve.toLowerCase(),
          event.creator.toLowerCase(),
          event.name,
          event.symbol,
          event.image,
          event.blockNumber.toString(),
          event.txHash,
        ],
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
      `SELECT * FROM tokens WHERE contract_address = $1`,
      [event.token.toLowerCase()],
    );
    if (token) {
      await this.redis.publishTokenEvent(event.token.toLowerCase(), 'NEW_TOKEN', token);
      // Invalidate cache
      await this.redis.del('tokens:list:newest:active:20:0:');
    }
  }

  // ─── Buy ─────────────────────────────────────────────────────────────────
  private async handleBuy(event: BuyEvent): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      // Find token by curve address
      const tokenResult = await client.query(
        `SELECT id FROM tokens WHERE curve_address = $1`,
        [event.curveAddress.toLowerCase()],
      );
      if (tokenResult.rows.length === 0) {
        this.logger.warn(`Buy: token not found for curve ${event.curveAddress}`);
        await client.query('ROLLBACK');
        return;
      }
      const tokenId = tokenResult.rows[0].id;

      // Compute price and market cap
      const usdcAmount = BigInt(event.usdcIn);
      const tokenAmount = BigInt(event.tokensOut);
      // Use the contract's price field (spot price after trade) when available,
      // falling back to computed price from trade amounts.
      const price =
        event.price && event.price !== '0' && event.price !== '0.000000'
          ? event.price
          : this.computePrice(usdcAmount, tokenAmount);
      const marketCap = (parseFloat(price) * 1e9).toFixed(6);

      // Update curve state (fee = 1% of input, split 50/50)
      const fee = usdcAmount / 100n;
      const netUsdc = usdcAmount - fee;
      const creatorFee = fee / 2n;
      const protocolFee = fee - creatorFee;

      // 1. Insert trade (idempotent)
      await client.query(
        `INSERT INTO trades (
           token_id, wallet, type,
           usdc_amount, token_amount, price,
           market_cap_after, real_usdc_after, tokens_sold_after,
           tx_hash, block_number, log_index, timestamp
         )
         VALUES ($1, $2, 'buy', $3, $4, $5, $6,
           (SELECT real_usdc + $7 FROM tokens WHERE id = $1),
           (SELECT tokens_sold + $8 FROM tokens WHERE id = $1),
           $9, $10, $11, NOW()
         )
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [
          tokenId,
          event.buyer.toLowerCase(),
          usdcAmount.toString(),
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
    const trade = await this.db.queryOne(
      `SELECT * FROM trades WHERE tx_hash = $1 AND log_index = $2`,
      [event.txHash, event.logIndex],
    );
    if (trade) {
      await this.redis.publishTokenEvent(
        event.curveAddress.toLowerCase(),
        'NEW_BUY',
        trade,
      );
    }

    // Invalidate caches so updated volume/price propagates immediately
    await this.invalidateTokenCaches(event.curveAddress.toLowerCase());
  }

  // ─── Sell ────────────────────────────────────────────────────────────────
  private async handleSell(event: SellEvent): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const tokenResult = await client.query(
        `SELECT id FROM tokens WHERE curve_address = $1`,
        [event.curveAddress.toLowerCase()],
      );
      if (tokenResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return;
      }
      const tokenId = tokenResult.rows[0].id;

      const usdcAmount = BigInt(event.usdcOut);
      const tokenAmount = BigInt(event.tokensIn);
      const price =
        event.price && event.price !== '0' && event.price !== '0.000000'
          ? event.price
          : this.computePrice(usdcAmount, tokenAmount);
      const marketCap = (parseFloat(price) * 1e9).toFixed(6);

      const fee = usdcAmount / 100n;
      const netUsdcOut = usdcAmount - fee;
      const creatorFee = fee / 2n;
      const protocolFee = fee - creatorFee;

      // 1. Insert trade (idempotent)
      await client.query(
        `INSERT INTO trades (
           token_id, wallet, type,
           usdc_amount, token_amount, price,
           market_cap_after, real_usdc_after, tokens_sold_after,
           tx_hash, block_number, log_index, timestamp
         )
         VALUES ($1, $2, 'sell', $3, $4, $5, $6,
           (SELECT GREATEST(0, real_usdc - $7) FROM tokens WHERE id = $1),
           (SELECT GREATEST(0, tokens_sold - $8) FROM tokens WHERE id = $1),
           $9, $10, $11, NOW()
         )
         ON CONFLICT (tx_hash, log_index) DO NOTHING`,
        [
          tokenId,
          event.seller.toLowerCase(),
          usdcAmount.toString(),
          tokenAmount.toString(),
          price,
          marketCap,
          netUsdcOut.toString(),
          tokenAmount.toString(),
          event.txHash,
          event.blockNumber.toString(),
          event.logIndex,
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
          netUsdcOut.toString(),
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

    const trade = await this.db.queryOne(
      `SELECT * FROM trades WHERE tx_hash = $1 AND log_index = $2`,
      [event.txHash, event.logIndex],
    );
    if (trade) {
      await this.redis.publishTokenEvent(
        event.curveAddress.toLowerCase(),
        'NEW_SELL',
        trade,
      );
    }

    // Invalidate caches so updated volume/price propagates immediately
    await this.invalidateTokenCaches(event.curveAddress.toLowerCase());
  }

  // ─── Graduated ───────────────────────────────────────────────────────────
  private async handleGraduated(event: GraduatedEvent): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      await client.query(
        `UPDATE tokens SET
           status = 'graduated',
           amm_pair_address = $2,
           graduated_at = NOW()
         WHERE contract_address = $1`,
        [event.token.toLowerCase(), event.ammPair.toLowerCase()],
      );

      const tokenResult = await client.query(
        `SELECT id FROM tokens WHERE contract_address = $1`,
        [event.token.toLowerCase()],
      );
      if (tokenResult.rows.length > 0) {
        const tokenId = tokenResult.rows[0].id;
        await client.query(
          `INSERT INTO graduations (
             token_id, amm_pair_address, lp_usdc, lp_tokens, lp_burned,
             tx_hash, block_number, timestamp
           ) VALUES ($1, $2, $3, $4, 0, $5, $6, NOW())
           ON CONFLICT (token_id) DO NOTHING`,
          [
            tokenId,
            event.ammPair.toLowerCase(),
            event.lpUsdc.toString(),
            event.lpTokens.toString(),
            event.txHash,
            event.blockNumber.toString(),
          ],
        );
      }

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
         WHERE token_id = (SELECT id FROM tokens WHERE contract_address = $1)`,
        [tokenAddr, lpBurned],
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
  private async handleAmmSwap(event: SwapEvent): Promise<void> {
    // TODO: Implement AMM swap indexing (post-graduation trading)
    // This requires knowing which token is token0 vs token1 in the pair.
    // For now, we just log it.
    this.logger.log(`AMM Swap on pair ${event.ammPairAddress} (not yet indexed)`);
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Invalidate all Redis caches that surface token data (lists, leaderboard,
   * individual token detail). Called after every buy/sell so updated volume,
   * price, and market cap propagate immediately to the frontend.
   */
  private async invalidateTokenCaches(curveAddress: string): Promise<void> {
    try {
      // Find the token's contract_address from its curve_address
      const token = await this.db.queryOne<{ contract_address: string }>(
        `SELECT contract_address FROM tokens WHERE curve_address = $1`,
        [curveAddress],
      );
      if (token) {
        // Invalidate individual token cache
        await this.redis.del(`token:${token.contract_address}`);
      }
      // Invalidate token list caches (explore page, all sort/filter combos)
      await this.redis.delPattern('tokens:list:*');
      // Invalidate leaderboard caches
      await this.redis.delPattern('leaderboard:*');
      // Invalidate platform stats
      await this.redis.del('stats:platform');
    } catch (err) {
      this.logger.warn(`Cache invalidation failed: ${err.message}`);
    }
  }

  /**
   * Compute price (USDC per token) from 6-dec USDC and 18-dec token amounts.
   * Returns a string suitable for NUMERIC(20,6) columns.
   *
   * Uses 1e18 scaling (not 1e12) to preserve precision for sub-micro prices.
   * Without the extra 1e6 factor, integer division truncates to 0 when the
   * price is < 1e-6 USDC/token (common for early bonding curve buys).
   */
  private computePrice(usdcAmount: bigint, tokenAmount: bigint): string {
    if (tokenAmount === 0n) return '0';
    // price = (usdcAmount / 1e6) / (tokenAmount / 1e18)
    //       = usdcAmount * 1e12 / tokenAmount
    // Scale by 1e18 (not 1e12) to avoid truncation for sub-micro prices.
    const scaled = (usdcAmount * 1000000000000000000n) / tokenAmount;
    // scaled is in micro-USDC per token (1e-6 USDC per token) * 1e6
    // Convert to USDC (6 decimal places)
    const integerPart = scaled / 1000000000000n;
    const fractionalPart = scaled % 1000000000000n;
    return `${integerPart}.${fractionalPart.toString().padStart(6, '0').slice(0, 6)}`;
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
}

interface BuyEvent extends IndexerEvent {
  type: 'Buy';
  curveAddress: string;
  buyer: string;
  usdcIn: string;
  tokensOut: string;
  price: string;
}

interface SellEvent extends IndexerEvent {
  type: 'Sell';
  curveAddress: string;
  seller: string;
  tokensIn: string;
  usdcOut: string;
  price: string;
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
