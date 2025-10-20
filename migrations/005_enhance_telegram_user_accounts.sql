-- Enhanced Telegram User Accounts Table
-- Add comprehensive fields to capture all available Telegram user data

-- Add new columns to telegram_user_accounts
ALTER TABLE telegram_user_accounts ADD COLUMN telegram_user_id TEXT; -- Telegram's actual user ID
ALTER TABLE telegram_user_accounts ADD COLUMN first_name TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN last_name TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN username TEXT; -- @username
ALTER TABLE telegram_user_accounts ADD COLUMN phone TEXT; -- May differ from phone_number used for auth
ALTER TABLE telegram_user_accounts ADD COLUMN language_code TEXT; -- User's language preference
ALTER TABLE telegram_user_accounts ADD COLUMN photo_id TEXT; -- Profile photo ID
ALTER TABLE telegram_user_accounts ADD COLUMN photo_dc_id INTEGER; -- Data center ID for photo
ALTER TABLE telegram_user_accounts ADD COLUMN photo_has_video BOOLEAN DEFAULT 0; -- Animated profile photo
ALTER TABLE telegram_user_accounts ADD COLUMN access_hash TEXT; -- Access hash for API calls

-- Status and verification flags
ALTER TABLE telegram_user_accounts ADD COLUMN is_bot BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_verified_telegram BOOLEAN DEFAULT 0; -- Telegram blue check
ALTER TABLE telegram_user_accounts ADD COLUMN is_restricted BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_scam BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_fake BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN is_premium BOOLEAN DEFAULT 0; -- Telegram Premium
ALTER TABLE telegram_user_accounts ADD COLUMN is_support BOOLEAN DEFAULT 0; -- Official support account
ALTER TABLE telegram_user_accounts ADD COLUMN is_self BOOLEAN DEFAULT 0; -- Is the authenticated user

-- Account restrictions
ALTER TABLE telegram_user_accounts ADD COLUMN restriction_reason TEXT; -- JSON array of restrictions
ALTER TABLE telegram_user_accounts ADD COLUMN restriction_platform TEXT; -- Which platform restricted
ALTER TABLE telegram_user_accounts ADD COLUMN restriction_text TEXT; -- Restriction message

-- Online/activity status
ALTER TABLE telegram_user_accounts ADD COLUMN status_type TEXT; -- 'online', 'offline', 'recently', 'within_week', 'within_month', 'long_ago'
ALTER TABLE telegram_user_accounts ADD COLUMN status_was_online INTEGER; -- Last seen timestamp
ALTER TABLE telegram_user_accounts ADD COLUMN status_expires INTEGER; -- When status expires

-- Bot-specific fields (if account is a bot)
ALTER TABLE telegram_user_accounts ADD COLUMN bot_inline_placeholder TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN bot_can_join_groups BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN bot_can_read_all_group_messages BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN bot_is_inline BOOLEAN DEFAULT 0;

-- Privacy and settings
ALTER TABLE telegram_user_accounts ADD COLUMN stories_hidden BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN stories_unavailable BOOLEAN DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN has_contact BOOLEAN DEFAULT 0; -- Is in contacts
ALTER TABLE telegram_user_accounts ADD COLUMN mutual_contact BOOLEAN DEFAULT 0;

-- Business/features
ALTER TABLE telegram_user_accounts ADD COLUMN emoji_status_document_id TEXT; -- Custom emoji status
ALTER TABLE telegram_user_accounts ADD COLUMN emoji_status_until INTEGER; -- Emoji status expiry
ALTER TABLE telegram_user_accounts ADD COLUMN about TEXT; -- Bio/about section
ALTER TABLE telegram_user_accounts ADD COLUMN common_chats_count INTEGER; -- Number of common chats

-- Datacenter and technical info
ALTER TABLE telegram_user_accounts ADD COLUMN dc_id INTEGER; -- Primary datacenter ID
ALTER TABLE telegram_user_accounts ADD COLUMN bot_info_version INTEGER; -- Bot API version

-- Metadata for tracking
ALTER TABLE telegram_user_accounts ADD COLUMN profile_fetched_at INTEGER; -- Last time profile was fetched
ALTER TABLE telegram_user_accounts ADD COLUMN profile_data_raw TEXT; -- JSON of complete raw profile data for future reference

-- Statistics
ALTER TABLE telegram_user_accounts ADD COLUMN total_chats_fetched INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN last_chat_fetch_at INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN total_messages_monitored INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN total_contracts_detected INTEGER DEFAULT 0;

-- Connection quality metrics
ALTER TABLE telegram_user_accounts ADD COLUMN connection_failures INTEGER DEFAULT 0;
ALTER TABLE telegram_user_accounts ADD COLUMN last_connection_error TEXT;
ALTER TABLE telegram_user_accounts ADD COLUMN last_error_at INTEGER;
ALTER TABLE telegram_user_accounts ADD COLUMN session_expires_at INTEGER; -- When session might expire
ALTER TABLE telegram_user_accounts ADD COLUMN auto_reconnect BOOLEAN DEFAULT 1;

-- Create indexes for new searchable fields
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_telegram_user_id ON telegram_user_accounts(telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_username ON telegram_user_accounts(username);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_is_verified ON telegram_user_accounts(is_verified);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_status_type ON telegram_user_accounts(status_type);
CREATE INDEX IF NOT EXISTS idx_telegram_user_accounts_last_connected ON telegram_user_accounts(last_connected_at);
