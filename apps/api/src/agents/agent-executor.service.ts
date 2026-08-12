import { Injectable, Logger } from '@nestjs/common';
import { Interval } from '@nestjs/schedule';
import { DatabaseService } from '../database/database.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';
import { AgentsService } from './agents.service';

/**
 * AgentExecutorService — autonomous agent runtime.
 *
 * Runs on a fixed interval (60s) and, for every agent with
 * `executor_enabled = true`, evaluates the agent's template `config` and
 * executes the enabled actions (launch / buy / post) by calling
 * `AgentsService` methods directly. The platform deployer wallet funds all
 * on-chain transactions; spending limits are enforced inside AgentsService.
 *
 * Safety:
 *   - Global kill switch: AGENT_EXECUTOR_ENABLED env must be "true".
 *   - Per-agent opt-in: agents.executor_enabled must be true.
 *   - Max N agents processed per tick (default 5) to avoid RPC rate limits.
 *   - Per-action cooldowns read from agent_executor_state.
 *   - Errors are isolated per (agent, action) — one failure doesn't stop
 *     others. Each attempt is recorded in agent_executor_state.
 *
 * Config schema (the `config` JSONB on agents, copied from the template):
 *   {
 *     "strategy": "launcher" | "trader" | "trend" | "community",
 *     "launch": { "enabled": bool, "interval_hours": number, "name_prefix"?: string, "name_suffix"?: string },
 *     "trade":  { "enabled": bool, "buy_amount_usdc": number, "max_buys_per_day": number, "targets": "new_launches" | "own_launches" },
 *     "post":   { "enabled": bool, "interval_hours": number, "templates": string[] }
 *   }
 */

const TICK_MS = 60_000; // 60s
const MAX_AGENTS_PER_TICK = 5;
const DEFAULT_LAUNCH_INTERVAL_HOURS = 24;
const DEFAULT_BUY_INTERVAL_HOURS = 4;
const DEFAULT_POST_INTERVAL_HOURS = 6;

// Word pool for generating token names.
const NAME_WORDS = ['Pepe', 'Dog', 'Cat', 'Moon', 'Rocket', 'Doge', 'Floki', 'Bonk', 'Wif', 'Chad', 'Giga', 'Based', 'Alpha', 'Degen', 'Fomo', 'Hype', 'Rush', 'Surge', 'Boom', 'Nova'];

interface AgentRow {
  id: number;
  agent_id: string;
  name: string;
  daily_limit: string;
  monthly_limit: string;
  config: any;
}

interface ExecutorStateRow {
  action: string;
  last_run_at: string | null;
  run_count: number;
  fail_count: number;
}

@Injectable()
export class AgentExecutorService {
  private readonly logger = new Logger(AgentExecutorService.name);
  private readonly enabled: boolean;
  private running = false; // guard against overlapping ticks

  constructor(
    private db: DatabaseService,
    private agentsService: AgentsService,
  ) {
    this.enabled = process.env.AGENT_EXECUTOR_ENABLED === 'true';
    if (this.enabled) {
      this.logger.log('Agent executor ENABLED — autonomous agents will run every 60s');
    } else {
      this.logger.log('Agent executor disabled (set AGENT_EXECUTOR_ENABLED=true to enable)');
    }
  }

  /**
   * Main tick — runs every 60s via @nestjs/schedule.
   * Skipped entirely if the global kill switch is off or a previous tick
   * is still running (overlapping ticks are dropped, not queued).
   */
  @Interval(TICK_MS)
  async tick() {
    if (!this.enabled) return;
    if (this.running) {
      this.logger.debug('Previous tick still running — skipping');
      return;
    }
    this.running = true;
    const started = Date.now();
    try {
      await this.runTick();
    } catch (err) {
      this.logger.error(`Tick failed: ${(err as Error).message}`);
    } finally {
      this.running = false;
    }
    this.logger.debug(`Tick completed in ${Date.now() - started}ms`);
  }

  private async runTick() {
    // Load agents with executor enabled. Limit per tick to protect RPC quota.
    const agents = await this.db.queryRows<AgentRow>(
      `SELECT id, agent_id, name, daily_limit, monthly_limit, config
       FROM agents
       WHERE active = true AND executor_enabled = true
       ORDER BY id
       LIMIT $1`,
      [MAX_AGENTS_PER_TICK],
    );

    if (agents.length === 0) return;
    this.logger.log(`Executing ${agents.length} agent(s) this tick`);

    // Process agents in parallel — each is independent and errors are isolated.
    await Promise.allSettled(agents.map((a) => this.executeAgent(a)));
  }

