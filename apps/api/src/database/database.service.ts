import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';

/**
 * DatabaseService — thin wrapper around node-postgres Pool.
 *
 * All queries use parameterized inputs ($1, $2, ...) to prevent SQL injection.
 * The pool manages connections; callers should not hold clients for long.
 *
 * Connection config comes from environment variables:
 *   POSTGRES_HOST (default localhost)
 *   POSTGRES_PORT (default 5432)
 *   POSTGRES_DB   (default orbafun)
 *   POSTGRES_USER (default orbafun)
 *   POSTGRES_PASSWORD
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    const host = process.env.POSTGRES_HOST || 'localhost';
    // Enable SSL for remote (cloud) databases. Local dev (localhost) skips SSL.
    const isRemote = host !== 'localhost' && host !== '127.0.0.1';
    this.pool = new Pool({
      host,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'orbafun',
      user: process.env.POSTGRES_USER || 'orbafun',
      password: process.env.POSTGRES_PASSWORD || '',
      max: 20, // max connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      // Cloud providers (Supabase, etc.) require SSL. We don't verify the cert
      // because Supabase uses their own CA not in Node's trust store.
      ssl: isRemote ? { rejectUnauthorized: false } : false,
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      const result = await client.query('SELECT NOW() as now');
      this.logger.log(`Connected to PostgreSQL at ${result.rows[0].now}`);
      client.release();
    } catch (err) {
      this.logger.error(`Failed to connect to PostgreSQL: ${err.message}`);
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.pool.end();
    this.logger.log('PostgreSQL pool closed');
  }

  /** Run a parameterized query. Returns the full result. */
  async query(text: string, params?: (string | number | boolean | null)[]) {
    return this.pool.query(text, params);
  }

  /** Run a query and return only the rows. */
  async queryRows<T = any>(text: string, params?: (string | number | boolean | null)[]): Promise<T[]> {
    const result = await this.pool.query(text, params);
    return result.rows as T[];
  }

  /** Run a query and return the first row, or null. */
  async queryOne<T = any>(text: string, params?: (string | number | boolean | null)[]): Promise<T | null> {
    const result = await this.pool.query(text, params);
    return (result.rows[0] as T) || null;
  }

  /** Acquire a client for transactions. Caller must release it. */
  async connect(): Promise<PoolClient> {
    return this.pool.connect();
  }
}
