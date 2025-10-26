-- Comprehensive fix for all missing OHLCV-related columns
-- This adds all columns that the OHLCV collectors expect but are missing from the schema

-- Add missing columns to ohlcv_backfill_progress
ALTER TABLE ohlcv_backfill_progress ADD COLUMN oldest_timestamp INTEGER;
ALTER TABLE ohlcv_backfill_progress ADD COLUMN newest_timestamp INTEGER;
ALTER TABLE ohlcv_backfill_progress ADD COLUMN fetch_count INTEGER DEFAULT 0;
ALTER TABLE ohlcv_backfill_progress ADD COLUMN pool_type TEXT;
ALTER TABLE ohlcv_backfill_progress ADD COLUMN migration_timestamp INTEGER;

-- Add missing columns to token_pools
ALTER TABLE token_pools ADD COLUMN price_usd REAL DEFAULT 0;
ALTER TABLE token_pools ADD COLUMN liquidity_usd REAL DEFAULT 0;
ALTER TABLE token_pools ADD COLUMN activity_tier TEXT;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ohlcv_backfill_timestamps ON ohlcv_backfill_progress(oldest_timestamp, newest_timestamp);
CREATE INDEX IF NOT EXISTS idx_token_pools_price ON token_pools(price_usd);
CREATE INDEX IF NOT EXISTS idx_token_pools_activity ON token_pools(activity_tier);
