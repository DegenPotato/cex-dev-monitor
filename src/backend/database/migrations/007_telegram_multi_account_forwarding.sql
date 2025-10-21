-- Migration: Add multi-account support and forwarding rules for Telegram

-- Add telegram_account_id to monitored chats to track which account owns each chat
ALTER TABLE telegram_monitored_chats 
ADD COLUMN telegram_account_id INTEGER;

-- Add foreign key reference (if not exists)
-- This links each chat to the specific Telegram account that has access to it
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_account 
ON telegram_monitored_chats(telegram_account_id);

-- Update existing chats to use the user's primary telegram account
-- (Assumes telegram_user_id from telegram_user_accounts is the account identifier)
UPDATE telegram_monitored_chats 
SET telegram_account_id = (
  SELECT telegram_user_id 
  FROM telegram_user_accounts 
  WHERE telegram_user_accounts.user_id = telegram_monitored_chats.user_id 
  LIMIT 1
)
WHERE telegram_account_id IS NULL;

-- Create forwarding rules table for auto-forwarding messages
CREATE TABLE IF NOT EXISTS telegram_forwarding_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  rule_name TEXT NOT NULL,
  source_chat_id TEXT NOT NULL, -- The chat to monitor
  source_account_id INTEGER NOT NULL, -- Which account to listen with
  
  -- Forwarding targets (can forward to multiple chats)
  target_chat_ids TEXT NOT NULL, -- JSON array of chat IDs to forward to
  target_account_id INTEGER NOT NULL, -- Which account to use for forwarding
  
  -- Filters
  filter_user_ids TEXT, -- JSON array of user IDs to filter (null = all users)
  filter_keywords TEXT, -- JSON array of keywords to filter (null = all messages)
  filter_media_types TEXT, -- JSON array of media types to filter (null = all types)
  
  -- Options
  include_sender_info BOOLEAN DEFAULT 1, -- Include original sender info
  forward_mode TEXT DEFAULT 'copy', -- 'copy' or 'forward' (forward shows "Forwarded from")
  delay_seconds INTEGER DEFAULT 0, -- Delay before forwarding (for stealth)
  
  -- Rate limiting per rule
  max_forwards_per_minute INTEGER DEFAULT 20,
  max_forwards_per_hour INTEGER DEFAULT 200,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  last_forward_at INTEGER, -- Unix timestamp
  total_forwards INTEGER DEFAULT 0,
  failed_forwards INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_rules_user 
ON telegram_forwarding_rules(user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_rules_source 
ON telegram_forwarding_rules(source_chat_id, is_active);

CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_rules_active 
ON telegram_forwarding_rules(is_active);

-- Track forwarding history for debugging and analytics
CREATE TABLE IF NOT EXISTS telegram_forwarding_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rule_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  
  -- Source message info
  source_chat_id TEXT NOT NULL,
  source_message_id INTEGER NOT NULL,
  source_sender_id TEXT,
  source_sender_username TEXT,
  
  -- Target info
  target_chat_id TEXT NOT NULL,
  target_message_id INTEGER, -- ID of forwarded message
  
  -- Status
  status TEXT NOT NULL, -- 'success', 'failed', 'rate_limited'
  error_message TEXT,
  response_time_ms INTEGER,
  
  -- Timestamps
  forwarded_at INTEGER NOT NULL,
  
  FOREIGN KEY (rule_id) REFERENCES telegram_forwarding_rules(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for history
CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_history_rule 
ON telegram_forwarding_history(rule_id);

CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_history_user_date 
ON telegram_forwarding_history(user_id, forwarded_at);

CREATE INDEX IF NOT EXISTS idx_telegram_forwarding_history_status 
ON telegram_forwarding_history(status, forwarded_at);
