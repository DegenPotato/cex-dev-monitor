-- Migration 065: Fix Test Lab isolation - add config_json column
-- Date: 2025-11-03
-- Description: Add config_json to test_lab_telegram_monitors for isolated Test Lab functionality
-- This ensures Test Lab NEVER interferes with production Telegram Sniffer

-- Add config_json column to store all monitor configuration
ALTER TABLE test_lab_telegram_monitors ADD COLUMN config_json TEXT;

-- Clean up any test_lab entries from production telegram_monitored_chats
-- (identified by having test_lab_alerts set)
DELETE FROM telegram_monitored_chats WHERE test_lab_alerts IS NOT NULL;

-- Drop the test_lab columns from telegram_monitored_chats since they should NEVER be used there
-- These belong ONLY in test_lab_telegram_monitors
-- Keeping them causes confusion and mixing of test/production
-- Note: SQLite doesn't support DROP COLUMN easily, so we'll just document not to use them

-- ============================================================================
-- IMPORTANT: Test Lab is ISOLATED
-- ============================================================================
-- test_lab_telegram_monitors = Test Lab ONLY (isolated testing)
-- telegram_monitored_chats = Production Telegram Sniffer ONLY
-- 
-- NEVER mix these two systems!
-- Test Lab should:
-- 1. Detect contracts from Telegram (using test_lab_telegram_monitors)
-- 2. Create campaigns identical to "Manual" source
-- 3. NOT appear in production Telegram Sniffer
-- ============================================================================
