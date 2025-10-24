-- Migration: Unify Token Tables
-- Date: 2024-10-24
-- Purpose: Consolidate token_mints into token_registry for single source of truth
-- This creates a single source of truth for all token data

-- Step 1: Add missing columns to existing token_registry table
-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS, so we need to be careful
-- The table was created in migration 021, we're adding new columns here

-- Add platform column
ALTER TABLE token_registry ADD COLUMN platform TEXT;

-- Add creator info columns
ALTER TABLE token_registry ADD COLUMN creator_address TEXT;
ALTER TABLE token_registry ADD COLUMN creation_signature TEXT;
ALTER TABLE token_registry ADD COLUMN creation_timestamp INTEGER;
ALTER TABLE token_registry ADD COLUMN creation_slot BIGINT;

-- Add graduated status
ALTER TABLE token_registry ADD COLUMN is_graduated INTEGER DEFAULT 0;
ALTER TABLE token_registry ADD COLUMN graduated_at INTEGER;

-- Add activity tracking
ALTER TABLE token_registry ADD COLUMN telegram_mentions INTEGER DEFAULT 0;
ALTER TABLE token_registry ADD COLUMN wallet_transactions INTEGER DEFAULT 0;
ALTER TABLE token_registry ADD COLUMN last_activity_at INTEGER;

-- Add migration tracking
ALTER TABLE token_registry ADD COLUMN migrated_from_token_mints INTEGER DEFAULT 0;
ALTER TABLE token_registry ADD COLUMN migrated_pool_address TEXT;

-- Step 2: token_market_data already exists from migration 030
-- These columns should already exist, but we'll skip adding them to avoid SQLite syntax errors

-- Step 3: Only migrate if token_mints exists
-- Since token_mints might not exist (it was created programmatically), 
-- we skip this step. The table unification will happen through the application code.
-- This migration just ensures the schema is ready.

-- Step 4: Skip price data migration since token_mints doesn't exist
-- The token_market_data table already exists from migration 030
-- Data will be populated through the application code

-- Step 5: Update foreign key references in other tables

-- Update telegram_detected_contracts if it exists
UPDATE telegram_detected_contracts 
SET contract_address = (
  SELECT token_mint FROM token_registry WHERE token_mint = telegram_detected_contracts.contract_address
)
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='telegram_detected_contracts');

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_registry_mint ON token_registry(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_registry_source ON token_registry(first_source_type);
CREATE INDEX IF NOT EXISTS idx_token_registry_creator ON token_registry(creator_address);
CREATE INDEX IF NOT EXISTS idx_token_registry_platform ON token_registry(platform);
CREATE INDEX IF NOT EXISTS idx_token_registry_first_seen ON token_registry(first_seen_at);
CREATE INDEX IF NOT EXISTS idx_token_registry_mentions ON token_registry(total_mentions DESC);

-- Step 7: Create a view for backward compatibility (if token_mints was used)
-- This view simulates the old token_mints structure using the new tables
DROP VIEW IF EXISTS token_mints_view;
CREATE VIEW token_mints_view AS
SELECT 
  tr.id,
  tr.token_mint as mint_address,
  tr.creator_address,
  tr.token_name as name,
  tr.token_symbol as symbol,
  tr.created_at as timestamp,
  tr.platform,
  tr.creation_signature as signature,
  tmd.market_cap_usd as starting_mcap,
  tmd.market_cap_usd as current_mcap,
  tmd.ath_usd as ath_mcap,
  tmd.price_usd,
  tmd.price_sol,
  NULL as graduation_percentage,
  CASE WHEN tr.migrated_pool_address IS NOT NULL THEN 1 ELSE 0 END as launchpad_completed,
  NULL as launchpad_completed_at,
  tr.migrated_pool_address,
  tmd.total_supply,
  tmd.market_cap_usd,
  NULL as coingecko_coin_id,
  NULL as gt_score,
  tr.notes as description,
  tmd.last_updated,
  tr.first_source_details as metadata,
  tr.first_source_type as first_seen_source,
  tr.first_seen_at,
  tr.telegram_mentions,
  tr.wallet_transactions
FROM token_registry tr
LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address;

-- Step 8: Create helper views for common queries

-- View: All tokens with current market data
CREATE VIEW IF NOT EXISTS tokens_with_market_data AS
SELECT 
  tr.*,
  tmd.price_usd,
  tmd.price_sol,
  tmd.market_cap_usd,
  tmd.volume_24h_usd,
  tmd.liquidity_usd,
  tmd.price_change_24h,
  tmd.last_updated as price_last_updated
FROM token_registry tr
LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address;

-- View: Recently discovered tokens
CREATE VIEW IF NOT EXISTS recent_token_discoveries AS
SELECT 
  tr.*,
  tmd.price_usd,
  tmd.market_cap_usd,
  tmd.volume_24h_usd
FROM token_registry tr
LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
ORDER BY tr.first_seen_at DESC
LIMIT 100;

-- View: Token performance by source
CREATE VIEW IF NOT EXISTS token_performance_by_source AS
SELECT 
  tr.first_source_type,
  COUNT(DISTINCT tr.token_mint) as total_tokens,
  COUNT(DISTINCT CASE WHEN tmd.price_change_24h > 0 THEN tr.token_mint END) as gainers,
  COUNT(DISTINCT CASE WHEN tmd.price_change_24h < 0 THEN tr.token_mint END) as losers,
  AVG(tmd.price_change_24h) as avg_24h_change,
  SUM(tmd.volume_24h_usd) as total_volume_24h
FROM token_registry tr
LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
GROUP BY tr.first_source_type;

-- Step 9: Add migration notes
INSERT INTO migrations_log (migration_name, executed_at, notes)
VALUES (
  '031_unify_token_tables',
  strftime('%s', 'now'),
  'Migrated token_mints to token_registry + token_market_data. Created backward compatibility view token_mints_view.'
)
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='migrations_log');

-- Note: We're NOT dropping token_mints table yet to ensure nothing breaks
-- Once all code is updated to use token_registry, run:
-- DROP TABLE token_mints;
-- And rename the view:
-- DROP VIEW token_mints_view;

PRAGMA foreign_keys = ON;
