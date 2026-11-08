CREATE TABLE IF NOT EXISTS treasury_claims (
  tx_hash TEXT NOT NULL,
  event_index INTEGER NOT NULL,
  token_id TEXT NOT NULL REFERENCES tokens(account_id),
  amount NUMERIC(40,0) NOT NULL,
  block_height BIGINT NOT NULL,
  PRIMARY KEY (tx_hash, event_index)
);

CREATE INDEX IF NOT EXISTS treasury_claims_token_height
  ON treasury_claims(token_id, block_height DESC);
