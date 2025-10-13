-- OHLCV Data Storage Schema

-- Table to store pool addresses for tokens
CREATE TABLE IF NOT EXISTS token_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL UNIQUE,
  pool_address TEXT NOT NULL,
  pool_name TEXT,
  dex TEXT DEFAULT 'raydium',
  discovered_at INTEGER NOT NULL,
  last_verified INTEGER,
  FOREIGN KEY (mint_address) REFERENCES token_mints(mint_address)
);

CREATE INDEX IF NOT EXISTS idx_token_pools_mint ON token_pools(mint_address);
CREATE INDEX IF NOT EXISTS idx_token_pools_pool ON token_pools(pool_address);

-- Table to store OHLCV candle data
CREATE TABLE IF NOT EXISTS ohlcv_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL, -- 1m, 15m, 1h, 4h, 1d
  timestamp INTEGER NOT NULL, -- Unix timestamp (start of candle)
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (mint_address) REFERENCES token_mints(mint_address),
  UNIQUE(mint_address, timeframe, timestamp) -- Prevent duplicates
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_mint_timeframe ON ohlcv_data(mint_address, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_timestamp ON ohlcv_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_data(mint_address, timeframe, timestamp);

-- Table to track backfilling progress
CREATE TABLE IF NOT EXISTS ohlcv_backfill_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  oldest_timestamp INTEGER, -- Oldest candle we have
  newest_timestamp INTEGER, -- Newest candle we have
  backfill_complete INTEGER DEFAULT 0, -- 1 when we've reached token creation
  last_fetch_at INTEGER,
  fetch_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  UNIQUE(mint_address, timeframe)
);

CREATE INDEX IF NOT EXISTS idx_backfill_progress_mint ON ohlcv_backfill_progress(mint_address);
CREATE INDEX IF NOT EXISTS idx_backfill_progress_incomplete ON ohlcv_backfill_progress(backfill_complete);
