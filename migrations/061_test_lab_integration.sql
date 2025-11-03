-- Migration 061: Test Lab Integration with Existing Telegram Infrastructure
-- Date: 2025-11-03
-- Description: Instead of creating new tables, we add Test Lab functionality to existing telegram_monitored_chats
-- This allows full reuse of existing user filtering, bot filtering, and duplicate CA handling logic

-- Add test_lab_alerts column to store alert configurations (JSON) for Test Lab auto-monitoring
-- When this column is NOT NULL, the chat is being monitored for Test Lab auto-campaigns
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_alerts TEXT;

-- Add filter for users without username
ALTER TABLE telegram_monitored_chats ADD COLUMN exclude_no_username BOOLEAN DEFAULT 0;

-- Add initial action on contract detection
-- Options: 'monitor_only' (just price tracking), 'buy_and_monitor' (buy then track position + price)
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_initial_action TEXT DEFAULT 'monitor_only';

-- Add buy amount for buy_and_monitor action
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_buy_amount_sol REAL;

-- Add wallet_id to link Test Lab campaigns to trading wallet (for position tracking)
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_wallet_id INTEGER REFERENCES trading_wallets(id);

-- Add only_buy_new_tokens filter (skip tokens already in token_registry)
ALTER TABLE telegram_monitored_chats ADD COLUMN only_buy_new_tokens BOOLEAN DEFAULT 1;

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
-- NEW TEST LAB COLUMNS ADDED:
-- ============================================================================
-- 📋 test_lab_alerts (TEXT/JSON):
--    - Alert configurations for price monitoring
--    - When NOT NULL, this chat is Test Lab monitored
--
-- 🚫 exclude_no_username (BOOLEAN):
--    - 0 = allow users without username
--    - 1 = exclude users without username
--
-- ⚡ test_lab_initial_action (TEXT):
--    - 'monitor_only' = just start price monitoring (default)
--    - 'buy_and_monitor' = execute buy order then monitor position + price
--
-- 💰 test_lab_buy_amount_sol (REAL):
--    - Amount of SOL to buy when initial_action = 'buy_and_monitor'
--
-- 👛 test_lab_wallet_id (INTEGER):
--    - Links to trading_wallets.id for executing buys and tracking positions
--    - Required if initial_action = 'buy_and_monitor'
--
-- ============================================================================
-- HOW TEST LAB WORKS WITH EXISTING INFRASTRUCTURE:
-- ============================================================================
-- 1. Test Lab UI creates entry in telegram_monitored_chats with test_lab_alerts set
-- 2. TelegramClientService detects contract (existing logic)
-- 3. checkTestLabMonitors() queries WHERE test_lab_alerts IS NOT NULL
-- 4. Existing user filtering (monitored_user_ids) applies
-- 5. Existing bot filtering (process_bot_messages) applies
-- 6. New exclude_no_username filter applies
-- 7. Existing duplicate handling applies
-- 8. If all pass AND initial_action = 'buy_and_monitor':
--    → Create trade_signal for buy order
--    → Trading system executes buy
--    → Position tracked in wallet_token_holdings
-- 9. Create Test Lab campaign with configured alerts
-- 10. Monitor tracks BOTH price alerts AND position value (if bought)
--
-- REUSES: trading_wallets, wallet_token_holdings, trade_signals, trading_transactions
-- ZERO duplicate trading logic! 🎯
