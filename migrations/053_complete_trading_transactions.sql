-- Migration: Complete Trading Transactions Table
-- Add missing columns to trading_transactions for full functionality

-- Add token_name column (token's full name)
ALTER TABLE trading_transactions ADD COLUMN token_name TEXT;

-- Add total_fee_sol column (total transaction fees in SOL)
ALTER TABLE trading_transactions ADD COLUMN total_fee_sol REAL DEFAULT 0;

-- Add error_message column for failed transactions
ALTER TABLE trading_transactions ADD COLUMN error_message TEXT;

-- Add slippage_bps column (slippage in basis points)
ALTER TABLE trading_transactions ADD COLUMN slippage_bps INTEGER;

-- Add priority_fee_lamports column
ALTER TABLE trading_transactions ADD COLUMN priority_fee_lamports INTEGER;

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_trading_transactions_status ON trading_transactions(status, created_at);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_token ON trading_transactions(token_mint);
