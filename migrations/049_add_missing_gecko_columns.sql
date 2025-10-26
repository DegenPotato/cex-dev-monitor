-- Add missing columns to gecko_token_data table
-- These columns are referenced in queries but missing from the original schema

-- Add ATH (All-Time High) tracking columns
ALTER TABLE gecko_token_data ADD COLUMN ath_price_usd REAL;
ALTER TABLE gecko_token_data ADD COLUMN ath_market_cap_usd REAL;

-- Add GeckoTerminal score
ALTER TABLE gecko_token_data ADD COLUMN gt_score INTEGER DEFAULT 0;

-- Add last_updated timestamp for caching
ALTER TABLE gecko_token_data ADD COLUMN last_updated INTEGER;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_gecko_ath_mcap ON gecko_token_data(ath_market_cap_usd DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_gt_score ON gecko_token_data(gt_score DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_last_updated ON gecko_token_data(last_updated);
