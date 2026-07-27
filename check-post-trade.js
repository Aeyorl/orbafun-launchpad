const { Client } = require('pg');
const client = new Client({
  host: process.env.POSTGRES_HOST || 'aws-0-eu-west-1.pooler.supabase.com',
  port: Number(process.env.POSTGRES_PORT || 5432),
  database: process.env.POSTGRES_DB || 'postgres',
  user: process.env.POSTGRES_USER || 'postgres.xzizgsnvmupzpaoxhvxs',
  password: process.env.POSTGRES_PASSWORD || '0454768177Apeh@@',
  ssl: { rejectUnauthorized: false }
});

client.connect().then(async () => {
  await client.query("UPDATE tokens t SET volume_24h = COALESCE((SELECT (SUM(usdc_amount)::numeric / 1000000.0)::numeric(20,6) FROM trades tr WHERE tr.token_id = t.id AND tr.timestamp > NOW() - INTERVAL '24 hours'), 0)");
  const tokens = await client.query("SELECT id, symbol, contract_address, price, market_cap, volume_24h, status FROM tokens ORDER BY volume_24h DESC LIMIT 5");
  console.log('RE-BACKFILLED TOKENS:\n', tokens.rows);
  await client.end();
}).catch(err => {
  console.error(err);
  process.exit(1);
});
