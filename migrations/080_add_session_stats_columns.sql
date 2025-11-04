-- ============================================================================
-- ADD SESSION STATS COLUMNS FOR COMPREHENSIVE TRACKING LIKE TEST LAB
-- ============================================================================
-- These columns track session highs/lows and USD prices

-- Add USD price tracking columns
ALTER TABLE telegram_trading_positions ADD COLUMN buy_price_usd_initial REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN current_price_usd REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN peak_price_usd REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN low_price_usd REAL;

-- Add session tracking columns (if missing)
ALTER TABLE telegram_trading_positions ADD COLUMN peak_price REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN low_price REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN session_start INTEGER;
ALTER TABLE telegram_trading_positions ADD COLUMN session_high_time INTEGER;
ALTER TABLE telegram_trading_positions ADD COLUMN session_low_time INTEGER;

-- Initialize values for existing positions
UPDATE telegram_trading_positions
SET 
  peak_price = COALESCE(peak_price, current_price, buy_price_sol, buy_price_usd),
  low_price = COALESCE(low_price, current_price, buy_price_sol, buy_price_usd),
  session_start = COALESCE(session_start, first_buy_at, created_at)
WHERE status = 'open';

-- Add index for monitoring queries
CREATE INDEX IF NOT EXISTS idx_telegram_positions_monitoring 
ON telegram_trading_positions(status, token_mint, updated_at);
