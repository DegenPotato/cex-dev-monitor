-- Telegram Integration Tables
-- Store user and bot account configurations for Telegram monitoring

-- Telegram User Accounts (using Telethon/TDLib for full chat access)
CREATE TABLE IF NOT EXISTS telegram_user_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- Links to users table
  api_id TEXT NOT NULL,
  api_hash TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  session_string TEXT, -- Encrypted session data
  is_verified BOOLEAN DEFAULT 0,
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id)
);

-- Telegram Bot Accounts (using Bot API for sending/receiving)
CREATE TABLE IF NOT EXISTS telegram_bot_accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- Links to users table
  bot_token TEXT NOT NULL,
  bot_username TEXT,
  is_verified BOOLEAN DEFAULT 0,
  last_connected_at INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id)
);

-- Monitored Chats/Channels Configuration
CREATE TABLE IF NOT EXISTS telegram_monitored_chats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL, -- Links to users table
  chat_id TEXT NOT NULL, -- Can be numeric ID or username
  chat_name TEXT,
  chat_type TEXT, -- 'group', 'supergroup', 'channel', 'private'
  is_active BOOLEAN DEFAULT 1,
  forward_to_chat_id TEXT, -- Where to forward detected contracts
  monitored_user_ids TEXT, -- JSON array of user IDs to filter
  monitored_keywords TEXT, -- JSON array of keywords to monitor
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id)
);

-- Detected Contracts from Telegram
CREATE TABLE IF NOT EXISTS telegram_detected_contracts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  sender_id TEXT,
  sender_username TEXT,
  contract_address TEXT NOT NULL,
  detection_type TEXT, -- 'standard', 'obfuscated', 'split'
  original_format TEXT, -- How it appeared in the message
  message_text TEXT,
  forwarded BOOLEAN DEFAULT 0,
  detected_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_user_id ON telegram_user_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_bot_accounts_user_id ON telegram_bot_accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_user_id ON telegram_monitored_chats(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_active ON telegram_monitored_chats(is_active);
CREATE INDEX IF NOT EXISTS idx_telegram_detected_contracts_user_id ON telegram_detected_contracts(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_detected_contracts_address ON telegram_detected_contracts(contract_address);
CREATE INDEX IF NOT EXISTS idx_telegram_detected_contracts_detected_at ON telegram_detected_contracts(detected_at);
