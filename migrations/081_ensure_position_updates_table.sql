-- ============================================================================
-- ENSURE POSITION_UPDATES TABLE EXISTS FOR WEBSOCKET QUEUE
-- ============================================================================
-- This table queues all position updates for WebSocket broadcast

CREATE TABLE IF NOT EXISTS position_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  update_type TEXT NOT NULL, -- 'price_update', 'trade_executed', 'alert_triggered', etc.
  data TEXT NOT NULL, -- JSON data to broadcast
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  processed INTEGER DEFAULT 0,
  
  FOREIGN KEY (position_id) REFERENCES telegram_trading_positions(id)
);

-- Index for fast polling
CREATE INDEX IF NOT EXISTS idx_position_updates_queue 
ON position_updates(processed, created_at);

-- Add real-time flag to positions (if missing)
ALTER TABLE telegram_trading_positions ADD COLUMN realtime_enabled INTEGER DEFAULT 1;
