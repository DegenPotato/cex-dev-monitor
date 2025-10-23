-- Migration 015: Add bot message filtering configuration
-- Date: 2024-10-21
-- Description: Adds ability to toggle processing of messages from bot accounts per chat

-- Add process_bot_messages column to telegram_monitored_chats
ALTER TABLE telegram_monitored_chats ADD COLUMN process_bot_messages BOOLEAN DEFAULT 0;

-- Add process_bot_messages column to telegram_chat_configs for duplicate strategy configs
ALTER TABLE telegram_chat_configs ADD COLUMN process_bot_messages BOOLEAN DEFAULT 0;

-- Update existing chats to have bot processing disabled by default for safety
UPDATE telegram_monitored_chats SET process_bot_messages = 0 WHERE process_bot_messages IS NULL;
UPDATE telegram_chat_configs SET process_bot_messages = 0 WHERE process_bot_messages IS NULL;
