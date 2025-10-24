-- Migration: Add missing pool balance and liquidity columns
-- Date: 2024-10-24
-- Purpose: Add all the comprehensive pool data fields from GeckoTerminal response

-- Add missing balance columns
ALTER TABLE gecko_pool_data ADD COLUMN base_token_balance REAL;
ALTER TABLE gecko_pool_data ADD COLUMN quote_token_balance REAL;

-- Add missing liquidity columns  
ALTER TABLE gecko_pool_data ADD COLUMN base_token_liquidity_usd REAL;
ALTER TABLE gecko_pool_data ADD COLUMN quote_token_liquidity_usd REAL;
