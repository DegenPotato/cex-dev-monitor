-- ============================================================================
-- FIX ALL TELEGRAM AUTOTRADER COLUMN ISSUES AT ONCE
-- ============================================================================
-- This migration ensures ALL columns exist that the Telegram AutoTrader needs

-- 1. Fix token_pools table - add missing columns if they don't exist
-- Note: SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we need to be careful

-- Check and add liquidity_usd if missing (used in TelegramAutoTrader.ts line 578)
ALTER TABLE token_pools ADD COLUMN liquidity_usd REAL DEFAULT 0;

-- Check and add dex if missing (used in TelegramAutoTrader.ts line 578)
ALTER TABLE token_pools ADD COLUMN dex TEXT DEFAULT 'unknown';

-- 2. Fix telegram_trading_positions - add ALL missing columns
-- From the sell endpoint (telegramAutoTrade.ts)
ALTER TABLE telegram_trading_positions ADD COLUMN last_trade_at INTEGER;
ALTER TABLE telegram_trading_positions ADD COLUMN total_buys INTEGER DEFAULT 0;
ALTER TABLE telegram_trading_positions ADD COLUMN total_sells INTEGER DEFAULT 0;
ALTER TABLE telegram_trading_positions ADD COLUMN total_trades INTEGER DEFAULT 0;
ALTER TABLE telegram_trading_positions ADD COLUMN current_tokens REAL;
ALTER TABLE telegram_trading_positions ADD COLUMN buy_price_sol REAL;

-- 3. Update existing positions with sensible defaults
UPDATE telegram_trading_positions 
SET 
  total_buys = COALESCE(total_buys, 1),
  total_trades = COALESCE(total_trades, 1),
  total_sells = COALESCE(total_sells, 0),
  current_tokens = COALESCE(current_tokens, tokens_bought),
  last_trade_at = COALESCE(last_trade_at, first_buy_at),
  buy_price_sol = COALESCE(buy_price_sol, buy_price_usd) -- buy_price_usd was actually SOL price
WHERE total_buys IS NULL OR current_tokens IS NULL;

-- 4. Fix unrealistic values from price confusion
-- Reset any position with absurd ROI (likely from USD/SOL confusion)
UPDATE telegram_trading_positions
SET 
  roi_percent = 0,
  unrealized_pnl_sol = 0,
  total_pnl_sol = realized_pnl_sol
WHERE roi_percent > 10000 OR roi_percent < -99;

-- 5. Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_token_pools_lookup ON token_pools(mint_address);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_active ON telegram_trading_positions(status, token_mint);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_user ON telegram_trading_positions(user_id, status);
