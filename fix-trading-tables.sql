-- Fix missing columns in trading_wallets table
ALTER TABLE trading_wallets ADD COLUMN IF NOT EXISTS is_deleted INTEGER DEFAULT 0;

-- Also ensure wallet_token_holdings table exists
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

-- Show all wallets to verify data
SELECT id, user_id, wallet_name, public_key, 
       CASE WHEN private_key IS NOT NULL THEN 'EXISTS' ELSE 'MISSING' END as has_private_key,
       sol_balance, created_at 
FROM trading_wallets;
