-- Migration: Unify Token Tables
-- Date: 2024-10-23
-- Purpose: Consolidate token_mints into token_registry + token_market_data
-- This creates a single source of truth for all token data

-- Step 1: Ensure token_registry exists with all needed columns
CREATE TABLE IF NOT EXISTS token_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL UNIQUE,
  
  -- Basic token info
  token_symbol TEXT,
  token_name TEXT,
  token_decimals INTEGER DEFAULT 9,
  
  -- Discovery/source info
  first_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  first_source_type TEXT NOT NULL DEFAULT 'unknown', -- 'telegram', 'wallet_monitor', 'manual', 'dex_scan', 'import'
  first_source_details TEXT, -- JSON with source-specific details
  
  -- Creator/platform info (from token_mints)
  creator_address TEXT,
  platform TEXT DEFAULT 'unknown', -- 'pumpfun', 'raydium', 'orca', etc
  creation_signature TEXT,
  
  -- Telegram-specific (if source is telegram)
  telegram_chat_id TEXT,
  telegram_chat_name TEXT,
  telegram_message_id INTEGER,
  telegram_sender TEXT,
  
  -- User attribution
  discovered_by_user_id INTEGER,
  
  -- Metadata
  is_verified INTEGER DEFAULT 0,
  is_scam INTEGER DEFAULT 0,
  tags TEXT, -- JSON array of tags
  notes TEXT,
  
  -- Stats
  total_mentions INTEGER DEFAULT 0,
  telegram_mentions INTEGER DEFAULT 0,
  wallet_transactions INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  first_trade_at INTEGER,
  
  -- Migration tracking
  migrated_from_token_mints INTEGER DEFAULT 0,
  migrated_pool_address TEXT, -- For graduated tokens
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (discovered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Step 2: token_market_data already exists from migration 030
-- These columns should already exist, but we'll skip adding them to avoid SQLite syntax errors

-- Step 3: Migrate all token_mints data to token_registry
INSERT OR IGNORE INTO token_registry (
  token_mint,
  token_symbol,
  token_name,
  token_decimals,
  first_seen_at,
  first_source_type,
  creator_address,
  platform,
  creation_signature,
  telegram_mentions,
  wallet_transactions,
  migrated_from_token_mints,
  migrated_pool_address,
  created_at,
  updated_at
)
SELECT 
  mint_address as token_mint,
  symbol as token_symbol,
  name as token_name,
  9 as token_decimals, -- Default for Solana tokens
  COALESCE(first_seen_at, timestamp, strftime('%s', 'now')) as first_seen_at,
  COALESCE(first_seen_source, 'wallet_monitor') as first_source_type,
  creator_address,
  COALESCE(platform, 'pumpfun') as platform,
  signature as creation_signature,
  COALESCE(telegram_mentions, 0) as telegram_mentions,
  COALESCE(wallet_transactions, 0) as wallet_transactions,
  1 as migrated_from_token_mints,
  migrated_pool_address,
  timestamp as created_at,
  COALESCE(last_updated, strftime('%s', 'now')) as updated_at
FROM token_mints
WHERE mint_address NOT IN (SELECT token_mint FROM token_registry);

-- Step 4: Migrate price data from token_mints to token_market_data
INSERT OR REPLACE INTO token_market_data (
  mint_address,
  symbol,
  name,
  price_usd,
  price_sol,
  market_cap_usd,
  fdv,
  total_supply,
  platform,
  last_updated,
  data_source
)
SELECT 
  tm.mint_address,
  tm.symbol,
  tm.name,
  tm.price_usd,
  tm.price_sol,
  COALESCE(tm.current_mcap, tm.market_cap_usd) as market_cap_usd,
  COALESCE(tm.current_mcap, tm.market_cap_usd) as fdv, -- Use mcap as FDV for now
  tm.total_supply,
  COALESCE(tm.platform, 'pumpfun') as platform,
  COALESCE(tm.last_updated, strftime('%s', 'now') * 1000) as last_updated,
  'migrated_from_token_mints' as data_source
FROM token_mints tm
WHERE tm.mint_address IS NOT NULL
  AND (tm.price_usd IS NOT NULL OR tm.current_mcap IS NOT NULL);

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

-- Step 7: Create a view for backward compatibility (maps old token_mints structure)
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
