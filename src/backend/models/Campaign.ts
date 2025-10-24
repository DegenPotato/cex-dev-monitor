// Campaign models and interfaces

// Campaign node types
export type NodeType = 'trigger' | 'filter' | 'monitor' | 'action';

// Campaign status
export type CampaignStatus = 'draft' | 'active' | 'paused' | 'archived';
export type InstanceStatus = 'running' | 'completed' | 'failed' | 'expired';
export type AlertLevel = 'info' | 'warning' | 'critical';

// Trigger types and configurations
export interface TriggerConfig {
    trigger_type: 'transfer_credited' | 'signature_to_address' | 'program_log' | 'account_created' | 'token_mint';
    condition?: string; // e.g., "net_credited == 2000000000" for 2 SOL
    lamports_exact?: number;
    lamports_min?: number;
    lamports_max?: number;
    sender_list?: string[]; // List of allowed senders
    program_id?: string; // Program to monitor
    log_pattern?: string; // Regex pattern for log matching
    aggregation?: 'per_tx' | 'per_block';
    dedupe_window_ms?: number; // Deduplication window
}

// Filter configurations
export interface FilterConfig {
    filter_type: 'account_age' | 'prior_balance' | 'inbound_sources' | 'token_interaction' | 'custom';
    expression?: string; // e.g., "account_age_seconds <= 300 && prior_balance_lamports < 2000000000"
    operator?: 'AND' | 'OR' | 'NOT';
    conditions?: FilterCondition[];
}

export interface FilterCondition {
    field: string;
    operator: '==' | '!=' | '<' | '>' | '<=' | '>=' | 'contains' | 'matches';
    value: any;
}

// Monitor configurations
export interface MonitorConfig {
    window_ms: number; // How long to monitor (e.g., 3600000 for 1 hour)
    programs_to_watch?: string[]; // Program IDs to monitor
    events?: string[]; // Event names to detect (InitializeMint, MintTo, etc.)
    min_events?: number; // Minimum number of events to trigger
    max_events?: number; // Maximum number of events
}

// Action configurations
export interface ActionConfig {
    action_type: 'webhook' | 'tag_db' | 'send_to_fetcher' | 'create_alert' | 'run_script';
    webhook_url?: string;
    webhook_method?: 'POST' | 'GET';
    webhook_headers?: Record<string, string>;
    webhook_payload_template?: string; // JSON template with placeholders
    tag_name?: string;
    tag_value?: string;
    alert_title?: string;
    alert_message?: string;
    script_command?: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
    metadata?: Record<string, any>;
}

// Campaign node definition
export interface CampaignNode {
    id?: number;
    campaign_id?: number;
    node_id: string; // e.g., 't1', 'f1', 'm1', 'a1'
    node_type: NodeType;
    parent_node_id?: string; // For sequencing
    parallel_group?: number; // For parallel execution
    config: TriggerConfig | FilterConfig | MonitorConfig | ActionConfig;
    position_x?: number; // For visual editor
    position_y?: number;
    created_at?: number;
}

// Main campaign interface
export interface Campaign {
    id?: number;
    user_id: number;
    name: string;
    description?: string;
    enabled?: boolean;
    tags?: string[];
    lifetime_ms?: number; // TTL for runtime instances
    max_instances?: number; // Max concurrent instances
    nodes?: CampaignNode[];
    created_at?: number;
    updated_at?: number;
    last_activated_at?: number;
    total_instances?: number;
    successful_instances?: number;
}

// Runtime instance
export interface RuntimeInstance {
    id?: number;
    campaign_id: number;
    trigger_wallet?: string;
    trigger_tx_signature?: string;
    trigger_data?: Record<string, any>;
    status: InstanceStatus;
    started_at?: number;
    completed_at?: number;
    expires_at?: number;
    current_node_id?: string;
    execution_log?: ExecutionStep[];
    error_message?: string;
}

// Execution step in runtime log
export interface ExecutionStep {
    node_id: string;
    node_type: NodeType;
    started_at: number;
    completed_at?: number;
    status: 'success' | 'failed' | 'skipped';
    result?: any;
    error?: string;
}

// Campaign event
export interface CampaignEvent {
    id?: number;
    instance_id: number;
    campaign_id: number;
    node_id: string;
    event_type: 'trigger_fired' | 'filter_passed' | 'filter_failed' | 'monitor_detected' | 'action_executed';
    event_data?: Record<string, any>;
    tx_signature?: string;
    block_time?: number;
    raw_instructions?: any[];
    created_at?: number;
}

// Campaign alert
export interface CampaignAlert {
    id?: number;
    campaign_id: number;
    instance_id?: number;
    alert_type: 'detection' | 'error' | 'completion';
    alert_level: AlertLevel;
    title: string;
    message?: string;
    metadata?: Record<string, any>;
    acknowledged?: boolean;
    created_at?: number;
}

// Campaign metrics
export interface CampaignMetrics {
    campaign_id: number;
    metric_date: string;
    triggers_fired: number;
    filters_passed: number;
    filters_failed: number;
    monitors_completed: number;
    actions_executed: number;
    webhooks_sent: number;
    avg_latency_ms?: number;
    total_runtime_ms?: number;
    error_count: number;
}

// Campaign template (for sharing/importing)
export interface CampaignTemplate {
    name: string;
    description: string;
    category: string;
    tags: string[];
    nodes: CampaignNode[];
    author?: string;
    version?: string;
    example_data?: Record<string, any>;
}
