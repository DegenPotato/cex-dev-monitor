-- Migration: Add ATH tracking columns to gecko_token_data
-- Date: 2024-10-24
-- Purpose: Add ath_price_usd and ath_market_cap_usd columns for ATH tracking

-- Add ATH columns if they don't exist
ALTER TABLE gecko_token_data ADD COLUMN ath_price_usd REAL;
ALTER TABLE gecko_token_data ADD COLUMN ath_market_cap_usd REAL;
ALTER TABLE gecko_token_data ADD COLUMN ath_date INTEGER;

-- Initialize ATH values from current data (one-time calculation)
UPDATE gecko_token_data 
SET 
  ath_price_usd = price_usd,
  ath_market_cap_usd = market_cap_usd,
  ath_date = fetched_at
WHERE ath_price_usd IS NULL;

-- Create index for ATH queries
CREATE INDEX IF NOT EXISTS idx_gecko_token_ath ON gecko_token_data(ath_price_usd DESC);
