-- Enhance trading_transactions with comprehensive trade data

-- Add missing columns to trading_transactions
ALTER TABLE trading_transactions ADD COLUMN token_name TEXT;
ALTER TABLE trading_transactions ADD COLUMN slippage_bps INTEGER;
ALTER TABLE trading_transactions ADD COLUMN priority_fee_sol REAL;
ALTER TABLE trading_transactions ADD COLUMN jito_tip_sol REAL;
ALTER TABLE trading_transactions ADD COLUMN tax_amount_sol REAL;
ALTER TABLE trading_transactions ADD COLUMN net_amount_sol REAL;
ALTER TABLE trading_transactions ADD COLUMN total_fee_sol REAL;

-- Price tracking for PnL calculations
ALTER TABLE trading_transactions ADD COLUMN token_price_usd REAL;
ALTER TABLE trading_transactions ADD COLUMN sol_price_usd REAL;
ALTER TABLE trading_transactions ADD COLUMN total_value_usd REAL;

-- Execution details
ALTER TABLE trading_transactions ADD COLUMN price_impact_pct REAL;
ALTER TABLE trading_transactions ADD COLUMN error_message TEXT;

-- Update existing rows to have default values
UPDATE trading_transactions 
SET 
  slippage_bps = 100,
  priority_fee_sol = 0,
  jito_tip_sol = 0,
  tax_amount_sol = 0,
  total_fee_sol = 0,
  token_price_usd = 0,
  sol_price_usd = 0,
  total_value_usd = 0,
  price_impact_pct = 0
WHERE slippage_bps IS NULL;

-- Create index for PnL queries
CREATE INDEX IF NOT EXISTS idx_trading_transactions_user_type ON trading_transactions(user_id, tx_type, created_at);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_token ON trading_transactions(token_mint, created_at);
