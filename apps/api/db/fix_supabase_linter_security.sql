-- Migration to resolve Supabase Database Linter Security Warnings/Errors
-- 1. Enable Row Level Security (RLS) on all public tables
-- 2. Lock down search_path on custom functions
-- 3. Move pg_trgm extension out of public schema (optional/recommended)

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Enable Row Level Security (RLS) on all public tables
-- Note: Your NestJS backend connects directly via node-postgres (as postgres / superuser / service role)
-- which bypasses RLS automatically. Enabling RLS without adding public policies blocks unauthorized
-- PostgREST HTTP access from external callers while keeping your NestJS backend functioning 100%.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.graduations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.amm_swaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.indexer_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.indexer_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.token_metadata ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_launches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_tips ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.agent_executor_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.price_snapshots ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Secure function search_path parameters
-- Explicitly setting search_path prevents search path hijacking attacks.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_user_volume()
RETURNS TRIGGER
SET search_path = public
AS $$
BEGIN
    INSERT INTO users (wallet, total_volume_usdc)
    VALUES (NEW.wallet, NEW.usdc_amount)
    ON CONFLICT (wallet) DO UPDATE
    SET total_volume_usdc = users.total_volume_usdc + NEW.usdc_amount;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.refresh_volume_24h()
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

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Move pg_trgm extension out of public schema to extensions schema
-- ─────────────────────────────────────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS extensions;
ALTER EXTENSION pg_trgm SET SCHEMA extensions;
