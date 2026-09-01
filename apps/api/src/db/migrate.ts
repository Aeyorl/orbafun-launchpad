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
const { migratePermanentReferralCodes } = require('./referral-code-migration');

function roleIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(value)) {
    throw new Error('POSTGRES_RUNTIME_ROLE must be a lowercase PostgreSQL identifier');
  }
  return `"${value}"`;
}

function sqlLiteral(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function provisionRuntimeRole(client) {
  const password = process.env.POSTGRES_RUNTIME_PASSWORD;
  if (!password) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('POSTGRES_RUNTIME_PASSWORD is required in production');
    }
    console.log('POSTGRES_RUNTIME_PASSWORD not set; skipping runtime role provisioning.');
    return;
  }

  const roleName = process.env.POSTGRES_RUNTIME_ROLE || 'orbafun_runtime';
  const role = roleIdentifier(roleName);
  const database = process.env.POSTGRES_DB || 'orbafun';
  const databaseIdentifier = `"${database.replaceAll('"', '""')}"`;

  await client.query(`
    DO $role$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${sqlLiteral(roleName)}) THEN
        CREATE ROLE ${role} LOGIN PASSWORD ${sqlLiteral(password)};
      ELSE
        ALTER ROLE ${role} WITH LOGIN PASSWORD ${sqlLiteral(password)};
      END IF;
    END
    $role$;
    GRANT CONNECT ON DATABASE ${databaseIdentifier} TO ${role};
    GRANT USAGE ON SCHEMA public TO ${role};
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role};
    GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${role};
    ALTER DEFAULT PRIVILEGES IN SCHEMA public
      GRANT USAGE, SELECT ON SEQUENCES TO ${role};
  `);

  const roleAttributes = await client.query(
    `SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
     FROM pg_roles WHERE rolname = $1`,
    [roleName],
  );
  const attributes = roleAttributes.rows[0];
  if (
    !attributes ||
    attributes.rolsuper ||
    attributes.rolcreatedb ||
    attributes.rolcreaterole ||
    attributes.rolreplication ||
    attributes.rolbypassrls
  ) {
    throw new Error('Runtime database role has elevated privileges');
  }

  const tables = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND rowsecurity = true
  `);
  for (const { tablename } of tables.rows) {
    const table = `"${tablename.replaceAll('"', '""')}"`;
    await client.query(`
      DROP POLICY IF EXISTS orbafun_runtime_access ON public.${table};
      CREATE POLICY orbafun_runtime_access ON public.${table}
        FOR ALL TO ${role} USING (true) WITH CHECK (true)
    `);
  }
}

async function main() {
  const host = process.env.POSTGRES_HOST || 'localhost';
  const isRemote = host !== 'localhost' && host !== '127.0.0.1';
  const sslCa = process.env.POSTGRES_SSL_CA_BASE64
    ? Buffer.from(process.env.POSTGRES_SSL_CA_BASE64, 'base64').toString('utf8')
    : undefined;
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
    ssl: isRemote
      ? { rejectUnauthorized: true, ...(sslCa ? { ca: sslCa } : {}) }
      : false,
  });

  const schemaPath = path.join(__dirname, '..', 'db', 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log('Applying schema from', schemaPath);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(schema);
    const migratedProfiles = await migratePermanentReferralCodes(client);
    await provisionRuntimeRole(client);
    await client.query('COMMIT');
    console.log('Schema applied successfully.');
    console.log(`Permanent referral codes migrated: ${migratedProfiles}`);
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
