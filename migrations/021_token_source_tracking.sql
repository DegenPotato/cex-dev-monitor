-- Enhanced Token Source Tracking Migration
-- Adds comprehensive tracking of how tokens enter the system

-- Central token registry with source tracking
CREATE TABLE IF NOT EXISTS token_registry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL UNIQUE,
  
  -- Basic token info
  token_symbol TEXT,
  token_name TEXT,
  token_decimals INTEGER DEFAULT 9,
  
  -- Discovery/source info
  first_seen_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  first_source_type TEXT NOT NULL, -- 'telegram', 'manual', 'import', 'dex_scan', 'wallet_scan', 'api'
  first_source_details TEXT, -- JSON with source-specific details
  
  -- Telegram-specific (if source is telegram)
  telegram_chat_id TEXT,
  telegram_chat_name TEXT,
  telegram_message_id INTEGER,
  telegram_sender TEXT,
  
  -- User attribution
  discovered_by_user_id INTEGER,
  
  -- Metadata
  is_verified INTEGER DEFAULT 0,
  is_scam INTEGER DEFAULT 0,
  tags TEXT, -- JSON array of tags
  notes TEXT,
  
  -- Stats
  total_mentions INTEGER DEFAULT 1,
  total_trades INTEGER DEFAULT 0,
  first_trade_at INTEGER,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (discovered_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Track all token sightings/mentions
CREATE TABLE IF NOT EXISTS token_sightings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_mint TEXT NOT NULL,
  
  -- Source info
  source_type TEXT NOT NULL, -- 'telegram', 'manual_search', 'wallet_scan', 'trade', 'api'
  source_id TEXT, -- telegram message ID, trade ID, etc.
  source_details TEXT, -- JSON with context
  
  -- Context
  user_id INTEGER,
  chat_id TEXT,
  chat_name TEXT,
  sender TEXT,
  message_text TEXT,
  
  -- Metrics at time of sighting
  price_usd REAL,
  market_cap_usd REAL,
  volume_24h_usd REAL,
  
  sighted_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (token_mint) REFERENCES token_registry(token_mint) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Link trades to their discovery source
CREATE TABLE IF NOT EXISTS trade_source_attribution (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trade_id INTEGER NOT NULL,
  token_mint TEXT NOT NULL,
  
  -- Discovery source
  source_type TEXT, -- 'telegram', 'manual', etc.
  source_id TEXT, -- Reference to original detection/sighting
  source_chat_id TEXT,
  source_chat_name TEXT,
  
  -- Time metrics
  discovery_to_trade_seconds INTEGER, -- How long from discovery to trade
  
  -- Outcome tracking
  trade_outcome TEXT, -- 'profit', 'loss', 'break_even', 'pending'
  profit_loss_pct REAL,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (token_mint) REFERENCES token_registry(token_mint)
);

-- Create indexes for trade_source_attribution
CREATE INDEX IF NOT EXISTS idx_trade_source_token ON trade_source_attribution(token_mint);
CREATE INDEX IF NOT EXISTS idx_trade_source_type ON trade_source_attribution(source_type);
CREATE INDEX IF NOT EXISTS idx_trade_source_chat ON trade_source_attribution(source_chat_id);

-- Aggregate stats by source
CREATE VIEW IF NOT EXISTS token_source_performance AS
SELECT 
  source_type,
  source_chat_id,
  source_chat_name,
  COUNT(DISTINCT token_mint) as unique_tokens,
  COUNT(*) as total_trades,
  SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) as profitable_trades,
  AVG(profit_loss_pct) as avg_profit_loss_pct,
  AVG(discovery_to_trade_seconds) as avg_time_to_trade
FROM trade_source_attribution
GROUP BY source_type, source_chat_id;

-- Migrate existing telegram_detected_contracts to new system
INSERT OR IGNORE INTO token_registry (
  token_mint, 
  first_seen_at,
  first_source_type,
  first_source_details,
  telegram_chat_id,
  telegram_message_id,
  telegram_sender,
  discovered_by_user_id
)
SELECT 
  contract_address,
  detected_at,
  'telegram',
  json_object(
    'detection_type', detection_type,
    'original_format', original_format
  ),
  chat_id,
  message_id,
  sender_username,
  user_id
FROM telegram_detected_contracts
WHERE NOT EXISTS (
  SELECT 1 FROM token_registry WHERE token_mint = telegram_detected_contracts.contract_address
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_token_registry_mint ON token_registry(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_registry_source ON token_registry(first_source_type);
CREATE INDEX IF NOT EXISTS idx_token_registry_user ON token_registry(discovered_by_user_id);
CREATE INDEX IF NOT EXISTS idx_token_registry_telegram_chat ON token_registry(telegram_chat_id);
CREATE INDEX IF NOT EXISTS idx_token_sightings_mint ON token_sightings(token_mint);
CREATE INDEX IF NOT EXISTS idx_token_sightings_source ON token_sightings(source_type);
CREATE INDEX IF NOT EXISTS idx_token_sightings_user ON token_sightings(user_id);
