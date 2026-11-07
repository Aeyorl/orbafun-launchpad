CREATE TABLE IF NOT EXISTS indexer_state (
  name TEXT PRIMARY KEY,
  last_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS tokens (
  account_id TEXT PRIMARY KEY,
  creator TEXT NOT NULL,
  treasury_recipient TEXT NOT NULL,
  name TEXT NOT NULL,
  symbol TEXT NOT NULL,
  real_usdc NUMERIC(40,0) NOT NULL DEFAULT 0,
  cumulative_volume_usdc NUMERIC(40,0) NOT NULL DEFAULT 0,
  tokens_sold NUMERIC(40,0) NOT NULL DEFAULT 0,
  reserved_remaining NUMERIC(40,0) NOT NULL DEFAULT 120000000000000000000000000,
  treasury_pool NUMERIC(40,0) NOT NULL DEFAULT 0,
  treasury_unlocked NUMERIC(40,0) NOT NULL DEFAULT 0,
  treasury_claimed NUMERIC(40,0) NOT NULL DEFAULT 0,
  milestones_completed SMALLINT NOT NULL DEFAULT 0,
  graduated BOOLEAN NOT NULL DEFAULT FALSE,
  preset JSONB NOT NULL,
  created_block BIGINT NOT NULL,
  created_tx TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS trades (
  id BIGSERIAL PRIMARY KEY,
  token_id TEXT NOT NULL REFERENCES tokens(account_id),
  trader TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  usdc_amount NUMERIC(40,0) NOT NULL,
  token_amount NUMERIC(40,0) NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  block_height BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tx_hash,event_index)
);
CREATE INDEX IF NOT EXISTS trades_token_height ON trades(token_id,block_height DESC);
CREATE TABLE IF NOT EXISTS milestones (
  token_id TEXT NOT NULL REFERENCES tokens(account_id),
  milestone_index SMALLINT NOT NULL,
  volume NUMERIC(40,0) NOT NULL,
  burn_amount NUMERIC(40,0) NOT NULL,
  treasury_unlocked NUMERIC(40,0) NOT NULL,
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  block_height BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(token_id,milestone_index),
  UNIQUE(tx_hash,event_index)
);
