-- On-chain Campaign Builder for Solana
-- Tables for campaign definition, execution, and monitoring

-- Main campaigns table
CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER DEFAULT 1,
    tags TEXT, -- JSON array of tags
    lifetime_ms INTEGER, -- Optional TTL in milliseconds
    max_instances INTEGER DEFAULT 100, -- Max concurrent runtime instances
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    last_activated_at INTEGER,
    total_instances INTEGER DEFAULT 0,
    successful_instances INTEGER DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Campaign nodes (triggers, filters, monitors, actions)
CREATE TABLE IF NOT EXISTS campaign_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    node_id TEXT NOT NULL, -- Unique ID within campaign (t1, f1, m1, a1)
    node_type TEXT NOT NULL, -- 'trigger', 'filter', 'monitor', 'action'
    parent_node_id TEXT, -- Parent node ID for sequencing
    parallel_group INTEGER, -- Group number for parallel execution (NULL for sequential)
    config TEXT NOT NULL, -- JSON configuration
    position_x INTEGER, -- Visual editor X position
    position_y INTEGER, -- Visual editor Y position
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, node_id)
);

-- Runtime instances (one per triggered wallet/tx)
CREATE TABLE IF NOT EXISTS campaign_runtime_instances (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    trigger_wallet TEXT, -- Wallet that triggered the campaign
    trigger_tx_signature TEXT, -- Transaction that triggered it
    trigger_data TEXT, -- JSON data from trigger
    status TEXT DEFAULT 'running', -- 'running', 'completed', 'failed', 'expired'
    started_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    completed_at INTEGER,
    expires_at INTEGER, -- Based on campaign lifetime
    current_node_id TEXT, -- Currently executing node
    execution_log TEXT, -- JSON array of execution steps
    error_message TEXT,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Campaign events/detections
CREATE TABLE IF NOT EXISTS campaign_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    instance_id INTEGER NOT NULL,
    campaign_id INTEGER NOT NULL,
    node_id TEXT NOT NULL,
    event_type TEXT NOT NULL, -- 'trigger_fired', 'filter_passed', 'filter_failed', 'monitor_detected', 'action_executed'
    event_data TEXT, -- JSON data
    tx_signature TEXT,
    block_time INTEGER,
    raw_instructions TEXT, -- JSON array of parsed instructions
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (instance_id) REFERENCES campaign_runtime_instances(id) ON DELETE CASCADE,
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Campaign tags (for categorization and search)
CREATE TABLE IF NOT EXISTS campaign_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    instance_id INTEGER,
    tag_type TEXT NOT NULL, -- 'wallet', 'token', 'program', 'custom'
    tag_value TEXT NOT NULL,
    metadata TEXT, -- JSON additional data
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Campaign alerts (for notifications)
CREATE TABLE IF NOT EXISTS campaign_alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    instance_id INTEGER,
    alert_type TEXT NOT NULL, -- 'detection', 'error', 'completion'
    alert_level TEXT DEFAULT 'info', -- 'info', 'warning', 'critical'
    title TEXT NOT NULL,
    message TEXT,
    metadata TEXT, -- JSON data
    acknowledged INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
);

-- Webhook action history
CREATE TABLE IF NOT EXISTS campaign_webhook_calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    instance_id INTEGER NOT NULL,
    node_id TEXT NOT NULL,
    webhook_url TEXT NOT NULL,
    payload TEXT, -- JSON payload sent
    response_status INTEGER,
    response_body TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    next_retry_at INTEGER,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    FOREIGN KEY (instance_id) REFERENCES campaign_runtime_instances(id) ON DELETE CASCADE
);

-- Dedupe tracking to prevent duplicate processing
CREATE TABLE IF NOT EXISTS campaign_deduplication (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    dedup_key TEXT NOT NULL, -- wallet + tx_sig or custom key
    processed_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    expires_at INTEGER NOT NULL, -- Based on dedupe_window_ms
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, dedup_key)
);

-- Performance metrics for campaigns
CREATE TABLE IF NOT EXISTS campaign_metrics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL,
    metric_date TEXT NOT NULL, -- YYYY-MM-DD format
    triggers_fired INTEGER DEFAULT 0,
    filters_passed INTEGER DEFAULT 0,
    filters_failed INTEGER DEFAULT 0,
    monitors_completed INTEGER DEFAULT 0,
    actions_executed INTEGER DEFAULT 0,
    webhooks_sent INTEGER DEFAULT 0,
    avg_latency_ms INTEGER,
    total_runtime_ms INTEGER,
    error_count INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
    FOREIGN KEY (campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE,
    UNIQUE(campaign_id, metric_date)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_campaigns_user_enabled ON campaigns(user_id, enabled);
CREATE INDEX IF NOT EXISTS idx_campaign_nodes_campaign ON campaign_nodes(campaign_id);
CREATE INDEX IF NOT EXISTS idx_runtime_instances_campaign_status ON campaign_runtime_instances(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_runtime_instances_trigger_wallet ON campaign_runtime_instances(trigger_wallet);
CREATE INDEX IF NOT EXISTS idx_campaign_events_instance ON campaign_events(instance_id);
CREATE INDEX IF NOT EXISTS idx_campaign_tags_value ON campaign_tags(tag_type, tag_value);
CREATE INDEX IF NOT EXISTS idx_campaign_alerts_acknowledged ON campaign_alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_campaign_dedup_key ON campaign_deduplication(dedup_key, expires_at);

-- Create view for active campaigns summary
CREATE VIEW IF NOT EXISTS campaign_active_summary AS
SELECT 
    c.id,
    c.name,
    c.user_id,
    c.enabled,
    COUNT(DISTINCT ri.id) as active_instances,
    COUNT(DISTINCT CASE WHEN ri.status = 'completed' THEN ri.id END) as completed_today,
    COUNT(DISTINCT CASE WHEN ri.status = 'failed' THEN ri.id END) as failed_today,
    MAX(ri.started_at) as last_triggered_at
FROM campaigns c
LEFT JOIN campaign_runtime_instances ri ON c.id = ri.campaign_id 
    AND date(ri.started_at, 'unixepoch') = date('now')
WHERE c.enabled = 1
GROUP BY c.id, c.name, c.user_id, c.enabled;
