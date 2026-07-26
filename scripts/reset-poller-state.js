const { Client } = require('pg');
require('dotenv').config({ path: './.env' });

async function resetPoller() {
  const client = new Client({
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432'),
    database: process.env.POSTGRES_DB || 'postgres',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('Connected to Postgres database...');

  // Get current sync state
  const res = await client.query(
    "SELECT * FROM indexer_sync_state WHERE entity = 'ArcEventPoller'"
  );
  console.log('Current ArcEventPoller sync state:', res.rows);

  // Reset sync block back to block 5300000 (or subtract 100,000 blocks)
  // so the poller re-scans all events from recent token launches & trades.
  if (res.rows.length > 0) {
    const currentLastBlock = BigInt(res.rows[0].last_block || '0');
    const newLastBlock = currentLastBlock > 100000n ? currentLastBlock - 100000n : 1n;
    await client.query(
      "UPDATE indexer_sync_state SET last_block = $1 WHERE entity = 'ArcEventPoller'",
      [newLastBlock.toString()]
    );
    console.log(`Reset last_block from ${currentLastBlock} to ${newLastBlock}`);
  } else {
    console.log('No ArcEventPoller sync state row found to reset.');
  }

  await client.end();
  console.log('Done!');
}

resetPoller().catch(console.error);
