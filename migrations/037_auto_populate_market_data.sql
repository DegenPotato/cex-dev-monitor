-- Migration: Auto-populate token_market_data from gecko_token_data
-- Date: 2024-10-24
-- Purpose: Make token_market_data automatically sync from gecko_token_data
-- gecko_token_data is the source of truth, token_market_data is the simplified view

-- Drop the old token_market_data table
DROP TABLE IF EXISTS token_market_data;

-- Recreate as a VIEW that always shows latest data from gecko_token_data
CREATE VIEW token_market_data AS
SELECT 
  gtd.mint_address,
  gtd.symbol as token_symbol,
  gtd.name as token_name,
  gtd.price_usd,
  gtd.price_sol,
  gtd.price_change_24h,
  gtd.volume_24h_usd,
  gtd.market_cap_usd,
  gtd.total_reserve_in_usd as liquidity_usd,
  gtd.fdv_usd,
  
  -- ATH tracking (max values from history)
  (SELECT MAX(price_usd) FROM gecko_token_data WHERE mint_address = gtd.mint_address) as ath_price_usd,
  (SELECT MAX(market_cap_usd) FROM gecko_token_data WHERE mint_address = gtd.mint_address) as ath_market_cap_usd,
  
  -- Additional price changes
  gtd.price_change_6h,
  gtd.price_change_1h,
  gtd.price_change_30m,
  
  -- Volume breakdown
  gtd.volume_6h_usd,
  gtd.volume_1h_usd,
  gtd.volume_30m_usd,
  
  -- Metadata
  gtd.data_source,
  gtd.fetched_at * 1000 as last_updated,  -- Convert to milliseconds
  1.0 as confidence_score  -- Default confidence
  
FROM gecko_token_data gtd
WHERE gtd.fetched_at = (
  -- Get only the latest record for each token
  SELECT MAX(fetched_at) 
  FROM gecko_token_data 
  WHERE mint_address = gtd.mint_address
);

-- Create indexes on gecko_token_data for performance
CREATE INDEX IF NOT EXISTS idx_gecko_token_mint_fetched ON gecko_token_data(mint_address, fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_updated ON gecko_token_data(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_price ON gecko_token_data(price_usd DESC);
CREATE INDEX IF NOT EXISTS idx_gecko_token_mcap ON gecko_token_data(market_cap_usd DESC);
