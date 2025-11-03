-- ============================================================================
-- FIX PRICE COLUMN NAMING CONFUSION
-- ============================================================================
-- The buy_price_usd column actually stores SOL prices, not USD
-- This migration adds a proper column and updates the data

-- Add new column with correct name
ALTER TABLE telegram_trading_positions ADD COLUMN buy_price_sol REAL;

-- Copy existing data (buy_price_usd is actually SOL price)
UPDATE telegram_trading_positions 
SET buy_price_sol = buy_price_usd 
WHERE buy_price_sol IS NULL;

-- Add comment for clarity (SQLite doesn't support column comments, but this documents intent)
-- buy_price_usd: DEPRECATED - Actually stores SOL price due to historical bug
-- buy_price_sol: Correct column - price per token in SOL

-- Update any positions with unrealistic ROI (likely due to price confusion)
-- If ROI is > 10000% or < -99%, recalculate
UPDATE telegram_trading_positions
SET roi_percent = 0
WHERE roi_percent > 10000 OR roi_percent < -99;
