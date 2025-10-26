import { Connection, PublicKey } from '@solana/web3.js';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import { queryAll, execute } from '../database/helpers.js';
export class SolanaEventDetector extends EventEmitter {
    constructor() {
        super();
        this.subscriptions = new Map();
        this.monitoringTargets = new Map();
        this.isRunning = false;
        this.reconnectAttempts = 0;
        this.MAX_RECONNECT_ATTEMPTS = 5;
        this.RECONNECT_DELAY = 5000;
        // Use Helius RPC if available, fallback to public
        const rpcUrl = process.env.RPC_URL ||
            (process.env.HELIUS_API_KEY
                ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
                : 'https://api.mainnet-beta.solana.com');
        this.connection = new Connection(rpcUrl, {
            commitment: 'confirmed',
            wsEndpoint: rpcUrl.replace('https://', 'wss://').replace('http://', 'ws://')
        });
        console.log('🔍 SolanaEventDetector initialized with RPC:', rpcUrl.split('?')[0]);
    }
    async start() {
        if (this.isRunning) {
            console.log('⚠️ SolanaEventDetector already running');
            return;
        }
        this.isRunning = true;
        console.log('🚀 Starting SolanaEventDetector...');
        // Load active campaigns
        await this.loadActiveCampaigns();
        // Start WebSocket subscription for logs
        await this.startWebSocketSubscription();
        // Start monitoring loop for specific addresses
        this.startMonitoringLoop();
        console.log('✅ SolanaEventDetector started successfully');
    }
    async stop() {
        console.log('🛑 Stopping SolanaEventDetector...');
        this.isRunning = false;
        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = undefined;
        }
        // Clear subscriptions
        this.subscriptions.clear();
        this.monitoringTargets.clear();
        console.log('✅ SolanaEventDetector stopped');
    }
    async loadActiveCampaigns() {
        try {
            const campaigns = await queryAll(`SELECT c.*, 
                    (SELECT json_group_array(json_object(
                        'node_id', node_id,
                        'node_type', node_type,
                        'parent_node_id', parent_node_id,
                        'parallel_group', parallel_group,
                        'config', config
                    ))
                    FROM campaign_nodes 
                    WHERE campaign_id = c.id
                    ) as nodes_json
                FROM campaigns c
                WHERE enabled = 1`);
            for (const campaign of campaigns) {
                if (campaign.nodes_json) {
                    campaign.nodes = JSON.parse(campaign.nodes_json);
                    campaign.nodes.forEach((node) => {
                        if (typeof node.config === 'string') {
                            node.config = JSON.parse(node.config);
                        }
                    });
                }
                this.subscriptions.set(campaign.id, campaign);
            }
            console.log(`📋 Loaded ${this.subscriptions.size} active campaigns`);
        }
        catch (error) {
            console.error('❌ Failed to load campaigns:', error);
        }
    }
    async startWebSocketSubscription() {
        try {
            // Subscribe to all logs (we'll filter by program later)
            const wsUrl = this.connection.rpcEndpoint
                .replace('https://', 'wss://')
                .replace('http://', 'ws://');
            this.ws = new WebSocket(wsUrl);
            this.ws.on('open', () => {
                console.log('🔌 WebSocket connected for log subscription');
                this.subscribeToLogs();
                this.reconnectAttempts = 0;
            });
            this.ws.on('message', (data) => {
                this.handleWebSocketMessage(data);
            });
            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error);
            });
            this.ws.on('close', () => {
                console.log('🔌 WebSocket disconnected');
                if (this.isRunning && this.reconnectAttempts < this.MAX_RECONNECT_ATTEMPTS) {
                    this.reconnectAttempts++;
                    setTimeout(() => this.startWebSocketSubscription(), this.RECONNECT_DELAY);
                }
            });
        }
        catch (error) {
            console.error('❌ Failed to start WebSocket subscription:', error);
        }
    }
    subscribeToLogs() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
            return;
        // Subscribe to logs for all programs we're interested in
        const programIds = new Set();
        for (const campaign of this.subscriptions.values()) {
            const triggerNodes = campaign.nodes?.filter(n => n.node_type === 'trigger') || [];
            for (const node of triggerNodes) {
                const config = node.config;
                if (config.program_id) {
                    programIds.add(config.program_id);
                }
            }
        }
        // Always subscribe to Token Program and Token-2022
        programIds.add('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
        programIds.add('TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb');
        if (programIds.size > 0) {
            const subscribeMsg = {
                jsonrpc: '2.0',
                id: 1,
                method: 'logsSubscribe',
                params: [
                    {
                        mentions: Array.from(programIds)
                    },
                    {
                        commitment: 'confirmed'
                    }
                ]
            };
            this.ws.send(JSON.stringify(subscribeMsg));
            console.log(`📡 Subscribed to logs for ${programIds.size} programs`);
        }
    }
    handleWebSocketMessage(data) {
        try {
            const message = JSON.parse(data.toString());
            if (message.method === 'logsNotification') {
                this.handleLogNotification(message.params);
            }
        }
        catch (error) {
            console.error('❌ Failed to handle WebSocket message:', error);
        }
    }
    async handleLogNotification(params) {
        const { result } = params;
        const { value } = result;
        const { signature, logs } = value;
        // Check if any campaign trigger matches these logs
        for (const campaign of this.subscriptions.values()) {
            await this.checkCampaignTriggers(campaign, signature, logs);
        }
    }
    async checkCampaignTriggers(campaign, signature, logs) {
        const triggerNodes = campaign.nodes?.filter(n => n.node_type === 'trigger') || [];
        for (const node of triggerNodes) {
            const config = node.config;
            if (config.trigger_type === 'program_log' && config.log_pattern) {
                const pattern = new RegExp(config.log_pattern);
                const matchingLog = logs.find(log => pattern.test(log));
                if (matchingLog) {
                    // Trigger fired!
                    await this.handleTriggerFired(campaign, node, {
                        type: 'program_log',
                        signature,
                        log_message: matchingLog,
                        timestamp: Date.now()
                    });
                }
            }
        }
    }
    startMonitoringLoop() {
        setInterval(async () => {
            if (!this.isRunning)
                return;
            // Check for transfer triggers
            await this.checkTransferTriggers();
            // Check monitoring targets
            await this.checkMonitoringTargets();
            // Clean expired targets
            this.cleanExpiredTargets();
        }, 5000); // Check every 5 seconds
    }
    async checkTransferTriggers() {
        // Get all campaigns with transfer triggers
        for (const campaign of this.subscriptions.values()) {
            const triggerNodes = campaign.nodes?.filter(n => n.node_type === 'trigger') || [];
            for (const node of triggerNodes) {
                const config = node.config;
                if (config.trigger_type === 'transfer_credited') {
                    // This would normally monitor specific addresses
                    // For now, we'll rely on the user providing addresses to watch
                    // In production, you might want to subscribe to specific accounts
                }
            }
        }
    }
    async checkMonitoringTargets() {
        for (const [wallet, targets] of this.monitoringTargets.entries()) {
            try {
                const pubkey = new PublicKey(wallet);
                const signatures = await this.connection.getSignaturesForAddress(pubkey, {
                    limit: 10
                });
                for (const sigInfo of signatures) {
                    // Get full transaction
                    const tx = await this.connection.getParsedTransaction(sigInfo.signature, {
                        maxSupportedTransactionVersion: 0
                    });
                    if (tx) {
                        await this.checkTransactionForMonitors(wallet, tx, targets);
                    }
                }
            }
            catch (error) {
                console.error(`❌ Failed to check monitoring target ${wallet}:`, error);
            }
        }
    }
    async checkTransactionForMonitors(wallet, tx, targets) {
        for (const target of targets) {
            const { monitor_config, campaign_id, instance_id } = target;
            // Check if transaction contains monitored programs
            const programIds = tx.transaction.message.instructions.map(ix => ix.programId.toString());
            const hasMonitoredProgram = monitor_config.programs_to_watch?.some((pid) => programIds.includes(pid));
            if (hasMonitoredProgram) {
                // Check for specific events (simplified - in production would parse instructions)
                const hasInitializeMint = tx.meta?.logMessages?.some(log => log.includes('InitializeMint'));
                const hasMintTo = tx.meta?.logMessages?.some(log => log.includes('MintTo'));
                if ((monitor_config.events?.includes('InitializeMint') && hasInitializeMint) ||
                    (monitor_config.events?.includes('MintTo') && hasMintTo)) {
                    // Monitor detected an event!
                    await this.handleMonitorDetection(campaign_id, instance_id, {
                        wallet,
                        signature: tx.transaction.signatures[0],
                        events: monitor_config.events,
                        timestamp: Date.now()
                    });
                }
            }
        }
    }
    cleanExpiredTargets() {
        const now = Date.now();
        for (const [wallet, targets] of this.monitoringTargets.entries()) {
            const activeTargets = targets.filter(t => t.expires_at > now);
            if (activeTargets.length === 0) {
                this.monitoringTargets.delete(wallet);
            }
            else if (activeTargets.length < targets.length) {
                this.monitoringTargets.set(wallet, activeTargets);
            }
        }
    }
    async handleTriggerFired(campaign, node, event) {
        console.log(`🎯 Trigger fired for campaign ${campaign.name}: ${node.node_id}`);
        // Check deduplication
        const dedupKey = `${event.wallet || event.signature}`;
        const isDuplicate = await this.checkDeduplication(campaign.id, dedupKey, node.config);
        if (isDuplicate) {
            console.log(`⏭️ Skipping duplicate trigger for ${dedupKey}`);
            return;
        }
        // Emit event for CampaignExecutor to handle
        this.emit('trigger_fired', {
            campaign,
            node,
            event
        });
    }
    async checkDeduplication(campaignId, dedupKey, config) {
        const dedupWindowMs = config.dedupe_window_ms || 600000; // Default 10 minutes
        const expiresAt = Math.floor((Date.now() + dedupWindowMs) / 1000);
        try {
            // Try to insert dedup record
            await execute(`INSERT INTO campaign_deduplication (campaign_id, dedup_key, expires_at)
                 VALUES (?, ?, ?)`, [campaignId, dedupKey, expiresAt]);
            // Clean old records
            await execute(`DELETE FROM campaign_deduplication 
                 WHERE expires_at < ?`, [Math.floor(Date.now() / 1000)]);
            return false; // Not a duplicate
        }
        catch (error) {
            if (error.message?.includes('UNIQUE constraint')) {
                return true; // Is a duplicate
            }
            throw error;
        }
    }
    async addMonitoringTarget(wallet, campaignId, instanceId, monitorConfig) {
        const target = {
            wallet,
            campaign_id: campaignId,
            instance_id: instanceId,
            monitor_config: monitorConfig,
            started_at: Date.now(),
            expires_at: Date.now() + (monitorConfig.window_ms || 3600000)
        };
        const existing = this.monitoringTargets.get(wallet) || [];
        existing.push(target);
        this.monitoringTargets.set(wallet, existing);
        console.log(`👁️ Added monitoring target for wallet ${wallet} (campaign ${campaignId})`);
    }
    async handleMonitorDetection(campaignId, instanceId, detection) {
        console.log(`🔍 Monitor detected event for instance ${instanceId}`);
        // Log the event
        await execute(`INSERT INTO campaign_events (instance_id, campaign_id, node_id, event_type, event_data, tx_signature, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [instanceId, campaignId, 'monitor', 'monitor_detected', JSON.stringify(detection),
            detection.signature, Math.floor(Date.now() / 1000)]);
        // Emit for executor to continue campaign
        this.emit('monitor_detected', {
            campaign_id: campaignId,
            instance_id: instanceId,
            detection
        });
    }
    // Helper method to detect net credited lamports in a transaction
    async getNetCreditedLamports(wallet, signature) {
        try {
            const tx = await this.connection.getParsedTransaction(signature, {
                maxSupportedTransactionVersion: 0
            });
            if (!tx || !tx.meta)
                return 0;
            const walletPubkey = new PublicKey(wallet);
            const accountIndex = tx.transaction.message.accountKeys.findIndex(key => key.pubkey.equals(walletPubkey));
            if (accountIndex === -1)
                return 0;
            const preBalance = tx.meta.preBalances[accountIndex];
            const postBalance = tx.meta.postBalances[accountIndex];
            return postBalance - preBalance;
        }
        catch (error) {
            console.error('Failed to get net credited lamports:', error);
            return 0;
        }
    }
    // Method to manually check a wallet for triggers
    async checkWalletForTriggers(wallet) {
        try {
            const pubkey = new PublicKey(wallet);
            const signatures = await this.connection.getSignaturesForAddress(pubkey, {
                limit: 10
            });
            for (const sigInfo of signatures) {
                const netLamports = await this.getNetCreditedLamports(wallet, sigInfo.signature);
                // Check all campaigns for matching triggers
                for (const campaign of this.subscriptions.values()) {
                    const triggerNodes = campaign.nodes?.filter(n => n.node_type === 'trigger') || [];
                    for (const node of triggerNodes) {
                        const config = node.config;
                        if (config.trigger_type === 'transfer_credited') {
                            let matches = false;
                            if (config.lamports_exact && netLamports === config.lamports_exact) {
                                matches = true;
                            }
                            else if (config.lamports_min && config.lamports_max &&
                                netLamports >= config.lamports_min &&
                                netLamports <= config.lamports_max) {
                                matches = true;
                            }
                            else if (config.condition) {
                                // Evaluate condition (simplified - in production use a safe evaluator)
                                const condition = config.condition.replace('net_credited', netLamports.toString());
                                try {
                                    matches = eval(condition);
                                }
                                catch (e) {
                                    console.error('Failed to evaluate condition:', e);
                                }
                            }
                            if (matches) {
                                await this.handleTriggerFired(campaign, node, {
                                    type: 'transfer',
                                    wallet,
                                    signature: sigInfo.signature,
                                    lamports: netLamports,
                                    timestamp: sigInfo.blockTime || Date.now()
                                });
                            }
                        }
                        else if (config.trigger_type === 'transfer_debited') {
                            // For transfer_debited, we check for negative netLamports (SOL sent out)
                            const debitedAmount = Math.abs(netLamports);
                            let matches = false;
                            // Only trigger if there was an actual debit (negative balance change)
                            if (netLamports < 0) {
                                if (config.lamports_exact && debitedAmount === config.lamports_exact) {
                                    matches = true;
                                }
                                else if (config.lamports_min && config.lamports_max &&
                                    debitedAmount >= config.lamports_min &&
                                    debitedAmount <= config.lamports_max) {
                                    matches = true;
                                }
                                else if (config.lamports_min && !config.lamports_max &&
                                    debitedAmount >= config.lamports_min) {
                                    matches = true;
                                }
                                else if (!config.lamports_exact && !config.lamports_min && !config.lamports_max) {
                                    // No amount specified, trigger on any debit
                                    matches = true;
                                }
                                else if (config.condition) {
                                    // Evaluate condition using the debited amount
                                    const condition = config.condition.replace('net_debited', debitedAmount.toString());
                                    try {
                                        matches = eval(condition);
                                    }
                                    catch (e) {
                                        console.error('Failed to evaluate condition:', e);
                                    }
                                }
                                if (matches) {
                                    await this.handleTriggerFired(campaign, node, {
                                        type: 'transfer',
                                        wallet,
                                        signature: sigInfo.signature,
                                        lamports: -debitedAmount, // Store as negative to indicate debit
                                        timestamp: sigInfo.blockTime || Date.now()
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
        catch (error) {
            console.error(`Failed to check wallet ${wallet} for triggers:`, error);
        }
    }
}
// Singleton instance
let solanaEventDetector = null;
export function getSolanaEventDetector() {
    if (!solanaEventDetector) {
        solanaEventDetector = new SolanaEventDetector();
    }
    return solanaEventDetector;
}
