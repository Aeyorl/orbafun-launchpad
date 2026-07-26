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

  const tokenRes = await client.query(
    "SELECT id, contract_address, curve_address, name, symbol, real_usdc, tokens_sold, created_block, created_tx_hash FROM tokens WHERE symbol = 'PROLS'"
  );
  console.log('PROLS Token record:', tokenRes.rows[0]);

  if (tokenRes.rows[0]) {
    const tradesRes = await client.query(
      "SELECT * FROM trades WHERE token_id = $1 ORDER BY id DESC",
      [tokenRes.rows[0].id]
    );
    console.log(`PROLS Trades in DB (${tradesRes.rows.length}):`, tradesRes.rows);
  }

  await client.end();
}

main().catch(console.error);
