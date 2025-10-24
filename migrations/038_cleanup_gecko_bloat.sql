-- Migration: Cleanup gecko_token_data bloat
-- Date: 2024-10-24
-- Purpose: Convert gecko_token_data from time-series to single-row-per-token
-- Reduces 700K+ rows/day to ~500 rows total

-- Step 1: Create new table with latest data only (single row per token)
CREATE TABLE IF NOT EXISTS gecko_token_latest (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL UNIQUE,  -- UNIQUE ensures one row per token
  
  -- Basic token info
  symbol TEXT,
  name TEXT,
  decimals INTEGER,
  image_url TEXT,
  coingecko_coin_id TEXT,
  
  -- Supply metrics
  total_supply TEXT,
  normalized_total_supply TEXT,
  circulating_supply TEXT,
  
  -- Current prices & Market Cap
  price_usd REAL,
  price_sol REAL,
  price_native REAL,
  market_cap_usd REAL,
  fdv_usd REAL,
  total_reserve_in_usd REAL,
  
  -- Volume (24h breakdown)
  volume_24h_usd REAL,
  volume_6h_usd REAL,
  volume_1h_usd REAL,
  volume_30m_usd REAL,
  
  -- Price changes
  price_change_24h REAL,
  price_change_6h REAL,
  price_change_1h REAL,
  price_change_30m REAL,
  price_change_15m REAL,
  price_change_5m REAL,
  
  -- ATH tracking (calculate once, store directly)
  ath_price_usd REAL,
  ath_market_cap_usd REAL,
  ath_date INTEGER,
  
  -- Launchpad details (for graduated tokens)
  launchpad_graduation_percentage INTEGER,
  launchpad_completed INTEGER DEFAULT 0,
  launchpad_completed_at INTEGER,
  launchpad_migrated_pool_address TEXT,
  
  -- Metadata
  top_pool_address TEXT,
  network_id TEXT DEFAULT 'solana',
  data_source TEXT DEFAULT 'geckoterminal',
  
  -- Single timestamp (not time-series anymore)
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

-- Step 2: Populate with latest data from existing table
INSERT INTO gecko_token_latest (
  mint_address,
  symbol,
  name,
  decimals,
  image_url,
  coingecko_coin_id,
  total_supply,
  normalized_total_supply,
  circulating_supply,
  price_usd,
  price_sol,
  price_native,
  market_cap_usd,
  fdv_usd,
  total_reserve_in_usd,
  volume_24h_usd,
  volume_6h_usd,
  volume_1h_usd,
  volume_30m_usd,
  price_change_24h,
  price_change_6h,
  price_change_1h,
  price_change_30m,
  price_change_15m,
  price_change_5m,
  ath_price_usd,
  ath_market_cap_usd,
  ath_date,
  launchpad_graduation_percentage,
  launchpad_completed,
  launchpad_completed_at,
  launchpad_migrated_pool_address,
  top_pool_address,
  network_id,
  data_source,
  last_updated,
  created_at
)
SELECT 
  gtd.mint_address,
  gtd.symbol,
  gtd.name,
  gtd.decimals,
  gtd.image_url,
  gtd.coingecko_coin_id,
  gtd.total_supply,
  gtd.normalized_total_supply,
  gtd.circulating_supply,
  gtd.price_usd,
  gtd.price_sol,
  gtd.price_native,
  gtd.market_cap_usd,
  gtd.fdv_usd,
  gtd.total_reserve_in_usd,
  gtd.volume_24h_usd,
  gtd.volume_6h_usd,
  gtd.volume_1h_usd,
  gtd.volume_30m_usd,
  gtd.price_change_24h,
  gtd.price_change_6h,
  gtd.price_change_1h,
  gtd.price_change_30m,
  gtd.price_change_15m,
  gtd.price_change_5m,
  -- Calculate ATH from historical data
  (SELECT MAX(price_usd) FROM gecko_token_data WHERE mint_address = gtd.mint_address) as ath_price_usd,
  (SELECT MAX(market_cap_usd) FROM gecko_token_data WHERE mint_address = gtd.mint_address) as ath_market_cap_usd,
  (SELECT fetched_at FROM gecko_token_data WHERE mint_address = gtd.mint_address AND price_usd = (SELECT MAX(price_usd) FROM gecko_token_data WHERE mint_address = gtd.mint_address) LIMIT 1) as ath_date,
  gtd.launchpad_graduation_percentage,
  gtd.launchpad_completed,
  gtd.launchpad_completed_at,
  gtd.launchpad_migrated_pool_address,
  gtd.top_pool_address,
  gtd.network_id,
  gtd.data_source,
  gtd.fetched_at as last_updated,
  MIN(gtd.created_at) as created_at
FROM gecko_token_data gtd
WHERE gtd.fetched_at = (
  SELECT MAX(fetched_at) 
  FROM gecko_token_data 
  WHERE mint_address = gtd.mint_address
)
GROUP BY gtd.mint_address;

-- Step 3: Optional - Keep last 24 hours of history in separate table
CREATE TABLE IF NOT EXISTS gecko_token_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  price_usd REAL,
  market_cap_usd REAL,
  volume_24h_usd REAL,
  price_change_24h REAL,
  fetched_at INTEGER,
  
  -- Index for fast lookups
  FOREIGN KEY (mint_address) REFERENCES gecko_token_latest(mint_address) ON DELETE CASCADE
);

CREATE INDEX idx_gecko_history_mint_time ON gecko_token_history(mint_address, fetched_at DESC);

-- Optionally preserve recent history (last 24 hours only)
INSERT INTO gecko_token_history (mint_address, price_usd, market_cap_usd, volume_24h_usd, price_change_24h, fetched_at)
SELECT mint_address, price_usd, market_cap_usd, volume_24h_usd, price_change_24h, fetched_at
FROM gecko_token_data
WHERE fetched_at > strftime('%s', 'now') - 86400;  -- Last 24 hours only

-- Step 4: Drop the bloated original table
DROP TABLE IF EXISTS gecko_token_data;

-- Step 5: Rename new table to original name
ALTER TABLE gecko_token_latest RENAME TO gecko_token_data;

-- Step 6: Create indexes for performance
CREATE INDEX idx_gecko_token_price ON gecko_token_data(price_usd DESC);
CREATE INDEX idx_gecko_token_mcap ON gecko_token_data(market_cap_usd DESC);
CREATE INDEX idx_gecko_token_volume ON gecko_token_data(volume_24h_usd DESC);
CREATE INDEX idx_gecko_token_updated ON gecko_token_data(last_updated DESC);

-- Step 7: Update the VIEW to use new structure
DROP VIEW IF EXISTS token_market_data;

CREATE VIEW token_market_data AS
SELECT 
  gtd.mint_address,
  gtd.symbol as token_symbol,
  gtd.name as token_name,
  gtd.price_usd,
  gtd.price_sol,
  gtd.price_change_24h,
  gtd.volume_24h_usd,
  gtd.market_cap_usd,
  gtd.total_reserve_in_usd as liquidity_usd,
  gtd.fdv_usd,
  gtd.ath_price_usd,
  gtd.ath_market_cap_usd,
  gtd.price_change_6h,
  gtd.price_change_1h,
  gtd.price_change_30m,
  gtd.volume_6h_usd,
  gtd.volume_1h_usd,
  gtd.volume_30m_usd,
  gtd.data_source,
  gtd.last_updated * 1000 as last_updated,  -- Convert to milliseconds
  1.0 as confidence_score
FROM gecko_token_data gtd;

-- Done! Database is now ~1000x smaller and queries are instant
