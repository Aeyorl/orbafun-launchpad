import { Injectable, Logger, BadRequestException, ForbiddenException, NotFoundException, Optional } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { DatabaseService } from '../database/database.service';
import { BroadcastTransactionError, DeployerService, LaunchResult, TradeResult } from './deployer.service';
import { MessagesService } from '../messages/messages.service';
import { TokenMetadataService, TokenMetadataInput } from '../token-metadata/token-metadata.service';
import { isValidEvmAddress } from '../common/utils';
import { AlertService, safeAlertError } from '../monitoring/alert.service';
import { TransactionFinalizerService } from './transaction-finalizer.service';

/**
 * AgentsService — manages AI agent registration, API key issuance, and
 * platform-funded token launches.
 *
 * Flow:
 *   1. Platform operator registers an agent via POST /agents/register
 *      → returns agent_id + raw API key (shown once)
 *   2. Agent calls POST /agents/launch with x-api-key header
 *      → platform deployer wallet submits createToken() on-chain
 *      → agent_launches row tracks attribution + spending
 *   3. Spending is tracked against daily/monthly limits
 *
 * Security:
 *   - API keys are hashed (SHA-256) before storage
 *   - Raw key is only returned once at creation time
 *   - Spending limits enforced before each launch
 *   - All launches recorded for audit trail
 */

const CREATION_FEE_USDC = 5_000_000n; // 5 USDC (6-dec)
const MAX_NAME_LENGTH = 50;
const MAX_SYMBOL_LENGTH = 10;
const MAX_DESCRIPTION_LENGTH = 280;
const AGENT_GAS_RESERVE_USDC = 10_000n;

export interface AgentRegistration {
  agentId: string;
  apiKey: string; // raw key — only shown once
  name: string;
}

export interface AgentLaunchRequest {
  name: string;
  symbol: string;
  image?: string;
  description?: string;
}

