-- Add columns to existing telegram_forwarding_history for contract auto-forwarding
-- The table already exists with rule-based forwarding schema, we're extending it

-- Add contract-specific columns
ALTER TABLE telegram_forwarding_history ADD COLUMN contract_address TEXT;
ALTER TABLE telegram_forwarding_history ADD COLUMN detection_type TEXT;
ALTER TABLE telegram_forwarding_history ADD COLUMN source_chat_name TEXT;
ALTER TABLE telegram_forwarding_history ADD COLUMN target_chat_name TEXT;
ALTER TABLE telegram_forwarding_history ADD COLUMN detection_account_id INTEGER;
ALTER TABLE telegram_forwarding_history ADD COLUMN forward_account_id INTEGER;
ALTER TABLE telegram_forwarding_history ADD COLUMN forward_account_phone TEXT;
ALTER TABLE telegram_forwarding_history ADD COLUMN detected_at INTEGER;
ALTER TABLE telegram_forwarding_history ADD COLUMN created_at INTEGER;

-- Make rule_id and source_message_id nullable for contract forwards
-- (can't alter existing columns in SQLite, so we'll handle NULL in code)

-- Add index for contract lookups
CREATE INDEX IF NOT EXISTS idx_forwarding_contract ON telegram_forwarding_history(contract_address);
CREATE INDEX IF NOT EXISTS idx_forwarding_created ON telegram_forwarding_history(created_at DESC);
