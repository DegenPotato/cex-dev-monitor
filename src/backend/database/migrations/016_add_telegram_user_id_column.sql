-- Add missing telegram_user_id column and other essential profile fields
-- This fixes the "no such column: telegram_user_id" error on startup

-- Add telegram_user_id column (the main missing one causing the error)
ALTER TABLE telegram_user_accounts ADD COLUMN telegram_user_id TEXT;

-- Add other essential profile fields that are being used in TelegramClientService
ALTER TABLE telegram_user_accounts ADD COLUMN first_name TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN last_name TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN username TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN phone TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN language_code TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN access_hash TEXT;

-- Status and verification flags
ALTER TABLE telegram_user_accounts ADD COLUMN is_bot BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_verified_telegram BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_restricted BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_scam BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_fake BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_premium BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_support BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_self BOOLEAN DEFAULT 0;

-- Photo information
ALTER TABLE telegram_user_accounts ADD COLUMN photo_id TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN photo_dc_id INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN photo_has_video BOOLEAN DEFAULT 0;

-- Online/activity status
ALTER TABLE telegram_user_accounts ADD COLUMN status_type TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN status_was_online INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN status_expires INTEGER;

-- Profile metadata
ALTER TABLE telegram_user_accounts ADD COLUMN about TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN dc_id INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN profile_fetched_at INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN profile_data_raw TEXT;

-- Statistics and connection metrics
ALTER TABLE telegram_user_accounts ADD COLUMN total_chats_fetched INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN last_chat_fetch_at INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN total_messages_monitored INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN total_contracts_detected INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN connection_failures INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN last_connection_error TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN last_error_at INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_telegram_user_id ON telegram_user_accounts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_username ON telegram_user_accounts(username);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_status_type ON telegram_user_accounts(status_type);
