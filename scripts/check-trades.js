const { Client } = require('pg');
require('dotenv').config({ path: './.env' });

async function main() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const res = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM tokens) AS total_tokens,
      (SELECT COUNT(*)::int FROM tokens WHERE status = 'active') AS active_tokens,
      (SELECT COUNT(*)::int FROM tokens WHERE status = 'graduated') AS graduated_tokens,
      (SELECT COALESCE(SUM(usdc_amount::bigint), 0)::text FROM trades WHERE timestamp >= NOW() - INTERVAL '24 hours') AS volume_24h_micro
  `);

  console.log('Raw stats from DB:', res.rows[0]);

  const micro = BigInt(res.rows[0].volume_24h_micro);
  const dollars = (Number(micro) / 1e6).toFixed(6);
  console.log(`Formatted 24h volume: $${dollars}`);

  await client.end();
}

main().catch(console.error);
