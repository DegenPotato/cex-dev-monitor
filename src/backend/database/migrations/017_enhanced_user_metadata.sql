-- Enhanced User Metadata for Moderation & Verification
-- Add profile pictures, phone numbers, verification flags, and more

-- Add new columns to telegram_chat_metadata for enhanced moderation
ALTER TABLE telegram_chat_metadata ADD COLUMN phone_number TEXT;
ALTER TABLE telegram_chat_metadata ADD COLUMN bio TEXT;
ALTER TABLE telegram_chat_metadata ADD COLUMN is_verified BOOLEAN DEFAULT 0;
ALTER TABLE telegram_chat_metadata ADD COLUMN is_scam BOOLEAN DEFAULT 0;
ALTER TABLE telegram_chat_metadata ADD COLUMN is_fake BOOLEAN DEFAULT 0;
ALTER TABLE telegram_chat_metadata ADD COLUMN is_premium BOOLEAN DEFAULT 0;
ALTER TABLE telegram_chat_metadata ADD COLUMN restriction_reason TEXT;
ALTER TABLE telegram_chat_metadata ADD COLUMN common_chats_count INTEGER DEFAULT 0;
ALTER TABLE telegram_chat_metadata ADD COLUMN last_seen_status TEXT; -- 'online', 'recently', 'within_week', 'within_month', 'long_ago', 'hidden'
ALTER TABLE telegram_chat_metadata ADD COLUMN last_seen_timestamp INTEGER;
ALTER TABLE telegram_chat_metadata ADD COLUMN photo_id TEXT; -- Telegram photo file ID
ALTER TABLE telegram_chat_metadata ADD COLUMN photo_local_path TEXT; -- Local cached photo path
ALTER TABLE telegram_chat_metadata ADD COLUMN access_hash TEXT; -- For API calls

-- Create index for moderation queries
CREATE INDEX IF NOT EXISTS idx_telegram_metadata_scam_flags 
ON telegram_chat_metadata(is_scam, is_fake);

CREATE INDEX IF NOT EXISTS idx_telegram_metadata_verification 
ON telegram_chat_metadata(is_verified);

CREATE INDEX IF NOT EXISTS idx_telegram_metadata_phone 
ON telegram_chat_metadata(phone_number);
