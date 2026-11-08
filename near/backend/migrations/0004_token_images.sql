CREATE TABLE token_images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  content BYTEA NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 1048576)
);

CREATE INDEX IF NOT EXISTS tokens_creator_block ON tokens(creator, created_block DESC);
CREATE INDEX IF NOT EXISTS trades_trader_height ON trades(trader, block_height DESC);
