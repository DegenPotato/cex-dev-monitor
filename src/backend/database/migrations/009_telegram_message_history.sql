-- Store Telegram message history for monitored chats
-- This allows us to display chat history without repeated API calls

CREATE TABLE IF NOT EXISTS telegram_message_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  
  -- Message content
  message_text TEXT,
  message_date INTEGER NOT NULL, -- Unix timestamp
  
  -- Sender information
  sender_id TEXT,
  sender_username TEXT,
  sender_name TEXT,
  is_bot INTEGER DEFAULT 0,
  
  -- Message metadata
  is_forwarded INTEGER DEFAULT 0,
  forward_from_chat_id TEXT,
  forward_from_name TEXT,
  reply_to_message_id INTEGER,
  edit_date INTEGER,
  
  -- Media information
  has_media INTEGER DEFAULT 0,
  media_type TEXT, -- 'photo', 'video', 'document', 'sticker', etc.
  media_id TEXT,
  
  -- Contract detection
  has_contract INTEGER DEFAULT 0,
  detected_contracts TEXT, -- JSON array of detected addresses
  
  -- Timestamps
  fetched_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  
  -- Unique constraint to prevent duplicates
  UNIQUE(chat_id, message_id),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_telegram_messages_chat 
ON telegram_message_history(chat_id, message_date DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_user 
ON telegram_message_history(user_id);

CREATE INDEX IF NOT EXISTS idx_telegram_messages_contracts 
ON telegram_message_history(has_contract);

-- Store fetch metadata (when we last fetched history for each chat)
CREATE TABLE IF NOT EXISTS telegram_chat_fetch_status (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  
  -- Fetch status
  last_fetched_at INTEGER,
  oldest_message_id INTEGER,
  newest_message_id INTEGER,
  total_messages_fetched INTEGER DEFAULT 0,
  
  -- Rate limiting
  api_calls_made INTEGER DEFAULT 0,
  
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
