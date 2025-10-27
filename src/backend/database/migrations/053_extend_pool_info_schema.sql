-- Extend pool_info schema to support all pool metadata
-- Adds columns needed by TokenPoolProvider and PumpFun bonding curve detection

-- Add pool metadata columns
ALTER TABLE pool_info ADD COLUMN pool_name TEXT;
ALTER TABLE pool_info ADD COLUMN is_primary INTEGER DEFAULT 0;
ALTER TABLE pool_info ADD COLUMN discovered_at INTEGER;
ALTER TABLE pool_info ADD COLUMN last_verified INTEGER;

-- Add market data columns (optional, can be NULL)
ALTER TABLE pool_info ADD COLUMN volume_24h_usd REAL;
ALTER TABLE pool_info ADD COLUMN liquidity_usd REAL;
ALTER TABLE pool_info ADD COLUMN price_usd REAL;

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_pool_info_token_primary
ON pool_info(token_mint, is_primary DESC, volume_24h_usd DESC);

CREATE INDEX IF NOT EXISTS idx_pool_info_dex
ON pool_info(dex_id, token_mint);

-- Migrate existing data from token_pools if it exists (backward compatibility)
-- This handles cases where token_pools might still have data
INSERT OR IGNORE INTO pool_info (
  pool_address, 
  token_mint, 
  name,
  pool_name,
  dex_id, 
  is_primary,
  volume_24h_usd,
  liquidity_usd,
  price_usd,
  pool_created_at, 
  discovered_at,
  last_updated,
  last_verified
)
SELECT 
  tp.pool_address,
  tp.mint_address,
  COALESCE(tp.pool_name, tp.dex || ' Pool'),
  tp.pool_name,
  tp.dex,
  tp.is_primary,
  tp.volume_24h_usd,
  tp.liquidity_usd,
  tp.price_usd,
  tp.discovered_at,
  tp.discovered_at,
  tp.last_verified,
  tp.last_verified
FROM token_pools tp
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='token_pools');

-- Update pool_info entries that are missing base_token_address but have it in token_pools
UPDATE pool_info
SET 
  base_token_address = (
    SELECT base_token FROM token_pools tp 
    WHERE tp.pool_address = pool_info.pool_address 
    LIMIT 1
  ),
  quote_token_address = (
    SELECT quote_token FROM token_pools tp 
    WHERE tp.pool_address = pool_info.pool_address 
    LIMIT 1
  )
WHERE EXISTS (SELECT 1 FROM sqlite_master WHERE type='table' AND name='token_pools')
  AND base_token_address IS NULL;
