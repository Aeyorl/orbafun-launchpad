-- Token banner image — optional cover image for a token, stored off-chain.
-- The on-chain TokenFactory.createToken() only accepts a single `image` field
-- (used as the token's pfp/avatar). The banner is a separate wide cover image
-- shown at the top of the coin page. Stored in token_metadata alongside the
-- existing social links. Only the token creator can set it (verified via
-- x-wallet header against the token's creator_wallet).

ALTER TABLE token_metadata
    ADD COLUMN IF NOT EXISTS banner TEXT;
