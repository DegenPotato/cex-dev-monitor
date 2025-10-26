-- Token Price Oracle Filters
-- Tracks which tokens should be excluded from automatic price fetching

CREATE TABLE IF NOT EXISTS token_price_oracle_filters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL UNIQUE,
  filter_reason TEXT NOT NULL, -- 'backlog', 'inactive', 'dormant', 'manual_pause', 'low_liquidity'
  paused_by_user_id INTEGER, -- NULL if auto-paused, user_id if manually paused
  paused_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  resume_after INTEGER, -- Optional timestamp to auto-resume
  notes TEXT, -- Optional admin notes
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (paused_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_token_oracle_filters_mint ON token_price_oracle_filters(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_oracle_filters_reason ON token_price_oracle_filters(filter_reason);
CREATE INDEX IF NOT EXISTS idx_token_oracle_filters_resume ON token_price_oracle_filters(resume_after) WHERE resume_after IS NOT NULL;

-- Global Oracle Configuration
CREATE TABLE IF NOT EXISTS token_price_oracle_config (
  id INTEGER PRIMARY KEY CHECK (id = 1), -- Only one row allowed
  is_running INTEGER NOT NULL DEFAULT 1, -- Global on/off switch
  update_interval_ms INTEGER NOT NULL DEFAULT 60000, -- 60 seconds default
  filter_backlog_tokens INTEGER NOT NULL DEFAULT 1, -- Auto-filter backlog tokens
  filter_inactive_tokens INTEGER NOT NULL DEFAULT 0, -- Auto-filter inactive tokens (optional)
  inactive_threshold_days INTEGER NOT NULL DEFAULT 7, -- Days without activity to be considered inactive
  last_started_at INTEGER,
  last_stopped_at INTEGER,
  started_by_user_id INTEGER,
  stopped_by_user_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (started_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (stopped_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default config
INSERT OR IGNORE INTO token_price_oracle_config (id, is_running) VALUES (1, 1);

-- View to get oracle-eligible tokens (not filtered)
CREATE VIEW IF NOT EXISTS token_price_oracle_eligible AS
SELECT 
  tr.token_mint,
  tr.symbol,
  tr.name,
  tr.first_seen_at,
  tr.first_source_type,
  json_extract(tr.first_source_details, '$.detectionType') as detection_type,
  tr.total_mentions,
  tr.total_trades,
  tr.last_mention_at
FROM token_registry tr
LEFT JOIN token_price_oracle_filters tpof ON tr.token_mint = tpof.token_mint
WHERE tpof.token_mint IS NULL -- Not in filter table
  AND tr.token_mint IS NOT NULL
  AND tr.token_mint != ''
  AND tr.token_mint != 'So11111111111111111111111111111111111111112'; -- Exclude SOL
