#!/usr/bin/env node
/**
 * Database migration script — applies schema.sql to the configured Postgres.
 * Run with: node dist/db/migrate.js  (or npm run db:migrate)
 *
 * Idempotent: uses IF NOT EXISTS / ON CONFLICT so it's safe to run multiple times.
 */
require('dotenv').config({ path: '../../.env' });
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function main() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const isRemote = host !== 'localhost' && host !== '127.0.0.1';
  const pool = new Pool({
    host,
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'orbafun',
    user: process.env.POSTGRES_USER || 'orbafun',
    password: process.env.POSTGRES_PASSWORD || '',
    connectionTimeoutMillis: parseInt(
      process.env.POSTGRES_CONNECT_TIMEOUT_MS || '30000',
      10,
    ),
    keepAlive: true,
    ssl: isRemote ? { rejectUnauthorized: false } : false,
  });

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying schema from', schemaPath);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    await client.query('COMMIT');
    console.log('Schema applied successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
