-- Fix Trading Wallets Schema Migration
-- This migration handles the transition from the old schema to the new one

-- First, check if we need to migrate by looking for the old column names
-- We'll rename the table and recreate it with the correct schema

-- Step 1: Backup existing data if the old table exists
DROP TABLE IF EXISTS trading_wallets_backup;
CREATE TABLE IF NOT EXISTS trading_wallets_backup AS 
SELECT * FROM trading_wallets WHERE 1=1;

-- Step 2: Drop related tables to avoid foreign key issues
DROP TABLE IF EXISTS wallet_token_holdings;
DROP TABLE IF EXISTS trading_transactions;
DROP TABLE IF EXISTS trading_wallets;

-- Step 3: Create the new schema
CREATE TABLE trading_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_name TEXT,
  public_key TEXT NOT NULL,  -- This was wallet_address in old schema
  private_key TEXT NOT NULL,  -- This was encrypted_private_key in old schema
  
  -- Balance tracking
  sol_balance REAL DEFAULT 0,
  
  -- Status flags
  is_active INTEGER DEFAULT 1,
  is_default INTEGER DEFAULT 0,
  is_deleted INTEGER DEFAULT 0,  -- Soft delete flag
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id, public_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Step 4: Migrate data from backup if it exists
-- The backup has OLD column names (wallet_address, encrypted_private_key) from migration 019
INSERT OR IGNORE INTO trading_wallets (id, user_id, public_key, private_key, sol_balance, is_active, is_default, created_at)
SELECT 
  id,
  user_id,
  wallet_address,  -- OLD column name: wallet_address -> NEW: public_key
  encrypted_private_key,  -- OLD column name: encrypted_private_key -> NEW: private_key
  COALESCE(sol_balance, 0),
  COALESCE(is_active, 1),
  COALESCE(is_default, 0),
  COALESCE(created_at, strftime('%s', 'now'))
FROM trading_wallets_backup
WHERE (SELECT COUNT(*) FROM trading_wallets_backup) > 0;

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

-- Step 8: Clean up backup table (optional - you can keep it for safety)
-- DROP TABLE IF EXISTS trading_wallets_backup;
