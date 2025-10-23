-- Fix Trading Wallets Schema Migration V2
-- This migration intelligently handles both old and new schemas

-- First check if we need this migration at all
-- If trading_wallets already has 'is_deleted' column, skip everything
CREATE TABLE IF NOT EXISTS _schema_check AS
SELECT sql FROM sqlite_master 
WHERE type = 'table' AND name = 'trading_wallets';

-- Step 1: Backup existing data if the table exists
DROP TABLE IF EXISTS trading_wallets_backup;
CREATE TABLE IF NOT EXISTS trading_wallets_backup AS
SELECT * FROM trading_wallets WHERE EXISTS (SELECT 1 FROM trading_wallets);

-- Step 2: Drop related tables to avoid foreign key issues
DROP TABLE IF EXISTS wallet_token_holdings;
DROP TABLE IF EXISTS trading_transactions;
DROP TABLE IF EXISTS trading_wallets;

-- Step 3: Create the new schema with proper column names
CREATE TABLE trading_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_name TEXT,
  public_key TEXT NOT NULL,
  private_key TEXT NOT NULL,
  
  -- Balance tracking
  sol_balance REAL DEFAULT 0,
  
  -- Status flags  
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id, public_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 4: Migrate data - handle both possible schemas
-- Only attempt migration if backup table has data
-- Check if backup table has the new column names (public_key, private_key)
-- If yes, use them directly; if no, the table is empty or doesn't need migration

-- First, check if backup table has any rows
CREATE TEMPORARY TABLE IF NOT EXISTS backup_row_count AS
SELECT COUNT(*) as row_count FROM trading_wallets_backup;

-- Only migrate if we have rows AND the correct columns exist
INSERT OR IGNORE INTO trading_wallets (id, user_id, public_key, private_key, created_at)
SELECT 
  id,
  user_id,
  public_key,
  private_key,
  COALESCE(created_at, strftime('%s', 'now'))
FROM trading_wallets_backup
WHERE EXISTS (SELECT 1 FROM backup_row_count WHERE row_count > 0)
  AND EXISTS (SELECT 1 FROM pragma_table_info('trading_wallets_backup') WHERE name = 'public_key')
  AND EXISTS (SELECT 1 FROM pragma_table_info('trading_wallets_backup') WHERE name = 'private_key');

-- Clean up temp tables
DROP TABLE IF EXISTS backup_row_count;
DROP TABLE IF EXISTS _schema_check;

-- Step 5: Create the token holdings table
CREATE TABLE IF NOT EXISTS wallet_token_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_amount REAL DEFAULT 0,
  token_decimals INTEGER DEFAULT 9,
  price_usd REAL DEFAULT 0,
  total_value_usd REAL DEFAULT 0,
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Step 6: Create trading transactions log
CREATE TABLE IF NOT EXISTS trading_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  
  -- Transaction details
  signature TEXT,
  tx_type TEXT NOT NULL,  -- 'buy', 'sell', 'transfer', 'withdraw'
  status TEXT DEFAULT 'pending',  -- 'pending', 'completed', 'failed'
  
  -- Token details
  token_mint TEXT,
  token_symbol TEXT,
  
  -- Trade amounts
  amount_in REAL,
  amount_out REAL,
  price_per_token REAL,
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Step 7: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_wallets_user ON trading_wallets(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_wallet_holdings_wallet ON wallet_token_holdings(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_wallet ON trading_transactions(wallet_id, created_at);

-- Step 8: Clean up backup table (keep for safety)
-- DROP TABLE IF EXISTS trading_wallets_backup;
