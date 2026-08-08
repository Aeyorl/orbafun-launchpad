/** Read/write-safe readiness checks for PostgreSQL and Redis. */
require('dotenv').config();
const { Pool } = require('pg');
const Redis = require('ioredis');

async function main() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const migrationUser = process.env.POSTGRES_USER || 'orbafun';
  const runtimeRole = process.env.POSTGRES_RUNTIME_ROLE || 'orbafun_runtime';
  const suffix = migrationUser.includes('.') ? migrationUser.slice(migrationUser.indexOf('.')) : '';
  const runtimePassword = process.env.POSTGRES_RUNTIME_PASSWORD;
  const ca = process.env.POSTGRES_SSL_CA_BASE64
    ? Buffer.from(process.env.POSTGRES_SSL_CA_BASE64, 'base64').toString('utf8')
    : undefined;
  const pool = new Pool({
    host,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'orbafun',
    user: runtimePassword ? process.env.POSTGRES_RUNTIME_USER || `${runtimeRole}${suffix}` : migrationUser,
    password: runtimePassword || process.env.POSTGRES_PASSWORD,
    ssl: host === 'localhost' || host === '127.0.0.1' ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    connectionTimeoutMillis: 30_000,
  });

  let postgres;
  try {
    const db = await pool.query(`
      SELECT current_user AS role,
             current_setting('server_version') AS version,
             (SELECT count(*)::int FROM tokens) AS tokens,
             (SELECT count(*)::int FROM trades) AS trades,
             (SELECT count(*)::int FROM token_metadata) AS metadata_rows,
             r.rolsuper,
             r.rolbypassrls
        FROM pg_roles r
       WHERE r.rolname = current_user
    `);
    postgres = { ok: true, ...db.rows[0] };
  } catch (error) {
    const certificateFailure = /certificate|self[- ]signed|unable to verify/i.test(error.message);
    postgres = {
      ok: false,
      error: certificateFailure
        ? 'TLS certificate verification failed. Set POSTGRES_SSL_CA_BASE64 to the base64-encoded Supabase project CA; do not disable verification.'
        : error.message,
    };
  } finally {
    await pool.end();
  }

  const redis = new Redis(process.env.REDIS_URL, {
    maxRetriesPerRequest: 1,
    connectTimeout: 30_000,
    ...(process.env.REDIS_URL?.startsWith('rediss://') ? {
      tls: { rejectUnauthorized: true },
    } : {}),
  });
  const key = `readiness:codex:${Date.now()}`;
  let redisResult;
  try {
    const pong = await redis.ping();
    await redis.set(key, 'ok', 'EX', 30);
    const roundTrip = await redis.get(key);
    const ttl = await redis.ttl(key);
    await redis.del(key);
    redisResult = { ok: pong === 'PONG' && roundTrip === 'ok', pong, roundTrip, ttlSeconds: ttl, temporaryKeyDeleted: true };
  } catch (error) {
    redisResult = { ok: false, error: error.message };
  } finally {
    redis.disconnect();
  }

  const result = {
    postgres,
    redis: redisResult,
  };
  console.log(JSON.stringify(result, null, 2));
  if (!postgres.ok || postgres.rolsuper || postgres.rolbypassrls || !redisResult.ok) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
