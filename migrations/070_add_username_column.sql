-- ============================================================================
-- FIX: Add missing username column to telegram_monitored_chats
-- ============================================================================
-- Previous migration missed this column

ALTER TABLE telegram_monitored_chats ADD COLUMN username TEXT;
