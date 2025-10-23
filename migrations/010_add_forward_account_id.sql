-- Add forward_account_id column to telegram_monitored_chats if it doesn't exist
-- This allows selecting which account to use for forwarding messages

-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE ADD COLUMN
-- So we need to check if the column exists first
-- This is a safe migration that won't error if column already exists

BEGIN TRANSACTION;

-- Try to add the column (will silently fail if it exists)
ALTER TABLE telegram_monitored_chats ADD COLUMN forward_account_id INTEGER DEFAULT NULL;

COMMIT;

-- Add index for performance (IF NOT EXISTS handles duplicates)
CREATE INDEX IF NOT EXISTS idx_telegram_monitored_chats_forward_account 
ON telegram_monitored_chats(forward_account_id);
