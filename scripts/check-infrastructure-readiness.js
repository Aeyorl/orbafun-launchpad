/** Read/write-safe readiness checks for PostgreSQL and Redis. */
const dotenv = require('dotenv');
const { Pool } = require('pg');
const Redis = require('ioredis');

function postgresSsl(host, caBase64) {
  if (host === 'localhost' || host === '127.0.0.1') return false;
  const ca = caBase64 ? Buffer.from(caBase64, 'base64').toString('utf8') : undefined;
  return { rejectUnauthorized: true, ...(ca ? { ca } : {}) };
}

function verifyRuntimeRole(identity, runtimeRole, runtimePassword) {
  const runtimeRoleVerified = Boolean(runtimePassword)
    && identity?.role === runtimeRole
    && !identity.rolsuper
    && !identity.rolbypassrls;
  let verificationError;
  if (!runtimePassword) {
    verificationError =
      'POSTGRES_RUNTIME_PASSWORD is not set; the connection passed TLS checks but did not verify the production runtime role.';
  } else if (identity?.role !== runtimeRole) {
    verificationError = `Connected as ${identity?.role || 'an unknown role'} instead of ${runtimeRole}.`;
  } else if (identity.rolsuper || identity.rolbypassrls) {
    verificationError = 'The production runtime role has elevated privileges.';
  }

  return {
    ok: runtimeRoleVerified,
    connected: true,
    credential_mode: runtimePassword ? 'runtime' : 'migration',
    runtime_role_verified: runtimeRoleVerified,
    ...(verificationError ? { error: verificationError } : {}),
    ...identity,
  };
}

function postgresFailure(error) {
  const certificateFailure = /certificate|self[- ]signed|unable to verify/i.test(error.message);
  return {
    ok: false,
    error: certificateFailure
      ? 'TLS certificate verification failed. Set POSTGRES_SSL_CA_BASE64 to the base64-encoded Supabase project CA; do not disable verification.'
      : error.message,
  };
}

function readinessFailed(postgres, redis) {
  return !postgres.ok || !redis.ok;
}

async function main() {
  dotenv.config();
  const host = process.env.POSTGRES_HOST || 'localhost';
  const migrationUser = process.env.POSTGRES_USER || 'orbafun';
  const runtimeRole = process.env.POSTGRES_RUNTIME_ROLE || 'orbafun_runtime';
  const suffix = migrationUser.includes('.') ? migrationUser.slice(migrationUser.indexOf('.')) : '';
  const runtimePassword = process.env.POSTGRES_RUNTIME_PASSWORD;
  const pool = new Pool({
    host,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: process.env.POSTGRES_DB || 'orbafun',
    user: runtimePassword ? process.env.POSTGRES_RUNTIME_USER || `${runtimeRole}${suffix}` : migrationUser,
    password: runtimePassword || process.env.POSTGRES_PASSWORD,
    ssl: postgresSsl(host, process.env.POSTGRES_SSL_CA_BASE64),
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
    postgres = verifyRuntimeRole(db.rows[0], runtimeRole, runtimePassword);
  } catch (error) {
    postgres = postgresFailure(error);
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
  if (readinessFailed(postgres, redisResult)) {
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = {
  postgresSsl,
  verifyRuntimeRole,
  postgresFailure,
  readinessFailed,
};
