#!/usr/bin/env node
'use strict';

require('dotenv').config();
const crypto = require('crypto');
const { Pool } = require('pg');
const Redis = require('ioredis');

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseInfo(info, keys) {
  const values = {};
  for (const line of info.split('\n')) {
    const separator = line.indexOf(':');
    if (separator < 0) continue;
    const key = line.slice(0, separator);
    if (keys.includes(key)) values[key] = line.slice(separator + 1).trim();
  }
  return values;
}

async function checkDatabase() {
  const host = required('POSTGRES_HOST');
  const sslCa = process.env.POSTGRES_SSL_CA_BASE64
    ? Buffer.from(process.env.POSTGRES_SSL_CA_BASE64, 'base64').toString('utf8')
    : undefined;
  const pool = new Pool({
    host,
    port: Number(process.env.POSTGRES_PORT || 5432),
    database: required('POSTGRES_DB'),
    user: required('POSTGRES_USER'),
    password: required('POSTGRES_PASSWORD'),
    ssl: { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) },
    connectionTimeoutMillis: 10_000,
  });
  const client = await pool.connect();
  try {
    const metadata = await client.query(`
      SELECT current_setting('server_version') AS version,
             current_database() AS database,
             current_user AS role,
             pg_is_in_recovery() AS recovery,
             (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl
    `);
    const stats = await client.query(`
      SELECT
        (SELECT count(*)::int FROM information_schema.tables
          WHERE table_schema = 'public' AND table_type = 'BASE TABLE') AS tables,
        (SELECT coalesce(sum(n_live_tup), 0)::bigint::text FROM pg_stat_user_tables) AS estimated_rows,
        (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity) AS rls_tables
    `);
    return { status: 'PASS', ...metadata.rows[0], ...stats.rows[0] };
  } finally {
    client.release();
    await pool.end();
  }
}

async function checkRedis() {
  const url = required('REDIS_URL');
  const ca = process.env.REDIS_TLS_CA_BASE64
    ? Buffer.from(process.env.REDIS_TLS_CA_BASE64, 'base64').toString('utf8')
    : undefined;
  const redis = new Redis(url, {
    lazyConnect: true,
    connectTimeout: 10_000,
    maxRetriesPerRequest: 1,
    ...(url.startsWith('rediss://') ? { tls: { rejectUnauthorized: true, ...(ca ? { ca } : {}) } } : {}),
  });
  const key = `orba:readiness:${crypto.randomUUID()}`;
  try {
    await redis.connect();
    const pong = await redis.ping();
    await redis.set(key, 'ok', 'EX', 60);
    const [value, ttl, info] = await Promise.all([redis.get(key), redis.ttl(key), redis.info()]);
    const deleted = await redis.del(key);
    if (pong !== 'PONG' || value !== 'ok' || ttl <= 0 || deleted !== 1) {
      throw new Error('Redis round-trip assertions failed');
    }
    return {
      status: 'PASS', tls: url.startsWith('rediss://'), ttlSeconds: ttl,
      ...parseInfo(info, ['redis_version', 'connected_clients', 'used_memory_human', 'maxmemory_human']),
    };
  } finally {
    await redis.quit().catch(() => redis.disconnect());
  }
}

async function checkRpc() {
  const urls = required('ARC_RPC_URLS').split(',').map((value) => value.trim()).filter(Boolean);
  return Promise.all(urls.map(async (url, index) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);
    try {
      const response = await fetch(url, {
        method: 'POST', signal: controller.signal,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
      });
      const body = await response.json();
      const chainId = Number(BigInt(body.result));
      if (!response.ok || chainId !== 5042002) throw new Error(body.error?.message || `chain ${chainId}`);
      return { provider: index + 1, status: 'PASS', chainId };
    } catch (error) {
      return { provider: index + 1, status: 'FAIL', error: error.name || error.message };
    } finally {
      clearTimeout(timer);
    }
  }));
}

async function main() {
  const results = {};
  for (const [name, check] of Object.entries({ database: checkDatabase, redis: checkRedis, rpc: checkRpc })) {
    try {
      results[name] = await check();
    } catch (error) {
      results[name] = { status: 'FAIL', error: error.code || error.message };
    }
  }
  const pass = results.database.status === 'PASS' && results.redis.status === 'PASS'
    && results.rpc.every((provider) => provider.status === 'PASS');
  console.log(JSON.stringify({ status: pass ? 'PASS' : 'FAIL', checkedAt: new Date().toISOString(), ...results }, null, 2));
  process.exit(pass ? 0 : 1);
}

main();
