-- Add missing columns for comprehensive trade tracking

-- Fee breakdown columns
ALTER TABLE trading_transactions ADD COLUMN priority_fee_sol REAL DEFAULT 0;
ALTER TABLE trading_transactions ADD COLUMN jito_tip_sol REAL DEFAULT 0;
ALTER TABLE trading_transactions ADD COLUMN tax_amount_sol REAL DEFAULT 0;
ALTER TABLE trading_transactions ADD COLUMN net_amount_sol REAL DEFAULT 0;

-- USD value tracking for PnL calculations
ALTER TABLE trading_transactions ADD COLUMN token_price_usd REAL DEFAULT 0;
ALTER TABLE trading_transactions ADD COLUMN sol_price_usd REAL DEFAULT 0;
ALTER TABLE trading_transactions ADD COLUMN total_value_usd REAL DEFAULT 0;

-- Trade execution details
ALTER TABLE trading_transactions ADD COLUMN price_impact_pct REAL DEFAULT 0;

-- Create indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_trading_transactions_user_type ON trading_transactions(user_id, tx_type, created_at);