  private async executeAgent(agent: AgentRow) {
    const config = this.parseConfig(agent.config);
    const agentObj = {
      id: agent.id,
      agentId: agent.agent_id,
      name: agent.name,
      dailyLimit: BigInt(agent.daily_limit),
      monthlyLimit: BigInt(agent.monthly_limit),
    };

    // Load cooldown state for this agent (all actions in one query).
    const stateRows = await this.db.queryRows<ExecutorStateRow>(
      `SELECT action, last_run_at, run_count, fail_count
       FROM agent_executor_state WHERE agent_id = $1`,
      [agent.id],
    );
    const state = new Map(stateRows.map((r) => [r.action, r]));

    const tasks: Promise<void>[] = [];

    if (config.launch?.enabled) {
      tasks.push(this.maybeLaunch(agentObj, config.launch, state.get('launch')));
    }
    if (config.trade?.enabled) {
      tasks.push(this.maybeBuy(agentObj, config.trade, state.get('buy')));
    }
    if (config.post?.enabled) {
      tasks.push(this.maybePost(agentObj, config.post, state.get('post')));
    }

    // Run the agent's actions in parallel — they're independent.
    await Promise.allSettled(tasks);
  }

  // ─── Actions ────────────────────────────────────────────────────────────

  private async maybeLaunch(
    agent: { id: number; agentId: string; name: string; dailyLimit: bigint; monthlyLimit: bigint },
    cfg: NonNullable<ParsedConfig['launch']>,
    state: ExecutorStateRow | undefined,
  ) {
    const intervalHours = cfg.interval_hours ?? DEFAULT_LAUNCH_INTERVAL_HOURS;
    if (!this.cooldownElapsed(state, intervalHours)) return;

    const name = this.generateTokenName(cfg);
    const symbol = this.deriveSymbol(name);
    try {
      const result = await this.agentsService.launchToken(agent, { name, symbol });
      await this.recordSuccess(agent.id, 'launch', result.txHash);
      this.logger.log(`Agent ${agent.agentId} launched ${name} (${symbol}) → ${result.tokenAddress}`);
    } catch (err) {
      await this.recordFailure(agent.id, 'launch', (err as Error).message);
      this.logger.warn(`Agent ${agent.agentId} launch failed: ${(err as Error).message}`);
    }
  }

  private async maybeBuy(
    agent: { id: number; agentId: string; name: string; dailyLimit: bigint; monthlyLimit: bigint },
    cfg: NonNullable<ParsedConfig['trade']>,
    state: ExecutorStateRow | undefined,
  ) {
    const intervalHours = DEFAULT_BUY_INTERVAL_HOURS;
    if (!this.cooldownElapsed(state, intervalHours)) return;

    const usdcAmount = BigInt(Math.round((cfg.buy_amount_usdc ?? 1) * 1_000_000));
    if (usdcAmount <= 0n) return;

    // Pick a target token. "own_launches" → one of this agent's launches.
    // "new_launches" (default) → a recent token from the tokens table.
    const tokenAddress = cfg.targets === 'own_launches'
      ? await this.pickOwnLaunch(agent.id)
      : await this.pickRecentToken();
    if (!tokenAddress) return; // nothing to buy

    try {
      const result = await this.agentsService.buyTokens(agent, tokenAddress, usdcAmount);
      await this.recordSuccess(agent.id, 'buy', result.txHash);
      this.logger.log(`Agent ${agent.agentId} bought ${tokenAddress} for ${usdcAmount} micro-USDC`);
    } catch (err) {
      await this.recordFailure(agent.id, 'buy', (err as Error).message);
      this.logger.warn(`Agent ${agent.agentId} buy failed: ${(err as Error).message}`);
    }
  }

  private async maybePost(
    agent: { id: number; agentId: string; name: string },
    cfg: NonNullable<ParsedConfig['post']>,
    state: ExecutorStateRow | undefined,
  ) {
    const intervalHours = cfg.interval_hours ?? DEFAULT_POST_INTERVAL_HOURS;
    if (!this.cooldownElapsed(state, intervalHours)) return;
    if (!cfg.templates || cfg.templates.length === 0) return;

    // Post on one of the agent's own launches (postTokenMessage requires ownership).
    const tokenAddress = await this.pickOwnLaunch(agent.id);
    if (!tokenAddress) return;

    const template = cfg.templates[Math.floor(Math.random() * cfg.templates.length)];
    try {
      await this.agentsService.postTokenMessage(agent, tokenAddress, template);
      await this.recordSuccess(agent.id, 'post', null);
      this.logger.log(`Agent ${agent.agentId} posted on ${tokenAddress}`);
    } catch (err) {
      await this.recordFailure(agent.id, 'post', (err as Error).message);
      this.logger.warn(`Agent ${agent.agentId} post failed: ${(err as Error).message}`);
    }
  }

