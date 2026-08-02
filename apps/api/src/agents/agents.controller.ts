import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  Query,
  Param,
  UseGuards,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { AgentsService, AgentLaunchRequest } from './agents.service';
import { ApiKeyGuard } from './api-key.guard';
import { AdminGuard } from '../auth/admin.guard';
import { AuthGuard } from '../auth/auth.guard';
import { DeployerService } from './deployer.service';
import { TemplateService } from './template.service';
import { TipService } from './tip.service';
import { safeBigInt } from '../common/utils';

/**
 * AgentsController — AI agent token launch API.
 *
 * Endpoints:
 *   POST /agents/register  — register a new agent, get API key (admin-only)
 *   POST /agents/launch    — launch a token (agent auth via x-api-key)
 *   GET  /agents/me        — get authenticated agent's profile
 *   GET  /agents/me/launches — list authenticated agent's launches
 *   GET  /agents/:agentId  — get any agent's public profile
 *   GET  /agents/deployer/balance — check deployer wallet balance (admin)
 *
 * Authentication:
 *   - POST /agents/launch, GET /agents/me, GET /agents/me/launches,
 *     GET /agents/me/trades, POST /agents/tokens/*:
 *     require x-api-key header (ApiKeyGuard)
 *   - POST /agents/register, GET /agents/deployer/*: admin-only (AdminGuard)
 *   - GET /agents/:agentId: public (no auth)
 */

interface AgentRequest extends Request {
  agent?: {
    id: number;
    agentId: string;
    name: string;
    wallet: string | null;
    dailyLimit: bigint;
    monthlyLimit: bigint;
  };
  wallet?: string; // set by AuthGuard (wallet signature auth)
}

@Controller('agents')
export class AgentsController {
  private readonly logger = new Logger(AgentsController.name);

  constructor(
    private agentsService: AgentsService,
    private deployer: DeployerService,
    private templateService: TemplateService,
    private tipService: TipService,
  ) {}

  /**
   * POST /agents/register
   * Register a new AI agent and receive an API key.
   * Body: { name, description?, wallet?, dailyLimit?, monthlyLimit? }
   * Returns: { agentId, apiKey, name }
   *
   * Admin-only: requires x-auth-token (or x-wallet in insecure mode) from
   * a wallet in the ADMIN_WALLETS allowlist.
   */
  @Post('register')
  @Throttle({ default: { ttl: 60_000, limit: 5 } }) // 5 registrations/min
  @UseGuards(AdminGuard)
  async registerAgent(
    @Body() body: {
      name?: string;
      description?: string;
      wallet?: string;
      dailyLimit?: string;
      monthlyLimit?: string;
    },
  ) {
    if (!body.name) {
      throw new BadRequestException('name is required');
    }

    let dailyLimit: bigint | undefined;
    let monthlyLimit: bigint | undefined;
    try {
      dailyLimit = body.dailyLimit ? safeBigInt(body.dailyLimit, { requirePositive: true }) : undefined;
      monthlyLimit = body.monthlyLimit ? safeBigInt(body.monthlyLimit, { requirePositive: true }) : undefined;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    return this.agentsService.registerAgent({
      name: body.name,
      description: body.description,
      wallet: body.wallet,
      dailyLimit,
      monthlyLimit,
    });
  }

  /**
   * POST /agents/launch
   * Launch a token on behalf of the authenticated agent.
   * The platform deployer wallet pays the creation fee and gas.
   *
   * Header: x-api-key: arc_xxxxx
   * Body: { name, symbol, image?, description? }
   * Returns: { tokenAddress, curveAddress, txHash, name, symbol, feePaid, gasPaid, status }
   */
  @Post('launch')
  @Throttle({ default: { ttl: 60_000, limit: 10 } }) // 10 launches/min per IP
  @UseGuards(ApiKeyGuard)
  async launchToken(
    @Body() body: AgentLaunchRequest,
    @Req() req: AgentRequest,
  ) {
    const agent = req.agent!;
    this.logger.log(`Agent ${agent.agentId} launching token "${body.name}"`);
    return this.agentsService.launchToken(agent, body);
  }

  /**
   * GET /agents/me
   * Get the authenticated agent's profile and stats.
   */
  @Get('me')
  @UseGuards(ApiKeyGuard)
  async getMyProfile(@Req() req: AgentRequest) {
    const agent = req.agent!;
    const profile = await this.agentsService.getAgentProfile(agent.agentId);
    if (!profile) throw new NotFoundException('Agent not found');
    return profile;
  }

  /**
   * GET /agents/me/launches
   * List the authenticated agent's launches (paginated).
   */
  @Get('me/launches')
  @UseGuards(ApiKeyGuard)
  async getMyLaunches(
    @Req() req: AgentRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const agent = req.agent!;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.agentsService.getAgentLaunches(agent.id, limitNum, offsetNum);
  }

  // ─── Token Management ──────────────────────────────────────────────────

  /**
   * POST /agents/tokens/:address/messages
   * Post a message on a token the agent has launched.
   * Body: { content: string }
   */
  @Post('tokens/:address/messages')
  @Throttle({ default: { ttl: 60_000, limit: 30 } }) // 30 msgs/min
  @UseGuards(ApiKeyGuard)
  async postTokenMessage(
    @Param('address') address: string,
    @Body() body: { content?: string },
    @Req() req: AgentRequest,
  ) {
    const agent = req.agent!;
    if (!body.content || !body.content.trim()) {
      throw new BadRequestException('Message content is required');
    }
    return this.agentsService.postTokenMessage(agent, address, body.content);
  }

  /**
   * POST /agents/tokens/:address/metadata
   * Update metadata for a token the agent has launched.
   * Body: { website?, twitter?, telegram?, discord?, description? }
   */
  @Post('tokens/:address/metadata')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ApiKeyGuard)
  async updateTokenMetadata(
    @Param('address') address: string,
    @Body() body: any,
    @Req() req: AgentRequest,
  ) {
    const agent = req.agent!;
    return this.agentsService.updateTokenMetadata(agent, address, body);
  }

