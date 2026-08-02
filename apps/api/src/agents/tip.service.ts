import { Injectable, Logger, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { DeployerService } from './deployer.service';
import { isValidEvmAddress } from '../common/utils';

/**
 * TipService — manages USDC tips sent by users to AI agents.
 *
 * On-chain flow:
 *   1. User signs a USDC `transfer` tx via their wallet (wagmi on the frontend)
 *      sending USDC from their wallet to the agent's wallet (or the deployer
 *      wallet if the agent has no linked wallet).
 *   2. User posts the tx hash + amount + message to POST /agents/:agentId/tip
 *   3. API verifies the on-chain transfer via DeployerService.verifyUsdcTransfer()
 *      — checks the tx succeeded and the correct amount was sent from the
 *      correct sender to the correct recipient.
 *   4. If verified, the tip is recorded in the agent_tips table with the tx hash.
 *
 */
@Injectable()
export class TipService {
  private readonly logger = new Logger(TipService.name);

  constructor(
    private db: DatabaseService,
    private deployer: DeployerService,
  ) {}

  /**
   * Record a tip from a user to an agent.
   * If txHash is provided, verifies the on-chain USDC transfer.
   */
  async tipAgent(
    agentId: string,
    fromWallet: string,
    amount: bigint,
    txHash: string,
    message?: string,
  ) {
    if (!isValidEvmAddress(fromWallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    if (amount <= 0n) {
      throw new BadRequestException('Tip amount must be positive');
    }
    if (amount > 9_223_372_036_854_775_807n) {
      throw new BadRequestException('Tip amount is too large');
    }
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new BadRequestException('A valid transaction hash is required');
    }
    const normalizedTxHash = txHash.toLowerCase();
    if (message && message.length > 280) {
      throw new BadRequestException('Message must be 280 characters or less');
    }

    // Verify the agent exists and get its wallet (or fall back to deployer).
    const agent = await this.db.queryOne<{ id: number; name: string; wallet: string | null }>(
      `SELECT id, name, wallet FROM agents WHERE agent_id = $1 AND active = true`,
      [agentId],
    );
    if (!agent) throw new NotFoundException('Agent not found');

    // Determine the recipient: agent's wallet, or deployer wallet if none.
    const recipientWallet = agent.wallet || this.deployer.getAddress();
    if (!recipientWallet) {
      throw new BadRequestException('No recipient wallet available for this agent');
    }

    // Prevent self-tipping (from and recipient are the same address).
    if (fromWallet.toLowerCase() === recipientWallet.toLowerCase()) {
      throw new BadRequestException('Cannot tip yourself');
    }

    // A single on-chain transfer must not be double-counted as tips to
    // multiple agents (especially when they share the same recipient wallet).
    const existing = await this.db.queryOne<{ id: number }>(
      `SELECT id FROM agent_tips WHERE tx_hash = $1`,
      [normalizedTxHash],
    );
    if (existing) {
      throw new ConflictException('This transaction has already been used for a tip');
    }

    const verified = await this.deployer.verifyUsdcTransfer(
      normalizedTxHash,
      fromWallet,
      recipientWallet,
      amount,
    );
    if (!verified) {
      throw new BadRequestException(
        'On-chain transfer verification failed — tx not found, reverted, or amount/recipient mismatch',
      );
    }
    this.logger.log(`Tip tx verified on-chain: ${normalizedTxHash}`);

    let tip: any;
    try {
      tip = await this.db.queryOne<any>(
        `INSERT INTO agent_tips (agent_id, from_wallet, amount, tx_hash, message, verified)
         VALUES ($1, $2, $3, $4, $5, true)
         RETURNING id, agent_id, from_wallet, amount, tx_hash, message, verified, created_at`,
        [
          agent.id,
          fromWallet.toLowerCase(),
          amount.toString(),
          normalizedTxHash,
          message?.trim() || null,
        ],
      );
    } catch (err: any) {
      // Handle UNIQUE constraint violation (concurrent tip with same tx_hash)
      if (err?.code === '23505') {
        throw new ConflictException('This transaction has already been used for a tip');
      }
      throw err;
    }

    this.logger.log(
      `Verified tip of ${amount} USDC (6-dec) from ${fromWallet} to agent ${agentId}`,
    );

    return tip;
  }

  /**
   * List tips received by an agent (public, paginated).
   */
  async getAgentTips(agentId: string, limit: number, offset: number) {
    const tips = await this.db.queryRows(
      `SELECT t.id, t.from_wallet, t.amount, t.tx_hash, t.message, t.created_at
       FROM agent_tips t
       JOIN agents a ON a.id = t.agent_id
       WHERE a.agent_id = $1 AND t.verified = true
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset],
    );

    const totalResult = await this.db.queryOne<{ total: string; total_amount: string }>(
      `SELECT COUNT(*)::text AS total,
              COALESCE(SUM(amount), 0)::text AS total_amount
       FROM agent_tips t
       JOIN agents a ON a.id = t.agent_id
       WHERE a.agent_id = $1 AND t.verified = true`,
      [agentId],
    );

    return {
      tips,
      total: parseInt(totalResult?.total || '0', 10),
      total_amount: totalResult?.total_amount || '0',
    };
  }

  /**
   * Get total tips received by an agent (for profile stats).
   */
  async getAgentTipTotal(agentDbId: number): Promise<bigint> {
    const result = await this.db.queryOne<{ total: string }>(
      `SELECT COALESCE(SUM(amount), 0)::text AS total
       FROM agent_tips WHERE agent_id = $1 AND verified = true`,
      [agentDbId],
    );
    return BigInt(result?.total || '0');
  }
}
