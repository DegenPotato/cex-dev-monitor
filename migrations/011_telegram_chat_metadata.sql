-- Add comprehensive metadata for Telegram chats
-- This enhances Available Chats section with rich insights

-- Create a new table for detailed chat metadata
CREATE TABLE IF NOT EXISTS telegram_chat_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  
  -- Basic info
  title TEXT,
  username TEXT,
  chat_type TEXT, -- 'private', 'group', 'supergroup', 'channel', 'bot'
  description TEXT,
  photo_url TEXT,
  invite_link TEXT,
  
  -- Statistics
  member_count INTEGER DEFAULT 0,
  online_count INTEGER DEFAULT 0,
  admin_count INTEGER DEFAULT 0,
  restricted_count INTEGER DEFAULT 0,
  kicked_count INTEGER DEFAULT 0,
  
  -- User's relationship with chat
  is_member BOOLEAN DEFAULT 0,
  is_admin BOOLEAN DEFAULT 0,
  is_creator BOOLEAN DEFAULT 0,
  has_left BOOLEAN DEFAULT 0,
  join_date INTEGER,
  
  -- Activity metrics
  message_count INTEGER DEFAULT 0,
  last_message_date INTEGER,
  last_message_text TEXT,
  avg_messages_per_day REAL DEFAULT 0,
  peak_activity_hour INTEGER, -- 0-23
  
  -- Content analysis
  common_keywords TEXT, -- JSON array of top keywords
  language TEXT,
  spam_score REAL DEFAULT 0, -- 0-1 spam likelihood
  bot_percentage REAL DEFAULT 0, -- percentage of bot members
  
  -- Contract/trading specific
  contracts_detected_30d INTEGER DEFAULT 0,
  last_contract_date INTEGER,
  most_active_sender TEXT, -- username of most active sender
  
  -- Metadata timestamps
  fetched_at INTEGER,
  updated_at INTEGER,
  
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_user_chat 
ON telegram_chat_metadata(user_id, chat_id);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_type 
ON telegram_chat_metadata(chat_type);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_member_count 
ON telegram_chat_metadata(member_count);

CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_activity 
ON telegram_chat_metadata(last_message_date);

-- Migrate existing data from telegram_monitored_chats
INSERT OR IGNORE INTO telegram_chat_metadata (user_id, chat_id, title, username, chat_type, invite_link, updated_at)
SELECT user_id, chat_id, chat_name, username, chat_type, invite_link, updated_at
FROM telegram_monitored_chats
WHERE chat_name IS NOT NULL;
