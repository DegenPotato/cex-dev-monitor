-- Add dex column to token_pools table
-- The OHLCV collectors expect this column to track which DEX each pool is on

ALTER TABLE token_pools ADD COLUMN dex TEXT DEFAULT 'unknown';

-- Create index for efficient querying by DEX
CREATE INDEX IF NOT EXISTS idx_token_pools_dex ON token_pools(dex);
