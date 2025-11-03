-- Migration 062: Add only_buy_new_tokens filter to Test Lab
-- Date: 2025-11-03
-- Description: Add filter to skip buying tokens that already exist in token_registry
-- This prevents duplicate purchases on tokens you've already seen/traded

-- Add only_buy_new_tokens column (default to TRUE - enabled by default)
ALTER TABLE telegram_monitored_chats ADD COLUMN only_buy_new_tokens BOOLEAN DEFAULT 1;

-- ============================================================================
-- HOW IT WORKS:
-- ============================================================================
-- When only_buy_new_tokens = 1 (enabled):
--   1. Contract detected from monitored user
--   2. Check: SELECT token_mint FROM token_registry WHERE token_mint = ?
--   3. If EXISTS: Skip buy order, still create monitoring campaign
--   4. If NOT EXISTS: Create buy signal (new token!)
--
-- When only_buy_new_tokens = 0 (disabled):
--   - Always create buy order (legacy behavior)
--
-- REUSES EXISTING:
-- - token_registry table (unified in migration 031)
-- - Contains ALL tokens detected across all sources
-- - Prevents buying tokens you've already encountered
-- ============================================================================
