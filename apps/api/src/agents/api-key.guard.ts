import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { createHash } from 'crypto';
import { DatabaseService } from '../database/database.service';

/**
 * ApiKeyGuard — authenticates AI agents via API keys.
 *
 * The API key is passed in the `x-api-key` header. The guard hashes the
 * incoming key (SHA-256) and looks up the hash in the `agent_api_keys` table.
 * If found and not revoked, the agent's database ID and public UUID are
 * attached to the request as `req.agent`.
 *
 * Key format: `arc_<32 hex chars>` (e.g. arc_a1b2c3d4...)
 * Storage: only the SHA-256 hash is stored — the raw key is never persisted.
 *
 * Alternatively, agents can authenticate with a wallet signature via the
 * existing AuthGuard (x-auth-token header). This guard is for programmatic
 * API access where signature-based auth is impractical.
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
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private db: DatabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AgentRequest>();
    const apiKey = request.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      throw new UnauthorizedException('Missing x-api-key header');
    }

    // Basic format check — keys start with "arc_"
    if (!apiKey.startsWith('arc_') || apiKey.length < 10) {
      throw new UnauthorizedException('Invalid API key format');
    }

    // Hash the key for lookup (never store or log the raw key).
    const keyHash = createHash('sha256').update(apiKey).digest('hex');

    // Look up the key in the database.
    const row = await this.db.queryOne<{
      id: number;
      agent_id: number;
      key_prefix: string;
      label: string | null;
      revoked: boolean;
    }>(
      `SELECT id, agent_id, key_prefix, label, revoked
       FROM agent_api_keys
       WHERE key_hash = $1`,
      [keyHash],
    );

    if (!row || row.revoked) {
      throw new UnauthorizedException('Invalid or revoked API key');
    }

    // Load the agent record.
    const agent = await this.db.queryOne<{
      id: number;
      agent_id: string;
      name: string;
      wallet: string | null;
      daily_limit: string;
      monthly_limit: string;
      active: boolean;
    }>(
      `SELECT id, agent_id, name, wallet, daily_limit, monthly_limit, active
       FROM agents
       WHERE id = $1`,
      [row.agent_id],
    );

    if (!agent || !agent.active) {
      throw new UnauthorizedException('Agent not found or deactivated');
    }

    // Attach agent info to the request.
    request.agent = {
      id: agent.id,
      agentId: agent.agent_id,
      name: agent.name,
      wallet: agent.wallet,
      dailyLimit: BigInt(agent.daily_limit),
      monthlyLimit: BigInt(agent.monthly_limit),
    };

    // Update last_used_at (fire-and-forget, don't block the request).
    this.db
      .query(
        `UPDATE agent_api_keys SET last_used_at = NOW() WHERE id = $1`,
        [row.id],
      )
      .catch(() => {});

    return true;
  }
}
