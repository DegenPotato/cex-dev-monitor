-- Migration: Comprehensive GeckoTerminal Data Capture
-- Date: 2024-10-24
-- Purpose: Capture ALL data from GeckoTerminal token/pool responses
-- This ensures we don't miss any valuable metrics

-- Enhanced token market data with all GeckoTerminal fields
CREATE TABLE IF NOT EXISTS gecko_token_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  
  -- Basic token info
  symbol TEXT,
  name TEXT,
  decimals INTEGER,
  image_url TEXT,
  coingecko_coin_id TEXT,
  
  -- Supply metrics
  total_supply TEXT,                    -- Raw total supply
  normalized_total_supply TEXT,         -- Human-readable supply
  circulating_supply TEXT,
  
  -- Price & Market Cap
  price_usd REAL,
  price_sol REAL,
  price_native REAL,
  market_cap_usd REAL,
  fdv_usd REAL,                        -- Fully Diluted Valuation
  total_reserve_in_usd REAL,           -- Liquidity across all pools
  
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
  
  -- Launchpad details (for graduated tokens)
  launchpad_graduation_percentage INTEGER,
  launchpad_completed INTEGER DEFAULT 0,
  launchpad_completed_at INTEGER,
  launchpad_migrated_pool_address TEXT,
  
  -- Metadata
  top_pool_address TEXT,                -- Main trading pool
  network_id TEXT DEFAULT 'solana',
  data_source TEXT DEFAULT 'geckoterminal',
  raw_response TEXT,                    -- Full JSON response
  
  -- Timestamps
  fetched_at INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  -- Indexes for lookups
  UNIQUE(mint_address, fetched_at)
);

-- Pool data from GeckoTerminal
CREATE TABLE IF NOT EXISTS gecko_pool_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_address TEXT NOT NULL,
  
  -- Pool identification
  name TEXT,                            -- e.g., "HELLOINU / SOL"
  base_token_address TEXT,
  quote_token_address TEXT,
  dex_id TEXT,                         -- e.g., "raydium", "pumpswap"
  network_id TEXT DEFAULT 'solana',
  
  -- Prices
  base_token_price_usd TEXT,           -- High precision string
  base_token_price_native TEXT,
  quote_token_price_usd TEXT,
  quote_token_price_native TEXT,
  base_token_price_quote_token TEXT,
  quote_token_price_base_token TEXT,
  
  -- Market metrics
  fdv_usd REAL,
  market_cap_usd REAL,
  reserve_in_usd REAL,                 -- Pool liquidity
  
  -- Price changes (all timeframes)
  price_change_5m REAL,
  price_change_15m REAL,
  price_change_30m REAL,
  price_change_1h REAL,
  price_change_6h REAL,
  price_change_24h REAL,
  
  -- Transaction metrics (24h)
  txns_24h_buys INTEGER,
  txns_24h_sells INTEGER,
  txns_24h_buyers INTEGER,
  txns_24h_sellers INTEGER,
  
  -- Transaction metrics (6h)
  txns_6h_buys INTEGER,
  txns_6h_sells INTEGER,
  txns_6h_buyers INTEGER,
  txns_6h_sellers INTEGER,
  
  -- Transaction metrics (1h)
  txns_1h_buys INTEGER,
  txns_1h_sells INTEGER,
  txns_1h_buyers INTEGER,
  txns_1h_sellers INTEGER,
  
  -- Transaction metrics (30m)
  txns_30m_buys INTEGER,
  txns_30m_sells INTEGER,
  txns_30m_buyers INTEGER,
  txns_30m_sellers INTEGER,
  
  -- Transaction metrics (15m)
  txns_15m_buys INTEGER,
  txns_15m_sells INTEGER,
  txns_15m_buyers INTEGER,
  txns_15m_sellers INTEGER,
  
  -- Transaction metrics (5m)
  txns_5m_buys INTEGER,
  txns_5m_sells INTEGER,
  txns_5m_buyers INTEGER,
  txns_5m_sellers INTEGER,
  
  -- Volume by timeframe
  volume_24h_usd REAL,
  volume_6h_usd REAL,
  volume_1h_usd REAL,
  volume_30m_usd REAL,
  volume_15m_usd REAL,
  volume_5m_usd REAL,
  
  -- Pool metadata
  pool_created_at INTEGER,
  raw_response TEXT,                   -- Full JSON for this pool
  
  -- Timestamps
  fetched_at INTEGER DEFAULT (strftime('%s', 'now')),
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(pool_address, fetched_at)
);

