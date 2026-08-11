import type { PoolClient } from 'pg';

export type PositionBasisStatus = 'complete' | 'incomplete';

export interface PositionState {
  quantityBaseUnits: bigint;
  remainingCostMicroUsdc: bigint;
  costOfTokensSoldMicroUsdc: bigint;
  netSaleProceedsMicroUsdc: bigint;
  realizedPnlMicroUsdc: bigint;
  totalBoughtMicroUsdc: bigint;
  totalSoldMicroUsdc: bigint;
  buyCount: number;
  sellCount: number;
  basisStatus: PositionBasisStatus;
}

export interface PositionTrade {
  type: 'buy' | 'sell';
  tokenAmountBaseUnits: bigint;
  grossMicroUsdc: bigint;
  netMicroUsdc: bigint;
}

export interface PositionUpdate extends PositionState {
  allocatedCostMicroUsdc: bigint;
  realizedPnlIncrementMicroUsdc: bigint;
}

export function calculatePositionUpdate(
  state: PositionState,
  trade: PositionTrade,
): PositionUpdate {
  if (trade.tokenAmountBaseUnits <= 0n) {
    throw new Error('Position trade token amount must be positive');
  }
  if (trade.grossMicroUsdc < 0n || trade.netMicroUsdc < 0n) {
    throw new Error('Position trade USDC amounts cannot be negative');
  }

  if (trade.type === 'buy') {
    return {
      ...state,
      quantityBaseUnits: state.quantityBaseUnits + trade.tokenAmountBaseUnits,
      remainingCostMicroUsdc:
        state.remainingCostMicroUsdc + trade.grossMicroUsdc,
      totalBoughtMicroUsdc:
        state.totalBoughtMicroUsdc + trade.grossMicroUsdc,
      buyCount: state.buyCount + 1,
      allocatedCostMicroUsdc: 0n,
      realizedPnlIncrementMicroUsdc: 0n,
    };
  }

  const quantityAvailable = state.quantityBaseUnits;
  const quantitySold = trade.tokenAmountBaseUnits;
  const basisIsIncomplete = quantitySold > quantityAvailable;
  const allocatedCost =
    quantityAvailable === 0n
      ? 0n
      : quantitySold >= quantityAvailable
        ? state.remainingCostMicroUsdc
        : (state.remainingCostMicroUsdc * quantitySold) / quantityAvailable;
  const realizedIncrement = trade.netMicroUsdc - allocatedCost;

  return {
    ...state,
    quantityBaseUnits:
      quantitySold >= quantityAvailable ? 0n : quantityAvailable - quantitySold,
    remainingCostMicroUsdc:
      quantitySold >= quantityAvailable
        ? 0n
        : state.remainingCostMicroUsdc - allocatedCost,
    costOfTokensSoldMicroUsdc:
      state.costOfTokensSoldMicroUsdc + allocatedCost,
    netSaleProceedsMicroUsdc:
      state.netSaleProceedsMicroUsdc + trade.netMicroUsdc,
    realizedPnlMicroUsdc:
      state.realizedPnlMicroUsdc + realizedIncrement,
    totalSoldMicroUsdc: state.totalSoldMicroUsdc + trade.netMicroUsdc,
    sellCount: state.sellCount + 1,
    basisStatus: basisIsIncomplete ? 'incomplete' : state.basisStatus,
    allocatedCostMicroUsdc: allocatedCost,
    realizedPnlIncrementMicroUsdc: realizedIncrement,
  };
}

export async function updateWalletPosition(
  client: PoolClient,
  input: {
    wallet: string;
    tokenId: number;
    tradeId: number;
    source: 'curve' | 'amm';
    trade: PositionTrade;
  },
): Promise<PositionUpdate> {
  await client.query(
    `INSERT INTO wallet_token_positions (
       wallet, token_id, last_activity_at
     ) VALUES ($1, $2, NOW())
     ON CONFLICT (wallet, token_id) DO NOTHING`,
    [input.wallet, input.tokenId],
  );

  const locked = await client.query(
    `SELECT
       quantity_base_units, remaining_cost_usdc,
       cost_of_tokens_sold_usdc, net_sale_proceeds_usdc,
       realized_pnl_usdc, total_bought_usdc, total_sold_usdc,
       buy_count, sell_count, basis_status
     FROM wallet_token_positions
     WHERE wallet = $1 AND token_id = $2
     FOR UPDATE`,
    [input.wallet, input.tokenId],
  );
  if (locked.rows.length !== 1) {
    throw new Error('Unable to lock wallet position');
  }

  const row = locked.rows[0];
  const state: PositionState = {
    quantityBaseUnits: BigInt(row.quantity_base_units),
    remainingCostMicroUsdc: BigInt(row.remaining_cost_usdc),
    costOfTokensSoldMicroUsdc: BigInt(row.cost_of_tokens_sold_usdc),
    netSaleProceedsMicroUsdc: BigInt(row.net_sale_proceeds_usdc),
    realizedPnlMicroUsdc: BigInt(row.realized_pnl_usdc),
    totalBoughtMicroUsdc: BigInt(row.total_bought_usdc),
    totalSoldMicroUsdc: BigInt(row.total_sold_usdc),
    buyCount: Number(row.buy_count),
    sellCount: Number(row.sell_count),
    basisStatus: row.basis_status,
  };
  const update = calculatePositionUpdate(state, input.trade);

  await client.query(
    `UPDATE wallet_token_positions SET
       quantity_base_units = $3,
       remaining_cost_usdc = $4,
       cost_of_tokens_sold_usdc = $5,
       net_sale_proceeds_usdc = $6,
       realized_pnl_usdc = $7,
       total_bought_usdc = $8,
       total_sold_usdc = $9,
       buy_count = $10,
       sell_count = $11,
       basis_status = $12,
       opened_at = CASE
         WHEN $13 = 'buy' AND quantity_base_units = 0 THEN NOW()
         ELSE opened_at
       END,
       closed_at = CASE
         WHEN $3::numeric = 0 AND $13 = 'sell' THEN NOW()
         WHEN $13 = 'buy' THEN NULL
         ELSE closed_at
       END,
       last_activity_at = NOW(),
       calculated_through_trade_id = CASE WHEN $14 = 'curve' THEN $15 ELSE calculated_through_trade_id END,
       calculated_through_swap_id = CASE WHEN $14 = 'amm' THEN $15 ELSE calculated_through_swap_id END,
       updated_at = NOW()
     WHERE wallet = $1 AND token_id = $2`,
    [
      input.wallet,
      input.tokenId,
      update.quantityBaseUnits.toString(),
      update.remainingCostMicroUsdc.toString(),
      update.costOfTokensSoldMicroUsdc.toString(),
      update.netSaleProceedsMicroUsdc.toString(),
      update.realizedPnlMicroUsdc.toString(),
      update.totalBoughtMicroUsdc.toString(),
      update.totalSoldMicroUsdc.toString(),
      update.buyCount,
      update.sellCount,
      update.basisStatus,
      input.trade.type,
      input.source,
      input.tradeId,
    ],
  );

  return update;
}
