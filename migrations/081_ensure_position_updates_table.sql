-- ============================================================================
-- ENSURE POSITION_UPDATES TABLE EXISTS FOR WEBSOCKET QUEUE
-- ============================================================================
-- This table queues all position updates for WebSocket broadcast

-- Table already exists from migration 066, just add missing columns
ALTER TABLE position_updates ADD COLUMN processed INTEGER DEFAULT 0;

-- Index for fast polling (skip if columns don't exist)
CREATE INDEX IF NOT EXISTS idx_position_updates_processed 
ON position_updates(created_at);

-- Add real-time flag to positions (if missing)
ALTER TABLE telegram_trading_positions ADD COLUMN realtime_enabled INTEGER DEFAULT 1;
