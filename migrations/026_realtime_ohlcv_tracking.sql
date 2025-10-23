-- Real-time OHLCV Subscription Tracking
-- Tracks which users have active real-time chart subscriptions

CREATE TABLE IF NOT EXISTS realtime_ohlcv_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  mint_address TEXT NOT NULL,
  pool_address TEXT,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  is_active INTEGER DEFAULT 1,
  update_count INTEGER DEFAULT 0,
  last_update INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_realtime_ohlcv_user_active 
ON realtime_ohlcv_subscriptions(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_realtime_ohlcv_mint 
ON realtime_ohlcv_subscriptions(mint_address);

CREATE INDEX IF NOT EXISTS idx_realtime_ohlcv_active 
ON realtime_ohlcv_subscriptions(is_active);

-- View for active subscriptions with user details
CREATE VIEW IF NOT EXISTS active_realtime_subscriptions AS
SELECT 
  ros.*,
  u.wallet_address,
  u.username,
  tm.token_name,
  tm.token_symbol,
  (strftime('%s', 'now') * 1000 - ros.started_at) / 1000 as duration_seconds
FROM realtime_ohlcv_subscriptions ros
JOIN users u ON ros.user_id = u.id
LEFT JOIN token_mints tm ON ros.mint_address = tm.mint_address
WHERE ros.is_active = 1;
