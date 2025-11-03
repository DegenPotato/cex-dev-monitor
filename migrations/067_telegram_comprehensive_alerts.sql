-- ============================================================================
-- COMPREHENSIVE ALERTS FOR TELEGRAM AUTO-TRADING
-- ============================================================================
-- Adds support for multiple alerts with actions like Test Lab

-- ============================================================================
-- POSITION ALERTS TABLE
-- ============================================================================
-- Store multiple alerts per position with configurable actions
CREATE TABLE IF NOT EXISTS telegram_position_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  position_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  
  -- Alert Configuration
  target_price REAL,
  target_percent REAL,
  direction TEXT CHECK(direction IN ('above', 'below')),
  price_type TEXT CHECK(price_type IN ('percentage', 'exact_sol', 'exact_usd')),
  
  -- Alert Status
  is_active INTEGER DEFAULT 1,
  hit INTEGER DEFAULT 0,
  hit_at INTEGER,
  
  -- Actions (JSON array of actions to execute)
  actions TEXT, -- JSON: [{type: 'sell', amount: 50, ...}, {type: 'notification'}, ...]
  
  created_at INTEGER DEFAULT (strftime('%s', 'now') * 1000),
  
  FOREIGN KEY (position_id) REFERENCES telegram_trading_positions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- UPDATE AUTO-TRADE CONFIG TO STORE ALERT TEMPLATES
-- ============================================================================
-- Store alert templates in the monitored_chats config
ALTER TABLE telegram_monitored_chats ADD COLUMN alert_templates TEXT;
-- JSON array of alert configs to apply to new positions

-- ============================================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_telegram_position_alerts_position ON telegram_position_alerts(position_id);
CREATE INDEX IF NOT EXISTS idx_telegram_position_alerts_active ON telegram_position_alerts(is_active, hit);

-- ============================================================================
-- SAMPLE ALERT TEMPLATES STRUCTURE
-- ============================================================================
-- alert_templates JSON structure:
-- [
--   {
--     "target_percent": 50,
--     "direction": "above",
--     "price_type": "percentage",
--     "actions": [
--       {"type": "sell", "amount": 25, "slippage": 1000, "priorityFee": 0.0001}
--     ]
--   },
--   {
--     "target_percent": 100,
--     "direction": "above",
--     "price_type": "percentage",
--     "actions": [
--       {"type": "sell", "amount": 50, "slippage": 1000, "priorityFee": 0.0001},
--       {"type": "notification"}
--     ]
--   },
--   {
--     "target_percent": -30,
--     "direction": "below",
--     "price_type": "percentage",
--     "actions": [
--       {"type": "sell", "amount": 100, "slippage": 1000, "priorityFee": 0.0001},
--       {"type": "notification"}
--     ]
--   }
-- ]
