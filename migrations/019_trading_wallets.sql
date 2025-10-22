-- Trading Wallets System for Fetcher Bot
-- Fixed schema to match the backend code expectations

-- Drop old tables if they exist with wrong schema
DROP TABLE IF EXISTS wallet_token_holdings;
DROP TABLE IF EXISTS trading_transactions;
DROP TABLE IF EXISTS trading_wallets;

-- Main trading wallets table
CREATE TABLE IF NOT EXISTS trading_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_name TEXT,
  public_key TEXT NOT NULL,  -- Public key/address
  private_key TEXT NOT NULL,  -- Encrypted private key
  
  -- Balance tracking
  sol_balance REAL DEFAULT 0,
  
  -- Status
  is_active INTEGER DEFAULT 1,
  is_deleted INTEGER DEFAULT 0,  -- Soft delete flag
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id, public_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Token holdings per wallet
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

-- Trading transactions log
CREATE TABLE IF NOT EXISTS trading_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  
  -- Transaction details
  signature TEXT,
  tx_type TEXT NOT NULL,  -- 'buy', 'sell', 'transfer'
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_wallets_user ON trading_wallets(user_id, is_deleted);
CREATE INDEX IF NOT EXISTS idx_wallet_holdings_wallet ON wallet_token_holdings(wallet_id);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_wallet ON trading_transactions(wallet_id, created_at);
