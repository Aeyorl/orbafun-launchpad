-- Migrate 18-decimal token amount columns from BIGINT to NUMERIC
-- (BigInt max is ~9.2e18, but 18-dec token amounts can be up to 1e27)

ALTER TABLE tokens ALTER COLUMN tokens_sold TYPE NUMERIC(40, 0);
ALTER TABLE tokens ALTER COLUMN lp_burned TYPE NUMERIC(40, 0);

ALTER TABLE trades ALTER COLUMN token_amount TYPE NUMERIC(40, 0);
ALTER TABLE trades ALTER COLUMN tokens_sold_after TYPE NUMERIC(40, 0);

ALTER TABLE graduations ALTER COLUMN lp_tokens TYPE NUMERIC(40, 0);
ALTER TABLE graduations ALTER COLUMN lp_burned TYPE NUMERIC(40, 0);

ALTER TABLE amm_swaps ALTER COLUMN token_in TYPE NUMERIC(40, 0);
ALTER TABLE amm_swaps ALTER COLUMN token_out TYPE NUMERIC(40, 0);
