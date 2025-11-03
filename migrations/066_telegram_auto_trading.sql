-- Migration 066: Production Telegram Auto-Trading with Comprehensive Position Tracking
-- Date: 2025-11-03
-- Description: Add auto-trading capabilities to production Telegram monitoring
-- Makes forwarding OPTIONAL - can now trade, monitor, or combine actions
-- Includes comprehensive position tracking with real-time WebSocket updates

-- ============================================================================
-- FLEXIBLE ACTION CONFIGURATION (Forwards become optional!)
-- ============================================================================
-- Action types when contract is detected (can combine multiple)
ALTER TABLE telegram_monitored_chats ADD COLUMN action_on_detection TEXT DEFAULT 'forward_only';
-- Options: 'forward_only', 'trade_only', 'monitor_only', 'forward_and_trade', 'forward_and_monitor', 'all'

-- ============================================================================
-- AUTO-BUY CONFIGURATION
-- ============================================================================
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_enabled INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_amount_sol REAL DEFAULT 0.1;
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_wallet_id INTEGER REFERENCES trading_wallets(id);
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_slippage_bps INTEGER DEFAULT 500;
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_priority_level TEXT DEFAULT 'high'; -- 'low', 'medium', 'high', 'turbo'
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_jito_tip_sol REAL DEFAULT 0.001;
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_buy_skip_tax INTEGER DEFAULT 0;

-- ============================================================================
-- AUTO-SELL CONFIGURATION (Stop Loss / Take Profit)
-- ============================================================================
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_sell_enabled INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN stop_loss_percent REAL DEFAULT -50; -- Sell at -50%
ALTER TABLE telegram_monitored_chats ADD COLUMN take_profit_percent REAL DEFAULT 100; -- Sell at +100%
ALTER TABLE telegram_monitored_chats ADD COLUMN trailing_stop_enabled INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN trailing_stop_percent REAL DEFAULT 20; -- Trail by 20%
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_sell_slippage_bps INTEGER DEFAULT 1000; -- Higher for sells

-- ============================================================================
-- MONITORING CONFIGURATION
-- ============================================================================
ALTER TABLE telegram_monitored_chats ADD COLUMN auto_monitor_enabled INTEGER DEFAULT 0;
ALTER TABLE telegram_monitored_chats ADD COLUMN monitor_duration_hours INTEGER DEFAULT 24; -- How long to monitor
ALTER TABLE telegram_monitored_chats ADD COLUMN alert_price_changes TEXT; -- JSON array of % changes to alert on

-- ============================================================================
-- COMPREHENSIVE POSITION TRACKING
-- ============================================================================
-- Create dedicated position tracking table for Telegram-sourced trades
CREATE TABLE IF NOT EXISTS telegram_trading_positions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  wallet_id INTEGER NOT NULL,
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,
  
  -- Source Attribution (WHERE did this trade come from?)
  source_chat_id TEXT NOT NULL,
  source_chat_name TEXT,
  source_message_id INTEGER,
  source_sender_id TEXT,
  source_sender_username TEXT,
  detection_type TEXT, -- 'standard', 'obfuscated', 'split'
  detected_at INTEGER NOT NULL,
  
  -- Position Details
  status TEXT DEFAULT 'pending', -- 'pending', 'open', 'partial_close', 'closed'
  entry_campaign_id TEXT, -- Link to OnChainPriceMonitor campaign
  
  -- Balance Tracking
  current_balance REAL DEFAULT 0,
  initial_balance REAL DEFAULT 0, -- Balance after first buy
  peak_balance REAL DEFAULT 0, -- Highest balance achieved
  
  -- Price Tracking (all in SOL)
  avg_entry_price REAL DEFAULT 0,
  current_price REAL,
  peak_price REAL, -- Highest price seen
  low_price REAL, -- Lowest price seen
  last_price_update INTEGER,
  
  -- Investment Tracking
  total_invested_sol REAL DEFAULT 0,
  total_withdrawn_sol REAL DEFAULT 0,
  
  -- P&L Tracking
  realized_pnl_sol REAL DEFAULT 0, -- From partial/full sells
  unrealized_pnl_sol REAL DEFAULT 0, -- Current position value - cost basis
  total_pnl_sol REAL DEFAULT 0, -- realized + unrealized
  peak_unrealized_pnl_sol REAL DEFAULT 0, -- Best unrealized P&L achieved
  roi_percent REAL DEFAULT 0, -- Return on investment %
  
  -- Trade Counts
  total_buys INTEGER DEFAULT 0,
  total_sells INTEGER DEFAULT 0,
  total_trades INTEGER DEFAULT 0,
  
  -- Auto-Sell Targets
  stop_loss_target REAL, -- Price to trigger stop loss
  take_profit_target REAL, -- Price to trigger take profit
  trailing_stop_active INTEGER DEFAULT 0,
  trailing_stop_trigger_price REAL, -- Price that activated trailing
  
  -- Outcome Tracking
  exit_reason TEXT, -- 'stop_loss', 'take_profit', 'trailing_stop', 'manual', 'rug'
  exit_price REAL,
  exit_roi_percent REAL,
  
  -- Timing
  first_buy_at INTEGER,
  last_trade_at INTEGER,
  closed_at INTEGER,
  position_duration_seconds INTEGER, -- Time from open to close
  
  -- Performance Metrics
  max_drawdown_percent REAL, -- Largest peak-to-trough decline
  win_loss_ratio REAL, -- For multi-trade positions
  sharpe_ratio REAL, -- Risk-adjusted returns
  
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  updated_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (wallet_id) REFERENCES trading_wallets(id)
);