  // ─── Helpers ────────────────────────────────────────────────────────────

  private cooldownElapsed(state: ExecutorStateRow | undefined, intervalHours: number): boolean {
    if (!state?.last_run_at) return true;
    const last = new Date(state.last_run_at).getTime();
    const elapsedMs = Date.now() - last;
    return elapsedMs >= intervalHours * 60 * 60 * 1000;
  }

  private generateTokenName(cfg: NonNullable<ParsedConfig['launch']>): string {
    const prefix = cfg.name_prefix || '';
    const suffix = cfg.name_suffix || '';
    const word = NAME_WORDS[Math.floor(Math.random() * NAME_WORDS.length)];
    const base = prefix ? `${prefix}${word}` : word;
    return `${base}${suffix}`.slice(0, 50);
  }

  private deriveSymbol(name: string): string {
    // Take consonants/vowels from the name to form a 3-5 char symbol.
    const cleaned = name.replace(/[^a-zA-Z]/g, '').toUpperCase();
    return cleaned.slice(0, Math.min(5, Math.max(3, cleaned.length))) || 'TOKEN';
  }

  private async pickRecentToken(): Promise<string | null> {
    // Most recent non-graduated token with a bonding curve.
    const row = await this.db.queryOne<{ contract_address: string }>(
      `SELECT t.contract_address FROM tokens t
       WHERE t.status = 'active' AND t.curve_address IS NOT NULL
         AND ${publicFactoryClause('t', 1)}
       ORDER BY created_at DESC LIMIT 1`,
      [getPublicFactoryAddresses()],
    );
    return row?.contract_address || null;
  }

  private async pickOwnLaunch(agentId: number): Promise<string | null> {
    // Most recent confirmed launch by this agent.
    const row = await this.db.queryOne<{ token_address: string }>(
      `SELECT al.token_address FROM agent_launches al
       JOIN tokens t ON t.contract_address = al.token_address
       WHERE al.agent_id = $1 AND al.status = 'confirmed'
         AND ${publicFactoryClause('t', 2)}
       ORDER BY created_at DESC LIMIT 1`,
      [agentId, getPublicFactoryAddresses()],
    );
    return row?.token_address || null;
  }

  private async recordSuccess(agentId: number, action: string, txHash: string | null) {
    await this.db.query(
      `INSERT INTO agent_executor_state (agent_id, action, last_run_at, last_tx_hash, run_count, fail_count, updated_at)
       VALUES ($1, $2, NOW(), $3, 1, 0, NOW())
       ON CONFLICT (agent_id, action) DO UPDATE
         SET last_run_at = NOW(),
             last_tx_hash = $3,
             run_count = agent_executor_state.run_count + 1,
             last_error = NULL,
             updated_at = NOW()`,
      [agentId, action, txHash],
    );
  }

  private async recordFailure(agentId: number, action: string, error: string) {
    await this.db.query(
      `INSERT INTO agent_executor_state (agent_id, action, last_run_at, run_count, fail_count, last_error, updated_at)
       VALUES ($1, $2, NOW(), 0, 1, $3, NOW())
       ON CONFLICT (agent_id, action) DO UPDATE
         SET last_run_at = NOW(),
             fail_count = agent_executor_state.fail_count + 1,
             last_error = $3,
             updated_at = NOW()`,
      [agentId, action, error.slice(0, 500)],
    );
  }

  private parseConfig(raw: any): ParsedConfig {
    if (!raw || typeof raw !== 'object') return {};
    return raw as ParsedConfig;
  }
}

interface ParsedConfig {
  strategy?: string;
  launch?: {
    enabled?: boolean;
    interval_hours?: number;
    name_prefix?: string;
    name_suffix?: string;
  };
  trade?: {
    enabled?: boolean;
    buy_amount_usdc?: number;
    max_buys_per_day?: number;
    targets?: 'new_launches' | 'own_launches';
  };
  post?: {
    enabled?: boolean;
    interval_hours?: number;
    templates?: string[];
  };
}
