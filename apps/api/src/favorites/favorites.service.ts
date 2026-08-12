import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { getPublicFactoryAddresses, publicFactoryClause } from '../common/factory-scope';

export interface Favorite {
  id: number;
  wallet: string;
  token_id: number;
  created_at: string;
}

@Injectable()
export class FavoritesService {
  private readonly logger = new Logger(FavoritesService.name);

  constructor(private db: DatabaseService) {}

  /** List a wallet's favorites (with token details joined in). */
  async listFavorites(
    wallet: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<{ tokens: any[]; total: number }> {
    const limit = Math.min(opts.limit || 20, 100);
    const offset = opts.offset || 0;
    const w = wallet.toLowerCase();

    const tokens = await this.db.queryRows<any>(
      `SELECT t.*, f.created_at AS favorited_at
       FROM favorites f
       JOIN tokens t ON f.token_id = t.id
       WHERE f.wallet = $1 AND ${publicFactoryClause('t', 2)}
       ORDER BY f.created_at DESC
       LIMIT $3 OFFSET $4`,
      [w, getPublicFactoryAddresses(), limit, offset],
    );

    const countResult = await this.db.queryOne<{ total: string }>(
      `SELECT COUNT(*) as total
       FROM favorites f JOIN tokens t ON t.id = f.token_id
       WHERE f.wallet = $1 AND ${publicFactoryClause('t', 2)}`,
      [w, getPublicFactoryAddresses()],
    );

    return {
      tokens,
      total: parseInt(countResult?.total || '0', 10),
    };
  }

  /** Add a token to favorites. Idempotent (returns existing if already fav'd). */
  async addFavorite(wallet: string, tokenAddress: string): Promise<Favorite> {
    const w = wallet.toLowerCase();
    const a = tokenAddress.toLowerCase();

    const token = await this.db.queryOne<{ id: number }>(
      `SELECT t.id FROM tokens t
       WHERE t.contract_address = $1 AND ${publicFactoryClause('t', 2)}`,
      [a, getPublicFactoryAddresses()],
    );
    if (!token) throw new Error('Token not found');

    const row = await this.db.queryOne<Favorite>(
      `INSERT INTO favorites (wallet, token_id)
       VALUES ($1, $2)
       ON CONFLICT (wallet, token_id) DO UPDATE SET wallet = EXCLUDED.wallet
       RETURNING id, wallet, token_id, created_at`,
      [w, token.id],
    );
    return row!;
  }

  /** Remove a token from favorites. */
  async removeFavorite(wallet: string, tokenAddress: string): Promise<boolean> {
    const w = wallet.toLowerCase();
    const a = tokenAddress.toLowerCase();

    const result = await this.db.query(
      `DELETE FROM favorites f
       USING tokens t
       WHERE f.token_id = t.id
         AND f.wallet = $1
         AND t.contract_address = $2
         AND ${publicFactoryClause('t', 3)}`,
      [w, a, getPublicFactoryAddresses()],
    );
    return (result.rowCount ?? 0) > 0;
  }

  /** Check if a wallet has favorited a specific token. */
  async isFavorite(wallet: string, tokenAddress: string): Promise<boolean> {
    const w = wallet.toLowerCase();
    const a = tokenAddress.toLowerCase();
    const row = await this.db.queryOne<{ exists: boolean }>(
      `SELECT EXISTS(
         SELECT 1 FROM favorites f
         JOIN tokens t ON f.token_id = t.id
         WHERE f.wallet = $1 AND t.contract_address = $2
           AND ${publicFactoryClause('t', 3)}
       ) AS exists`,
      [w, a, getPublicFactoryAddresses()],
    );
    return row?.exists ?? false;
  }
}
