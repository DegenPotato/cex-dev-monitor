-- Migration 063: Add exclude_no_username filter to telegram_monitored_chats
-- Date: 2025-11-03
-- Description: Add filter to exclude users without username from monitoring
-- This is a Test Lab feature that complements the existing process_bot_messages filter

-- Add exclude_no_username column (default to FALSE - disabled by default)
ALTER TABLE telegram_monitored_chats ADD COLUMN exclude_no_username BOOLEAN DEFAULT 0;

-- ============================================================================
-- HOW IT WORKS:
-- ============================================================================
-- When exclude_no_username = 1 (enabled):
--   - Skip messages from users who don't have a Telegram username
--   - Useful for focusing only on established/verified users
--
-- When exclude_no_username = 0 (disabled, default):
--   - Process messages from all users (legacy behavior)
--
-- COMPLEMENTS EXISTING FILTERS:
-- - process_bot_messages (filter bots)
-- - monitored_user_ids (specific users or all)
-- - exclude_no_username (NEW - filter users without username)
-- ============================================================================
