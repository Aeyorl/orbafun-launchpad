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
 *   POSTGRES_RUNTIME_ROLE (database role, default orbafun_runtime in production)
 *   POSTGRES_RUNTIME_USER (connection username; derived for Supavisor if omitted)
 *   POSTGRES_RUNTIME_PASSWORD
 */
@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool;

  constructor() {
    const host = process.env.POSTGRES_HOST || 'localhost';
    const migrationUser = process.env.POSTGRES_USER || 'orbafun';
    const runtimeRole = process.env.POSTGRES_RUNTIME_ROLE || 'orbafun_runtime';
    const poolerSuffix = migrationUser.includes('.')
      ? migrationUser.slice(migrationUser.indexOf('.'))
      : '';
    const runtimePassword = process.env.POSTGRES_RUNTIME_PASSWORD;
    const useRuntimeRole = !!runtimePassword;

    if (process.env.NODE_ENV === 'production' && !useRuntimeRole) {
      throw new Error('POSTGRES_RUNTIME_PASSWORD is required in production');
    }
    // Enable SSL for remote (cloud) databases. Local dev (localhost) skips SSL.
    const isRemote = host !== 'localhost' && host !== '127.0.0.1';
    const sslCa = process.env.POSTGRES_SSL_CA_BASE64
      ? Buffer.from(process.env.POSTGRES_SSL_CA_BASE64, 'base64').toString('utf8')
      : undefined;
    this.pool = new Pool({
      host,
      port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
      database: process.env.POSTGRES_DB || 'orbafun',
      user: useRuntimeRole
        ? process.env.POSTGRES_RUNTIME_USER || `${runtimeRole}${poolerSuffix}`
        : migrationUser,
      password: useRuntimeRole ? runtimePassword : process.env.POSTGRES_PASSWORD || '',
      max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: parseInt(
        process.env.POSTGRES_CONNECT_TIMEOUT_MS || '30000',
        10,
      ),
      keepAlive: true,
      ssl: isRemote
        ? { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) }
        : false,
    });
  }

  async onModuleInit() {
    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          `SELECT NOW() AS now, current_user AS role,
                  r.rolsuper, r.rolbypassrls
           FROM pg_roles r WHERE r.rolname = current_user`,
        );
        if (
          process.env.NODE_ENV === 'production' &&
          (result.rows[0]?.rolsuper || result.rows[0]?.rolbypassrls)
        ) {
          throw new Error('Runtime database role must not bypass row-level security');
        }
        this.logger.log(`Connected to PostgreSQL at ${result.rows[0].now}`);
      } finally {
        client.release();
      }
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

  getPoolStats() {
    return {
      total: this.pool.totalCount,
      idle: this.pool.idleCount,
      waiting: this.pool.waitingCount,
      max: parseInt(process.env.POSTGRES_POOL_MAX || '10', 10),
    };
  }
}
