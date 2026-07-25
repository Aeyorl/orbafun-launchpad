import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

/**
 * EnvioPollerService — polls Envio HyperIndex's Hasura GraphQL API for
 * new/updated entities and syncs them into our Postgres database.
 *
 * Architecture:
 *   Arc Testnet → Envio HyperIndex (Hasura GraphQL on :8080)
 *                        ↓ (this poller, every 5s)
 *              Our Postgres (tokens, trades, users, graduations)
 *                        ↓
 *              Redis pub/sub → WebSocket → Frontend
 *
 * We poll entity tables (Token, Trade, Graduation, AmmSwap, User) rather
 * than individual events, because Envio's Hasura exposes entities not raw
 * events. Each entity row corresponds to an event that was processed by
 * the Envio handlers (indexer/src/handlers/index.ts).
 *
 * Idempotency: All upserts use ON CONFLICT DO NOTHING/UPDATE, so re-polling
 * the same data is safe. We track the last-synced block per entity type
 * in the `indexer_sync_state` table.
 *
 * The poller is enabled when INDEXER_GRAPHQL_URL is set. If not set, the
 * poller stays dormant (webhook mode can be used instead).
 */
@Injectable()
export class EnvioPollerService implements OnModuleInit {
  private readonly logger = new Logger(EnvioPollerService.name);
  private readonly graphqlUrl: string;
  private readonly adminSecret: string;
  private enabled = false;
  private polling = false;

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {
    this.graphqlUrl = process.env.INDEXER_GRAPHQL_URL || 'http://localhost:8080/v1/graphql';
    this.adminSecret = process.env.INDEXER_GRAPHQL_SECRET || 'testing';
  }

  async onModuleInit(): Promise<void> {
    // Check if Envio is reachable
    if (!process.env.INDEXER_GRAPHQL_URL) {
      this.logger.log('INDEXER_GRAPHQL_URL not set — poller disabled (webhook mode)');
      return;
    }

    try {
      const reachable = await this.checkReachable();
      if (reachable) {
        this.enabled = true;
        this.logger.log(`Envio GraphQL reachable at ${this.graphqlUrl} — poller enabled`);
        // Do an initial sync on startup
        this.poll().catch((err) => this.logger.error(`Initial poll failed: ${err.message}`));
      } else {
        this.logger.warn(`Envio GraphQL not reachable at ${this.graphqlUrl} — poller will retry via cron`);
        this.enabled = true; // Enable so cron keeps trying
      }
    } catch (err) {
      this.logger.warn(`Envio GraphQL check failed: ${err.message} — poller disabled`);
    }
  }

  /**
   * Poll every 5 seconds for new data.
   * The cron decorator requires ScheduleModule.forRoot() (already in AppModule).
   */
  @Cron('*/5 * * * * *')
  async pollCron(): Promise<void> {
    if (!this.enabled || this.polling) return;
    await this.poll();
  }

  async poll(): Promise<void> {
    this.polling = true;
    try {
      await this.syncTokens();
      await this.syncTrades();
      await this.syncGraduations();
      await this.syncUsers();
    } catch (err) {
      this.logger.error(`Poll failed: ${err.message}`);
    } finally {
      this.polling = false;
    }
  }

  // ─── Token sync ───────────────────────────────────────────────────────────
  private async syncTokens(): Promise<void> {
    const lastBlock = await this.getSyncBlock('Token');
    const query = `
      query SyncTokens($lastBlock: numeric!) {
        Token(where: { createdAtBlock: { _gt: $lastBlock } }, order_by: { createdAtBlock: asc }, limit: 100) {
          id curve ammPair creator name symbol image
          price marketCap volume24h
          realUsdc tokensSold creatorFeesAccrued protocolFeesAccrued
          status graduatedAt lpBurned
          createdAtBlock createdAtTx createdAt
        }
      }`;

    const data = await this.graphqlRequest(query, { lastBlock: lastBlock.toString() });
    const tokens = data?.Token || [];
    if (tokens.length === 0) return;

    let maxBlock = lastBlock;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const t of tokens) {
        const block = BigInt(t.createdAtBlock);
        if (block > maxBlock) maxBlock = block;

        await client.query(
          `INSERT INTO tokens (
            contract_address, curve_address, creator_wallet,
            name, symbol, image, description,
            price, market_cap, volume_24h,
            real_usdc, tokens_sold, creator_fees_accrued, protocol_fees_accrued,
            status, amm_pair_address, graduated_at, lp_burned,
            created_block, created_tx_hash, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, NULL,
            $7, $8, $9,
            $10, $11, $12, $13,
            $14, $15, $16, $17,
            $18, $19, to_timestamp($20)
          )
          ON CONFLICT (contract_address) DO UPDATE SET
            price = EXCLUDED.price,
            market_cap = EXCLUDED.market_cap,
            volume_24h = EXCLUDED.volume_24h,
            real_usdc = EXCLUDED.real_usdc,
            tokens_sold = EXCLUDED.tokens_sold,
            creator_fees_accrued = EXCLUDED.creator_fees_accrued,
            protocol_fees_accrued = EXCLUDED.protocol_fees_accrued,
            status = EXCLUDED.status,
            amm_pair_address = EXCLUDED.amm_pair_address,
            graduated_at = EXCLUDED.graduated_at,
            lp_burned = EXCLUDED.lp_burned`,
          [
            t.id.toLowerCase(),
            t.curve.toLowerCase(),
            t.creator.toLowerCase(),
            t.name,
            t.symbol,
            t.image,
            t.price,
            t.marketCap,
            t.volume24h,
            t.realUsdc,
            t.tokensSold,
            t.creatorFeesAccrued,
            t.protocolFeesAccrued,
            t.status,
            t.ammPair ? t.ammPair.toLowerCase() : null,
            t.graduatedAt ? new Date(t.graduatedAt * 1000) : null,
            t.lpBurned,
            t.createdAtBlock,
            t.createdAtTx,
            t.createdAt,
          ],
        );
      }
      await this.setSyncBlock('Token', maxBlock);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Publish WebSocket events for new tokens
    for (const t of tokens) {
      await this.redis.publishTokenEvent(t.id.toLowerCase(), 'NEW_TOKEN', t);
    }
    // Invalidate token list cache
    await this.redis.delPattern('tokens:list:*');

