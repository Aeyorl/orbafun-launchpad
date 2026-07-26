-- Agent executor + user self-serve deploy.
--
-- (1) owner_wallet on agents — the user who deployed the agent from a
--     template via the self-serve endpoint. Null for admin-deployed agents.
--     Used to gate management endpoints (list/toggle executor) to the owner.
--
-- (2) executor_enabled on agents — per-agent opt-in to the autonomous
--     executor. Default false. The global kill switch (AGENT_EXECUTOR_ENABLED
--     env) must ALSO be true for the executor to run; both must be on.
--
-- (3) agent_executor_state — cooldown tracking per agent per action so the
--     executor respects per-strategy intervals (e.g. 1 launch/day, 1 buy/hr).

-- (1) + (2): add columns to existing agents table (idempotent).
ALTER TABLE agents ADD COLUMN IF NOT EXISTS owner_wallet TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS executor_enabled BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agents_owner_wallet ON agents(owner_wallet) WHERE owner_wallet IS NOT NULL;


-- (3): executor cooldown state.
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
