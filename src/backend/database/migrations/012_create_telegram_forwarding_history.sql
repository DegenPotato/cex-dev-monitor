-- Create forwarding history table to track all forward attempts
CREATE TABLE IF NOT EXISTS telegram_forwarding_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  
  -- Source information
  source_chat_id TEXT NOT NULL,
  source_chat_name TEXT,
  message_id TEXT,
  contract_address TEXT,
  detection_type TEXT,
  
  -- Target information
  target_chat_id TEXT NOT NULL,
  target_chat_name TEXT,
  
  -- Account information
  detection_account_id INTEGER NOT NULL,
  forward_account_id INTEGER,
  forward_account_phone TEXT,
  
  -- Forward details
  forward_status TEXT NOT NULL CHECK(forward_status IN ('success', 'failed', 'pending')),
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  
  -- Performance metrics
  forward_latency_ms INTEGER,
  
  -- Timestamps
  detected_at INTEGER NOT NULL,
  forwarded_at INTEGER,
  created_at INTEGER NOT NULL,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_forwarding_user_id (user_id),
  INDEX idx_forwarding_status (forward_status),
  INDEX idx_forwarding_created (created_at DESC),
  INDEX idx_forwarding_contract (contract_address)
);

-- Create summary view for quick stats
CREATE VIEW IF NOT EXISTS telegram_forwarding_stats AS
SELECT 
  user_id,
  DATE(created_at, 'unixepoch') as date,
  COUNT(*) as total_forwards,
  SUM(CASE WHEN forward_status = 'success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN forward_status = 'failed' THEN 1 ELSE 0 END) as failed,
  SUM(CASE WHEN forward_status = 'pending' THEN 1 ELSE 0 END) as pending,
  AVG(CASE WHEN forward_status = 'success' THEN forward_latency_ms ELSE NULL END) as avg_latency_ms,
  COUNT(DISTINCT contract_address) as unique_contracts,
  COUNT(DISTINCT source_chat_id) as unique_source_chats,
  COUNT(DISTINCT target_chat_id) as unique_target_chats
FROM telegram_forwarding_history
GROUP BY user_id, date;