    if (tokens.length > 0) {
      this.logger.log(`Synced ${tokens.length} tokens (block ${lastBlock} → ${maxBlock})`);
    }
  }

  // ─── Trade sync ───────────────────────────────────────────────────────────
  private async syncTrades(): Promise<void> {
    const lastBlock = await this.getSyncBlock('Trade');
    const query = `
      query SyncTrades($lastBlock: numeric!) {
        Trade(where: { blockNumber: { _gt: $lastBlock } }, order_by: { blockNumber: asc, logIndex: asc }, limit: 200) {
          id token { id } wallet type
          usdcAmount tokenAmount price
          marketCapAfter realUsdcAfter tokensSoldAfter
          txHash blockNumber logIndex timestamp
        }
      }`;

    const data = await this.graphqlRequest(query, { lastBlock: lastBlock.toString() });
    const trades = data?.Trade || [];
    if (trades.length === 0) return;

    let maxBlock = lastBlock;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const tr of trades) {
        const block = BigInt(tr.blockNumber);
        if (block > maxBlock) maxBlock = block;

        const tokenAddress = tr.token?.id?.toLowerCase();
        if (!tokenAddress) continue;

        // Find our token id
        const tokenResult = await client.query(
          `SELECT id FROM tokens WHERE contract_address = $1`,
          [tokenAddress],
        );
        if (tokenResult.rows.length === 0) {
          this.logger.warn(`Trade sync: token ${tokenAddress} not found in DB, skipping`);
          continue;
        }
        const tokenId = tokenResult.rows[0].id;

        await client.query(
          `INSERT INTO trades (
            token_id, wallet, type,
            usdc_amount, token_amount, price,
            market_cap_after, real_usdc_after, tokens_sold_after,
            tx_hash, block_number, log_index, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, to_timestamp($13))
          ON CONFLICT (tx_hash, log_index) DO UPDATE SET
            price = EXCLUDED.price,
            market_cap_after = EXCLUDED.market_cap_after,
            real_usdc_after = EXCLUDED.real_usdc_after,
            tokens_sold_after = EXCLUDED.tokens_sold_after`,
          [
            tokenId,
            tr.wallet.toLowerCase(),
            tr.type,
            tr.usdcAmount,
            tr.tokenAmount,
            tr.price,
            tr.marketCapAfter,
            tr.realUsdcAfter,
            tr.tokensSoldAfter,
            tr.txHash,
            tr.blockNumber,
            tr.logIndex,
            tr.timestamp,
          ],
        );

        // Update token aggregate state from the trade's "after" fields.
        // The Envio Token entity is updated by the Buy/Sell handlers, but
        // syncTokens() only fetches NEW tokens (createdAtBlock > lastBlock),
        // so updated state on existing tokens would never propagate without
        // this. Trades are processed in block order, so the latest trade
        // carries the most recent state.
        await client.query(
          `UPDATE tokens SET
            price = $2,
            market_cap = $3,
            real_usdc = $4,
            tokens_sold = $5
          WHERE id = $1`,
          [
            tokenId,
            tr.price,
            tr.marketCapAfter,
            tr.realUsdcAfter,
            tr.tokensSoldAfter,
          ],
        );
      }
      await this.setSyncBlock('Trade', maxBlock);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    // Publish WebSocket events for new trades
    for (const tr of trades) {
      const tokenAddress = tr.token?.id?.toLowerCase();
      if (tokenAddress) {
        const eventType = tr.type === 'buy' ? 'NEW_BUY' : 'NEW_SELL';
        await this.redis.publishTokenEvent(tokenAddress, eventType, tr);
      }
    }

    if (trades.length > 0) {
      this.logger.log(`Synced ${trades.length} trades (block ${lastBlock} → ${maxBlock})`);
    }
  }

  // ─── Graduation sync ──────────────────────────────────────────────────────
  private async syncGraduations(): Promise<void> {
    const lastBlock = await this.getSyncBlock('Graduation');
    const query = `
      query SyncGraduations($lastBlock: numeric!) {
        Graduation(where: { blockNumber: { _gt: $lastBlock } }, order_by: { blockNumber: asc }, limit: 50) {
          id token { id } ammPair lpUsdc lpTokens lpBurned
          txHash blockNumber timestamp
        }
      }`;

    const data = await this.graphqlRequest(query, { lastBlock: lastBlock.toString() });
    const graduations = data?.Graduation || [];
    if (graduations.length === 0) return;

    let maxBlock = lastBlock;
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const g of graduations) {
        const block = BigInt(g.blockNumber);
        if (block > maxBlock) maxBlock = block;

        const tokenAddress = g.token?.id?.toLowerCase();
        if (!tokenAddress) continue;

        const tokenResult = await client.query(
          `SELECT id FROM tokens WHERE contract_address = $1`,
          [tokenAddress],
        );
        if (tokenResult.rows.length === 0) continue;
        const tokenId = tokenResult.rows[0].id;

        await client.query(
          `INSERT INTO graduations (
            token_id, amm_pair_address, lp_usdc, lp_tokens, lp_burned,
            tx_hash, block_number, timestamp
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, to_timestamp($8))
          ON CONFLICT (token_id) DO UPDATE SET lp_burned = EXCLUDED.lp_burned`,
          [
            tokenId,
            g.ammPair.toLowerCase(),
            g.lpUsdc,
            g.lpTokens,
            g.lpBurned,
            g.txHash,
            g.blockNumber,
            g.timestamp,
          ],
        );
      }
      await this.setSyncBlock('Graduation', maxBlock);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }

    for (const g of graduations) {
      const tokenAddress = g.token?.id?.toLowerCase();
      if (tokenAddress) {
        await this.redis.publishTokenEvent(tokenAddress, 'TOKEN_GRADUATED', g);
      }
    }

    if (graduations.length > 0) {
      this.logger.log(`Synced ${graduations.length} graduations`);
    }
  }

  // ─── User sync ────────────────────────────────────────────────────────────
  private async syncUsers(): Promise<void> {
    const query = `
      query SyncUsers {
        User(order_by: { id: asc }) {
          id tokensLaunched totalVolumeUsdc
        }
      }`;

    const data = await this.graphqlRequest(query, {});
    const users = data?.User || [];
    if (users.length === 0) return;

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      for (const u of users) {
        await client.query(
          `INSERT INTO users (wallet, tokens_launched, total_volume_usdc, created_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (wallet) DO UPDATE SET
             tokens_launched = EXCLUDED.tokens_launched,
             total_volume_usdc = EXCLUDED.total_volume_usdc`,
          [
            u.id.toLowerCase(),
            u.tokensLaunched,
            u.totalVolumeUsdc,
          ],
        );
      }
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── GraphQL helper ───────────────────────────────────────────────────────
  private async graphqlRequest(query: string, variables: Record<string, any>): Promise<any> {
    const fetch = (await import('node-fetch')).default;
    const resp = await fetch(this.graphqlUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Hasura-Admin-Secret': this.adminSecret,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!resp.ok) {
      throw new Error(`GraphQL request failed: ${resp.status} ${resp.statusText}`);
    }

    const json: any = await resp.json();
    if (json.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
    }
    return json.data;
  }

  private async checkReachable(): Promise<boolean> {
    try {
      const data = await this.graphqlRequest(`{ __typename }`, {});
      return data !== null;
    } catch {
      return false;
    }
  }

  // ─── Sync state tracking ──────────────────────────────────────────────────
  private async getSyncBlock(entity: string): Promise<bigint> {
    const row = await this.db.queryOne(
      `SELECT last_block FROM indexer_sync_state WHERE entity = $1`,
      [entity],
    );
    return row ? BigInt(row.last_block) : 0n;
  }

  private async setSyncBlock(entity: string, block: bigint): Promise<void> {
    await this.db.query(
      `INSERT INTO indexer_sync_state (entity, last_block, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (entity) DO UPDATE SET last_block = $2, updated_at = NOW()`,
      [entity, block.toString()],
    );
  }
}
