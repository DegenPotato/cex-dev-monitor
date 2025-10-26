-- Migration 013: Add comprehensive duplicate CA handling system
-- Date: 2024-10-21
-- Description: Adds support for multiple duplicate handling strategies and comprehensive token tracking

-- 0. Create token_mints table if it doesn't exist
CREATE TABLE IF NOT EXISTS token_mints (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mint_address TEXT NOT NULL UNIQUE,
  mint_name TEXT,
  mint_symbol TEXT,
  mint_decimals INTEGER,
  timestamp INTEGER NOT NULL,
  first_seen_source TEXT,
  first_seen_at INTEGER,
  telegram_mentions INTEGER DEFAULT 0,
  wallet_transactions INTEGER DEFAULT 0
);

-- 1. Add new columns to token_mints table if they don't exist (will fail silently if already exists)
-- Note: SQLite doesn't support ALTER TABLE ADD COLUMN IF NOT EXISTS
-- These columns may already exist from direct schema modifications

-- Try to add columns (will fail silently if they exist)
-- Add first_seen_source column
ALTER TABLE token_mints ADD COLUMN first_seen_source TEXT;

-- Add first_seen_at column  
ALTER TABLE token_mints ADD COLUMN first_seen_at INTEGER;

-- Add telegram_mentions column
ALTER TABLE token_mints ADD COLUMN telegram_mentions INTEGER DEFAULT 0;

-- Add wallet_transactions column
ALTER TABLE token_mints ADD COLUMN wallet_transactions INTEGER DEFAULT 0;

-- 2. Create telegram_detections table for comprehensive logging
CREATE TABLE IF NOT EXISTS telegram_detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_address TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_username TEXT,
  message_id TEXT,
  message_text TEXT,
  sender_id INTEGER,
  sender_username TEXT,
  detection_type TEXT, -- 'standard', 'obfuscated', 'split', 'url'
  detected_by_user_id INTEGER NOT NULL,
  detected_at INTEGER NOT NULL,
  message_timestamp INTEGER NOT NULL, -- Original message timestamp from Telegram
  is_first_mention BOOLEAN DEFAULT 0, -- Is this the first mention in this chat?
  is_backlog BOOLEAN DEFAULT 0, -- Was this detected from historical backlog?
  forwarded BOOLEAN DEFAULT 0,
  forwarded_to TEXT,
  forward_latency INTEGER,
  forward_error TEXT,
  processed_action TEXT, -- 'forwarded', 'skipped_duplicate', 'skipped_not_first', etc.
  FOREIGN KEY (contract_address) REFERENCES token_mints(mint_address)
);

-- Create indexes for telegram_detections
CREATE INDEX IF NOT EXISTS idx_telegram_detections_contract ON telegram_detections(contract_address);
CREATE INDEX IF NOT EXISTS idx_telegram_detections_chat ON telegram_detections(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_detections_detected_at ON telegram_detections(detected_at);
CREATE INDEX IF NOT EXISTS idx_telegram_detections_message_timestamp ON telegram_detections(message_timestamp);
CREATE INDEX IF NOT EXISTS idx_telegram_detections_first_mention ON telegram_detections(chat_id, contract_address, is_first_mention);

-- 3. Create telegram_chat_configs table for duplicate strategy configuration
CREATE TABLE IF NOT EXISTS telegram_chat_configs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT NOT NULL,
  user_id INTEGER NOT NULL,
  duplicate_strategy TEXT DEFAULT 'first_only_no_backlog',
  -- 'first_only_with_backlog': Process first mention, scan history
  -- 'first_only_no_backlog': Process first new mention only (current default)
  -- 'buy_any_call': Process every mention
  -- 'custom': Future custom rules
  backlog_scan_depth INTEGER DEFAULT 1000, -- How many messages to scan back
  backlog_time_limit INTEGER DEFAULT 86400, -- Max seconds to scan back (24h default)
  min_time_between_duplicates INTEGER DEFAULT 0, -- Min seconds between duplicate forwards
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(chat_id, user_id)
);

-- Create index for telegram_chat_configs
CREATE INDEX IF NOT EXISTS idx_telegram_chat_configs_chat_user ON telegram_chat_configs(chat_id, user_id);

-- 4. Create contract_first_mentions table to track first mentions
CREATE TABLE IF NOT EXISTS contract_first_mentions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_address TEXT NOT NULL,
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  message_timestamp INTEGER NOT NULL,
  detected_at INTEGER NOT NULL,
  is_backlog_scan BOOLEAN DEFAULT 0,
  scan_completed_at INTEGER,
  UNIQUE(contract_address, chat_id)
);

-- Create indexes for contract_first_mentions
CREATE INDEX IF NOT EXISTS idx_contract_first_mentions_contract_chat ON contract_first_mentions(contract_address, chat_id);
CREATE INDEX IF NOT EXISTS idx_contract_first_mentions_timestamp ON contract_first_mentions(message_timestamp);

-- 5. Migrate existing data if applicable
-- Set default duplicate_strategy for existing monitored chats
INSERT OR IGNORE INTO telegram_chat_configs (chat_id, user_id, duplicate_strategy, backlog_scan_depth, backlog_time_limit, min_time_between_duplicates, created_at, updated_at)
SELECT DISTINCT chat_id, user_id, 'first_only_no_backlog', 1000, 86400, 0, strftime('%s', 'now'), strftime('%s', 'now')
FROM telegram_monitored_chats
WHERE chat_id IS NOT NULL;

-- Update existing token_mints with default values if columns are null
UPDATE token_mints 
SET first_seen_source = COALESCE(first_seen_source, 'unknown'),
    first_seen_at = COALESCE(first_seen_at, timestamp),
    telegram_mentions = COALESCE(telegram_mentions, 0),
    wallet_transactions = COALESCE(wallet_transactions, 0)
WHERE first_seen_source IS NULL 
   OR first_seen_at IS NULL 
   OR telegram_mentions IS NULL 
   OR wallet_transactions IS NULL;

-- Migration complete
-- Note: This migration is idempotent and safe to run multiple times
