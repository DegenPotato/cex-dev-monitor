-- Migration 061: Test Lab Integration with Existing Telegram Infrastructure
-- Date: 2025-11-03
-- Description: Instead of creating new tables, we add Test Lab functionality to existing telegram_monitored_chats
-- This allows full reuse of existing user filtering, bot filtering, and duplicate CA handling logic

-- Add test_lab_alerts column to store alert configurations (JSON) for Test Lab auto-monitoring
-- When this column is NOT NULL, the chat is being monitored for Test Lab auto-campaigns
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_alerts TEXT;

-- Create index for faster Test Lab queries (only index rows where test_lab_alerts is set)
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_test_lab 
  ON telegram_monitored_chats(test_lab_alerts) 
  WHERE test_lab_alerts IS NOT NULL;

-- ============================================================================
-- REUSING EXISTING INFRASTRUCTURE (no new columns needed):
-- ============================================================================
-- ✅ monitored_user_ids (TEXT/JSON):
--    - Empty array [] = monitor all users in chat
--    - Populated array [123, 456] = monitor only specific user IDs
--    - Already has filtering logic in TelegramClientService.ts
--
-- ✅ process_bot_messages (BOOLEAN):
--    - Added in migration 015
--    - 0 = exclude bots, 1 = include bots
--    - Already integrated in message processing
--
-- ✅ is_active (BOOLEAN):
--    - Existing active/inactive toggle
--    - Already checked in contract detection
--
-- ✅ telegram_account_id (INTEGER):
--    - Which Telegram account to use for monitoring
--    - Already tracked per chat
--
-- ✅ Duplicate CA handling:
--    - telegram_chat_configs table (duplicate_strategy column)
--    - Existing sophisticated duplicate detection logic
--    - No new logic needed
--
-- ============================================================================
-- HOW TEST LAB WORKS WITH EXISTING INFRASTRUCTURE:
-- ============================================================================
-- 1. Test Lab UI creates entry in telegram_monitored_chats with test_lab_alerts set
-- 2. TelegramClientService detects contract (existing logic)
-- 3. checkTestLabMonitors() queries WHERE test_lab_alerts IS NOT NULL
-- 4. Existing user filtering (monitored_user_ids) determines if sender matches
-- 5. Existing bot filtering (process_bot_messages) applies
-- 6. Existing duplicate handling applies
-- 7. If all pass, create Test Lab campaign with configured alerts
--
-- ZERO new tables, ZERO duplicate logic, MAXIMUM reuse! 🎯
