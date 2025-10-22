-- Comprehensive Caller/KOL Performance Tracking System
-- Track individual callers, their shills, and performance metrics

-- Main table for individual callers/KOLs
CREATE TABLE IF NOT EXISTS telegram_callers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,  -- Our system user
  telegram_user_id TEXT NOT NULL,  -- Telegram's user ID
  username TEXT,
  first_name TEXT,
  last_name TEXT,
  is_bot BOOLEAN DEFAULT 0,
  is_premium BOOLEAN DEFAULT 0,
  is_verified BOOLEAN DEFAULT 0,
  
  -- Aggregated stats
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,  -- Calls that reached certain multiplier
  avg_peak_multiplier REAL DEFAULT 0,
  avg_time_to_peak INTEGER DEFAULT 0,  -- In minutes
  total_volume_generated REAL DEFAULT 0,  -- In USD
  win_rate REAL DEFAULT 0,  -- Percentage
  
  -- Reputation scoring
  reputation_score REAL DEFAULT 0,  -- 0-100 scale
  trust_level TEXT DEFAULT 'unknown',  -- 'trusted', 'neutral', 'suspicious', 'scammer'
  
  -- Activity tracking
  first_seen INTEGER,
  last_seen INTEGER,
  last_call_date INTEGER,
  
  -- Profile enrichment
  bio TEXT,
  profile_photo_url TEXT,
  associated_channels TEXT,  -- JSON array of channel IDs
  known_wallets TEXT,  -- JSON array of wallet addresses
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id, telegram_user_id)
);

-- Track individual token calls/shills
CREATE TABLE IF NOT EXISTS telegram_token_calls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  caller_id INTEGER NOT NULL,  -- FK to telegram_callers
  chat_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  
  -- Token info
  contract_address TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  chain TEXT DEFAULT 'solana',
  
  -- Call details
  call_timestamp INTEGER NOT NULL,
  call_type TEXT,  -- 'launch', 'buy', 'pump', 'moon', 'ape', etc.
  call_message TEXT,  -- Full message text
  confidence_score REAL DEFAULT 0,  -- How confident the call seems (0-1)
  
  -- Price tracking
  price_at_call REAL,
  mcap_at_call REAL,
  ath_price REAL,
  ath_mcap REAL,
  ath_timestamp INTEGER,
  ath_multiplier REAL,  -- ATH/initial price
  
  -- Current metrics (updated periodically)
  current_price REAL,
  current_mcap REAL,
  current_multiplier REAL,
  last_price_update INTEGER,
  
  -- Performance metrics
  time_to_ath INTEGER,  -- Minutes from call to ATH
  max_drawdown REAL,  -- Percentage
  volume_24h REAL,
  holder_count INTEGER,
  
  -- Status tracking
  is_rugpull BOOLEAN DEFAULT 0,
  is_honeypot BOOLEAN DEFAULT 0,
  is_successful BOOLEAN DEFAULT 0,  -- Hit target multiplier
  
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (caller_id) REFERENCES telegram_callers(id) ON DELETE CASCADE
);

-- Track channel/group performance
CREATE TABLE IF NOT EXISTS telegram_channel_stats (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  chat_id TEXT NOT NULL,
  chat_name TEXT,
  chat_type TEXT,
  
  -- Aggregated metrics
  total_calls INTEGER DEFAULT 0,
  successful_calls INTEGER DEFAULT 0,
  avg_multiplier REAL DEFAULT 0,
  total_volume REAL DEFAULT 0,
  
  -- Top performers
  top_callers TEXT,  -- JSON array of top 10 caller IDs
  best_call_id INTEGER,  -- Reference to best performing call
  worst_call_id INTEGER,  -- Reference to worst performing call
  
  -- Activity metrics
  calls_today INTEGER DEFAULT 0,
  calls_this_week INTEGER DEFAULT 0,
  calls_this_month INTEGER DEFAULT 0,
  
  -- Reputation
  channel_reputation REAL DEFAULT 0,  -- 0-100 scale
  scam_probability REAL DEFAULT 0,  -- 0-1 scale
  
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id, chat_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Store OHLCV data for called tokens
CREATE TABLE IF NOT EXISTS token_ohlcv_data (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  contract_address TEXT NOT NULL,
  timestamp INTEGER NOT NULL,
  timeframe TEXT NOT NULL,  -- '1m', '5m', '15m', '1h', '4h', '1d'
  
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  
  trades_count INTEGER,
  buyer_count INTEGER,
  seller_count INTEGER,
  
  UNIQUE(contract_address, timestamp, timeframe)
);

-- Campaign management for tracking specific strategies
CREATE TABLE IF NOT EXISTS sniffer_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  
  -- Configuration
  target_channels TEXT,  -- JSON array of channel IDs to monitor
  target_callers TEXT,  -- JSON array of caller IDs to follow
  min_confidence REAL DEFAULT 0.5,
  max_mcap REAL,  -- Maximum market cap to enter
  target_multiplier REAL DEFAULT 2,  -- Exit target
  stop_loss REAL DEFAULT 0.5,  -- Stop loss percentage
  
  -- Performance tracking
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_pnl REAL DEFAULT 0,
  best_trade_id INTEGER,
  worst_trade_id INTEGER,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  ended_at INTEGER,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Detailed caller relationships and patterns
CREATE TABLE IF NOT EXISTS caller_relationships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  caller_id_1 INTEGER NOT NULL,
  caller_id_2 INTEGER NOT NULL,
  
  -- Relationship metrics
  co_call_count INTEGER DEFAULT 0,  -- Times they called same token
  correlation_score REAL DEFAULT 0,  -- -1 to 1, how correlated their calls are
  avg_time_difference INTEGER,  -- Average minutes between their calls
  
  -- Pattern detection
  is_coordinated BOOLEAN DEFAULT 0,  -- Likely coordinating
  pattern_type TEXT,  -- 'pump_group', 'insider', 'copy_trader', etc.
  
  last_updated INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(caller_id_1, caller_id_2),
  FOREIGN KEY (caller_id_1) REFERENCES telegram_callers(id),
  FOREIGN KEY (caller_id_2) REFERENCES telegram_callers(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_telegram_callers_user_telegram ON telegram_callers(user_id, telegram_user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_callers_reputation ON telegram_callers(reputation_score DESC);
CREATE INDEX IF NOT EXISTS idx_telegram_callers_win_rate ON telegram_callers(win_rate DESC);

CREATE INDEX IF NOT EXISTS idx_token_calls_caller ON telegram_token_calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_token_calls_contract ON telegram_token_calls(contract_address);
CREATE INDEX IF NOT EXISTS idx_token_calls_timestamp ON telegram_token_calls(call_timestamp);
CREATE INDEX IF NOT EXISTS idx_token_calls_multiplier ON telegram_token_calls(ath_multiplier DESC);

CREATE INDEX IF NOT EXISTS idx_channel_stats_chat ON telegram_channel_stats(user_id, chat_id);
CREATE INDEX IF NOT EXISTS idx_channel_stats_reputation ON telegram_channel_stats(channel_reputation DESC);

CREATE INDEX IF NOT EXISTS idx_ohlcv_contract_time ON token_ohlcv_data(contract_address, timestamp, timeframe);

CREATE INDEX IF NOT EXISTS idx_campaigns_user ON sniffer_campaigns(user_id, is_active);

CREATE INDEX IF NOT EXISTS idx_relationships_callers ON caller_relationships(caller_id_1, caller_id_2);
CREATE INDEX IF NOT EXISTS idx_relationships_coordinated ON caller_relationships(is_coordinated, correlation_score);
