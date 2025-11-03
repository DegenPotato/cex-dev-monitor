-- ============================================================================
-- FINAL FIX: Add remaining missing columns for updateChatConfiguration
-- ============================================================================
-- These are the columns used in the UPDATE statement that were missed

-- Add monitored_topic_ids column (different from monitored_topics)
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_topic_ids TEXT; -- JSON array
