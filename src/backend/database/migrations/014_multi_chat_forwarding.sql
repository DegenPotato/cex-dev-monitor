-- Migration 014: Multi-chat forwarding support
-- Date: 2024-10-21
-- Description: Adds support for forwarding to multiple chats simultaneously

-- 1. Create table for forward destinations
CREATE TABLE IF NOT EXISTS telegram_forward_destinations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_chat_id TEXT NOT NULL, -- The chat we're monitoring
  target_chat_id TEXT NOT NULL, -- Where to forward to
  target_chat_name TEXT,         -- Display name for UI
  forward_account_id INTEGER,    -- Which account to use for this specific forward
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, source_chat_id, target_chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_forward_destinations_user ON telegram_forward_destinations(user_id);
CREATE INDEX IF NOT EXISTS idx_forward_destinations_source ON telegram_forward_destinations(source_chat_id);
CREATE INDEX IF NOT EXISTS idx_forward_destinations_active ON telegram_forward_destinations(is_active);

-- 2. Migrate existing single forward destinations
INSERT OR IGNORE INTO telegram_forward_destinations (
  user_id, source_chat_id, target_chat_id, target_chat_name, 
  forward_account_id, is_active, created_at
)
SELECT 
  user_id, 
  chat_id, 
  forward_to_chat_id,
  forward_to_chat_id, -- Use ID as name initially
  forward_account_id,
  1,
  strftime('%s', 'now')
FROM telegram_monitored_chats
WHERE forward_to_chat_id IS NOT NULL 
  AND forward_to_chat_id != '';

-- 3. Create table for available forward targets (chats you can forward TO)
CREATE TABLE IF NOT EXISTS telegram_available_forward_targets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_username TEXT,
  chat_type TEXT, -- 'user', 'group', 'channel'
  is_bot BOOLEAN DEFAULT 0,
  can_forward BOOLEAN DEFAULT 1, -- Some chats may not allow forwarding
  last_verified INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_available_targets_user ON telegram_available_forward_targets(user_id);
CREATE INDEX IF NOT EXISTS idx_available_targets_can_forward ON telegram_available_forward_targets(can_forward);

-- Note: The old forward_to_chat_id and forward_account_id columns in telegram_monitored_chats 
-- are kept for backward compatibility but will be deprecated
