-- Enhanced Pool Activity Tracking
-- Captures ALL data points from GeckoTerminal search/pools endpoint

-- Main pool information table
CREATE TABLE IF NOT EXISTS pool_info (
  pool_address TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  name TEXT,
  base_token_address TEXT,
  base_token_symbol TEXT,
  quote_token_address TEXT,
  quote_token_symbol TEXT,
  dex_id TEXT,
  pool_created_at INTEGER,
  last_updated INTEGER NOT NULL,
  FOREIGN KEY (token_mint) REFERENCES token_mints(mint_address)
);

-- Real-time pool pricing data
CREATE TABLE IF NOT EXISTS pool_pricing (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_address TEXT NOT NULL,
  base_token_price_usd REAL,
  base_token_price_native REAL,
  quote_token_price_usd REAL,
  quote_token_price_native REAL,
  base_token_price_quote_token REAL,
  quote_token_price_base_token REAL,
  fdv_usd REAL,
  market_cap_usd REAL,
  reserve_in_usd REAL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (pool_address) REFERENCES pool_info(pool_address)
);

-- Price change percentages across timeframes
CREATE TABLE IF NOT EXISTS pool_price_changes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_address TEXT NOT NULL,
  m5 REAL,
  m15 REAL,
  m30 REAL,
  h1 REAL,
  h6 REAL,
  h24 REAL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (pool_address) REFERENCES pool_info(pool_address)
);

-- Transaction activity across timeframes
CREATE TABLE IF NOT EXISTS pool_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL, -- 'm5', 'm15', 'm30', 'h1', 'h6', 'h24'
  buys INTEGER,
  sells INTEGER,
  buyers INTEGER,
  sellers INTEGER,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (pool_address) REFERENCES pool_info(pool_address)
);

-- Volume data across timeframes
CREATE TABLE IF NOT EXISTS pool_volume (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pool_address TEXT NOT NULL,
  m5_usd REAL,
  m15_usd REAL,
  m30_usd REAL,
  h1_usd REAL,
  h6_usd REAL,
  h24_usd REAL,
  timestamp INTEGER NOT NULL,
  FOREIGN KEY (pool_address) REFERENCES pool_info(pool_address)
);

-- Aggregated pool metrics view
CREATE VIEW IF NOT EXISTS pool_activity_summary AS
SELECT 
  pi.pool_address,
  pi.token_mint,
  pi.name as pool_name,
  pi.dex_id,
  pi.pool_created_at,
  pp.base_token_price_usd,
  pp.quote_token_price_usd,
  pp.fdv_usd,
  pp.market_cap_usd,
  pp.reserve_in_usd,
  pc.h24 as price_change_24h,
  pv.h24_usd as volume_24h_usd,
  pt_h24.buys as buys_24h,
  pt_h24.sells as sells_24h,
  pt_h24.buyers as buyers_24h,
  pt_h24.sellers as sellers_24h,
  pp.timestamp as last_updated
FROM pool_info pi
LEFT JOIN (
  SELECT pool_address, MAX(timestamp) as max_ts
  FROM pool_pricing
  GROUP BY pool_address
) latest_pp ON pi.pool_address = latest_pp.pool_address
LEFT JOIN pool_pricing pp ON pp.pool_address = pi.pool_address AND pp.timestamp = latest_pp.max_ts
LEFT JOIN (
  SELECT pool_address, MAX(timestamp) as max_ts
  FROM pool_price_changes
  GROUP BY pool_address
) latest_pc ON pi.pool_address = latest_pc.pool_address
LEFT JOIN pool_price_changes pc ON pc.pool_address = pi.pool_address AND pc.timestamp = latest_pc.max_ts
LEFT JOIN (
  SELECT pool_address, MAX(timestamp) as max_ts
  FROM pool_volume
  GROUP BY pool_address
) latest_pv ON pi.pool_address = latest_pv.pool_address
LEFT JOIN pool_volume pv ON pv.pool_address = pi.pool_address AND pv.timestamp = latest_pv.max_ts
LEFT JOIN pool_transactions pt_h24 ON pt_h24.pool_address = pi.pool_address 
  AND pt_h24.timeframe = 'h24' 
  AND pt_h24.timestamp = (SELECT MAX(timestamp) FROM pool_transactions WHERE pool_address = pi.pool_address AND timeframe = 'h24');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_pool_info_token ON pool_info(token_mint);
CREATE INDEX IF NOT EXISTS idx_pool_info_dex ON pool_info(dex_id);
CREATE INDEX IF NOT EXISTS idx_pool_pricing_address ON pool_pricing(pool_address);
CREATE INDEX IF NOT EXISTS idx_pool_pricing_timestamp ON pool_pricing(timestamp);
CREATE INDEX IF NOT EXISTS idx_pool_price_changes_address ON pool_price_changes(pool_address);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_address ON pool_transactions(pool_address);
CREATE INDEX IF NOT EXISTS idx_pool_transactions_timeframe ON pool_transactions(timeframe);
CREATE INDEX IF NOT EXISTS idx_pool_volume_address ON pool_volume(pool_address);
