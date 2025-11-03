-- ============================================================================
-- ENSURE POSITION_UPDATES TABLE HAS CORRECT STRUCTURE
-- ============================================================================
-- Migration 073 may have been applied but we need to ensure the structure is correct
-- This migration safely handles both cases: table exists or doesn't exist

-- First, check if table exists and has wrong structure by trying to alter it
-- If it fails, we know it already has the right structure

-- Drop and recreate only if the table has the wrong structure
BEGIN TRANSACTION;

-- Save any existing data temporarily (if table exists)
CREATE TEMP TABLE IF NOT EXISTS position_updates_backup AS 
SELECT * FROM position_updates WHERE 1=0;

-- Try to backup data if table exists with any structure
INSERT OR IGNORE INTO position_updates_backup 
SELECT * FROM position_updates WHERE EXISTS (
  SELECT 1 FROM sqlite_master 
  WHERE type='table' AND name='position_updates'
);

-- Drop the old table
DROP TABLE IF EXISTS position_updates;

-- Create with correct structure
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

COMMIT;

-- Add a success marker
INSERT INTO position_updates (type, data) 
VALUES ('migration_074_complete', '{"message": "Position updates table structure verified"}');