-- Historical snapshots for tracking token evolution
CREATE TABLE IF NOT EXISTS gecko_token_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  
  -- Snapshot data
  price_usd REAL,
  market_cap_usd REAL,
  fdv_usd REAL,
  volume_24h_usd REAL,
  reserve_usd REAL,
  
  -- Transaction metrics
  txns_24h_total INTEGER,
  txns_24h_buys INTEGER,
  txns_24h_sells INTEGER,
  unique_buyers_24h INTEGER,
  unique_sellers_24h INTEGER,
  
  -- Price movement
  price_change_24h REAL,
  price_change_6h REAL,
  price_change_1h REAL,
  
  -- Launchpad status at time of snapshot
  is_graduated INTEGER DEFAULT 0,
  graduation_percentage INTEGER,
  
  snapshot_timestamp INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  -- Create snapshots at regular intervals
  UNIQUE(mint_address, snapshot_timestamp)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gecko_token_mint ON gecko_token_data(mint_address);
CREATE INDEX IF NOT EXISTS idx_gecko_token_fetched ON gecko_token_data(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_volume ON gecko_token_data(volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_fdv ON gecko_token_data(fdv_usd DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_launchpad ON gecko_token_data(launchpad_completed, launchpad_completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_gecko_pool_address ON gecko_pool_data(pool_address);
CREATE INDEX IF NOT EXISTS idx_gecko_pool_base_token ON gecko_pool_data(base_token_address);
CREATE INDEX IF NOT EXISTS idx_gecko_pool_dex ON gecko_pool_data(dex_id);
CREATE INDEX IF NOT EXISTS idx_gecko_pool_volume ON gecko_pool_data(volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_pool_fetched ON gecko_pool_data(fetched_at DESC);

CREATE INDEX IF NOT EXISTS idx_gecko_snapshot_mint ON gecko_token_snapshots(mint_address, snapshot_timestamp DESC);

-- View for latest token data (most recent fetch for each token)
CREATE VIEW IF NOT EXISTS gecko_token_latest AS
SELECT * FROM gecko_token_data
WHERE (mint_address, fetched_at) IN (
  SELECT mint_address, MAX(fetched_at)
  FROM gecko_token_data
  GROUP BY mint_address
);

-- View for latest pool data
CREATE VIEW IF NOT EXISTS gecko_pool_latest AS
SELECT * FROM gecko_pool_data
WHERE (pool_address, fetched_at) IN (
  SELECT pool_address, MAX(fetched_at)
  FROM gecko_pool_data
  GROUP BY pool_address
);

-- View for token trading metrics (combines token and pool data)
CREATE VIEW IF NOT EXISTS gecko_trading_metrics AS
SELECT 
  t.mint_address,
  t.symbol,
  t.name,
  t.price_usd,
  t.fdv_usd,
  t.market_cap_usd,
  t.volume_24h_usd as token_volume_24h,
  t.price_change_24h,
  t.launchpad_completed,
  t.launchpad_completed_at,
  p.pool_address,
  p.dex_id,
  p.reserve_in_usd as pool_liquidity,
  p.txns_24h_buys,
  p.txns_24h_sells,
  p.txns_24h_buyers,
  p.txns_24h_sellers,
  p.volume_24h_usd as pool_volume_24h,
  ROUND(CAST(p.txns_24h_buys AS REAL) / NULLIF(p.txns_24h_buys + p.txns_24h_sells, 0) * 100, 2) as buy_percentage,
  t.fetched_at
FROM gecko_token_latest t
LEFT JOIN gecko_pool_latest p ON t.top_pool_address = p.pool_address;

-- View for graduated tokens performance
CREATE VIEW IF NOT EXISTS gecko_graduated_tokens AS
SELECT 
  t.*,
  ROUND((strftime('%s', 'now') - t.launchpad_completed_at) / 3600.0, 2) as hours_since_graduation,
  p.reserve_in_usd as current_liquidity,
  p.txns_24h_total as daily_transactions
FROM gecko_token_latest t
LEFT JOIN (
  SELECT 
    base_token_address,
    reserve_in_usd,
    (txns_24h_buys + txns_24h_sells) as txns_24h_total
  FROM gecko_pool_latest
) p ON t.mint_address = p.base_token_address
WHERE t.launchpad_completed = 1
ORDER BY t.launchpad_completed_at DESC;

-- Tracking table for API call efficiency
CREATE TABLE IF NOT EXISTS gecko_fetch_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  fetch_type TEXT,                     -- 'single', 'batch'
  tokens_requested INTEGER,
  tokens_returned INTEGER,
  api_response_time_ms INTEGER,
  processing_time_ms INTEGER,
  success INTEGER DEFAULT 1,
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

PRAGMA foreign_keys = ON;
