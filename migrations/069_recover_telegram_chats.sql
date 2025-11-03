-- ============================================================================
-- EMERGENCY RECOVERY: Restore missing columns to telegram_monitored_chats
-- ============================================================================
-- The previous migration accidentally removed important columns
-- This migration adds them back without losing existing data

-- Add back all missing columns that the application needs
ALTER TABLE telegram_monitored_chats ADD COLUMN chat_type TEXT;
ALTER TABLE telegram_monitored_chats ADD COLUMN access_hash TEXT;
ALTER TABLE telegram_monitored_chats ADD COLUMN participants_count INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN can_send_messages INTEGER DEFAULT 1;
ALTER TABLE telegram_monitored_chats ADD COLUMN topics TEXT; -- JSON array
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_topics TEXT; -- JSON array
ALTER TABLE telegram_monitored_chats ADD COLUMN exclude_bots INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN exclude_no_username INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN updated_at INTEGER DEFAULT (strftime('%s', 'now'));

-- Fix the telegram_available_chats table if it exists
CREATE TABLE IF NOT EXISTS telegram_available_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_type TEXT,
  access_hash TEXT,
  participants_count INTEGER DEFAULT 0,
  can_send_messages INTEGER DEFAULT 1,
  topics TEXT, -- JSON array
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_telegram_available_chats_user ON telegram_available_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_available_chats_type ON telegram_available_chats(chat_type);
