-- Price snapshots migration
-- Records token price/market_cap at each trade for gain/percentage calculations.
-- This enables the leaderboard "Top Gainers" section to show real percentage
-- gains instead of just sorting by market cap.
--
-- Run: cd apps/api && npm run db:migrate

CREATE TABLE IF NOT EXISTS price_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    token_id        BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    price           NUMERIC(20, 6) NOT NULL,    -- USDC per token (6-dec)
    market_cap      NUMERIC(20, 6) NOT NULL,    -- 6-dec USDC
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time
    ON price_snapshots(token_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time_asc
    ON price_snapshots(token_id, snapshot_at ASC);
