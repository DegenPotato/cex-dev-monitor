-- Migration: Add real-time OHLCV toggle and activity tracking
-- Purpose: Allow per-token real-time chart updates and track pool activity tiers

-- Add real-time toggle to token_registry (token_mints was unified into token_registry in migration 031)
ALTER TABLE token_registry ADD COLUMN ohlcv_realtime_enabled INTEGER DEFAULT 0;
ALTER TABLE token_registry ADD COLUMN ohlcv_update_tier TEXT DEFAULT 'NORMAL';
ALTER TABLE token_registry ADD COLUMN ohlcv_last_activity_check INTEGER;

-- Add activity metrics to token_pools table
ALTER TABLE token_pools ADD COLUMN activity_tier TEXT DEFAULT 'NORMAL';
ALTER TABLE token_pools ADD COLUMN last_activity_volume_15m REAL DEFAULT 0;
ALTER TABLE token_pools ADD COLUMN last_activity_volume_1h REAL DEFAULT 0;
ALTER TABLE token_pools ADD COLUMN last_activity_txns_15m INTEGER DEFAULT 0;
ALTER TABLE token_pools ADD COLUMN last_activity_check INTEGER;
ALTER TABLE token_pools ADD COLUMN next_update_at INTEGER;

-- Create index for efficient tier-based queries
CREATE INDEX IF NOT EXISTS idx_token_pools_activity_tier ON token_pools(activity_tier, next_update_at);
CREATE INDEX IF NOT EXISTS idx_token_registry_ohlcv_realtime ON token_registry(ohlcv_realtime_enabled);
CREATE INDEX IF NOT EXISTS idx_token_registry_update_tier ON token_registry(ohlcv_update_tier);

-- Add table to track OHLCV update schedules
CREATE TABLE IF NOT EXISTS ohlcv_update_schedule (
  pool_address TEXT PRIMARY KEY,
  mint_address TEXT NOT NULL,
  update_tier TEXT NOT NULL DEFAULT 'NORMAL',
  last_update INTEGER,
  next_update INTEGER,
  last_activity_volume REAL DEFAULT 0,
  last_activity_txns INTEGER DEFAULT 0,
  consecutive_dormant_checks INTEGER DEFAULT 0,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (mint_address) REFERENCES token_registry(token_mint)
);

CREATE INDEX IF NOT EXISTS idx_ohlcv_schedule_next_update ON ohlcv_update_schedule(next_update);
CREATE INDEX IF NOT EXISTS idx_ohlcv_schedule_tier ON ohlcv_update_schedule(update_tier);

-- View for monitoring OHLCV update efficiency
CREATE VIEW IF NOT EXISTS ohlcv_update_stats AS
SELECT 
  update_tier,
  COUNT(*) as pool_count,
  AVG(last_activity_volume) as avg_volume,
  AVG(last_activity_txns) as avg_transactions,
  MIN(next_update) as next_scheduled_update,
  COUNT(CASE WHEN last_update > strftime('%s', 'now', '-5 minutes') THEN 1 END) as updated_last_5m,
  COUNT(CASE WHEN last_update > strftime('%s', 'now', '-15 minutes') THEN 1 END) as updated_last_15m,
  COUNT(CASE WHEN last_update > strftime('%s', 'now', '-1 hour') THEN 1 END) as updated_last_hour
FROM ohlcv_update_schedule
GROUP BY update_tier;
