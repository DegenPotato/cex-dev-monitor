-- OHLCV Data Storage Schema

-- Table to store pool addresses for tokens (supports multiple pools per token)
CREATE TABLE IF NOT EXISTS token_pools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  pool_name TEXT,
  dex TEXT,
  base_token TEXT,
  quote_token TEXT,
  volume_24h_usd REAL,
  liquidity_usd REAL,
  price_usd REAL,
  is_primary INTEGER DEFAULT 0, -- Flag for primary/preferred pool
  discovered_at INTEGER NOT NULL,
  last_verified INTEGER, -- Timestamp of last metadata update (for deduplication tracking)
  UNIQUE(mint_address, pool_address), -- Deduplication: One pool per token
  FOREIGN KEY (mint_address) REFERENCES token_mints(mint_address)
);

CREATE INDEX IF NOT EXISTS idx_token_pools_mint ON token_pools(mint_address);
CREATE INDEX IF NOT EXISTS idx_token_pools_pool ON token_pools(pool_address);
CREATE INDEX IF NOT EXISTS idx_token_pools_primary ON token_pools(mint_address, is_primary);

-- Table to store OHLCV candle data (per-pool storage)
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
  FOREIGN KEY (pool_address) REFERENCES token_pools(pool_address),
  UNIQUE(pool_address, timeframe, timestamp) -- Prevent duplicates PER POOL
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_pool_timeframe ON ohlcv_data(pool_address, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_mint_timeframe ON ohlcv_data(mint_address, timeframe);
CREATE INDEX IF NOT EXISTS idx_ohlcv_timestamp ON ohlcv_data(timestamp);
CREATE INDEX IF NOT EXISTS idx_ohlcv_lookup ON ohlcv_data(pool_address, timeframe, timestamp);

-- Table to track backfilling progress (per-pool tracking)
CREATE TABLE IF NOT EXISTS ohlcv_backfill_progress (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL,
  pool_address TEXT NOT NULL,
  timeframe TEXT NOT NULL,
  oldest_timestamp INTEGER, -- Oldest candle we have
  newest_timestamp INTEGER, -- Newest candle we have
  backfill_complete INTEGER DEFAULT 0, -- 1 when we've reached token creation
  last_fetch_at INTEGER,
  fetch_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  last_error TEXT,
  UNIQUE(pool_address, timeframe), -- Track progress per pool
  FOREIGN KEY (pool_address) REFERENCES token_pools(pool_address)
);

CREATE INDEX IF NOT EXISTS idx_backfill_progress_pool ON ohlcv_backfill_progress(pool_address);
CREATE INDEX IF NOT EXISTS idx_backfill_progress_mint ON ohlcv_backfill_progress(mint_address);
CREATE INDEX IF NOT EXISTS idx_backfill_progress_incomplete ON ohlcv_backfill_progress(backfill_complete);
