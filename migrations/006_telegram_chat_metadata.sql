-- Telegram Chat Metadata Table
-- Stores comprehensive metadata for each chat including user's role/permissions

CREATE TABLE IF NOT EXISTS telegram_chat_metadata (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  
  -- Basic Info
  title TEXT,
  username TEXT,
  chat_type TEXT, -- 'private', 'group', 'supergroup', 'channel'
  description TEXT,
  photo_url TEXT,
  invite_link TEXT,
  
  -- Member Statistics
  member_count INTEGER DEFAULT 0,
  online_count INTEGER DEFAULT 0,
  admin_count INTEGER DEFAULT 0,
  restricted_count INTEGER DEFAULT 0,
  kicked_count INTEGER DEFAULT 0,
  bot_percentage REAL DEFAULT 0, -- Percentage of bots in chat
  
  -- User's Status in Chat
  is_member BOOLEAN DEFAULT 0,
  is_admin BOOLEAN DEFAULT 0,
  is_creator BOOLEAN DEFAULT 0,
  has_left BOOLEAN DEFAULT 0,
  join_date INTEGER, -- Unix timestamp when user joined
  
  -- Activity Metrics
  last_message_date INTEGER, -- Unix timestamp of last message
  last_message_text TEXT, -- Preview of last message
  contracts_detected_30d INTEGER DEFAULT 0, -- Contracts detected in last 30 days
  
  -- Metadata Timestamps
  fetched_at INTEGER NOT NULL, -- When metadata was fetched
  updated_at INTEGER NOT NULL, -- Last update timestamp
  
  -- Constraints
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_user_id ON telegram_chat_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_chat_id ON telegram_chat_metadata(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_chat_type ON telegram_chat_metadata(chat_type);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_is_admin ON telegram_chat_metadata(is_admin);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_is_creator ON telegram_chat_metadata(is_creator);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_member_count ON telegram_chat_metadata(member_count);
CREATE INDEX IF NOT EXISTS idx_telegram_chat_metadata_updated_at ON telegram_chat_metadata(updated_at);