-- ============================================================================
-- ENHANCED TRADING TRANSACTIONS (Link to positions)
-- ============================================================================
-- Add position tracking to trading_transactions
ALTER TABLE trading_transactions ADD COLUMN position_id INTEGER REFERENCES telegram_trading_positions(id);
ALTER TABLE trading_transactions ADD COLUMN triggered_by TEXT DEFAULT 'manual';
-- triggered_by options: 'telegram_detection', 'stop_loss', 'take_profit', 'trailing_stop', 'manual', 'dca'

-- ============================================================================
-- POPULATE TRADE SOURCE ATTRIBUTION (Link existing table)
-- ============================================================================
-- Add position_id to link attribution to positions
ALTER TABLE trade_source_attribution ADD COLUMN position_id INTEGER REFERENCES telegram_trading_positions(id);

-- ============================================================================
-- REAL-TIME POSITION UPDATES TABLE (For WebSocket broadcasting)
-- ============================================================================
CREATE TABLE IF NOT EXISTS position_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  update_type TEXT NOT NULL, -- 'price', 'trade', 'pnl', 'status', 'alert'
  
  -- Price Updates
  old_price REAL,
  new_price REAL,
  price_change_percent REAL,
  
  -- P&L Updates
  old_unrealized_pnl REAL,
  new_unrealized_pnl REAL,
  pnl_change REAL,
  
  -- Trade Updates
  trade_type TEXT, -- 'buy', 'sell'
  trade_amount_sol REAL,
  trade_amount_tokens REAL,
  trade_signature TEXT,
  
  -- Alert/Status Updates
  alert_message TEXT,
  new_status TEXT,
  
  -- WebSocket broadcast flag
  broadcasted INTEGER DEFAULT 0,
  broadcast_at INTEGER,
  
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (position_id) REFERENCES telegram_trading_positions(id) ON DELETE CASCADE
);

-- ============================================================================
-- POSITION MONITORING CAMPAIGNS (Link to OnChainPriceMonitor)
-- ============================================================================
CREATE TABLE IF NOT EXISTS position_monitor_campaigns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  campaign_id TEXT NOT NULL, -- OnChainPriceMonitor campaign ID
  campaign_type TEXT, -- 'price_tracking', 'stop_loss', 'take_profit'
  is_active INTEGER DEFAULT 1,
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (position_id) REFERENCES telegram_trading_positions(id) ON DELETE CASCADE
);

-- ============================================================================
-- PERFORMANCE INDEXES
-- ============================================================================
-- Position lookups
CREATE INDEX IF NOT EXISTS idx_telegram_positions_user ON telegram_trading_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_wallet ON telegram_trading_positions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_token ON telegram_trading_positions(token_mint);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_status ON telegram_trading_positions(status);
CREATE INDEX IF NOT EXISTS idx_telegram_positions_source ON telegram_trading_positions(source_chat_id);

-- Transaction position links
CREATE INDEX IF NOT EXISTS idx_trading_transactions_position ON trading_transactions(position_id);
CREATE INDEX IF NOT EXISTS idx_trading_transactions_triggered ON trading_transactions(triggered_by);

-- Real-time updates
CREATE INDEX IF NOT EXISTS idx_position_updates_position ON position_updates(position_id);
CREATE INDEX IF NOT EXISTS idx_position_updates_broadcast ON position_updates(broadcasted);
CREATE INDEX IF NOT EXISTS idx_position_updates_created ON position_updates(created_at);

-- Source attribution
CREATE INDEX IF NOT EXISTS idx_trade_attribution_position ON trade_source_attribution(position_id);

-- Monitor campaigns
CREATE INDEX IF NOT EXISTS idx_monitor_campaigns_position ON position_monitor_campaigns(position_id);
CREATE INDEX IF NOT EXISTS idx_monitor_campaigns_active ON position_monitor_campaigns(is_active);

-- ============================================================================
-- WEBSOCKET EVENTS TO BROADCAST (Frontend real-time updates)
-- ============================================================================
-- When position is created: 'telegram_position_created'
-- {
--   type: 'telegram_position_created',
--   data: {
--     position_id, user_id, token_mint, token_symbol,
--     source_chat_name, source_sender_username,
--     action: 'Detected and buying...'
--   }
-- }
--
-- When trade executes: 'telegram_trade_executed'
-- {
--   type: 'telegram_trade_executed',
--   data: {
--     position_id, trade_type: 'buy'/'sell',
--     amount_sol, amount_tokens, signature,
--     new_balance, new_avg_price, pnl_change
--   }
-- }
--
-- When price updates: 'telegram_position_price_update'
-- {
--   type: 'telegram_position_price_update',
--   data: {
--     position_id, token_symbol,
--     old_price, new_price, change_percent,
--     unrealized_pnl, total_pnl, roi_percent
--   }
-- }
--
-- When alert triggers: 'telegram_position_alert'
-- {
--   type: 'telegram_position_alert',
--   data: {
--     position_id, alert_type: 'stop_loss'/'take_profit',
--     trigger_price, action: 'selling'/'sold',
--     pnl_sol, roi_percent
--   }
-- }
--
-- When position closes: 'telegram_position_closed'
-- {
--   type: 'telegram_position_closed',
--   data: {
--     position_id, exit_reason,
--     total_pnl_sol, roi_percent,
--     duration_hours, total_trades
--   }
-- }

-- ============================================================================
-- MIGRATION NOTES
-- ============================================================================
-- 1. This migration is for PRODUCTION Telegram Sniffer ONLY
-- 2. Test Lab continues to use test_lab_telegram_monitors (isolated)
-- 3. All position updates MUST broadcast via WebSocket for real-time UI
-- 4. Positions persist across server restarts (unlike Test Lab)
-- 5. Links to existing trading_wallets and trading_transactions
-- 6. Reuses OnChainPriceMonitor for price tracking
-- 7. action_on_detection makes forwarding OPTIONAL!