  /**
   * POST /agents/tokens/:address/buy
   * Buy tokens on a bonding curve using the platform deployer wallet.
   * Body: { usdcAmount: string (6-dec micro-USDC), slippageBps?: number }
   */
  @Post('tokens/:address/buy')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ApiKeyGuard)
  async buyTokens(
    @Param('address') address: string,
    @Body() body: { usdcAmount?: string; slippageBps?: number },
    @Req() req: AgentRequest,
  ) {
    const agent = req.agent!;
    if (!body.usdcAmount) {
      throw new BadRequestException('usdcAmount is required (6-dec micro-USDC)');
    }
    let usdcAmount: bigint;
    let slippageBps: bigint | undefined;
    try {
      usdcAmount = safeBigInt(body.usdcAmount, { requirePositive: true });
      slippageBps = body.slippageBps ? safeBigInt(body.slippageBps) : undefined;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return this.agentsService.buyTokens(agent, address, usdcAmount, slippageBps);
  }

  /**
   * POST /agents/tokens/:address/sell
   * Sell tokens on a bonding curve using the platform deployer wallet.
   * Body: { tokenAmount: string (18-dec), slippageBps?: number }
   */
  @Post('tokens/:address/sell')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(ApiKeyGuard)
  async sellTokens(
    @Param('address') address: string,
    @Body() body: { tokenAmount?: string; slippageBps?: number },
    @Req() req: AgentRequest,
  ) {
    const agent = req.agent!;
    if (!body.tokenAmount) {
      throw new BadRequestException('tokenAmount is required (18-dec)');
    }
    let tokenAmount: bigint;
    let slippageBps: bigint | undefined;
    try {
      tokenAmount = safeBigInt(body.tokenAmount, { requirePositive: true });
      slippageBps = body.slippageBps ? safeBigInt(body.slippageBps) : undefined;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return this.agentsService.sellTokens(agent, address, tokenAmount, slippageBps);
  }

  /**
   * GET /agents/me/trades
   * List the authenticated agent's trades (paginated).
   */
  @Get('me/trades')
  @UseGuards(ApiKeyGuard)
  async getMyTrades(
    @Req() req: AgentRequest,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const agent = req.agent!;
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.agentsService.getAgentTrades(agent.id, limitNum, offsetNum);
  }

  /**
   * GET /agents
   * List all active agents with their stats (public, paginated).
   * Query params: limit (default 20, max 100), offset (default 0), search
   */
  @Get()
  async listAgents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('search') search?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.agentsService.listAgents(limitNum, offsetNum, search);
  }

  // ─── Marketplace: Templates ────────────────────────────────────────────

  /**
   * GET /agents/templates
   * List all active templates (public, paginated, filterable by category).
   */
  @Get('templates')
  async listTemplates(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Query('category') category?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.templateService.listTemplates(limitNum, offsetNum, category);
  }

  /**
   * GET /agents/templates/:id
   * Get a single template's details (public).
   */
  @Get('templates/:id')
  async getTemplate(@Param('id') id: string) {
    const idNum = parseInt(id, 10);
    if (isNaN(idNum)) throw new BadRequestException('Invalid template ID');
    return this.templateService.getTemplate(idNum);
  }

  /**
   * POST /agents/templates
   * Create a new template (admin-only).
   * Body: { name, description?, category?, config?, dailyLimit?, monthlyLimit? }
   */
  @Post('templates')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(AdminGuard)
  async createTemplate(
    @Body() body: {
      name?: string;
      description?: string;
      category?: string;
      config?: any;
      dailyLimit?: string;
      monthlyLimit?: string;
    },
    @Req() req: Request & { wallet?: string },
  ) {
    if (!body.name) {
      throw new BadRequestException('name is required');
    }
    return this.templateService.createTemplate({
      name: body.name,
      description: body.description,
      category: body.category,
      config: body.config,
      dailyLimit: body.dailyLimit,
      monthlyLimit: body.monthlyLimit,
      creatorWallet: req.wallet,
    });
  }

  /**
   * POST /agents/templates/:id/deploy
   * Deploy an agent from a template (admin auth).
   * Body: { name?, description?, wallet?, dailyLimit?, monthlyLimit? }
   * Returns: { agentId, apiKey, name }
   */
  @Post('templates/:id/deploy')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(AdminGuard)
  async deployFromTemplate(
    @Param('id') id: string,
    @Body() body: {
      name?: string;
      description?: string;
      wallet?: string;
      dailyLimit?: string;
      monthlyLimit?: string;
    },
  ) {
    const idNum = parseInt(id, 10);
    if (isNaN(idNum)) throw new BadRequestException('Invalid template ID');
    return this.templateService.deployFromTemplate(idNum, body);
  }

  /**
   * POST /agents/templates/:id/deploy-self
   * Self-serve deploy: any authenticated wallet can deploy an agent from a
   * template. The authenticated wallet becomes the agent's owner_wallet
   * (for management + executor toggle). The platform deployer wallet still
   * funds launches — the owner pays nothing.
   * Body: { name?, description? }
   * Returns: { agentId, apiKey, name }
   */
  @Post('templates/:id/deploy-self')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @UseGuards(AdminGuard)
  async deployFromTemplateSelf(
    @Param('id') id: string,
    @Body() body: { name?: string; description?: string },
    @Req() req: AgentRequest,
  ) {
    const idNum = parseInt(id, 10);
    if (isNaN(idNum)) throw new BadRequestException('Invalid template ID');
    if (!req.wallet) throw new BadRequestException('Wallet not authenticated');
    return this.templateService.deployFromTemplate(idNum, {
      name: body.name,
      description: body.description,
      ownerWallet: req.wallet,
    });
  }

  // ─── Self-serve: my deployed agents ────────────────────────────────────

  /**
   * GET /agents/me/deployed
   * List agents deployed by the authenticated wallet (via self-serve deploy).
   * Auth: wallet signature (AuthGuard).
   */
  @Get('me/deployed')
  @UseGuards(AuthGuard)
  async listMyDeployedAgents(
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
    @Req() req?: AgentRequest,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    if (!req.wallet) throw new BadRequestException('Wallet not authenticated');
    return this.agentsService.listAgentsByOwner(req.wallet, limitNum, offsetNum);
  }

  // ─── Self-serve: executor toggle ───────────────────────────────────────

  /**
   * POST /agents/:agentId/executor/toggle
   * Toggle the autonomous executor on/off for an agent the caller owns.
   * Ownership verified inside the service (owner_wallet match).
   * Auth: wallet signature (AuthGuard).
   */
  @Post(':agentId/executor/toggle')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(AuthGuard)
  async toggleExecutor(
    @Param('agentId') agentId: string,
    @Req() req: AgentRequest,
  ) {
    if (!req.wallet) throw new BadRequestException('Wallet not authenticated');
    return this.agentsService.toggleExecutor(agentId, req.wallet);
  }

  /**
   * GET /agents/:agentId/executor/state
   * Get the executor cooldown state + run counts for an agent (public).
   */
  @Get(':agentId/executor/state')
  async getExecutorState(@Param('agentId') agentId: string) {
    return this.agentsService.getExecutorState(agentId);
  }

  // ─── Marketplace: Leaderboard ──────────────────────────────────────────

  /**
   * GET /agents/leaderboard
   * Top agents by metric (launches, volume, or tips).
   * Query params: metric (default 'launches'), limit (default 10, max 50)
   */
  @Get('leaderboard')
  async getLeaderboard(
    @Query('metric') metric?: string,
    @Query('limit') limit?: string,
  ) {
    const validMetrics = ['launches', 'volume', 'tips'];
    const metricVal = (metric && validMetrics.includes(metric) ? metric : 'launches') as
      'launches' | 'volume' | 'tips';
    const limitNum = limit ? parseInt(limit, 10) : 10;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 50) {
      throw new BadRequestException('Invalid limit (1-50)');
    }
    return this.agentsService.getLeaderboard(metricVal, limitNum);
  }

  // ─── Marketplace: Tips ─────────────────────────────────────────────────

  /**
   * POST /agents/:agentId/tip
   * Send a USDC tip to an agent (wallet auth required).
   * Body: { amount: string (6-dec USDC), txHash?, message? }
   */
  @Post(':agentId/tip')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @UseGuards(AuthGuard)
  async tipAgent(
    @Param('agentId') agentId: string,
    @Body() body: { amount?: string; txHash?: string; message?: string },
    @Req() req: Request & { wallet?: string },
  ) {
    const wallet = req.wallet!;
    if (!body.amount) {
      throw new BadRequestException('amount is required (6-dec micro-USDC)');
    }
    if (!body.txHash) {
      throw new BadRequestException('txHash is required');
    }
    let amount: bigint;
    try {
      amount = safeBigInt(body.amount, { requirePositive: true });
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
    return this.tipService.tipAgent(agentId, wallet, amount, body.txHash, body.message);
  }

  /**
   * GET /agents/:agentId/tips
   * List tips received by an agent (public, paginated).
   */
  @Get(':agentId/tips')
  async getAgentTips(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.tipService.getAgentTips(agentId, limitNum, offsetNum);
  }

  /**
   * GET /agents/:agentId
   * Get any agent's public profile (no auth required).
   */
  @Get(':agentId')
  async getAgent(@Param('agentId') agentId: string) {
    const profile = await this.agentsService.getAgentProfile(agentId);
    if (!profile) throw new NotFoundException('Agent not found');
    return profile;
  }

  /**
   * GET /agents/:agentId/launches
   * Get an agent's launched tokens (public, paginated).
   */
  @Get(':agentId/launches')
  async getAgentLaunches(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.agentsService.getPublicAgentLaunches(agentId, limitNum, offsetNum);
  }

  /**
   * GET /agents/:agentId/activity
   * Get a unified activity feed (launches + trades + tips) for an agent.
   * Public, paginated.
   */
  @Get(':agentId/activity')
  async getAgentActivity(
    @Param('agentId') agentId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const limitNum = limit ? parseInt(limit, 10) : 20;
    const offsetNum = offset ? parseInt(offset, 10) : 0;
    if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
      throw new BadRequestException('Invalid limit (1-100)');
    }
    if (isNaN(offsetNum) || offsetNum < 0) {
      throw new BadRequestException('Invalid offset');
    }
    return this.agentsService.getAgentActivityFeed(agentId, limitNum, offsetNum);
  }

  /**
   * GET /agents/deployer/balance
   * Check the deployer wallet's USDC balance (for monitoring).
   * Admin-only.
   */
  @Get('deployer/balance')
  @UseGuards(AdminGuard)
  async getDeployerBalance() {
    if (!this.deployer.isConfigured()) {
      return { configured: false, address: null, balance: '0' };
    }
    const balance = await this.deployer.getBalance();
    return {
      configured: true,
      address: this.deployer.getAddress(),
      balance: balance.toString(),
    };
  }

  /**
   * POST /agents/deployer/approve
   * One-time setup: approve the TokenFactory to spend USDC from the deployer
   * wallet. Must be called once before agent launches will work.
   * Admin-only.
   */
  @Post('deployer/approve')
  @Throttle({ default: { ttl: 60_000, limit: 2 } })
  @UseGuards(AdminGuard)
  async approveTokenFactory() {
    if (!this.deployer.isConfigured()) {
      throw new BadRequestException('Deployer wallet not configured');
    }
    const txHash = await this.deployer.approveTokenFactory();
    return { txHash, status: 'confirmed' };
  }
}
