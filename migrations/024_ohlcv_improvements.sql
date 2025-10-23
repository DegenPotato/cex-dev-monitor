-- OHLCV Improvements Migration
-- Ensures all required indexes and constraints are in place

-- Add indexes for efficient querying if they don't exist
CREATE INDEX IF NOT EXISTS idx_ohlcv_backfill_progress_lookup 
ON ohlcv_backfill_progress(mint_address, pool_address, timeframe);

CREATE INDEX IF NOT EXISTS idx_ohlcv_backfill_progress_incomplete
ON ohlcv_backfill_progress(backfill_complete, last_fetch_at);

CREATE INDEX IF NOT EXISTS idx_ohlcv_data_lookup
ON ohlcv_data(mint_address, pool_address, timeframe, timestamp);

CREATE INDEX IF NOT EXISTS idx_token_pools_lookup
ON token_pools(mint_address, is_primary, volume_24h_usd);

-- Add unique constraint to prevent duplicate candles
CREATE UNIQUE INDEX IF NOT EXISTS idx_ohlcv_data_unique
ON ohlcv_data(pool_address, timeframe, timestamp);
