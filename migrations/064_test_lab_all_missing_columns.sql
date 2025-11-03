-- Migration 064: Add ALL missing Test Lab columns at once
-- Date: 2025-11-03
-- Description: Migration 061 was applied before these columns were added to it
-- This adds all the columns that 061 SHOULD have added but didn't

-- Initial action on contract detection
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_initial_action TEXT DEFAULT 'monitor_only';

-- Buy amount for buy_and_monitor action
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_buy_amount_sol REAL;

-- Wallet ID for trading
ALTER TABLE telegram_monitored_chats ADD COLUMN test_lab_wallet_id INTEGER REFERENCES trading_wallets(id);

-- All columns now present for Test Lab functionality
