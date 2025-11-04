-- Migration: Create telegram_autotrader_config table for Test Lab Telegram AutoTrader
-- This table stores configuration for the Telegram AutoTrader feature in Test Lab

CREATE TABLE IF NOT EXISTS telegram_autotrader_config (
  user_id INTEGER PRIMARY KEY,
  enabled INTEGER DEFAULT 0,
  action TEXT DEFAULT 'monitor', -- 'monitor' or 'buy_monitor'
  buy_amount REAL DEFAULT 0.1,
  buy_timing TEXT DEFAULT 'instant', -- 'instant', 'wait_dip', 'wait_pump'
  price_change_threshold REAL DEFAULT NULL, -- percentage for wait_dip or wait_pump
  take_profit REAL DEFAULT NULL, -- percentage for profit taking
  stop_loss REAL DEFAULT NULL, -- percentage for stop loss
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create index for quick lookups
CREATE INDEX IF NOT EXISTS idx_telegram_autotrader_config_user ON telegram_autotrader_config(user_id);
