import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { TransactionInspection } from './deployer.service';

type SuccessInspection = Extract<TransactionInspection, { status: 'success' }>;

type FinalizableIntent = {
  id: string;
  reservation_id: string;
  operation: 'launch' | 'buy' | 'sell';
  agent_id: number;
  payload: Record<string, string>;
};

@Injectable()
export class TransactionFinalizerService {
  constructor(private readonly db: DatabaseService) {}

  async finalizeSuccess(intentId: string, state: SuccessInspection): Promise<boolean> {
    return this.db.transaction(async (client) => {
      const transitioned = await client.query(
        `UPDATE agent_transaction_intents
         SET status = 'succeeded', tx_hash = $2, lease_expires_at = NULL,
             resolved_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND status IN ('broadcast', 'reconciling')
         RETURNING id, reservation_id, operation, agent_id, payload`,
        [intentId, state.txHash],
      );
      if (transitioned.rowCount !== 1) return false;

      const intent = transitioned.rows[0] as FinalizableIntent;
      const payload = intent.payload;
      const hasText = (value: unknown): value is string =>
        typeof value === 'string' && value.length > 0;

      if (!hasText(state.txHash) || state.gasUsed === undefined) {
        throw new Error('Successful receipt is missing transaction hash or gas used');
      }
      if (
        intent.operation === 'buy'
        && (!hasText(payload.tokenAddress)
          || !hasText(payload.curveAddress)
          || !hasText(payload.usdcAmount))
      ) {
        throw new Error('Successful buy intent is missing requested token or USDC amount');
      }
      if (
        intent.operation === 'sell'
        && (!hasText(payload.tokenAddress)
          || !hasText(payload.curveAddress)
          || !hasText(payload.tokenAmount))
      ) {
        throw new Error('Successful sell intent is missing requested token amount');
      }
      if (
        intent.operation === 'launch'
        && (!hasText(payload.name) || !hasText(payload.symbol) || !hasText(payload.usdcAmount))
      ) {
        throw new Error('Successful launch intent is missing requested launch metadata');
      }

      if (intent.operation === 'launch') {
        if (!state.tokenAddress || !state.curveAddress) {
          throw new Error('Successful launch receipt is missing emitted token or curve address');
        }
        await client.query(
          `INSERT INTO agent_launches (agent_id, token_address, curve_address, tx_hash,
             name, symbol, image, description, fee_paid, gas_paid, status)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'confirmed')
           ON CONFLICT (tx_hash) DO NOTHING`,
          [
            intent.agent_id,
            state.tokenAddress,
            state.curveAddress,
            state.txHash,
            payload.name,
            payload.symbol,
            payload.image || null,
            payload.description || null,
            payload.usdcAmount,
            state.gasUsed.toString(),
          ],
        );
      } else if (intent.operation === 'buy') {
        if (state.tokenAmount === undefined) {
          throw new Error('Successful buy receipt is missing emitted token amount');
        }
        await client.query(
          `INSERT INTO agent_trades (agent_id, token_address, curve_address, tx_hash,
             type, usdc_amount, token_amount, gas_paid, status)
           VALUES ($1,$2,$3,$4,'buy',$5,$6,$7,'confirmed')
           ON CONFLICT (tx_hash) DO NOTHING`,
          [
            intent.agent_id,
            payload.tokenAddress,
            payload.curveAddress,
            state.txHash,
            (state.usdcAmount ?? BigInt(payload.usdcAmount)).toString(),
            state.tokenAmount.toString(),
            state.gasUsed.toString(),
          ],
        );
      } else if (intent.operation === 'sell') {
        if (state.usdcAmount === undefined) {
          throw new Error('Successful sell receipt is missing emitted USDC amount');
        }
        await client.query(
          `INSERT INTO agent_trades (agent_id, token_address, curve_address, tx_hash,
             type, usdc_amount, token_amount, gas_paid, status)
           VALUES ($1,$2,$3,$4,'sell',$5,$6,$7,'confirmed')
           ON CONFLICT (tx_hash) DO NOTHING`,
          [
            intent.agent_id,
            payload.tokenAddress,
            payload.curveAddress,
            state.txHash,
            state.usdcAmount.toString(),
            payload.tokenAmount,
            state.gasUsed.toString(),
          ],
        );
      } else {
        throw new Error(`Unsupported successful intent operation: ${intent.operation}`);
      }

      const reservation = intent.operation === 'sell'
        ? await client.query(
          `UPDATE agent_position_reservations SET status = 'confirmed', tx_hash = $2,
             resolved_at = NOW(), updated_at = NOW()
           WHERE reservation_id = $1
             AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
          [intent.reservation_id, state.txHash],
        )
        : await client.query(
          `UPDATE agent_spend_reservations SET status = 'confirmed', tx_hash = $2,
             resolved_at = NOW(), updated_at = NOW()
           WHERE reservation_id = $1
             AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
          [intent.reservation_id, state.txHash],
        );
      if (reservation.rowCount !== 1) {
        throw new Error(`Spending reservation ${intent.reservation_id} is not finalizable`);
      }
      if (intent.operation === 'buy') {
        await client.query(
          `INSERT INTO agent_position_reservations
             (reservation_id, transaction_intent_id, agent_id, token_address,
              amount, status, tx_hash, resolved_at)
           VALUES (gen_random_uuid(), $1, $2, $3, $4, 'confirmed', $5, NOW())
           ON CONFLICT (transaction_intent_id) DO NOTHING`,
          [intent.id, intent.agent_id, payload.tokenAddress, state.tokenAmount!.toString(), state.txHash],
        );
      }
      return true;
    });
  }
}
