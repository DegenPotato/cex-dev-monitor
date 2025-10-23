-- Migration 028: Add topic-level monitoring support for Telegram forum groups
-- Date: 2024-10-23
-- Description: Enables granular monitoring of specific topics within forum groups

-- Add topic monitoring columns to telegram_monitored_chats
ALTER TABLE telegram_monitored_chats ADD COLUMN monitored_topic_ids TEXT DEFAULT NULL;
-- Format: JSON array of topic IDs, e.g., ["123", "456"] or null for all topics

-- Add topic-specific user filters
ALTER TABLE telegram_monitored_chats ADD COLUMN topic_user_filters TEXT DEFAULT NULL;
-- Format: JSON object mapping topic IDs to user ID arrays
-- Example: {"123": ["userId1", "userId2"], "456": ["userId3"]}

-- Track topic info in message history
ALTER TABLE telegram_message_history ADD COLUMN topic_id TEXT DEFAULT NULL;
ALTER TABLE telegram_message_history ADD COLUMN topic_title TEXT DEFAULT NULL;

-- Track topic info in detected contracts
ALTER TABLE telegram_detected_contracts ADD COLUMN topic_id TEXT DEFAULT NULL;
ALTER TABLE telegram_detected_contracts ADD COLUMN topic_title TEXT DEFAULT NULL;

-- Create index for topic-based queries
CREATE INDEX IF NOT EXISTS idx_message_history_topic ON telegram_message_history(chat_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_detected_contracts_topic ON telegram_detected_contracts(chat_id, topic_id);

-- Create a view for topic statistics
CREATE VIEW IF NOT EXISTS telegram_topic_stats AS
SELECT 
    chat_id,
    topic_id,
    topic_title,
    COUNT(DISTINCT message_id) as message_count,
    COUNT(DISTINCT sender_id) as unique_senders,
    COUNT(DISTINCT CASE WHEN detected_contracts IS NOT NULL THEN message_id END) as messages_with_contracts,
    MAX(message_timestamp) as last_message_time
FROM telegram_message_history
WHERE topic_id IS NOT NULL
GROUP BY chat_id, topic_id, topic_title;
