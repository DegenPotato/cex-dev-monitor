-- Secure Trading Wallet System
-- User-specific encrypted wallet storage for automated trading

-- Main trading wallets table (user-specific, encrypted)
CREATE TABLE IF NOT EXISTS trading_wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_address TEXT NOT NULL,  -- Public key
  encrypted_private_key TEXT NOT NULL,  -- AES-256 encrypted
  encryption_iv TEXT NOT NULL,  -- Initialization vector for encryption
  
  -- Wallet metadata
  wallet_name TEXT,
  is_default BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  
  -- Security tracking
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_used_at INTEGER,
  last_tx_signature TEXT,
  
  -- Balance tracking (cached)
  sol_balance REAL DEFAULT 0,
  last_balance_check INTEGER,
  
  UNIQUE(user_id, wallet_address),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Trading transactions log
CREATE TABLE IF NOT EXISTS trading_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  
  -- Transaction details
  signature TEXT NOT NULL UNIQUE,
  tx_type TEXT NOT NULL,  -- 'buy', 'sell', 'transfer'
  status TEXT DEFAULT 'pending',  -- 'pending', 'confirmed', 'failed'
  
  -- Token details
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  token_decimals INTEGER,
  
  -- Trade amounts
  amount_in REAL,
  amount_out REAL,
  price_per_token REAL,
  
  -- DEX/Route info
  dex_used TEXT,  -- 'jupiter', 'raydium', etc
  route_json TEXT,  -- Full route data from Jupiter
  
  -- Fees and slippage
  slippage_bps INTEGER,
  priority_fee_lamports INTEGER,
  jito_tip_lamports INTEGER,
  total_fee_sol REAL,
  
  -- MEV Protection
  jito_bundle_id TEXT,
  mev_protected BOOLEAN DEFAULT 0,
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  confirmed_at INTEGER,
  block_height INTEGER,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Token holdings per wallet
CREATE TABLE IF NOT EXISTS wallet_token_holdings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  token_mint TEXT NOT NULL,
  
  -- Token info
  token_symbol TEXT,
  token_name TEXT,
  token_decimals INTEGER,
  
  -- Balance
  balance REAL NOT NULL,
  ui_balance REAL,  -- Human readable balance
  
  -- Value tracking
  current_price_usd REAL,
  total_value_usd REAL,
  
  -- Performance
  avg_entry_price REAL,
  total_invested REAL,
  realized_pnl REAL,
  unrealized_pnl REAL,
  
  -- Timestamps
  first_acquired_at INTEGER,
  last_updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(wallet_id, token_mint),
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Trading strategies/campaigns
CREATE TABLE IF NOT EXISTS trading_strategies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  
  -- Strategy config
  name TEXT NOT NULL,
  strategy_type TEXT,  -- 'copy_trade', 'signal_based', 'dca', 'sniper'
  config_json TEXT,  -- Full strategy configuration
  
  -- Risk management
  max_position_size REAL,  -- Max SOL per trade
  stop_loss_percentage REAL,
  take_profit_percentage REAL,
  max_daily_trades INTEGER,
  max_open_positions INTEGER,
  
  -- Performance
  total_trades INTEGER DEFAULT 0,
  winning_trades INTEGER DEFAULT 0,
  total_pnl_sol REAL DEFAULT 0,
  total_pnl_usd REAL DEFAULT 0,
  win_rate REAL DEFAULT 0,
  sharpe_ratio REAL,
  
  -- Status
  is_active BOOLEAN DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  last_trade_at INTEGER,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id) ON DELETE CASCADE
);

-- Trade signals queue
CREATE TABLE IF NOT EXISTS trade_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  strategy_id INTEGER,
  
  -- Signal details
  signal_type TEXT NOT NULL,  -- 'buy', 'sell', 'transfer'
  signal_source TEXT,  -- 'telegram', 'discord', 'x', 'onchain', 'manual'
  source_reference TEXT,  -- Message ID, tx hash, etc
  
  -- Trade parameters
  token_mint TEXT NOT NULL,
  action TEXT NOT NULL,
  amount REAL,
  slippage_bps INTEGER DEFAULT 100,
  priority TEXT DEFAULT 'normal',  -- 'low', 'normal', 'high', 'turbo'
  
  -- Execution
  status TEXT DEFAULT 'pending',  -- 'pending', 'executing', 'completed', 'failed', 'cancelled'
  executed_by_wallet_id INTEGER,
  tx_signature TEXT,
  
  -- Timestamps
  created_at INTEGER DEFAULT (strftime('%s', 'now')),
  executed_at INTEGER,
  
  -- Metadata
  metadata_json TEXT,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (strategy_id) REFERENCES trading_strategies(id) ON DELETE SET NULL
);

-- API keys and RPC configuration (encrypted)
CREATE TABLE IF NOT EXISTS trading_api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  -- Service keys (all encrypted)
  helius_api_key_encrypted TEXT,
  jito_api_key_encrypted TEXT,
  jupiter_api_key_encrypted TEXT,
  
  -- Custom RPC endpoints
  custom_rpc_url TEXT,
  custom_ws_url TEXT,
  
  -- Usage tracking
  helius_requests_today INTEGER DEFAULT 0,
  helius_requests_month INTEGER DEFAULT 0,
  jito_bundles_today INTEGER DEFAULT 0,
  
  -- Settings
  use_monetized_rpc BOOLEAN DEFAULT 1,
  max_priority_fee_lamports INTEGER DEFAULT 1000000,
  auto_jito_tips BOOLEAN DEFAULT 1,
  
  updated_at INTEGER DEFAULT (strftime('%s', 'now')),
  
  UNIQUE(user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_trading_wallets_user ON trading_wallets(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trading_wallets_default ON trading_wallets(user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_trading_transactions_wallet ON trading_transactions(wallet_id, created_at);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_token ON trading_transactions(token_mint);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_status ON trading_transactions(status);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_signature ON trading_transactions(signature);

CREATE INDEX IF NOT EXISTS idx_wallet_holdings_wallet ON wallet_token_holdings(wallet_id);
CREATE INDEX IF NOT EXISTS idx_wallet_holdings_token ON wallet_token_holdings(token_mint);

CREATE INDEX IF NOT EXISTS idx_trading_strategies_user ON trading_strategies(user_id, is_active);
CREATE INDEX IF NOT EXISTS idx_trading_strategies_wallet ON trading_strategies(wallet_id);

CREATE INDEX IF NOT EXISTS idx_trade_signals_user_status ON trade_signals(user_id, status);
CREATE INDEX IF NOT EXISTS idx_trade_signals_strategy ON trade_signals(strategy_id);
CREATE INDEX IF NOT EXISTS idx_trade_signals_created ON trade_signals(created_at);
