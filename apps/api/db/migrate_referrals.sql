-- Referral links — track wallet-to-wallet attribution for revenue sharing.
-- A wallet that arrives via ?ref=<wallet> is attributed to that referrer.
-- When the referred wallet trades, a % of the trading fee is credited to
-- the referrer as a reward. This is off-chain attribution + accounting;
-- the actual USDC payout is a future feature (v2) — for now we track
-- volume and accrued rewards so the leaderboard can show top referrers.

CREATE TABLE IF NOT EXISTS referrals (
    id              BIGSERIAL PRIMARY KEY,
    referrer_wallet TEXT NOT NULL,                -- lowercase address (who shared the link)
    referred_wallet TEXT NOT NULL UNIQUE,         -- lowercase address (who clicked it)
    attributed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Updated by the indexer on each trade by the referred wallet
    trade_count     INTEGER NOT NULL DEFAULT 0,
    total_volume_usdc BIGINT NOT NULL DEFAULT 0,  -- 6-dec, lifetime volume from referred
    reward_earned_usdc BIGINT NOT NULL DEFAULT 0, -- 6-dec, accrued referral reward
    -- First token the referred wallet traded (for display)
    first_token_address TEXT,
    CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_wallet)
        REFERENCES users(wallet) ON DELETE RESTRICT,
    CONSTRAINT fk_referrals_referred FOREIGN KEY (referred_wallet)
        REFERENCES users(wallet) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_wallet);
CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_wallet);
