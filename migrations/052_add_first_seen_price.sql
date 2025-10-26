-- Add first_seen_price_usd to token_registry to permanently store the price when token first entered system
-- This will never be updated, giving us a true baseline for gain/loss calculations

-- Add column to store first seen price
ALTER TABLE token_registry ADD COLUMN first_seen_price_usd REAL;

-- Add column to store first seen market cap  
ALTER TABLE token_registry ADD COLUMN first_seen_mcap_usd REAL;

-- Backfill from current gecko_token_data prices (best we can do for existing tokens)
UPDATE token_registry
SET 
  first_seen_price_usd = (SELECT price_usd FROM gecko_token_data WHERE mint_address = token_registry.token_mint),
  first_seen_mcap_usd = (SELECT market_cap_usd FROM gecko_token_data WHERE mint_address = token_registry.token_mint)
WHERE first_seen_price_usd IS NULL;
