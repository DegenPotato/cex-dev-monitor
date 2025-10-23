-- Telegram Entity Cache
-- Stores entity information to prevent "Could not find entity" errors
CREATE TABLE IF NOT EXISTS telegram_entity_cache (
  entity_id TEXT PRIMARY KEY,                -- User ID, chat ID, or channel ID
  entity_type TEXT NOT NULL,                 -- 'user', 'chat', or 'channel'
  access_hash TEXT,                           -- Access hash for users (if available)
  username TEXT,                              -- Username (if available)
  title TEXT,                                 -- Title for chats/channels
  cached_at INTEGER NOT NULL,                -- When entity was cached
  last_used INTEGER NOT NULL,                -- Last time entity was used
  metadata TEXT                               -- Additional metadata as JSON
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_telegram_entity_cache_type ON telegram_entity_cache(entity_type);
CREATE INDEX IF NOT EXISTS idx_telegram_entity_cache_cached ON telegram_entity_cache(cached_at);
CREATE INDEX IF NOT EXISTS idx_telegram_entity_cache_used ON telegram_entity_cache(last_used);
