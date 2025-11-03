-- ============================================================================
-- COMPLETE FIX: Add ALL missing columns to telegram_monitored_chats
-- ============================================================================
-- This adds ALL columns the application actually needs based on the INSERT statement

-- Add ALL missing columns that saveMonitoredChatsBatch() expects
ALTER TABLE telegram_monitored_chats ADD COLUMN invite_link TEXT;
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_user_ids TEXT; -- JSON array
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_keywords TEXT; -- JSON array  
ALTER TABLE telegram_monitored_chats ADD COLUMN telegram_account_id INTEGER;
ALTER TABLE telegram_monitored_chats ADD COLUMN process_bot_messages INTEGER DEFAULT 0;

-- Create index for telegram_account_id for faster queries
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_account ON telegram_monitored_chats(telegram_account_id);
