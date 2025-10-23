-- Token Market Data Table
-- Stores current/latest market data for tokens
-- Separate from OHLCV for efficient dashboard queries

CREATE TABLE IF NOT EXISTS token_market_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL UNIQUE,
  
  -- Basic token info (cached for quick access)
  token_symbol TEXT,
  token_name TEXT,
  decimals INTEGER DEFAULT 9,
  
  -- Current market data
  price_usd REAL,
  price_sol REAL,
  market_cap_usd REAL,
  market_cap_sol REAL,
  
  -- Volume metrics
  volume_24h_usd REAL,
  volume_24h_sol REAL,
  volume_1h_usd REAL,
  volume_1h_sol REAL,
  
  -- Price changes
  price_change_1h REAL,
  price_change_24h REAL,
  price_change_7d REAL,
  price_change_30d REAL,
  
  -- Liquidity metrics
  liquidity_usd REAL,
  liquidity_sol REAL,
  
  -- Trading metrics
  trades_24h INTEGER,
  trades_1h INTEGER,
  buyers_24h INTEGER,
  sellers_24h INTEGER,
  buy_sell_ratio REAL,
  
  -- High/Low prices
  high_24h_usd REAL,
  low_24h_usd REAL,
  ath_usd REAL,
  ath_date INTEGER,
  atl_usd REAL,
  atl_date INTEGER,
  
  -- Platform specific
  platform TEXT DEFAULT 'pumpfun', -- 'pumpfun', 'raydium', 'orca', etc
  pool_address TEXT,
  
  -- Update tracking
  last_updated INTEGER NOT NULL,
  last_price_update INTEGER,
  last_volume_update INTEGER,
  
  -- Data quality
  is_verified BOOLEAN DEFAULT 0,
  data_source TEXT, -- 'dexscreener', 'geckoterminal', 'birdeye', 'direct_rpc'
  confidence_score REAL DEFAULT 0, -- 0-1 score for data reliability
  
  FOREIGN KEY (mint_address) REFERENCES token_registry(token_mint) ON DELETE CASCADE
);

-- Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_token_market_data_mint ON token_market_data(mint_address);
CREATE INDEX IF NOT EXISTS idx_token_market_data_volume ON token_market_data(volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_token_market_data_market_cap ON token_market_data(market_cap_usd DESC);
CREATE INDEX IF NOT EXISTS idx_token_market_data_price_change ON token_market_data(price_change_24h DESC);
CREATE INDEX IF NOT EXISTS idx_token_market_data_last_updated ON token_market_data(last_updated DESC);
CREATE INDEX IF NOT EXISTS idx_token_market_data_platform ON token_market_data(platform);

-- View for top movers (best performers)
CREATE VIEW IF NOT EXISTS token_top_gainers AS
SELECT 
  tmd.*,
  tr.first_source_type,
  tr.telegram_chat_name,
  tr.first_seen_at,
  (tmd.price_usd - tr.first_price_usd) / NULLIF(tr.first_price_usd, 0) * 100 as roi_from_discovery
FROM token_market_data tmd
JOIN token_registry tr ON tmd.mint_address = tr.token_mint
WHERE tmd.price_change_24h > 0
ORDER BY tmd.price_change_24h DESC
LIMIT 50;

-- View for top losers
CREATE VIEW IF NOT EXISTS token_top_losers AS
SELECT 
  tmd.*,
  tr.first_source_type,
  tr.telegram_chat_name,
  tr.first_seen_at
FROM token_market_data tmd
JOIN token_registry tr ON tmd.mint_address = tr.token_mint
WHERE tmd.price_change_24h < 0
ORDER BY tmd.price_change_24h ASC
LIMIT 50;

-- View for high volume tokens
CREATE VIEW IF NOT EXISTS token_high_volume AS
SELECT 
  tmd.*,
  tr.first_source_type,
  tr.telegram_chat_name,
  tr.discovered_by_user_id,
  tr.first_seen_at,
  (julianday('now') - julianday(datetime(tr.first_seen_at, 'unixepoch'))) as days_since_discovery
FROM token_market_data tmd
JOIN token_registry tr ON tmd.mint_address = tr.token_mint
WHERE tmd.volume_24h_usd > 10000
ORDER BY tmd.volume_24h_usd DESC;

-- Function to update market data (called by backend services)
-- This is a placeholder - actual implementation would be in backend
-- Shows the expected update pattern:
-- UPDATE token_market_data SET
--   price_usd = ?,
--   price_sol = ?,
--   market_cap_usd = ?,
--   volume_24h_usd = ?,
--   volume_1h_usd = ?,
--   price_change_1h = ?,
--   price_change_24h = ?,
--   trades_24h = ?,
--   trades_1h = ?,
--   buyers_24h = ?,
--   sellers_24h = ?,
--   buy_sell_ratio = ?,
--   high_24h_usd = ?,
--   low_24h_usd = ?,
--   last_updated = ?,
--   last_price_update = ?,
--   data_source = ?,
--   confidence_score = ?
-- WHERE mint_address = ?;
