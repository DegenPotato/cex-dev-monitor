-- OHLCV Improvements Migration
-- Ensures all required tables and indexes are in place

-- Create tables if they don't exist
CREATE TABLE IF NOT EXISTS ohlcv_backfill_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  backfill_complete INTEGER DEFAULT 0,
  last_fetch_at INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS ohlcv_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  open REAL,
  high REAL,
  low REAL,
  close REAL,
  volume REAL,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE TABLE IF NOT EXISTS token_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  is_primary INTEGER DEFAULT 0,
  volume_24h_usd REAL DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

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
