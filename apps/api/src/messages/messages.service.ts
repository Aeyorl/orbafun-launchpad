import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { RedisService } from '../redis/redis.service';

export interface Message {
  id: number;
  token_id: number;
  wallet: string;
  content: string;
  tx_hash: string | null;
  created_at: string;
  // Agent message attribution — populated when the message was posted by an AI agent
  is_agent_message: boolean;
  agent_name: string | null;
}

const MAX_CONTENT_LENGTH = 500;
const MAX_MESSAGES_PER_REQUEST = 100;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private db: DatabaseService,
    private redis: RedisService,
  ) {}

  /**
   * Get recent messages for a token (newest first).
   * GET /tokens/:address/messages?limit=50
   */
  async getMessages(
    tokenId: number,
    opts: { limit?: number; before?: number } = {},
  ): Promise<{ messages: Message[]; hasMore: boolean }> {
    const limit = Math.min(opts.limit || 50, MAX_MESSAGES_PER_REQUEST);
    const before = opts.before; // message id for pagination (load older)

    const rows = await this.db.queryRows<Message>(
      `SELECT m.id, m.token_id, m.wallet, m.content, m.tx_hash, m.created_at,
        CASE WHEN al.id IS NOT NULL AND (
          LOWER(m.wallet) = LOWER(a.wallet)
          OR (a.wallet IS NULL AND LOWER(m.wallet) = LOWER(t.creator_wallet))
        ) THEN true ELSE false END AS is_agent_message,
        a.name AS agent_name
       FROM messages m
       JOIN tokens t ON t.id = m.token_id
       LEFT JOIN agent_launches al ON al.token_address = t.contract_address
       LEFT JOIN agents a ON a.id = al.agent_id
       WHERE m.token_id = $1 ${before ? 'AND m.id < $2' : ''}
       ORDER BY m.id DESC
       LIMIT $${before ? 3 : 2}`,
      before ? [tokenId, before, limit + 1] : [tokenId, limit + 1],
    );

    const hasMore = rows.length > limit;
    const messages = rows.slice(0, limit);
    return { messages, hasMore };
  }

  /**
   * Post a new message.
   * POST /tokens/:address/messages
   * Body: { content: string, txHash?: string }
   * Header: x-wallet (the poster's address — verified via wallet signature
   *         in production; for now we trust the client since this is testnet).
   */
  async postMessage(
    tokenId: number,
    wallet: string,
    content: string,
    txHash?: string,
  ): Promise<Message> {
    const trimmed = content.trim();
    if (!trimmed) {
      throw new Error('Message content cannot be empty');
    }
    if (trimmed.length > MAX_CONTENT_LENGTH) {
      throw new Error(`Message too long (max ${MAX_CONTENT_LENGTH} chars)`);
    }

    const row = await this.db.queryOne<Message>(
      `INSERT INTO messages (token_id, wallet, content, tx_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, token_id, wallet, content, tx_hash, created_at`,
      [tokenId, wallet.toLowerCase(), trimmed, txHash || null],
    );

    if (!row) {
      throw new Error('Failed to insert message');
    }

    // Publish to Redis for WebSocket relay.
    await this.redis.publish(
      'token:events',
      JSON.stringify({
        type: 'NEW_MESSAGE',
        tokenAddress: await this.getTokenAddress(tokenId),
        data: row,
        timestamp: Date.now(),
      }),
    );

    return row;
  }

  private async getTokenAddress(tokenId: number): Promise<string> {
    const row = await this.db.queryOne<{ contract_address: string }>(
      `SELECT contract_address FROM tokens WHERE id = $1`,
      [tokenId],
    );
    return row?.contract_address || '';
  }

  /** Resolve a token address to its DB id. */
  async resolveTokenId(address: string): Promise<number | null> {
    const row = await this.db.queryOne<{ id: number }>(
      `SELECT id FROM tokens WHERE contract_address = $1`,
      [address.toLowerCase()],
    );
    return row?.id || null;
  }
}
