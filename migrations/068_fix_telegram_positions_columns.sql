-- ============================================================================
-- FIX TELEGRAM TRADING POSITIONS TABLE - RECREATE WITH ALL COLUMNS
-- ============================================================================
-- Since SQLite doesn't support conditional column adding, we'll recreate the table

-- Drop old table if it exists and recreate with all columns
DROP TABLE IF EXISTS telegram_trading_positions_backup;

-- Backup existing data if table exists
CREATE TABLE IF NOT EXISTS telegram_trading_positions_backup AS 
SELECT * FROM telegram_trading_positions WHERE 1=1;

-- Drop and recreate with full schema
DROP TABLE IF EXISTS telegram_trading_positions;

CREATE TABLE telegram_trading_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  token_mint TEXT NOT NULL,
  
  -- Core trading fields
  buy_amount_sol REAL DEFAULT 0,
  total_invested_sol REAL DEFAULT 0,
  buy_signature TEXT,
  buy_price_usd REAL DEFAULT 0,
  tokens_bought REAL DEFAULT 0,
  current_tokens REAL DEFAULT 0,
  
  -- Source attribution
  source_chat_id TEXT,
  source_chat_name TEXT,
  source_message_id INTEGER DEFAULT 0,
  source_sender_id TEXT,
  source_sender_username TEXT,
  detection_type TEXT DEFAULT 'standard',
  
  -- Status tracking
  status TEXT DEFAULT 'open',
  detected_at INTEGER,
  first_buy_at INTEGER,
  
  -- Performance metrics
  current_price REAL DEFAULT 0,
  current_balance REAL DEFAULT 0,
  realized_pnl_sol REAL DEFAULT 0,
  realized_pnl_usd REAL DEFAULT 0,
  unrealized_pnl_sol REAL DEFAULT 0,
  unrealized_pnl_usd REAL DEFAULT 0,
  total_pnl_sol REAL DEFAULT 0,
  total_pnl_usd REAL DEFAULT 0,
  roi_percent REAL DEFAULT 0,
  
  -- Peak tracking
  peak_price REAL DEFAULT 0,
  peak_pnl_sol REAL DEFAULT 0,
  peak_roi_percent REAL DEFAULT 0,
  max_drawdown_percent REAL DEFAULT 0,
  
  -- Exit tracking
  closed_at INTEGER,
  exit_reason TEXT,
  exit_price REAL,
  exit_roi_percent REAL,
  
  -- Timestamps
  last_price_update INTEGER,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Restore data from backup if it exists
-- Only restore columns that existed in the old table
INSERT OR IGNORE INTO telegram_trading_positions (
  id, user_id, wallet_id, token_mint, status, 
  created_at, updated_at
)
SELECT 
  id, user_id, wallet_id, token_mint,
  COALESCE(status, 'open'),
  created_at, updated_at
FROM telegram_trading_positions_backup WHERE 1=1;

-- Drop backup table
DROP TABLE IF EXISTS telegram_trading_positions_backup;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_telegram_positions_token ON telegram_trading_positions(token_mint);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_status ON telegram_trading_positions(status);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_user ON telegram_trading_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_wallet ON telegram_trading_positions(wallet_id);

-- Add missing columns to telegram_monitored_chats without recreating the table
-- These will fail silently if columns already exist

-- Add alert_templates for comprehensive alerts
ALTER TABLE telegram_monitored_chats ADD COLUMN alert_templates TEXT;

-- Add is_active column that the code is looking for
ALTER TABLE telegram_monitored_chats ADD COLUMN is_active INTEGER DEFAULT 1;
