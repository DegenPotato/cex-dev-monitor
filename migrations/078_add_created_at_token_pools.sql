-- ============================================================================
-- FINAL FIX: ADD created_at COLUMN TO token_pools
-- ============================================================================
-- This column is referenced in TelegramAutoTrader.ts line 583 but was missing

-- Add created_at column that the code expects
ALTER TABLE token_pools ADD COLUMN created_at INTEGER;

-- Set default values for existing rows
UPDATE token_pools 
SET created_at = strftime('%s', 'now') 
WHERE created_at IS NULL;
