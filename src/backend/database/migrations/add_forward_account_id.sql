-- Add forward_account_id column to telegram_monitored_chats
-- This allows selecting which account to use for forwarding messages

ALTER TABLE telegram_monitored_chats 
ADD COLUMN forward_account_id INTEGER DEFAULT NULL;

-- Add index for performance
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_forward_account 
ON telegram_monitored_chats(forward_account_id);
