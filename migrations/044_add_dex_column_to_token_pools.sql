-- Add missing columns to token_pools table
-- The OHLCV collectors expect these columns

ALTER TABLE token_pools ADD COLUMN dex TEXT DEFAULT 'unknown';
ALTER TABLE token_pools ADD COLUMN discovered_at INTEGER;
ALTER TABLE token_pools ADD COLUMN last_verified INTEGER;

-- Create index for efficient querying by DEX
CREATE INDEX IF NOT EXISTS idx_token_pools_dex ON token_pools(dex);
