-- ============================================================================
-- ADD MISSING TRADE TRACKING COLUMNS TO TELEGRAM_TRADING_POSITIONS
-- ============================================================================
-- These columns are used in the sell endpoint but may be missing on production

-- Add last_trade_at column if it doesn't exist
ALTER TABLE telegram_trading_positions ADD COLUMN last_trade_at INTEGER;

-- Add trade counting columns if they don't exist
ALTER TABLE telegram_trading_positions ADD COLUMN total_buys INTEGER DEFAULT 0;
ALTER TABLE telegram_trading_positions ADD COLUMN total_sells INTEGER DEFAULT 0;
ALTER TABLE telegram_trading_positions ADD COLUMN total_trades INTEGER DEFAULT 0;

-- Update existing positions to have default values
UPDATE telegram_trading_positions 
SET total_buys = 1,  -- They all have at least one buy
    total_trades = 1,
    total_sells = 0
WHERE total_buys IS NULL;

-- Set last_trade_at to first_buy_at for existing positions
UPDATE telegram_trading_positions 
SET last_trade_at = first_buy_at 
WHERE last_trade_at IS NULL AND first_buy_at IS NOT NULL;
