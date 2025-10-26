-- OHLCV PumpFun Migration Support
-- Adds columns to track pool types and migration timestamps

-- Add pool_type to track bonding curves vs DEX pools
ALTER TABLE ohlcv_data ADD COLUMN pool_type TEXT DEFAULT 'unknown';
ALTER TABLE ohlcv_data ADD COLUMN is_post_migration INTEGER DEFAULT 0;

-- Add pool_type to backfill progress
ALTER TABLE ohlcv_backfill_progress ADD COLUMN pool_type TEXT DEFAULT 'unknown';
ALTER TABLE ohlcv_backfill_progress ADD COLUMN migration_timestamp INTEGER;

-- Create index for pool type queries
CREATE INDEX IF NOT EXISTS idx_ohlcv_data_pool_type 
ON ohlcv_data(mint_address, pool_type, timestamp);

-- Skip pool type updates - column 'dex' doesn't exist in token_pools
-- This would require knowing which pools are pump.fun vs raydium
-- Will be set correctly as new data comes in
