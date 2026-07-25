import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { AgentsService } from './agents.service';
import { safeBigInt } from '../common/utils';

/**
 * TemplateService — manages agent templates for the marketplace.
 *
 * Templates are pre-built agent strategies that can be deployed with one click.
 * Each template has a default config (daily/monthly limits, description) that
 * gets applied to the new agent.
 */
@Injectable()
export class TemplateService {
  private readonly logger = new Logger(TemplateService.name);

  constructor(
    private db: DatabaseService,
    private agentsService: AgentsService,
  ) {}

  /**
   * List active templates (public, paginated, filterable by category).
   */
  async listTemplates(limit: number, offset: number, category?: string) {
    const where = category
      ? `WHERE active = true AND category = $3`
      : `WHERE active = true`;
    const params = category ? [limit, offset, category] : [limit, offset];

    const templates = await this.db.queryRows(
      `SELECT id, name, description, category, creator_wallet,
              daily_limit, monthly_limit, deploy_count, created_at
       FROM agent_templates
       ${where}
       ORDER BY deploy_count DESC, created_at DESC
       LIMIT $1 OFFSET $2`,
      params,
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*)::text AS total FROM agent_templates ${where}`,
      category ? [category] : [],
    );

    return {
      templates,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /**
   * Get a single template by ID (public).
   */
  async getTemplate(id: number) {
    const template = await this.db.queryOne<any>(
      `SELECT id, name, description, category, config, creator_wallet,
              daily_limit, monthly_limit, deploy_count, active, created_at
       FROM agent_templates WHERE id = $1`,
      [id],
    );
    if (!template) throw new NotFoundException('Template not found');
    return template;
  }

  /**
   * Create a new template (admin-only).
   */
  async createTemplate(input: {
    name: string;
    description?: string;
    category?: string;
    config?: any;
    dailyLimit?: string;
    monthlyLimit?: string;
    creatorWallet?: string;
  }) {
    if (!input.name || !input.name.trim()) {
      throw new BadRequestException('Template name is required');
    }

    const validCategories = ['general', 'trend', 'trader', 'community', 'custom'];
    const category = input.category || 'general';
    if (!validCategories.includes(category)) {
      throw new BadRequestException(`Invalid category. Must be one of: ${validCategories.join(', ')}`);
    }

    let dailyLimit: bigint;
    let monthlyLimit: bigint;
    try {
      dailyLimit = input.dailyLimit ? safeBigInt(input.dailyLimit, { requirePositive: true }) : 50_000_000n;
      monthlyLimit = input.monthlyLimit ? safeBigInt(input.monthlyLimit, { requirePositive: true }) : 1_000_000_000n;
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    const template = await this.db.queryOne<any>(
      `INSERT INTO agent_templates (name, description, category, config, creator_wallet, daily_limit, monthly_limit)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, description, category, daily_limit, monthly_limit, created_at`,
      [
        input.name.trim(),
        input.description || null,
        category,
        JSON.stringify(input.config || {}),
        input.creatorWallet?.toLowerCase() || null,
        dailyLimit.toString(),
        monthlyLimit.toString(),
      ],
    );

    this.logger.log(`Template created: ${template.id} (${template.name})`);
    return template;
  }

  /**
   * Deploy an agent from a template (admin auth required).
   * Creates a new agent with the template's default config and returns the API key.
   */
  async deployFromTemplate(templateId: number, overrides?: {
    name?: string;
    description?: string;
    wallet?: string;
    dailyLimit?: string;
    monthlyLimit?: string;
  }) {
    const template = await this.getTemplate(templateId);

    const name = overrides?.name || `${template.name} Agent`;
    const description = overrides?.description || template.description || undefined;
    const wallet = overrides?.wallet || template.creator_wallet || undefined;
    const dailyLimit = overrides?.dailyLimit || template.daily_limit;
    const monthlyLimit = overrides?.monthlyLimit || template.monthly_limit;
    const config = template.config || {};

    // Register the agent via AgentsService, passing the template config.
    const result = await this.agentsService.registerAgent({
      name,
      description,
      wallet,
      dailyLimit,
      monthlyLimit,
      config,
    });

    // Increment deploy count.
    await this.db.query(
      `UPDATE agent_templates SET deploy_count = deploy_count + 1 WHERE id = $1`,
      [templateId],
    );

    this.logger.log(`Agent deployed from template ${templateId}: ${result.agentId}`);
    return result;
  }
}
