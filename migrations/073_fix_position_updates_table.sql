-- ============================================================================
-- FIX POSITION_UPDATES TABLE TO MATCH CODE EXPECTATIONS
-- ============================================================================
-- The code expects a simpler structure with type, data, created_at
-- But migration 066 created a complex structure with update_type

-- Drop the old table if it exists
DROP TABLE IF EXISTS position_updates;

-- Create the table with the structure the code expects
CREATE TABLE position_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,  -- 'telegram_position_created', 'telegram_position_price_update', etc.
  data TEXT NOT NULL,  -- JSON data
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  broadcasted INTEGER DEFAULT 0  -- Track if WebSocket broadcast was sent
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_position_updates_type ON position_updates(type);
CREATE INDEX IF NOT EXISTS idx_position_updates_created ON position_updates(created_at);
CREATE INDEX IF NOT EXISTS idx_position_updates_broadcast ON position_updates(broadcasted);
