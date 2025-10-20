-- Add username and invite_link columns to telegram_monitored_chats
ALTER TABLE telegram_monitored_chats ADD COLUMN username TEXT;
ALTER TABLE telegram_monitored_chats ADD COLUMN invite_link TEXT;
