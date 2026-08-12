BEGIN;

ALTER TABLE agent_spend_reservations
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE agent_spend_reservations DROP CONSTRAINT IF EXISTS agent_spend_reservations_status_check;
ALTER TABLE agent_spend_reservations ADD CONSTRAINT agent_spend_reservations_status_check
  CHECK (status IN ('pending','confirmed','released','broadcast_confirmed','reconciling'));
DROP INDEX IF EXISTS idx_agent_spend_reservations_active;
CREATE INDEX idx_agent_spend_reservations_active ON agent_spend_reservations(agent_id, created_at)
  WHERE status IN ('pending','broadcast_confirmed','reconciling');

CREATE TABLE IF NOT EXISTS agent_transaction_intents (
  id UUID PRIMARY KEY,
  reservation_id UUID NOT NULL UNIQUE,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  operation TEXT NOT NULL CHECK (operation IN ('launch','buy','sell')),
  payload JSONB NOT NULL,
  signed_tx TEXT,
  tx_hash TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'created'
    CHECK (status IN ('created','prepared','broadcast','reconciling','succeeded','reverted','expired')),
  lease_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
ALTER TABLE agent_transaction_intents
  DROP CONSTRAINT IF EXISTS agent_transaction_intents_status_check;
ALTER TABLE agent_transaction_intents
  ADD CONSTRAINT agent_transaction_intents_status_check
  CHECK (status IN ('created','prepared','broadcast','reconciling','succeeded','reverted','expired'));
CREATE INDEX IF NOT EXISTS idx_agent_transaction_intents_claim
  ON agent_transaction_intents(updated_at)
  WHERE status IN ('prepared','broadcast','reconciling');

CREATE TABLE IF NOT EXISTS agent_position_reservations (
  reservation_id UUID PRIMARY KEY,
  agent_id BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  token_address TEXT NOT NULL,
  amount NUMERIC(40,0) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','released','broadcast_confirmed','reconciling')),
  tx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  transaction_intent_id UUID REFERENCES agent_transaction_intents(id)
);
ALTER TABLE agent_position_reservations
  ADD COLUMN IF NOT EXISTS transaction_intent_id UUID REFERENCES agent_transaction_intents(id);
DROP INDEX IF EXISTS idx_agent_position_reservations_active;
CREATE INDEX idx_agent_position_reservations_active
  ON agent_position_reservations(agent_id, token_address, created_at)
  WHERE status IN ('pending','broadcast_confirmed','reconciling');
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_position_reservations_tx_hash
  ON agent_position_reservations(tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_position_reservations_intent
  ON agent_position_reservations(transaction_intent_id) WHERE transaction_intent_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_launches_tx_hash_unique ON agent_launches(tx_hash);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_trades_tx_hash_unique ON agent_trades(tx_hash);

COMMIT;
