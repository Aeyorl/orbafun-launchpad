#!/usr/bin/env node
import * as dotenv from 'dotenv';
import { DatabaseService } from '../database/database.service';
import { updateWalletPosition } from '../users/position-accounting';
import { refreshWalletStats } from '../users/wallet-intelligence';

dotenv.config({ path: '../../.env' });

interface LedgerEvent {
  source: 'curve' | 'amm';
  source_id: string;
  token_id: string;
  wallet: string;
  type: 'buy' | 'sell';
  token_amount: string;
  gross_usdc_amount: string;
  net_usdc_amount: string;
}

async function main() {
  const db = new DatabaseService();
  await db.onModuleInit();
  const client = await db.connect();

  try {
    await client.query('BEGIN');
    await client.query('TRUNCATE TABLE wallet_stats, wallet_token_positions');
    await client.query(
      `UPDATE trades SET allocated_cost_usdc = 0, realized_pnl_usdc = 0`,
    );
    await client.query(
      `UPDATE amm_swaps SET allocated_cost_usdc = 0, realized_pnl_usdc = 0`,
    );

    const events = await client.query<LedgerEvent>(
      `SELECT * FROM (
         SELECT
           'curve'::text AS source, id AS source_id, token_id, wallet, type,
           token_amount, gross_usdc_amount, net_usdc_amount,
           block_number, log_index
         FROM trades
         UNION ALL
         SELECT
           'amm'::text AS source, id AS source_id, token_id,
           CASE WHEN is_buy THEN to_address ELSE sender END AS wallet,
           CASE WHEN is_buy THEN 'buy' ELSE 'sell' END AS type,
           CASE WHEN is_buy THEN token_out ELSE token_in END AS token_amount,
           CASE WHEN is_buy THEN usdc_in ELSE usdc_out END AS gross_usdc_amount,
           CASE WHEN is_buy THEN usdc_in ELSE usdc_out END AS net_usdc_amount,
           block_number, log_index
         FROM amm_swaps
       ) ledger
       ORDER BY block_number, log_index, source, source_id`,
    );

    for (const event of events.rows) {
      const update = await updateWalletPosition(client, {
        wallet: event.wallet.toLowerCase(),
        tokenId: Number(event.token_id),
        tradeId: Number(event.source_id),
        source: event.source,
        trade: {
          type: event.type,
          tokenAmountBaseUnits: BigInt(event.token_amount),
          grossMicroUsdc: BigInt(event.gross_usdc_amount),
          netMicroUsdc: BigInt(event.net_usdc_amount),
        },
      });
      const table = event.source === 'curve' ? 'trades' : 'amm_swaps';
      await client.query(
        `UPDATE ${table}
         SET allocated_cost_usdc = $2, realized_pnl_usdc = $3
         WHERE id = $1`,
        [
          event.source_id,
          update.allocatedCostMicroUsdc.toString(),
          update.realizedPnlIncrementMicroUsdc.toString(),
        ],
      );
    }

    await client.query('COMMIT');
    const wallets = await db.queryRows<{ wallet: string }>(
      `SELECT DISTINCT wallet FROM wallet_token_positions ORDER BY wallet`,
    );
    for (const { wallet } of wallets) {
      await refreshWalletStats(db, wallet);
    }
    console.log(
      `Rebuilt ${events.rowCount} ledger events across ${wallets.length} wallets.`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await db.onModuleDestroy();
  }
}

void main().catch((error) => {
  console.error('Wallet accounting rebuild failed:', error.message);
  process.exitCode = 1;
});
