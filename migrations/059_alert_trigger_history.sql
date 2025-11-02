-- Alert Trigger History Table
-- Stores history of triggered alerts with executed actions

CREATE TABLE IF NOT EXISTS alert_trigger_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  campaign_id TEXT NOT NULL,
  alert_id TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  trigger_price_sol REAL NOT NULL,
  trigger_price_usd REAL,
  change_percent REAL DEFAULT 0,
  alert_type TEXT NOT NULL,        -- e.g., "above 5%" or "below 0.001 SOL"
  alert_target REAL NOT NULL,      -- Target price that was hit
  actions_executed TEXT,            -- JSON array of actions that were executed
  triggered_at INTEGER NOT NULL,   -- Timestamp when alert triggered
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000)
);

-- Index for campaign lookups
CREATE INDEX IF NOT EXISTS idx_alert_trigger_history_campaign 
  ON alert_trigger_history(campaign_id);

-- Index for timestamp queries
CREATE INDEX IF NOT EXISTS idx_alert_trigger_history_triggered_at 
  ON alert_trigger_history(triggered_at DESC);

-- Index for token lookups
CREATE INDEX IF NOT EXISTS idx_alert_trigger_history_token 
  ON alert_trigger_history(token_mint);
