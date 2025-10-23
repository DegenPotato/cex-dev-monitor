-- Migration 029: Advanced Topic Monitoring Features
-- Date: 2024-10-23
-- Description: Adds topic discovery, performance analytics, and topic-based forwarding

-- ============================================
-- 1. Topic Discovery Cache
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_forum_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  topic_title TEXT,
  icon_emoji TEXT,
  icon_color INTEGER,
  is_general INTEGER DEFAULT 0,
  is_closed INTEGER DEFAULT 0,
  creator_id TEXT,
  created_date INTEGER,
  message_count INTEGER DEFAULT 0,
  last_message_date INTEGER,
  discovered_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_forum_topics_chat ON telegram_forum_topics(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_forum_topics_updated ON telegram_forum_topics(updated_at);

-- ============================================
-- 2. Topic-Specific User Filters (Enhanced)
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_topic_user_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  monitored_user_ids TEXT, -- JSON array of user IDs
  excluded_user_ids TEXT,   -- JSON array of excluded user IDs
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id, topic_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_user_filters ON telegram_topic_user_filters(user_id, chat_id, topic_id);

-- ============================================
-- 3. Topic Performance Analytics
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_topic_performance (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  date INTEGER NOT NULL, -- Daily aggregation (timestamp at start of day)
  
  -- Message metrics
  total_messages INTEGER DEFAULT 0,
  messages_with_contracts INTEGER DEFAULT 0,
  unique_contracts INTEGER DEFAULT 0,
  
  -- Forward metrics
  contracts_forwarded INTEGER DEFAULT 0,
  forward_success_rate REAL DEFAULT 0,
  avg_forward_latency_ms INTEGER DEFAULT 0,
  
  -- Quality metrics
  verified_contracts INTEGER DEFAULT 0,  -- Contracts that were verified on-chain
  scam_contracts INTEGER DEFAULT 0,      -- Known scams/rugs
  profitable_contracts INTEGER DEFAULT 0, -- Contracts that went up in value
  
  -- User activity
  unique_senders INTEGER DEFAULT 0,
  bot_messages INTEGER DEFAULT 0,
  admin_messages INTEGER DEFAULT 0,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  UNIQUE(user_id, chat_id, topic_id, date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_performance_date ON telegram_topic_performance(date DESC);
CREATE INDEX IF NOT EXISTS idx_topic_performance_quality ON telegram_topic_performance(profitable_contracts DESC);

-- ============================================
-- 4. Topic-Based Forwarding Rules
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_topic_forward_rules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  source_chat_id TEXT NOT NULL,
  topic_id TEXT NOT NULL,
  
  -- Forward destinations (can be different per topic)
  target_chat_id TEXT NOT NULL,
  target_chat_name TEXT,
  forward_account_id INTEGER,
  
  -- Topic-specific settings
  forward_all INTEGER DEFAULT 0,           -- Forward all messages from topic
  forward_contracts_only INTEGER DEFAULT 1, -- Only forward if contract detected
  forward_keywords TEXT,                    -- Additional keywords to trigger forward
  
  -- Filtering
  min_message_length INTEGER DEFAULT 0,
  max_message_length INTEGER DEFAULT 0,
  forward_from_bots INTEGER DEFAULT 0,
  forward_from_admins_only INTEGER DEFAULT 0,
  
  is_active INTEGER DEFAULT 1,
  priority INTEGER DEFAULT 0,  -- Higher priority rules execute first
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_topic_forward_rules ON telegram_topic_forward_rules(user_id, source_chat_id, topic_id);
CREATE INDEX IF NOT EXISTS idx_topic_forward_priority ON telegram_topic_forward_rules(priority DESC);

-- ============================================
-- 5. Topic Detection Tracking (Enhanced)
-- ============================================
ALTER TABLE telegram_detected_contracts ADD COLUMN topic_performance_tracked INTEGER DEFAULT 0;

-- ============================================
-- 6. Analytics Views
-- ============================================

-- View: Best performing topics by profit ratio
CREATE VIEW IF NOT EXISTS telegram_best_topics AS
SELECT 
  tp.user_id,
  tp.chat_id,
  tp.topic_id,
  ft.topic_title,
  SUM(tp.total_messages) as total_messages,
  SUM(tp.messages_with_contracts) as messages_with_contracts,
  SUM(tp.unique_contracts) as unique_contracts,
  SUM(tp.profitable_contracts) as profitable_contracts,
  CASE 
    WHEN SUM(tp.unique_contracts) > 0 
    THEN CAST(SUM(tp.profitable_contracts) AS REAL) / SUM(tp.unique_contracts)
    ELSE 0 
  END as profit_ratio,
  MAX(tp.date) as last_active_date
FROM telegram_topic_performance tp
LEFT JOIN telegram_forum_topics ft ON 
  tp.user_id = ft.user_id AND 
  tp.chat_id = ft.chat_id AND 
  tp.topic_id = ft.topic_id
GROUP BY tp.user_id, tp.chat_id, tp.topic_id
ORDER BY profit_ratio DESC;

-- View: Topic activity heatmap (by hour)
CREATE VIEW IF NOT EXISTS telegram_topic_activity AS
SELECT 
  user_id,
  chat_id,
  topic_id,
  strftime('%H', message_timestamp, 'unixepoch') as hour,
  COUNT(*) as message_count,
  COUNT(DISTINCT CASE WHEN detected_contracts IS NOT NULL THEN message_id END) as contract_messages
FROM telegram_message_history
WHERE topic_id IS NOT NULL
GROUP BY user_id, chat_id, topic_id, hour;

-- ============================================
-- 7. Logging table for topic operations
-- ============================================
CREATE TABLE IF NOT EXISTS telegram_topic_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  topic_id TEXT,
  operation TEXT NOT NULL, -- 'discovered', 'filter_updated', 'forward_triggered', 'performance_tracked'
  details TEXT,            -- JSON with operation-specific details
  status TEXT,            -- 'success', 'failed', 'skipped'
  error_message TEXT,
  created_at INTEGER DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_topic_logs_operation ON telegram_topic_logs(operation, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_topic_logs_errors ON telegram_topic_logs(status, created_at DESC) WHERE status = 'failed';
