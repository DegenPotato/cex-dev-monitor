-- Fix bot detection: Update chat_type for bot accounts
-- Bots were incorrectly classified as 'private' chats

-- First, let's check if we need to add an is_bot column
-- (This might already exist depending on your schema)
ALTER TABLE telegram_monitored_chats ADD COLUMN is_bot INTEGER DEFAULT 0;

-- Update existing entries that are bots based on username patterns
-- Common bot username patterns: ends with 'bot', '_bot', or 'Bot'
UPDATE telegram_monitored_chats 
SET chat_type = 'bot',
    is_bot = 1,
    updated_at = strftime('%s', 'now')
WHERE chat_type = 'private' 
  AND (
    username LIKE '%bot' OR 
    username LIKE '%_bot' OR 
    username LIKE '%Bot' OR
    chat_name LIKE '%bot' OR
    chat_name LIKE '% Bot'
  );

-- Backfill invite links for chats that have usernames
-- (This handles both bots and regular chats)
UPDATE telegram_monitored_chats 
SET invite_link = 'https://t.me/' || username,
    updated_at = strftime('%s', 'now')
WHERE username IS NOT NULL 
  AND username != ''
  AND (invite_link IS NULL OR invite_link = '');

-- Create index for faster bot filtering
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_is_bot 
ON telegram_monitored_chats(is_bot);

CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_type 
ON telegram_monitored_chats(chat_type);
