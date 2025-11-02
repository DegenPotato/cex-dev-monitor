-- Test Lab Telegram Monitors
-- Stores configurations for auto-monitoring specific users in Telegram chats

CREATE TABLE IF NOT EXISTS test_lab_telegram_monitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  telegram_account_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  target_username TEXT NOT NULL,
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_test_lab_monitors_user 
  ON test_lab_telegram_monitors(user_id);

CREATE INDEX IF NOT EXISTS idx_test_lab_monitors_chat 
  ON test_lab_telegram_monitors(chat_id);

CREATE INDEX IF NOT EXISTS idx_test_lab_monitors_active 
  ON test_lab_telegram_monitors(is_active);

-- Track auto-created campaigns from telegram monitors
CREATE TABLE IF NOT EXISTS test_lab_auto_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  monitor_id INTEGER NOT NULL,
  campaign_id TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  message_id INTEGER NOT NULL,
  detected_at INTEGER NOT NULL,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  FOREIGN KEY (monitor_id) REFERENCES test_lab_telegram_monitors(id)
);

CREATE INDEX IF NOT EXISTS idx_test_lab_auto_campaigns_monitor 
  ON test_lab_auto_campaigns(monitor_id);

CREATE INDEX IF NOT EXISTS idx_test_lab_auto_campaigns_campaign 
  ON test_lab_auto_campaigns(campaign_id);
