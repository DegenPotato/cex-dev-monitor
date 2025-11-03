-- ============================================================================
-- FIX TOKEN AMOUNTS - CORRECT DECIMAL CONVERSION ERROR
-- ============================================================================
-- Previous bug: Jupiter's decimals defaulted to 9, but many tokens have 6 decimals
-- This caused token amounts to be off by 1000x (e.g., 1.5 instead of 1500)

-- Fix positions that likely have wrong token amounts
-- If tokens_bought < 10 and buy_amount_sol >= 0.0001, likely wrong by 1000x
UPDATE telegram_trading_positions
SET 
  tokens_bought = tokens_bought * 1000,
  current_tokens = current_tokens * 1000
WHERE 
  tokens_bought < 10 
  AND buy_amount_sol >= 0.0001
  AND status = 'open';

-- Log what we fixed
SELECT 
  id, 
  token_mint,
  buy_amount_sol,
  tokens_bought as new_tokens_bought,
  tokens_bought / 1000 as old_tokens_bought
FROM telegram_trading_positions
WHERE 
  tokens_bought >= 10  -- After our update
  AND buy_amount_sol >= 0.0001
  AND status = 'open';

-- Recalculate buy price for fixed positions
UPDATE telegram_trading_positions
SET 
  buy_price_sol = buy_amount_sol / tokens_bought,
  buy_price_usd = buy_amount_sol / tokens_bought  -- Legacy column
WHERE 
  tokens_bought > 0
  AND status = 'open';
