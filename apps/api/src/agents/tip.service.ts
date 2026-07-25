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
 * If no tx hash is provided (testnet/dev mode), the tip is recorded without
 * on-chain verification — the amount is tracked as off-chain attribution only.
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
    txHash?: string,
    message?: string,
  ) {
    if (!isValidEvmAddress(fromWallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    if (amount <= 0n) {
      throw new BadRequestException('Tip amount must be positive');
    }
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

    // If a tx hash is provided, verify the on-chain transfer.
    let verified = false;
    if (txHash && this.deployer.isConfigured()) {
      // Check for replay: reject if this tx_hash was already used for ANY tip.
      // A single on-chain transfer must not be double-counted as tips to
      // multiple agents (especially when they share the same recipient wallet).
      const existing = await this.db.queryOne<{ id: number }>(
        `SELECT id FROM agent_tips WHERE tx_hash = $1`,
        [txHash],
      );
      if (existing) {
        throw new ConflictException('This transaction has already been used for a tip');
      }

      verified = await this.deployer.verifyUsdcTransfer(
        txHash,
        fromWallet,
        recipientWallet,
        amount,
      );
      if (!verified) {
        throw new BadRequestException(
          'On-chain transfer verification failed — tx not found, reverted, or amount/recipient mismatch',
        );
      }
      this.logger.log(`Tip tx verified on-chain: ${txHash}`);
    }

    let tip: any;
    try {
      tip = await this.db.queryOne<any>(
        `INSERT INTO agent_tips (agent_id, from_wallet, amount, tx_hash, message)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, agent_id, from_wallet, amount, tx_hash, message, created_at`,
        [
          agent.id,
          fromWallet.toLowerCase(),
          amount.toString(),
          txHash || null,
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
      `Tip of ${amount} USDC (6-dec) from ${fromWallet} to agent ${agentId}` +
        (verified ? ' [verified]' : ' [unverified]'),
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
       WHERE a.agent_id = $1
       ORDER BY t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset],
    );

    const totalResult = await this.db.queryOne<{ total: string; total_amount: string }>(
      `SELECT COUNT(*)::text AS total,
              COALESCE(SUM(amount), 0)::text AS total_amount
       FROM agent_tips t
       JOIN agents a ON a.id = t.agent_id
       WHERE a.agent_id = $1`,
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
       FROM agent_tips WHERE agent_id = $1`,
      [agentDbId],
    );
    return BigInt(result?.total || '0');
  }
}
