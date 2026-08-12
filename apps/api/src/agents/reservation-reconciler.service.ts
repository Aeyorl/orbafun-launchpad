import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { DeployerService } from './deployer.service';
import { TransactionFinalizerService } from './transaction-finalizer.service';

type Intent = {
  id: string;
  reservation_id: string;
  operation: 'launch' | 'buy' | 'sell';
  agent_id: number;
  tx_hash: string | null;
  signed_tx: string | null;
  payload: Record<string, string>;
};

@Injectable()
export class ReservationReconcilerService {
  private readonly logger = new Logger(ReservationReconcilerService.name);
  constructor(
    private readonly db: DatabaseService,
    private readonly deployer: DeployerService,
    private readonly finalizer: TransactionFinalizerService,
  ) {}

  @Cron('*/15 * * * * *')
  async reconcile(): Promise<void> {
    await this.expireStaleCreated();
    const intents = await this.claim();
    for (const intent of intents) {
      try {
        // A raw signed transaction is deterministic. Re-sending it is safe and
        // closes the signer-return/database crash gap without pretending the
        // RPC broadcast and PostgreSQL commit can be atomic.
        if (intent.signed_tx) await this.deployer.rebroadcastSignedTransaction(intent.signed_tx);
        const state = await this.deployer.inspectTransaction(intent.tx_hash, {
          operation: intent.operation,
          payload: intent.payload,
        });
        if (state.status === 'success') await this.finalizer.finalizeSuccess(intent.id, state);
        else if (state.status === 'reverted') await this.finalizeRevert(intent, state.txHash);
        else if (state.status === 'replaced') await this.recordReplacement(intent.id, state.txHash);
        else await this.retryLater(intent.id);
      } catch (error) {
        await this.retryLater(intent.id);
        this.logger.error(`Intent ${intent.id} reconciliation failed: ${(error as Error).message}`);
      }
    }
  }

  private async expireStaleCreated(): Promise<void> {
    await this.db.query(
      `WITH expired AS (
         UPDATE agent_transaction_intents
         SET status = 'expired', resolved_at = NOW(), updated_at = NOW()
         WHERE status = 'created'
           AND signed_tx IS NULL
           AND tx_hash IS NULL
           AND created_at < NOW() - INTERVAL '5 minutes'
         RETURNING reservation_id
       ), released_spend AS (
         UPDATE agent_spend_reservations r
         SET status = 'released', resolved_at = NOW(), updated_at = NOW()
         FROM expired e
         WHERE r.reservation_id = e.reservation_id
           AND r.status = 'pending'
         RETURNING r.reservation_id
       ), released_positions AS (
         UPDATE agent_position_reservations r
         SET status = 'released', resolved_at = NOW(), updated_at = NOW()
         FROM expired e
         WHERE r.reservation_id = e.reservation_id
           AND r.status = 'pending'
         RETURNING r.reservation_id
       )
       SELECT
         (SELECT COUNT(*) FROM expired) AS expired_count,
         (SELECT COUNT(*) FROM released_spend) AS released_spend_count,
         (SELECT COUNT(*) FROM released_positions) AS released_position_count`,
    );
  }

  private async claim(): Promise<Intent[]> {
    const result = await this.db.query(
      `WITH candidates AS (
         SELECT id FROM agent_transaction_intents
         WHERE status IN ('prepared', 'broadcast')
            OR (status = 'reconciling' AND lease_expires_at < NOW())
         ORDER BY updated_at ASC
         FOR UPDATE SKIP LOCKED
         LIMIT 50
       )
       UPDATE agent_transaction_intents i
       SET status = 'reconciling', lease_expires_at = NOW() + INTERVAL '2 minutes', updated_at = NOW()
       FROM candidates c WHERE i.id = c.id
       RETURNING i.id, i.reservation_id, i.operation, i.agent_id,
                 i.tx_hash, i.signed_tx, i.payload`,
    );
    return result.rows;
  }

  private async retryLater(id: string): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE agent_transaction_intents SET status = 'broadcast', lease_expires_at = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'reconciling'`, [id],
      );
    });
  }

  private async recordReplacement(id: string, txHash: string): Promise<void> {
    await this.db.transaction(async (client) => {
      await client.query(
        `UPDATE agent_transaction_intents SET tx_hash = $2, status = 'broadcast',
           lease_expires_at = NULL, updated_at = NOW()
         WHERE id = $1 AND status = 'reconciling'`, [id, txHash],
      );
    });
  }

  private async finalizeRevert(intent: Intent, txHash: string): Promise<void> {
    await this.db.transaction(async (client) => {
      const transitioned = await client.query(
        `UPDATE agent_transaction_intents SET status = 'reverted', tx_hash = $2,
           lease_expires_at = NULL, resolved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status = 'reconciling' RETURNING id`, [intent.id, txHash],
      );
      if (transitioned.rowCount !== 1) return;
      const table = intent.operation === 'sell' ? 'agent_position_reservations' : 'agent_spend_reservations';
      await client.query(
        `UPDATE ${table} SET status = 'released', resolved_at = NOW(), updated_at = NOW()
         WHERE reservation_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
        [intent.reservation_id],
      );
    });
  }

}
