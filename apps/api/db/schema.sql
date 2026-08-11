-- Orba Database Schema
-- Phase 2: Backend + Indexer
--
-- All USDC amounts stored in 6-decimal units (matching the ERC-20 view).
-- All token amounts stored in 18-decimal units (ERC-20 standard).
-- Block timestamps are in seconds (uint256 from contract, stored as bigint).

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- for fuzzy text search on token names

-- ─── Users ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id          BIGSERIAL PRIMARY KEY,
    wallet      TEXT NOT NULL UNIQUE,        -- checksummed address, lowercase
    username    TEXT,
    avatar      TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Aggregated stats (updated by indexer on each trade)
    tokens_launched  INTEGER NOT NULL DEFAULT 0,
    total_volume_usdc BIGINT NOT NULL DEFAULT 0  -- 6-dec, lifetime volume
);

CREATE INDEX IF NOT EXISTS idx_users_wallet ON users(wallet);

-- ─── Tokens ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tokens (
    id              BIGSERIAL PRIMARY KEY,
    contract_address TEXT NOT NULL UNIQUE,    -- MemeToken address (the "token")
    curve_address   TEXT NOT NULL UNIQUE,     -- BondingCurve address
    factory_address TEXT,                     -- emitting TokenFactory address
    transfer_policy TEXT NOT NULL DEFAULT 'legacy_capped',
    amm_pair_address TEXT,                    -- set on graduation (nullable)
    creator_wallet  TEXT NOT NULL,            -- lowercase address

    name            TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    description     TEXT,
    image           TEXT,                     -- IPFS URI or URL

    -- Pricing state (updated by indexer on each trade)
    price           NUMERIC(38, 18) NOT NULL DEFAULT 0, -- USDC per token
    market_cap      NUMERIC(20, 6) NOT NULL DEFAULT 0,  -- 6-dec USDC
    volume_24h      NUMERIC(20, 6) NOT NULL DEFAULT 0,  -- rolling 24h, 6-dec

    -- Curve state (mirrored from contract for fast reads)
    real_usdc       BIGINT NOT NULL DEFAULT 0,    -- 6-dec, USDC in curve
    tokens_sold     NUMERIC(40, 0) NOT NULL DEFAULT 0,  -- 18-dec, tokens sold from curve
    creator_fees_accrued BIGINT NOT NULL DEFAULT 0, -- 6-dec
    protocol_fees_accrued BIGINT NOT NULL DEFAULT 0, -- 6-dec

    -- Lifecycle
    status          TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active', 'graduated', 'paused')),
    graduated_at    TIMESTAMPTZ,
    lp_burned       NUMERIC(40, 0),             -- 18-dec LP tokens burned to 0x...dEaD

    -- Metadata
    created_block   BIGINT NOT NULL,
    created_tx_hash TEXT NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Foreign key to users (creator)
    CONSTRAINT fk_tokens_creator FOREIGN KEY (creator_wallet)
        REFERENCES users(wallet) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_volume_24h ON tokens(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator_wallet);
CREATE INDEX IF NOT EXISTS idx_tokens_factory ON tokens(factory_address);
CREATE INDEX IF NOT EXISTS idx_tokens_symbol_trgm ON tokens USING gin (symbol gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_tokens_name_trgm ON tokens USING gin (name gin_trgm_ops);

-- Multi-factory migration. Existing tokens remain legacy-capped; only events
-- from explicitly configured uncapped factories receive the uncapped policy.
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS factory_address TEXT;
ALTER TABLE tokens ADD COLUMN IF NOT EXISTS transfer_policy TEXT NOT NULL DEFAULT 'legacy_capped';
DO $$ BEGIN
    ALTER TABLE tokens ADD CONSTRAINT chk_tokens_transfer_policy
        CHECK (transfer_policy IN ('legacy_capped', 'uncapped'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Trades ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
    id          BIGSERIAL PRIMARY KEY,
    token_id    BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    wallet      TEXT NOT NULL,                -- trader address (lowercase)
    type        TEXT NOT NULL CHECK (type IN ('buy', 'sell')),

    -- Amounts (6-dec USDC, 18-dec tokens)
    usdc_amount BIGINT NOT NULL,              -- 6-dec
    gross_usdc_amount BIGINT NOT NULL DEFAULT 0,
    fee_usdc_amount BIGINT NOT NULL DEFAULT 0,
    net_usdc_amount BIGINT NOT NULL DEFAULT 0,
    allocated_cost_usdc BIGINT NOT NULL DEFAULT 0,
    realized_pnl_usdc BIGINT NOT NULL DEFAULT 0,
    token_amount NUMERIC(40, 0) NOT NULL,    -- 18-dec
    price       NUMERIC(38, 18) NOT NULL,     -- USDC per token at trade time

    -- Curve state after this trade (for chart reconstruction)
    market_cap_after NUMERIC(20, 6) NOT NULL,  -- 6-dec
    real_usdc_after  BIGINT NOT NULL,           -- 6-dec
    tokens_sold_after NUMERIC(40, 0) NOT NULL, -- 18-dec

    -- Transaction metadata
    tx_hash     TEXT NOT NULL,
    block_number BIGINT NOT NULL,
    log_index   INTEGER NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL,

    -- Unique constraint: one trade per (tx_hash, log_index) — prevents
    -- duplicate indexing on re-index or restart.
    CONSTRAINT uq_trades_tx_log UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_trades_token_timestamp ON trades(token_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_wallet_timestamp ON trades(wallet, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_block ON trades(block_number);

-- Explicit accounting semantics for existing deployments. Historical rows only
-- retained the gross amount, so their fee/net split is deterministically derived
-- using the launchpad's 1% fee. New rows are populated from decoded V2 events.
ALTER TABLE trades ADD COLUMN IF NOT EXISTS gross_usdc_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS fee_usdc_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS net_usdc_amount BIGINT NOT NULL DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS allocated_cost_usdc BIGINT NOT NULL DEFAULT 0;
ALTER TABLE trades ADD COLUMN IF NOT EXISTS realized_pnl_usdc BIGINT NOT NULL DEFAULT 0;
UPDATE trades
SET gross_usdc_amount = usdc_amount,
    fee_usdc_amount = usdc_amount / 100,
    net_usdc_amount = usdc_amount - (usdc_amount / 100)
WHERE gross_usdc_amount = 0 AND usdc_amount > 0;

-- ─── Graduations ───────────────────────────────────────────────────────────
-- Separate table for graduation events (one per token, but kept separate for
-- extensibility and to avoid nullable columns on tokens).
CREATE TABLE IF NOT EXISTS graduations (
    id              BIGSERIAL PRIMARY KEY,
    token_id        BIGINT NOT NULL UNIQUE REFERENCES tokens(id) ON DELETE CASCADE,
    amm_pair_address TEXT NOT NULL,
    lp_usdc         BIGINT NOT NULL,          -- 6-dec, USDC added to AMM
    lp_tokens       NUMERIC(40, 0) NOT NULL, -- 18-dec, tokens added to AMM
    lp_burned       NUMERIC(40, 0) NOT NULL, -- 18-dec, LP tokens burned to 0x...dEaD
    tx_hash         TEXT NOT NULL,
    block_number    BIGINT NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_graduations_token ON graduations(token_id);

-- ─── AMM Swaps (post-graduation) ───────────────────────────────────────────
-- Tracks swaps on the AMM pair after graduation.
CREATE TABLE IF NOT EXISTS amm_swaps (
    id              BIGSERIAL PRIMARY KEY,
    token_id        BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    amm_pair_address TEXT NOT NULL,
    sender          TEXT NOT NULL,            -- who initiated the swap
    to_address      TEXT NOT NULL,            -- recipient of output tokens

    -- Swap details (which direction: USDC→token or token→USDC)
    is_buy          BOOLEAN NOT NULL,         -- true = USDC→token, false = token→USDC
    usdc_in         BIGINT NOT NULL DEFAULT 0,  -- 6-dec
    usdc_out        BIGINT NOT NULL DEFAULT 0,  -- 6-dec
    token_in        NUMERIC(40, 0) NOT NULL DEFAULT 0,  -- 18-dec
    token_out       NUMERIC(40, 0) NOT NULL DEFAULT 0,  -- 18-dec
    allocated_cost_usdc BIGINT NOT NULL DEFAULT 0,
    realized_pnl_usdc BIGINT NOT NULL DEFAULT 0,

    -- Price after swap
    price_after     NUMERIC(38, 18) NOT NULL, -- USDC per token

    tx_hash         TEXT NOT NULL,
    block_number    BIGINT NOT NULL,
    log_index       INTEGER NOT NULL,
    timestamp       TIMESTAMPTZ NOT NULL,

    CONSTRAINT uq_amm_swaps_tx_log UNIQUE (tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_amm_swaps_token_timestamp ON amm_swaps(token_id, timestamp DESC);
ALTER TABLE amm_swaps ADD COLUMN IF NOT EXISTS allocated_cost_usdc BIGINT NOT NULL DEFAULT 0;
ALTER TABLE amm_swaps ADD COLUMN IF NOT EXISTS realized_pnl_usdc BIGINT NOT NULL DEFAULT 0;

-- ─── Indexer State (for resumability / lag tracking) ───────────────────────
-- Tracks the last block the indexer has processed. Envio/Goldsky handle this
-- internally, but we keep our own record for monitoring and debugging.
CREATE TABLE IF NOT EXISTS indexer_state (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1), -- singleton
    last_block      BIGINT NOT NULL DEFAULT 0,
    last_block_hash TEXT,
    last_event_timestamp TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    events_indexed  BIGINT NOT NULL DEFAULT 0
);

INSERT INTO indexer_state (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ─── Indexer Sync State (for Envio GraphQL polling) ────────────────────────
-- Tracks the last block synced per entity type when polling Envio's Hasura
-- GraphQL API. Each row represents a high-water mark for one entity table
-- (Token, Trade, Graduation, etc.) so the poller only fetches new rows.
CREATE TABLE IF NOT EXISTS indexer_sync_state (
    entity      TEXT PRIMARY KEY,             -- e.g. 'Token', 'Trade', 'Graduation'
    last_block  BIGINT NOT NULL DEFAULT 0,    -- highest block synced
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User volume is updated inside the same indexer transaction as all other
-- trade aggregates. Keeping a second trigger here double-counts every trade.
DROP TRIGGER IF EXISTS trg_trades_update_user_volume ON trades;
DROP FUNCTION IF EXISTS update_user_volume();

-- ─── volume_24h refresh function ───────────────────────────────────────────
-- Called periodically (e.g. every 60s) to refresh the rolling 24h volume.
-- This is cheaper than computing it on every read.
CREATE OR REPLACE FUNCTION refresh_volume_24h()
RETURNS VOID
SET search_path = public
AS $$
BEGIN
    UPDATE tokens t
    SET volume_24h = COALESCE((
        SELECT (SUM(usdc_amount)::numeric / 1000000.0)::numeric(20,6)
        FROM trades
        WHERE token_id = t.id
          AND timestamp > NOW() - INTERVAL '24 hours'
    ), 0)
    WHERE status = 'active';
END;
$$ LANGUAGE plpgsql;

-- ─── Price Snapshots (for leaderboard gain calculations) ──────────────────
-- Records token price/market_cap at each trade. The leaderboard uses this
-- to compute real percentage gains (24h or all-time) instead of sorting by
-- market cap as a proxy.
-- Inserted by the indexer on each Buy/Sell/Swap event.
CREATE TABLE IF NOT EXISTS price_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    token_id        BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    price           NUMERIC(38, 18) NOT NULL,   -- USDC per token
    market_cap      NUMERIC(20, 6) NOT NULL,    -- 6-dec USDC
    snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time
    ON price_snapshots(token_id, snapshot_at DESC);

CREATE INDEX IF NOT EXISTS idx_price_snapshots_token_time_asc
    ON price_snapshots(token_id, snapshot_at ASC);

-- Preserve sub-micro token-price movements. Older deployments used a scale
-- of 6, which rounded early bonding-curve trades to the same 0.000004 value.
DO $$
DECLARE
    existing_scale INTEGER;
BEGIN
    SELECT numeric_scale INTO existing_scale
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'trades'
      AND column_name = 'price';

    IF existing_scale IS NOT NULL AND existing_scale < 18 THEN
        ALTER TABLE tokens ALTER COLUMN price TYPE NUMERIC(38,18) USING price::numeric;
        ALTER TABLE trades ALTER COLUMN price TYPE NUMERIC(38,18) USING price::numeric;
        ALTER TABLE amm_swaps ALTER COLUMN price_after TYPE NUMERIC(38,18) USING price_after::numeric;
        ALTER TABLE price_snapshots ALTER COLUMN price TYPE NUMERIC(38,18) USING price::numeric;

        UPDATE trades
        SET price = ROUND(
                ((5866666700::numeric + real_usdc_after::numeric) * 1000000000000::numeric)
                / ((1466666667::numeric * 1000000000000000000::numeric) - tokens_sold_after::numeric),
                18
            ),
            market_cap_after = ROUND(
                (((5866666700::numeric + real_usdc_after::numeric) * 1000000000000::numeric)
                / ((1466666667::numeric * 1000000000000000000::numeric) - tokens_sold_after::numeric))
                * 1000000000::numeric,
                6
            );

        UPDATE tokens
        SET price = ROUND(
                ((5866666700::numeric + real_usdc::numeric) * 1000000000000::numeric)
                / ((1466666667::numeric * 1000000000000000000::numeric) - tokens_sold::numeric),
                18
            ),
            market_cap = ROUND(
                (((5866666700::numeric + real_usdc::numeric) * 1000000000000::numeric)
                / ((1466666667::numeric * 1000000000000000000::numeric) - tokens_sold::numeric))
                * 1000000000::numeric,
                6
            );
    END IF;
END $$;

-- ─── Token Holders ─────────────────────────────────────────────────────────
-- Holder balances are computed on-the-fly by the API from the trades + amm_swaps
-- tables (sum of buys minus sells per wallet). No materialized view is needed
-- for the current scale — the query is fast enough with the existing indexes
-- on trades(token_id, timestamp) and amm_swaps(token_id, timestamp).
-- If performance becomes an issue at scale, add a MATERIALIZED VIEW here and
-- refresh it on each trade event.

-- ─── Token Messages (per-token live chat) ──────────────────────────────────
-- Simple chat: one message per row, no threading. Messages are keyed to a
-- token and a wallet (poster). The frontend subscribes via WebSocket for
-- real-time updates; history is fetched via the REST API.
CREATE TABLE IF NOT EXISTS messages (
    id          BIGSERIAL PRIMARY KEY,
    token_id    BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    wallet      TEXT NOT NULL,                -- poster address (lowercase)
    content     TEXT NOT NULL,                -- max 500 chars (enforced in API)
    tx_hash     TEXT,                         -- optional: link to a buy/sell tx
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_token_created ON messages(token_id, created_at DESC);

-- ─── Favorites / Watchlist ─────────────────────────────────────────────────
-- Per-wallet favorites. Wallet is the connected user's address (lowercase).
-- No FK to users since a user can favorite before they've traded.
CREATE TABLE IF NOT EXISTS favorites (
    id          BIGSERIAL PRIMARY KEY,
    wallet      TEXT NOT NULL,                -- user address (lowercase)
    token_id    BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_favorites_wallet_token UNIQUE (wallet, token_id)
);

CREATE INDEX IF NOT EXISTS idx_favorites_wallet ON favorites(wallet, created_at DESC);

-- ─── Token Metadata (off-chain social links, website, etc.) ───────────────
-- Stored off-chain because the token contract only stores name/symbol/image.
-- Keyed by token contract address (lowercase). Only the token creator can
-- set metadata (verified via x-wallet header against the token's creator).
CREATE TABLE IF NOT EXISTS token_metadata (
    token_address   TEXT PRIMARY KEY,        -- lowercase contract address
    website         TEXT,
    twitter         TEXT,                     -- handle without @
    telegram        TEXT,                     -- group/channel URL or handle
    discord         TEXT,                     -- invite URL
    description     TEXT,                     -- longer description (optional)
    banner          TEXT,                     -- IPFS URI or URL for cover image (off-chain)
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── AI Agents ─────────────────────────────────────────────────────────────
-- Registered AI agents that can launch tokens via the API. Each agent has
-- an API key for authentication and optional spending limits.
CREATE TABLE IF NOT EXISTS agents (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        TEXT NOT NULL UNIQUE,        -- public UUID (agent identifier)
    name            TEXT NOT NULL,               -- display name
    description     TEXT,
    wallet          TEXT,                        -- optional linked wallet address
    owner_wallet    TEXT,                        -- user who deployed this agent (self-serve); null for admin-deployed
    -- Spending limits (USDC, 6-dec micro-units)
    daily_limit     BIGINT NOT NULL DEFAULT 50000000,  -- 50 USDC/day default
    monthly_limit   BIGINT NOT NULL DEFAULT 1000000000, -- 1000 USDC/month default
    -- Template config (JSON) — strategy parameters from the template this
    -- agent was deployed from. E.g. trading pairs, launch thresholds, etc.
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    -- Autonomous executor opt-in (per-agent). Global kill switch is the
    -- AGENT_EXECUTOR_ENABLED env var; both must be true to run.
    executor_enabled BOOLEAN NOT NULL DEFAULT false,
    -- Status
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agents_agent_id ON agents(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_wallet ON agents(wallet);

-- Add columns to existing agents table (idempotent — safe to re-run).
-- CREATE TABLE IF NOT EXISTS won't add new columns to an existing table.
-- Indexes on the new columns come AFTER the ALTERs so they don't fail on
-- pre-existing tables that don't yet have the columns.
ALTER TABLE agents ADD COLUMN IF NOT EXISTS config JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_wallet TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS executor_enabled BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agents_owner_wallet ON agents(owner_wallet) WHERE owner_wallet IS NOT NULL;

-- ─── Agent API Keys ────────────────────────────────────────────────────────
-- API keys for agent authentication. Keys are hashed (SHA-256) — the raw key
-- is only shown once at creation time. Multiple keys per agent are allowed
-- (e.g. for key rotation).
CREATE TABLE IF NOT EXISTS agent_api_keys (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    key_hash        TEXT NOT NULL UNIQUE,        -- SHA-256 hash of the API key
    key_prefix      TEXT NOT NULL,               -- first 8 chars for identification
    label           TEXT,                        -- optional label (e.g. "production")
    last_used_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked         BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_agent_api_keys_hash ON agent_api_keys(key_hash);

-- ─── Agent Launches ────────────────────────────────────────────────────────
-- Tracks tokens launched by agents. The platform deployer wallet submits the
-- on-chain transaction; the agent is recorded as the "creator" for attribution.
-- Note: the on-chain creator is the deployer wallet (msg.sender), but the
-- agent_id links the launch to the agent for attribution and spending tracking.
CREATE TABLE IF NOT EXISTS agent_launches (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    token_address   TEXT NOT NULL,               -- deployed MemeToken address
    curve_address   TEXT,                        -- deployed BondingCurve address
    tx_hash         TEXT NOT NULL,
    name            TEXT NOT NULL,
    symbol          TEXT NOT NULL,
    image           TEXT,
    description     TEXT,
    fee_paid        BIGINT NOT NULL DEFAULT 0,   -- 6-dec USDC creation fee
    gas_paid        BIGINT NOT NULL DEFAULT 0,   -- 18-dec native USDC gas cost
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_launches_agent ON agent_launches(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_launches_token ON agent_launches(token_address);

-- ─── Agent Trades ──────────────────────────────────────────────────────────
-- Tracks buys/sells executed by agents via the deployer wallet. The main
-- `trades` table is populated by the indexer from on-chain events; this table
-- provides attribution linking the on-chain trade to the agent that initiated it.
CREATE TABLE IF NOT EXISTS agent_trades (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    token_address   TEXT NOT NULL,               -- token being traded
    curve_address   TEXT,                        -- bonding curve address
    tx_hash         TEXT NOT NULL,
    type            TEXT NOT NULL CHECK (type IN ('buy', 'sell')),
    usdc_amount     BIGINT NOT NULL DEFAULT 0,   -- 6-dec USDC spent (buy) or received (sell)
    token_amount    NUMERIC(40,0) NOT NULL DEFAULT 0,  -- 18-dec tokens received (buy) or sold (sell)
    gas_paid        NUMERIC(40,0) NOT NULL DEFAULT 0,  -- 18-dec native USDC gas cost
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'failed')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_trades_agent ON agent_trades(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_trades_token ON agent_trades(token_address);

-- Atomic spending reservations for platform-funded agent actions. A reservation
-- is created while the agent row is locked, before the on-chain transaction is
-- submitted. Pending reservations count against limits so concurrent requests
-- cannot all spend the same remaining allowance. Reservations are finalized in
-- the same database transaction that records the confirmed launch/trade.
CREATE TABLE IF NOT EXISTS agent_spend_reservations (
    reservation_id  UUID PRIMARY KEY,
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    operation       TEXT NOT NULL CHECK (operation IN ('launch', 'buy')),
    amount          BIGINT NOT NULL CHECK (amount > 0),
    status          TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending', 'confirmed', 'released')),
    tx_hash         TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_agent_spend_reservations_active
    ON agent_spend_reservations(agent_id, created_at)
    WHERE status = 'pending';
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_spend_reservations_tx_hash
    ON agent_spend_reservations(tx_hash)
    WHERE tx_hash IS NOT NULL;

-- ─── Agent Executor State ───────────────────────────────────────────────────
-- Cooldown tracking for the autonomous agent executor. One row per
-- (agent, action). The executor reads last_run_at to respect per-strategy
-- intervals (e.g. 1 launch/day, 1 buy/hr) and updates it after each attempt.
CREATE TABLE IF NOT EXISTS agent_executor_state (
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    action          TEXT NOT NULL CHECK (action IN ('launch', 'buy', 'sell', 'post')),
    last_run_at     TIMESTAMPTZ,
    last_tx_hash    TEXT,
    run_count       INTEGER NOT NULL DEFAULT 0,
    fail_count      INTEGER NOT NULL DEFAULT 0,
    last_error      TEXT,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (agent_id, action)
);

-- ─── Agent Templates ───────────────────────────────────────────────────────
-- Pre-built agent strategies that users can deploy from the marketplace.
-- Each template has a default config (JSON) that gets applied to the new agent.
CREATE TABLE IF NOT EXISTS agent_templates (
    id              BIGSERIAL PRIMARY KEY,
    name            TEXT NOT NULL,
    description     TEXT,
    category        TEXT NOT NULL DEFAULT 'general'
                        CHECK (category IN ('general', 'trend', 'trader', 'community', 'custom')),
    config          JSONB NOT NULL DEFAULT '{}'::jsonb,
    creator_wallet  TEXT,
    daily_limit     BIGINT NOT NULL DEFAULT 50000000,   -- 50 USDC default
    monthly_limit   BIGINT NOT NULL DEFAULT 1000000000, -- 1000 USDC default
    deploy_count    INTEGER NOT NULL DEFAULT 0,
    active          BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_templates_category ON agent_templates(category, active);
CREATE INDEX IF NOT EXISTS idx_agent_templates_deploy ON agent_templates(deploy_count DESC);

-- ─── Agent Tips ─────────────────────────────────────────────────────────────
-- USDC tips sent by users to agents. The API verifies the user's on-chain
-- transfer before recording it; only verified rows affect public statistics.
CREATE TABLE IF NOT EXISTS agent_tips (
    id              BIGSERIAL PRIMARY KEY,
    agent_id        BIGINT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    from_wallet     TEXT NOT NULL,
    amount          BIGINT NOT NULL,                     -- 6-dec USDC
    tx_hash         TEXT,                                -- on-chain tx hash (if applicable)
    message         TEXT,
    verified        BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Prevent tip replay: one tip per tx_hash globally (a single on-chain
    -- transfer must not be double-counted as tips to multiple agents that
    -- share the same recipient wallet, e.g. the deployer wallet).
    CONSTRAINT uq_agent_tips_tx_hash UNIQUE (tx_hash)
);

CREATE INDEX IF NOT EXISTS idx_agent_tips_agent ON agent_tips(agent_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_tips_from ON agent_tips(from_wallet, created_at DESC);
ALTER TABLE agent_tips ADD COLUMN IF NOT EXISTS verified BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS idx_agent_tips_verified
    ON agent_tips(agent_id, created_at DESC) WHERE verified = true;

-- Ensure UNIQUE constraint exists even if table was created before this constraint
-- was added to the CREATE TABLE statement (idempotent migration).
-- Also handles migration from the old (agent_id, tx_hash) constraint to the
-- new (tx_hash) only constraint: drops the old one if it exists.
DO $$
BEGIN
    -- Drop old per-agent constraint if it exists (migration from v1)
    IF EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_agent_tips_tx_hash'
        AND conrelid = 'agent_tips'::regclass
        AND array_to_string(conkey, ',') != (SELECT array_to_string(ARRAY(SELECT attnum FROM pg_attribute WHERE attrelid = 'agent_tips'::regclass AND attname = 'tx_hash'), ','))
    ) THEN
        ALTER TABLE agent_tips DROP CONSTRAINT uq_agent_tips_tx_hash;
    END IF;

    -- Add the new global tx_hash UNIQUE constraint if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'uq_agent_tips_tx_hash'
        AND conrelid = 'agent_tips'::regclass
    ) THEN
        ALTER TABLE agent_tips ADD CONSTRAINT uq_agent_tips_tx_hash UNIQUE (tx_hash);
    END IF;
END $$;

-- ─── Referrals ─────────────────────────────────────────────────────────────
-- Tracks wallet-to-wallet referral attribution for revenue sharing.
-- A wallet that arrives via ?ref=<wallet> is attributed to that referrer.
-- When the referred wallet trades, a % of the trading fee is credited to
-- the referrer as a reward (off-chain accounting; USDC payout is v2).
CREATE TABLE IF NOT EXISTS referrals (
    id              BIGSERIAL PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,                -- lowercase address (who shared the link)
    referred_wallet TEXT NOT NULL UNIQUE,         -- lowercase address (who clicked it)
    attributed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trade_count     INTEGER NOT NULL DEFAULT 0,
    total_volume_usdc BIGINT NOT NULL DEFAULT 0,  -- 6-dec, lifetime volume from referred
    reward_earned_usdc BIGINT NOT NULL DEFAULT 0, -- 6-dec, accrued referral reward
    first_token_address TEXT,
    CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_wallet)
        REFERENCES users(wallet) ON DELETE RESTRICT,
    CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_wallet)
        REFERENCES users(wallet) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_wallet);

-- Derived weighted-average position ledger. Canonical trades/swaps remain the
-- rebuild source; these rows make profile and feed reads bounded and consistent.
CREATE TABLE IF NOT EXISTS wallet_token_positions (
    wallet                       TEXT NOT NULL,
    token_id                     BIGINT NOT NULL REFERENCES tokens(id) ON DELETE CASCADE,
    quantity_base_units          NUMERIC(40, 0) NOT NULL DEFAULT 0 CHECK (quantity_base_units >= 0),
    remaining_cost_usdc          BIGINT NOT NULL DEFAULT 0 CHECK (remaining_cost_usdc >= 0),
    cost_of_tokens_sold_usdc     BIGINT NOT NULL DEFAULT 0 CHECK (cost_of_tokens_sold_usdc >= 0),
    net_sale_proceeds_usdc       BIGINT NOT NULL DEFAULT 0 CHECK (net_sale_proceeds_usdc >= 0),
    realized_pnl_usdc            BIGINT NOT NULL DEFAULT 0,
    total_bought_usdc            BIGINT NOT NULL DEFAULT 0 CHECK (total_bought_usdc >= 0),
    total_sold_usdc              BIGINT NOT NULL DEFAULT 0 CHECK (total_sold_usdc >= 0),
    buy_count                    INTEGER NOT NULL DEFAULT 0 CHECK (buy_count >= 0),
    sell_count                   INTEGER NOT NULL DEFAULT 0 CHECK (sell_count >= 0),
    basis_status                 TEXT NOT NULL DEFAULT 'complete'
                                     CHECK (basis_status IN ('complete', 'incomplete')),
    opened_at                    TIMESTAMPTZ,
    closed_at                    TIMESTAMPTZ,
    last_activity_at             TIMESTAMPTZ NOT NULL,
    calculated_through_trade_id  BIGINT REFERENCES trades(id) ON DELETE SET NULL,
    calculated_through_swap_id   BIGINT REFERENCES amm_swaps(id) ON DELETE SET NULL,
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (wallet, token_id)
);

CREATE INDEX IF NOT EXISTS idx_wallet_positions_token
    ON wallet_token_positions(token_id);
CREATE INDEX IF NOT EXISTS idx_wallet_positions_open
    ON wallet_token_positions(wallet, last_activity_at DESC)
    WHERE quantity_base_units > 0;
CREATE INDEX IF NOT EXISTS idx_wallet_positions_closed
    ON wallet_token_positions(wallet, last_activity_at DESC)
    WHERE quantity_base_units = 0 AND buy_count + sell_count > 0;

-- Cached Orba-only wallet metrics. Values are integer micro-USDC; public copy
-- must not imply that this represents a wallet's total assets across Arc.
CREATE TABLE IF NOT EXISTS wallet_stats (
    wallet                    TEXT PRIMARY KEY,
    tier                      TEXT NOT NULL DEFAULT 'shrimp'
                                  CHECK (tier IN ('shrimp', 'fish', 'dolphin', 'whale')),
    portfolio_value_usdc      BIGINT NOT NULL DEFAULT 0,
    realized_pnl_usdc         BIGINT NOT NULL DEFAULT 0,
    unrealized_pnl_usdc       BIGINT NOT NULL DEFAULT 0,
    volume_7d_usdc            BIGINT NOT NULL DEFAULT 0,
    volume_30d_usdc           BIGINT NOT NULL DEFAULT 0,
    lifetime_volume_usdc      BIGINT NOT NULL DEFAULT 0,
    largest_trade_usdc        BIGINT NOT NULL DEFAULT 0,
    buy_count                 INTEGER NOT NULL DEFAULT 0,
    sell_count                INTEGER NOT NULL DEFAULT 0,
    distinct_tokens_traded    INTEGER NOT NULL DEFAULT 0,
    open_positions            INTEGER NOT NULL DEFAULT 0,
    closed_positions          INTEGER NOT NULL DEFAULT 0,
    profitable_positions      INTEGER NOT NULL DEFAULT 0,
    suspicious_activity       BOOLEAN NOT NULL DEFAULT FALSE,
    first_seen_at             TIMESTAMPTZ,
    last_active_at            TIMESTAMPTZ,
    calculated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wallet_stats_tier_value
    ON wallet_stats(tier, portfolio_value_usdc DESC);

-- Apply RLS as part of the normal migration path, including every table added
-- in future schema revisions. The API runtime role should have explicit direct
-- SQL privileges; public PostgREST access receives no permissive policies.
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN
        SELECT tablename FROM pg_tables WHERE schemaname = 'public'
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_record.tablename);
    END LOOP;
END $$;