export interface AgentLaunchResponse {
  tokenAddress: string;
  curveAddress: string;
  txHash: string;
  name: string;
  symbol: string;
  feePaid: string;
  gasPaid: string;
  status: 'confirmed';
}

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private db: DatabaseService,
    private deployer: DeployerService,
    private messagesService: MessagesService,
    private metadataService: TokenMetadataService,
    private finalizer: TransactionFinalizerService,
    @Optional() private alerts?: AlertService,
  ) {}

  /**
   * Register a new AI agent and issue an API key.
   * Admin-only — protected by AdminGuard at the controller level.
   */
  async registerAgent(input: {
    name: string;
    description?: string;
    wallet?: string;
    ownerWallet?: string;
    dailyLimit?: bigint;
    monthlyLimit?: bigint;
    config?: any;
  }): Promise<AgentRegistration> {
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('Agent name is required');
    }
    if (input.wallet && !isValidEvmAddress(input.wallet)) {
      throw new BadRequestException('Invalid wallet address');
    }
    if (input.ownerWallet && !isValidEvmAddress(input.ownerWallet)) {
      throw new BadRequestException('Invalid owner wallet address');
    }

    const agentId = randomUUID();
    const rawKey = `arc_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 12);

    const client = await this.db.connect();
    try {
      await client.query('BEGIN');

      const agentRow = await client.query(
        `INSERT INTO agents (agent_id, name, description, wallet, owner_wallet, daily_limit, monthly_limit, config)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          agentId,
          input.name.trim(),
          input.description || null,
          input.wallet?.toLowerCase() || null,
          input.ownerWallet?.toLowerCase() || null,
          (input.dailyLimit ?? 50_000_000n).toString(),
          (input.monthlyLimit ?? 1_000_000_000n).toString(),
          JSON.stringify(input.config || {}),
        ],
      );

      const agentDbId = agentRow.rows[0].id;

      await client.query(
        `INSERT INTO agent_api_keys (agent_id, key_hash, key_prefix, label)
         VALUES ($1, $2, $3, $4)`,
        [agentDbId, keyHash, keyPrefix, 'default'],
      );

      await client.query('COMMIT');

      this.logger.log(`Agent registered: ${agentId} (${input.name})`);

      return {
        agentId,
        apiKey: rawKey,
        name: input.name.trim(),
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  /**
   * Launch a token on behalf of an authenticated agent.
   * The platform deployer wallet pays the creation fee and gas.
   */
  async launchToken(
    agent: { id: number; agentId: string; name: string; dailyLimit: bigint; monthlyLimit: bigint },
    input: AgentLaunchRequest,
  ): Promise<AgentLaunchResponse> {
    // Validate input.
    if (!input.name || input.name.trim().length === 0) {
      throw new BadRequestException('Token name is required');
    }
    if (input.name.length > MAX_NAME_LENGTH) {
      throw new BadRequestException(`Name must be ${MAX_NAME_LENGTH} characters or less`);
    }
    if (!input.symbol || input.symbol.trim().length === 0) {
      throw new BadRequestException('Token symbol is required');
    }
    if (input.symbol.length > MAX_SYMBOL_LENGTH) {
      throw new BadRequestException(`Symbol must be ${MAX_SYMBOL_LENGTH} characters or less`);
    }
    if (input.description && input.description.length > MAX_DESCRIPTION_LENGTH) {
      throw new BadRequestException(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or less`);
    }

    // Check deployer wallet is configured.
    if (!this.deployer.isConfigured()) {
      throw new ForbiddenException('Agent launches disabled — deployer wallet not configured');
    }

    // Check deployer has sufficient USDC balance for the creation fee + gas.
    // Native USDC is 18-dec; creation fee is 6-dec. Convert fee to 18-dec for
    // comparison (multiply by 1e12). Add a small buffer for gas.
    try {
      const nativeBalance = await this.deployer.getBalance(); // 18-dec
      const creationFee18dec = CREATION_FEE_USDC * 1_000_000_000_000n; // 6-dec → 18-dec
      const gasBuffer = 10_000_000_000_000n; // ~0.01 USDC gas buffer (18-dec)
      if (nativeBalance < creationFee18dec + gasBuffer) {
        throw new ForbiddenException(
          `Deployer wallet has insufficient USDC for launch (balance: ${nativeBalance} 18-dec, ` +
          `needed: ${creationFee18dec + gasBuffer} 18-dec). Top up the deployer wallet.`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // If balance check fails (RPC error), proceed — the on-chain tx will
      // fail naturally if there's insufficient balance.
      this.logger.warn(`Deployer balance check failed: ${(err as Error).message}`);
    }

    const image = input.image || '';
    const description = input.description || '';
    const reservationId = await this.reserveSpending(
      agent.id,
      'launch',
      CREATION_FEE_USDC,
      {
        name: input.name.trim(),
        symbol: input.symbol.trim().toUpperCase(),
        image,
        description,
        usdcAmount: CREATION_FEE_USDC.toString(),
      },
    );

    // Submit the on-chain transaction.
    let result: LaunchResult;
    try {
      result = await this.deployer.launchToken(
        input.name.trim(),
        input.symbol.trim().toUpperCase(),
        image,
        description,
        reservationId,
      );
    } catch (err) {
      if (err instanceof BroadcastTransactionError) {
        await this.markReservationBroadcast(reservationId, err.txHash);
      } else {
        await this.releaseReservation(reservationId);
      }
      await this.alerts?.send('agent-launch-failed', 'critical', 'Agent-funded launch failed', {
        agentId: agent.agentId,
        error: safeAlertError(err),
      });
      throw err;
    }

    const gasPaid18dec = result.gasUsed;
    await this.finalizer.finalizeSuccess(reservationId, {
      status: 'success',
      txHash: result.txHash,
      tokenAddress: result.tokenAddress,
      curveAddress: result.curveAddress,
      gasUsed: result.gasUsed,
    });

    this.logger.log(
      `Agent ${agent.agentId} launched token ${result.tokenAddress}`,
    );

    return {
      tokenAddress: result.tokenAddress,
      curveAddress: result.curveAddress,
      txHash: result.txHash,
      name: input.name.trim(),
      symbol: input.symbol.trim().toUpperCase(),
      feePaid: result.creationFee.toString(),
      gasPaid: gasPaid18dec.toString(),
      status: 'confirmed',
    };
  }

  /**
   * List all active agents with their launch stats (public).
   * Paginated, sorted by total launches (most active first).
   */
  async listAgents(limit: number, offset: number, search?: string) {
    const searchClause = search
      ? `WHERE a.active = true AND (a.name ILIKE $3 OR a.description ILIKE $3)`
      : `WHERE a.active = true`;
    const params = search
      ? [limit, offset, `%${search}%`]
      : [limit, offset];

    const agents = await this.db.queryRows(
      `SELECT
         a.agent_id, a.name, a.description, a.wallet,
         a.daily_limit, a.monthly_limit, a.created_at,
         COALESCE(la.total_launches, 0)::text AS total_launches,
         COALESCE(la.confirmed_launches, 0)::text AS confirmed_launches,
         COALESCE(la.total_spent, 0)::text AS total_spent,
         COALESCE(tr.total_trades, 0)::text AS total_trades,
         COALESCE(tr.total_volume, 0)::text AS total_volume
       FROM agents a
       LEFT JOIN (
         SELECT agent_id,
           COUNT(*) AS total_launches,
           COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_launches,
           SUM(fee_paid + gas_paid / 1000000000000) AS total_spent
         FROM agent_launches GROUP BY agent_id
       ) la ON la.agent_id = a.id
       LEFT JOIN (
         SELECT agent_id,
           COUNT(*) AS total_trades,
           SUM(usdc_amount) AS total_volume
         FROM agent_trades WHERE status = 'confirmed' GROUP BY agent_id
       ) tr ON tr.agent_id = a.id
       ${searchClause}
       ORDER BY COALESCE(la.confirmed_launches, 0) DESC, a.created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM agents a ${searchClause}`,
      search ? [`%${search}%`] : [],
    );

    return {
      agents,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Get the agent leaderboard — top agents by various metrics.
   * @param metric 'launches' | 'volume' | 'tips'
   * @param limit Number of agents to return
   */
  async getLeaderboard(metric: 'launches' | 'volume' | 'tips', limit: number) {
    let orderBy: string;
    let metricColumn: string;

    switch (metric) {
      case 'launches':
        orderBy = `COALESCE(la.confirmed_launches, 0) DESC`;
        metricColumn = `COALESCE(la.confirmed_launches, 0)::text AS metric_value`;
        break;
      case 'volume':
        orderBy = `COALESCE(tr.total_volume, 0) DESC`;
        metricColumn = `COALESCE(tr.total_volume, 0)::text AS metric_value`;
        break;
      case 'tips':
        orderBy = `COALESCE(tip.total_tips, 0) DESC`;
        metricColumn = `COALESCE(tip.total_tips, 0)::text AS metric_value`;
        break;
    }

    const agents = await this.db.queryRows(
      `SELECT
         a.agent_id, a.name, a.description, a.created_at,
         COALESCE(la.confirmed_launches, 0)::text AS confirmed_launches,
         COALESCE(la.total_spent, 0)::text AS total_spent,
         COALESCE(tr.total_trades, 0)::text AS total_trades,
         COALESCE(tr.total_volume, 0)::text AS total_volume,
         COALESCE(tip.total_tips, 0)::text AS total_tips,
         ${metricColumn}
       FROM agents a
       LEFT JOIN (
         SELECT agent_id,
           COUNT(*) FILTER (WHERE status = 'confirmed') AS confirmed_launches,
           SUM(fee_paid + gas_paid / 1000000000000) AS total_spent
         FROM agent_launches GROUP BY agent_id
       ) la ON la.agent_id = a.id
       LEFT JOIN (
         SELECT agent_id,
           COUNT(*) AS total_trades,
           SUM(usdc_amount) AS total_volume
         FROM agent_trades WHERE status = 'confirmed' GROUP BY agent_id
       ) tr ON tr.agent_id = a.id
       LEFT JOIN (
         SELECT agent_id, SUM(amount) AS total_tips
         FROM agent_tips WHERE verified = true GROUP BY agent_id
       ) tip ON tip.agent_id = a.id
       WHERE a.active = true
       ORDER BY ${orderBy}
       LIMIT $1`,
      [limit],
    );

    return { metric, agents };
  }

  /**
   * Get agent profile and launch stats.
   */
  async getAgentProfile(agentId: string) {
    const agent = await this.db.queryOne<{
      agent_id: string;
      name: string;
      description: string | null;
      wallet: string | null;
      daily_limit: string;
      monthly_limit: string;
      config: any;
      active: boolean;
      created_at: string;
    }>(
      `SELECT agent_id, name, description, wallet, daily_limit, monthly_limit, config, active, created_at
       FROM agents WHERE agent_id = $1`,
      [agentId],
    );

    if (!agent) return null;

    const stats = await this.db.queryOne<{
      total_launches: string;
      confirmed_launches: string;
      total_spent: string;
    }>(
      `SELECT
         COUNT(*)::text AS total_launches,
         COUNT(*) FILTER (WHERE status = 'confirmed')::text AS confirmed_launches,
         COALESCE(SUM(fee_paid + gas_paid / 1000000000000), 0)::text AS total_spent
       FROM agent_launches
       WHERE agent_id = (SELECT id FROM agents WHERE agent_id = $1)`,
      [agentId],
    );

    return {
      ...agent,
      daily_limit: agent.daily_limit,
      monthly_limit: agent.monthly_limit,
      stats: {
        total_launches: parseInt(stats?.total_launches || '0', 10),
        confirmed_launches: parseInt(stats?.confirmed_launches || '0', 10),
        total_spent: stats?.total_spent || '0',
      },
    };
  }

  /**
   * List launches by an agent (paginated).
   */
  async getAgentLaunches(agentDbId: number, limit: number, offset: number) {
    const launches = await this.db.queryRows(
      `SELECT token_address, curve_address, tx_hash, name, symbol, image,
              description, fee_paid, gas_paid, status, created_at
       FROM agent_launches
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentDbId, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM agent_launches WHERE agent_id = $1`,
      [agentDbId],
    );

    return {
      launches,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Get an agent's launches by agent_id (public, paginated).
   * Joins with the tokens table to include live price/market cap data.
   */
  async getPublicAgentLaunches(agentId: string, limit: number, offset: number) {
    const launches = await this.db.queryRows(
      `SELECT
         al.token_address, al.tx_hash, al.name, al.symbol,
         al.image, al.description, al.status, al.created_at,
         t.price, t.market_cap, t.status AS token_status,
         t.real_usdc, t.tokens_sold
       FROM agent_launches al
       JOIN agents a ON a.id = al.agent_id
       LEFT JOIN tokens t ON t.contract_address = al.token_address
       WHERE a.agent_id = $1
       ORDER BY al.created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total
       FROM agent_launches al
       JOIN agents a ON a.id = al.agent_id
       WHERE a.agent_id = $1`,
      [agentId],
    );

    return {
      launches,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Get a unified activity feed for an agent (public, paginated).
   * Unions launches, trades, and tips into a single timeline ordered by time.
   */
  async getAgentActivityFeed(agentId: string, limit: number, offset: number) {
    const rows = await this.db.queryRows(
      `SELECT activity_type, created_at, payload
       FROM (
         -- Launches
         SELECT
           'launch' AS activity_type,
           al.created_at,
           jsonb_build_object(
             'token_address', al.token_address,
             'name', al.name,
             'symbol', al.symbol,
             'image', al.image,
             'tx_hash', al.tx_hash,
             'status', al.status,
             'fee_paid', al.fee_paid
           ) AS payload
         FROM agent_launches al
         JOIN agents a ON a.id = al.agent_id
         WHERE a.agent_id = $1

         UNION ALL

         -- Trades
         SELECT
           'trade' AS activity_type,
           ats.created_at,
           jsonb_build_object(
             'token_address', ats.token_address,
             'trade_type', ats.type,
             'usdc_amount', ats.usdc_amount,
             'token_amount', ats.token_amount,
             'tx_hash', ats.tx_hash,
             'status', ats.status
           ) AS payload
         FROM agent_trades ats
         JOIN agents a ON a.id = ats.agent_id
         WHERE a.agent_id = $1

         UNION ALL

         -- Tips received
         SELECT
           'tip' AS activity_type,
           t.created_at,
           jsonb_build_object(
             'from_wallet', t.from_wallet,
             'amount', t.amount,
             'message', t.message,
             'tx_hash', t.tx_hash
           ) AS payload
         FROM agent_tips t
         JOIN agents a ON a.id = t.agent_id
         WHERE a.agent_id = $1
       ) AS combined
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT
         (SELECT COUNT(*) FROM agent_launches al JOIN agents a ON a.id = al.agent_id WHERE a.agent_id = $1)
         + (SELECT COUNT(*) FROM agent_trades ats JOIN agents a ON a.id = ats.agent_id WHERE a.agent_id = $1)
         + (SELECT COUNT(*) FROM agent_tips t JOIN agents a ON a.id = t.agent_id WHERE a.agent_id = $1)
       AS total`,
      [agentId],
    );

    return {
      activities: rows,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  // ─── Token Management ──────────────────────────────────────────────────

  /**
   * Verify that an agent launched a specific token.
   * Returns the launch record if found, null otherwise.
   */
  private async verifyTokenOwnership(
    agentDbId: number,
    tokenAddress: string,
  ): Promise<{ curve_address: string } | null> {
    return this.db.queryOne<{ curve_address: string }>(
      `SELECT curve_address FROM agent_launches
       WHERE agent_id = $1 AND token_address = $2 AND status = 'confirmed'`,
      [agentDbId, tokenAddress.toLowerCase()],
    );
  }

  /**
   * Post a message on a token's chat board as the agent.
   * The message is posted using the deployer wallet address (the on-chain creator).
   * Only allowed on tokens the agent has launched.
   */
  async postTokenMessage(
    agent: { id: number; agentId: string; name: string },
    tokenAddress: string,
    content: string,
  ): Promise<any> {
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    const launch = await this.verifyTokenOwnership(agent.id, tokenAddress);
    if (!launch) {
      throw new ForbiddenException('Agent can only post messages on tokens it has launched');
    }

    const tokenId = await this.messagesService.resolveTokenId(tokenAddress);
    if (!tokenId) throw new NotFoundException('Token not found in database');

    // Post as the deployer wallet (the on-chain creator).
    const posterWallet = this.deployer.getAddress();
    if (!posterWallet) {
      throw new ForbiddenException('Deployer wallet not configured');
    }

    this.logger.log(`Agent ${agent.agentId} posting message on token ${tokenAddress}`);
    return this.messagesService.postMessage(tokenId, posterWallet, content, undefined, agent.name);
  }

  /**
   * Update metadata (website, twitter, telegram, discord, description) for a
   * token the agent has launched. The deployer wallet is the on-chain creator,
   * so we pass its address to the metadata service for ownership verification.
   */
  async updateTokenMetadata(
    agent: { id: number; agentId: string; name: string },
    tokenAddress: string,
    input: TokenMetadataInput,
  ): Promise<any> {
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    const launch = await this.verifyTokenOwnership(agent.id, tokenAddress);
    if (!launch) {
      throw new ForbiddenException('Agent can only update metadata on tokens it has launched');
    }

    const creatorWallet = this.deployer.getAddress();
    if (!creatorWallet) {
      throw new ForbiddenException('Deployer wallet not configured');
    }

    this.logger.log(`Agent ${agent.agentId} updating metadata for token ${tokenAddress}`);
    return this.metadataService.setMetadata(tokenAddress, creatorWallet, input);
  }

  /**
   * Buy tokens on a bonding curve using the platform deployer wallet.
   * Spending limits are checked before executing the trade.
   * The agent can buy any token, not just ones it has launched.
   */
  async buyTokens(
    agent: { id: number; agentId: string; name: string; dailyLimit: bigint; monthlyLimit: bigint },
    tokenAddress: string,
    usdcAmount: bigint,
    slippageBps?: bigint,
  ): Promise<AgentTradeResponse> {
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    if (usdcAmount <= 0n) {
      throw new BadRequestException('USDC amount must be positive');
    }

    if (!this.deployer.isConfigured()) {
      throw new ForbiddenException('Agent trades disabled — deployer wallet not configured');
    }

    // Check deployer has sufficient USDC for the buy amount + gas.
    try {
      const nativeBalance = await this.deployer.getBalance(); // 18-dec
      const usdcAmount18dec = usdcAmount * 1_000_000_000_000n; // 6-dec → 18-dec
      const gasBuffer = 10_000_000_000_000n; // ~0.01 USDC gas buffer (18-dec)
      if (nativeBalance < usdcAmount18dec + gasBuffer) {
        throw new ForbiddenException(
          `Deployer wallet has insufficient USDC for buy (balance: ${nativeBalance} 18-dec, ` +
          `needed: ${usdcAmount18dec + gasBuffer} 18-dec).`,
        );
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      this.logger.warn(`Deployer balance check failed: ${(err as Error).message}`);
    }
    const token = await this.db.queryOne<{ curve_address: string }>(
      `SELECT curve_address FROM tokens WHERE contract_address = $1`,
      [tokenAddress.toLowerCase()],
    );
    if (!token || !token.curve_address) {
      throw new NotFoundException('Token or bonding curve not found');
    }

    const reservationId = await this.reserveSpending(agent.id, 'buy', usdcAmount, {
      tokenAddress: tokenAddress.toLowerCase(),
      curveAddress: token.curve_address,
      usdcAmount: usdcAmount.toString(),
    });

    // Execute the buy on-chain.
    let result: TradeResult;
    try {
      result = await this.deployer.buyTokens(
        token.curve_address,
        usdcAmount,
        slippageBps,
        reservationId,
      );
    } catch (err) {
      if (err instanceof BroadcastTransactionError) {
        await this.markReservationBroadcast(reservationId, err.txHash);
      } else {
        await this.releaseReservation(reservationId);
      }
      await this.alerts?.send('agent-buy-failed', 'critical', 'Agent-funded buy failed', {
        agentId: agent.agentId,
        tokenAddress: tokenAddress.toLowerCase(),
        error: safeAlertError(err),
      });
      throw err;
    }

    await this.finalizer.finalizeSuccess(reservationId, {
      status: 'success',
      txHash: result.txHash,
      usdcAmount: result.usdcAmount,
      tokenAmount: result.tokenAmount,
      gasUsed: result.gasUsed,
    });

    this.logger.log(
      `Agent ${agent.agentId} bought ${result.tokenAmount} tokens for ${result.usdcAmount} USDC on ${tokenAddress}`,
    );

    return {
      txHash: result.txHash,
      type: 'buy',
      tokenAddress: tokenAddress.toLowerCase(),
      usdcAmount: result.usdcAmount.toString(),
      tokenAmount: result.tokenAmount.toString(),
      gasPaid: result.gasUsed.toString(),
      status: 'confirmed',
    };
  }

  /**
   * Sell tokens on a bonding curve using the platform deployer wallet.
   * The deployer wallet must hold the tokens (from a previous buy).
   * The agent can sell any token, not just ones it has launched.
   */
  async sellTokens(
    agent: { id: number; agentId: string; name: string },
    tokenAddress: string,
    tokenAmount: bigint,
    slippageBps?: bigint,
  ): Promise<AgentTradeResponse> {
    if (!isValidEvmAddress(tokenAddress)) {
      throw new BadRequestException('Invalid token address');
    }
    if (tokenAmount <= 0n) {
      throw new BadRequestException('Token amount must be positive');
    }

    if (!this.deployer.isConfigured()) {
      throw new ForbiddenException('Agent trades disabled — deployer wallet not configured');
    }

    // Resolve the curve address.
    const token = await this.db.queryOne<{ curve_address: string }>(
      `SELECT curve_address FROM tokens WHERE contract_address = $1`,
      [tokenAddress.toLowerCase()],
    );
    if (!token || !token.curve_address) {
      throw new NotFoundException('Token or bonding curve not found');
    }

    // Reserve only inventory economically attributable to this agent. The
    // deployer wallet is shared, so its aggregate ERC-20 balance is not an
    // authorization boundary.
    const positionReservationId = await this.reservePosition(
      agent.id,
      tokenAddress.toLowerCase(),
      tokenAmount,
      {
        tokenAddress: tokenAddress.toLowerCase(),
        curveAddress: token.curve_address,
        tokenAmount: tokenAmount.toString(),
      },
    );

    // Check the aggregate on-chain balance after the per-agent reservation.
    const balance = await this.deployer.getTokenBalance(tokenAddress);
    if (balance < tokenAmount) {
      await this.releasePositionReservation(positionReservationId);
      throw new BadRequestException(
        `Insufficient token balance in deployer wallet: have ${balance}, need ${tokenAmount}`,
      );
    }

    // Execute the sell on-chain.
    let result: TradeResult;
    try {
      result = await this.deployer.sellTokens(
        tokenAddress,
        token.curve_address,
        tokenAmount,
        slippageBps,
        positionReservationId,
      );
    } catch (err) {
      if (err instanceof BroadcastTransactionError) {
        await this.markPositionReservationBroadcast(positionReservationId, err.txHash);
      } else {
        await this.releasePositionReservation(positionReservationId);
      }
      await this.alerts?.send('agent-sell-failed', 'critical', 'Agent-funded sell failed', {
        agentId: agent.agentId,
        tokenAddress: tokenAddress.toLowerCase(),
        error: safeAlertError(err),
      });
      throw err;
    }

    await this.finalizer.finalizeSuccess(positionReservationId, {
      status: 'success',
      txHash: result.txHash,
      usdcAmount: result.usdcAmount,
      gasUsed: result.gasUsed,
    });

    this.logger.log(
      `Agent ${agent.agentId} sold ${result.tokenAmount} tokens for ${result.usdcAmount} USDC on ${tokenAddress}`,
    );

    return {
      txHash: result.txHash,
      type: 'sell',
      tokenAddress: tokenAddress.toLowerCase(),
      usdcAmount: result.usdcAmount.toString(),
      tokenAmount: result.tokenAmount.toString(),
      gasPaid: result.gasUsed.toString(),
      status: 'confirmed',
    };
  }

  /**
   * List trades executed by an agent (paginated).
   */
  async getAgentTrades(agentDbId: number, limit: number, offset: number) {
    const trades = await this.db.queryRows(
      `SELECT token_address, curve_address, tx_hash, type,
              usdc_amount, token_amount, gas_paid, status, created_at
       FROM agent_trades
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentDbId, limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM agent_trades WHERE agent_id = $1`,
      [agentDbId],
    );

    return {
      trades,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Atomically reserve an agent's own confirmed inventory before a sell.
   */
  private async reservePosition(
    agentId: number,
    tokenAddress: string,
    amount: bigint,
    payload: Record<string, string>,
  ): Promise<string> {
    const reservationId = randomUUID();
    const client = await this.db.connect();
    try {
      await client.query('BEGIN');
      const agentResult = await client.query(
        `SELECT id, active FROM agents WHERE id = $1 FOR UPDATE`,
        [agentId],
      );
      if (!agentResult.rows[0]?.active) {
        throw new ForbiddenException('Agent is inactive or no longer exists');
      }
      const position = await client.query(
        `SELECT (
           COALESCE(SUM(CASE WHEN type = 'buy' THEN token_amount ELSE -token_amount END), 0)
           - COALESCE((SELECT SUM(amount) FROM agent_position_reservations
             WHERE agent_id = $1 AND token_address = $2 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')), 0)
         )::text AS available_amount
         FROM agent_trades
         WHERE agent_id = $1 AND token_address = $2 AND status = 'confirmed'`,
        [agentId, tokenAddress],
      );
      const available = BigInt(position.rows[0]?.available_amount || '0');
      if (available < amount) {
        throw new BadRequestException(
          `Insufficient agent position: have ${available}, need ${amount}`,
        );
      }
      await client.query(
        `INSERT INTO agent_transaction_intents
           (id, reservation_id, agent_id, operation, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [reservationId, reservationId, agentId, 'sell', JSON.stringify(payload)],
      );
      await client.query(
        `INSERT INTO agent_position_reservations
           (reservation_id, transaction_intent_id, agent_id, token_address, amount)
         VALUES ($1, $1, $2, $3, $4)`,
        [reservationId, agentId, tokenAddress, amount.toString()],
      );
      await client.query('COMMIT');
      return reservationId;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }


  private async markPositionReservationBroadcast(
    reservationId: string,
    txHash: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE agent_position_reservations
       SET tx_hash = $2
       WHERE reservation_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
      [reservationId, txHash],
    );
  }

  private async releasePositionReservation(reservationId: string): Promise<void> {
    await this.db.query(
      `UPDATE agent_position_reservations
       SET status = 'released', resolved_at = NOW()
       WHERE reservation_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
      [reservationId],
    );
  }

  /**
   * Check spending limits including trade spending.
   * @param agent Agent info with limits
   * @param additionalUsdc USDC that will be spent in the upcoming operation
   */
  private async reserveSpending(
    agentId: number,
    operation: 'launch' | 'buy',
    principalUsdc: bigint,
    payload: Record<string, string>,
  ): Promise<string> {
    const reservationId = randomUUID();
    const reservedAmount = principalUsdc + AGENT_GAS_RESERVE_USDC;
    // Use a transaction with SELECT FOR UPDATE on the agent row to prevent
    // concurrent requests from racing past the limit check. The row lock is
    // held until the caller commits (or rolls back) the outer transaction.
    // Since launches/trades record their spend in the same DB transaction,
    // the lock ensures atomicity: check + record happen as one unit.
    const client = await this.db.connect();
    try {
      // Lock the agent row for the duration of this check.
      // The caller is responsible for committing the launch/trade transaction
      // that follows; here we release the lock after the check to avoid
      // holding it during the on-chain tx (which could take seconds).
      // For true atomicity, the launch/trade should wrap check + record in a
      // single transaction — but since the on-chain tx is the source of truth
      // and spends are only counted on 'confirmed' status, a concurrent request
      // would simply fail at the on-chain step if the deployer runs out of USDC.
      await client.query('BEGIN');

      // Serialize platform-wide spend checks across all agents. PostgreSQL
      // releases this transaction-scoped advisory lock automatically.
      await client.query('SELECT pg_advisory_xact_lock($1)', [0x4f524241]);

      const agentResult = await client.query(
        `SELECT daily_limit, monthly_limit, active
         FROM agents WHERE id = $1 FOR UPDATE`,
        [agentId],
      );
      const lockedAgent = agentResult.rows[0];
      if (!lockedAgent || !lockedAgent.active) {
        throw new ForbiddenException('Agent is inactive or no longer exists');
      }

      // Sum launch spending + buy trade spending for the period.
      // gas_paid is 18-dec native USDC; divide by 1e12 to convert to 6-dec for summation.
      const todaySpend = await client.query(
        `SELECT (
           COALESCE((SELECT SUM(fee_paid + gas_paid / 1000000000000) FROM agent_launches
            WHERE agent_id = $1 AND status = 'confirmed' AND created_at >= NOW() - INTERVAL '24 hours'), 0)
           + COALESCE((SELECT SUM(usdc_amount + gas_paid / 1000000000000) FROM agent_trades
            WHERE agent_id = $1 AND status = 'confirmed' AND type = 'buy'
              AND created_at >= NOW() - INTERVAL '24 hours'), 0)
           + COALESCE((SELECT SUM(amount) FROM agent_spend_reservations
            WHERE agent_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')
              AND created_at >= NOW() - INTERVAL '24 hours'), 0)
         )::text AS total`,
        [agentId],
      );

      const monthSpend = await client.query(
        `SELECT (
           COALESCE((SELECT SUM(fee_paid + gas_paid / 1000000000000) FROM agent_launches
            WHERE agent_id = $1 AND status = 'confirmed' AND created_at >= NOW() - INTERVAL '30 days'), 0)
           + COALESCE((SELECT SUM(usdc_amount + gas_paid / 1000000000000) FROM agent_trades
            WHERE agent_id = $1 AND status = 'confirmed' AND type = 'buy'
              AND created_at >= NOW() - INTERVAL '30 days'), 0)
           + COALESCE((SELECT SUM(amount) FROM agent_spend_reservations
            WHERE agent_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')
              AND created_at >= NOW() - INTERVAL '30 days'), 0)
         )::text AS total`,
        [agentId],
      );

      const todayTotal = BigInt(todaySpend.rows[0]?.total || '0');
      const monthTotal = BigInt(monthSpend.rows[0]?.total || '0');
      const dailyLimit = BigInt(lockedAgent.daily_limit);
      const monthlyLimit = BigInt(lockedAgent.monthly_limit);

      const platformDailyLimit = this.requiredPlatformLimit(
        'PLATFORM_DEPLOYER_DAILY_LIMIT_MICRO_USDC',
      );
      const platformMonthlyLimit = this.requiredPlatformLimit(
        'PLATFORM_DEPLOYER_MONTHLY_LIMIT_MICRO_USDC',
      );

      const platformSpend = await client.query(
        `SELECT
           (COALESCE((SELECT SUM(fee_paid + gas_paid / 1000000000000) FROM agent_launches
              WHERE status = 'confirmed' AND created_at >= NOW() - INTERVAL '24 hours'), 0)
            + COALESCE((SELECT SUM(usdc_amount + gas_paid / 1000000000000) FROM agent_trades
              WHERE status = 'confirmed' AND type = 'buy'
                AND created_at >= NOW() - INTERVAL '24 hours'), 0)
            + COALESCE((SELECT SUM(amount) FROM agent_spend_reservations
              WHERE status IN ('pending', 'broadcast_confirmed', 'reconciling') AND created_at >= NOW() - INTERVAL '24 hours'), 0))::text AS daily,
           (COALESCE((SELECT SUM(fee_paid + gas_paid / 1000000000000) FROM agent_launches
              WHERE status = 'confirmed' AND created_at >= NOW() - INTERVAL '30 days'), 0)
            + COALESCE((SELECT SUM(usdc_amount + gas_paid / 1000000000000) FROM agent_trades
              WHERE status = 'confirmed' AND type = 'buy'
                AND created_at >= NOW() - INTERVAL '30 days'), 0)
            + COALESCE((SELECT SUM(amount) FROM agent_spend_reservations
              WHERE status IN ('pending', 'broadcast_confirmed', 'reconciling') AND created_at >= NOW() - INTERVAL '30 days'), 0))::text AS monthly`,
      );
      const platformDaily = BigInt(platformSpend.rows[0]?.daily || '0');
      const platformMonthly = BigInt(platformSpend.rows[0]?.monthly || '0');

      if (todayTotal + reservedAmount > dailyLimit) {
        throw new ForbiddenException(
          `Daily spending limit exceeded (used: ${todayTotal} / limit: ${dailyLimit} micro-USDC)`,
        );
      }

      if (monthTotal + reservedAmount > monthlyLimit) {
        throw new ForbiddenException(
          `Monthly spending limit exceeded (used: ${monthTotal} / limit: ${monthlyLimit} micro-USDC)`,
        );
      }

      if (platformDaily + reservedAmount > platformDailyLimit) {
        throw new ForbiddenException('Platform deployer daily spending cap exceeded');
      }
      if (platformMonthly + reservedAmount > platformMonthlyLimit) {
        throw new ForbiddenException('Platform deployer monthly spending cap exceeded');
      }

      await client.query(
        `INSERT INTO agent_spend_reservations
           (reservation_id, agent_id, operation, amount)
         VALUES ($1, $2, $3, $4)`,
        [reservationId, agentId, operation, reservedAmount.toString()],
      );
      await client.query(
        `INSERT INTO agent_transaction_intents
           (id, reservation_id, agent_id, operation, payload)
         VALUES ($1, $2, $3, $4, $5::jsonb)`,
        [reservationId, reservationId, agentId, operation, JSON.stringify(payload)],
      );
      await client.query('COMMIT');
      return reservationId;
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch {}
      throw err;
    } finally {
      client.release();
    }
  }

  // ─── Self-serve deploy support ──────────────────────────────────────────

  /**
   * List agents deployed by a given owner wallet (self-serve deploy attribution).
   * Includes executor_enabled + last activity timestamp.
   */

  private requiredPlatformLimit(name: string): bigint {
    const raw = process.env[name];
    if (!raw) {
      throw new ForbiddenException(`Platform-funded actions disabled: ${name} is not configured`);
    }
    try {
      const value = BigInt(raw);
      if (value <= 0n) throw new Error();
      return value;
    } catch {
      throw new ForbiddenException(`Platform-funded actions disabled: ${name} is invalid`);
    }
  }

  private async markReservationBroadcast(
    reservationId: string,
    txHash: string,
  ): Promise<void> {
    await this.db.query(
      `UPDATE agent_spend_reservations
       SET tx_hash = $2
       WHERE reservation_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
      [reservationId, txHash],
    );
  }

  private async releaseReservation(reservationId: string): Promise<void> {
    await this.db.query(
      `UPDATE agent_spend_reservations
       SET status = 'released', resolved_at = NOW()
       WHERE reservation_id = $1 AND status IN ('pending', 'broadcast_confirmed', 'reconciling')`,
      [reservationId],
    );
  }

  async listAgentsByOwner(ownerWallet: string, limit: number, offset: number) {
    const w = ownerWallet.toLowerCase();
    const agents = await this.db.queryRows(
      `SELECT agent_id, name, description, wallet, daily_limit, monthly_limit,
              executor_enabled, active, created_at,
              (SELECT COUNT(*) FROM agent_launches WHERE agent_id = agents.id) AS launch_count,
              (SELECT COUNT(*) FROM agent_trades WHERE agent_id = agents.id) AS trade_count
       FROM agents
       WHERE owner_wallet = $3
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset, w],
    );
    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM agents WHERE owner_wallet = $1`,
      [w],
    );
    return {
      agents,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Toggle the autonomous executor on/off for an agent.
   * Ownership is verified by the caller (controller) before calling this.
   * Returns the new state.
   */
  async toggleExecutor(agentId: string, ownerWallet: string): Promise<{ executorEnabled: boolean }> {
    const w = ownerWallet.toLowerCase();
    const result = await this.db.queryOne<{ executor_enabled: boolean }>(
      `UPDATE agents
       SET executor_enabled = NOT executor_enabled
       WHERE agent_id = $1 AND owner_wallet = $2
       RETURNING executor_enabled`,
      [agentId, w],
    );
    if (!result) {
      throw new NotFoundException('Agent not found or you are not the owner');
    }
    this.logger.log(`Executor ${result.executor_enabled ? 'enabled' : 'disabled'} for agent ${agentId} by ${w}`);
    return { executorEnabled: result.executor_enabled };
  }

  /**
   * Get the executor state (cooldowns + run counts) for an agent.
   * Public-ish: the caller is responsible for ownership checks if needed.
   */
  async getExecutorState(agentId: string) {
    const agent = await this.db.queryOne<{ id: number; executor_enabled: boolean }>(
      `SELECT id, executor_enabled FROM agents WHERE agent_id = $1`,
      [agentId],
    );
    if (!agent) throw new NotFoundException('Agent not found');
    const state = await this.db.queryRows(
      `SELECT action, last_run_at, last_tx_hash, run_count, fail_count, last_error, updated_at
       FROM agent_executor_state
       WHERE agent_id = $1
       ORDER BY action`,
      [agent.id],
    );
    return { executorEnabled: agent.executor_enabled, state };
  }
}

export interface AgentTradeResponse {
  txHash: string;
  type: 'buy' | 'sell';
  tokenAddress: string;
  usdcAmount: string;  // 6-dec USDC
  tokenAmount: string; // 18-dec tokens
  gasPaid: string;     // 18-dec native USDC
  status: 'confirmed';
}
