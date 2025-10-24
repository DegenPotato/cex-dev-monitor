import { EventEmitter } from 'events';
import axios from 'axios';
import { Connection, PublicKey } from '@solana/web3.js';
import { getDb, queryOne, queryAll, execute } from '../database/helpers.js';
import { 
    Campaign, 
    CampaignNode, 
    RuntimeInstance, 
    ExecutionStep,
    FilterConfig,
    MonitorConfig,
    ActionConfig,
    InstanceStatus,
    CampaignEvent
} from '../models/Campaign.js';
import { getSolanaEventDetector } from './SolanaEventDetector.js';
import { getWebSocketServer } from './WebSocketService.js';

export class CampaignExecutor extends EventEmitter {
    private connection: Connection;
    private activeInstances: Map<number, RuntimeInstance> = new Map();
    private executionQueues: Map<number, CampaignNode[]> = new Map();
    private isRunning: boolean = false;

    constructor() {
        super();
        
        const rpcUrl = process.env.RPC_URL || 
                      (process.env.HELIUS_API_KEY 
                          ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
                          : 'https://api.mainnet-beta.solana.com');
        
        this.connection = new Connection(rpcUrl, 'confirmed');
        
        // Listen for events from SolanaEventDetector
        const detector = getSolanaEventDetector();
        detector.on('trigger_fired', this.handleTriggerFired.bind(this));
        detector.on('monitor_detected', this.handleMonitorDetected.bind(this));

        console.log('⚡ CampaignExecutor initialized');
    }

    async start(): Promise<void> {
        if (this.isRunning) return;
        
        this.isRunning = true;
        console.log('🚀 Starting CampaignExecutor...');
        
        // Load any incomplete instances
        await this.loadIncompleteInstances();
        
        // Start execution loop
        this.startExecutionLoop();
        
        console.log('✅ CampaignExecutor started');
    }

    async stop(): Promise<void> {
        console.log('🛑 Stopping CampaignExecutor...');
        this.isRunning = false;
        this.activeInstances.clear();
        this.executionQueues.clear();
        console.log('✅ CampaignExecutor stopped');
    }

    private async loadIncompleteInstances(): Promise<void> {
        try {
            const instances = await queryAll(
                `SELECT * FROM campaign_runtime_instances 
                 WHERE status = 'running' 
                 AND (expires_at IS NULL OR expires_at > ?)`,
                [Math.floor(Date.now() / 1000)]
            );

            for (const instance of instances) {
                if (instance.execution_log) {
                    instance.execution_log = JSON.parse(instance.execution_log);
                }
                if (instance.trigger_data) {
                    instance.trigger_data = JSON.parse(instance.trigger_data);
                }
                this.activeInstances.set(instance.id, instance);
            }

            console.log(`📋 Loaded ${instances.length} incomplete instances`);
        } catch (error) {
            console.error('❌ Failed to load incomplete instances:', error);
        }
    }

    private startExecutionLoop(): void {
        setInterval(async () => {
            if (!this.isRunning) return;
            
            // Check for expired instances
            await this.checkExpiredInstances();
            
            // Process execution queues
            await this.processExecutionQueues();
        }, 1000); // Check every second
    }

    private async checkExpiredInstances(): Promise<void> {
        const now = Math.floor(Date.now() / 1000);
        
        for (const [id, instance] of this.activeInstances.entries()) {
            if (instance.expires_at && instance.expires_at <= now) {
                await this.expireInstance(id);
            }
        }
    }

    private async expireInstance(instanceId: number): Promise<void> {
        console.log(`⏰ Expiring instance ${instanceId}`);
        
        await execute(
            `UPDATE campaign_runtime_instances 
             SET status = 'expired', completed_at = ? 
             WHERE id = ?`,
            [Math.floor(Date.now() / 1000), instanceId]
        );
        
        this.activeInstances.delete(instanceId);
        this.executionQueues.delete(instanceId);
        
        // Emit event
        this.emit('instance_expired', instanceId);
    }

    private async processExecutionQueues(): Promise<void> {
        for (const [instanceId, queue] of this.executionQueues.entries()) {
            if (queue.length === 0) continue;
            
            const node = queue[0];
            const instance = this.activeInstances.get(instanceId);
            
            if (!instance) {
                this.executionQueues.delete(instanceId);
                continue;
            }
            
            // Check if we can execute this node
            if (instance.current_node_id !== node.node_id) {
                await this.executeNode(instanceId, node);
            }
        }
    }

    private async handleTriggerFired(data: { campaign: Campaign, node: CampaignNode, event: any }): Promise<void> {
        const { campaign, node, event } = data;
        
        console.log(`🎯 Handling trigger for campaign "${campaign.name}"`);
        
        // Create runtime instance
        const instanceId = await this.createRuntimeInstance(campaign, event);
        
        // Log trigger event
        await this.logEvent(instanceId, campaign.id!, node.node_id, 'trigger_fired', event);
        
        // Start execution flow
        await this.startCampaignExecution(instanceId, campaign, node);
    }

    private async createRuntimeInstance(campaign: Campaign, triggerEvent: any): Promise<number> {
        const expiresAt = campaign.lifetime_ms 
            ? Math.floor((Date.now() + campaign.lifetime_ms) / 1000)
            : null;
        
        const result = await execute(
            `INSERT INTO campaign_runtime_instances 
             (campaign_id, trigger_wallet, trigger_tx_signature, trigger_data, expires_at)
             VALUES (?, ?, ?, ?, ?)`,
            [
                campaign.id!,
                triggerEvent.wallet || null,
                triggerEvent.signature || null,
                JSON.stringify(triggerEvent),
                expiresAt
            ]
        );
        
        const instanceId = result.lastInsertRowid;
        
        const instance: RuntimeInstance = {
            id: instanceId,
            campaign_id: campaign.id!,
            trigger_wallet: triggerEvent.wallet,
            trigger_tx_signature: triggerEvent.signature,
            trigger_data: triggerEvent,
            status: 'running',
            started_at: Date.now(),
            expires_at: expiresAt ? expiresAt * 1000 : undefined,
            execution_log: []
        };
        
        this.activeInstances.set(instanceId, instance);
        
        // Update campaign stats
        await execute(
            `UPDATE campaigns 
             SET total_instances = total_instances + 1, 
                 last_activated_at = ? 
             WHERE id = ?`,
            [Math.floor(Date.now() / 1000), campaign.id!]
        );
        
        // Emit WebSocket event
        const ws = getWebSocketServer();
        ws.broadcast('campaign_instance_created', {
            campaign_id: campaign.id,
            campaign_name: campaign.name,
            instance_id: instanceId,
            trigger_data: triggerEvent
        });
        
        return instanceId;
    }

    private async startCampaignExecution(
        instanceId: number, 
        campaign: Campaign, 
        triggerNode: CampaignNode
    ): Promise<void> {
        if (!campaign.nodes) return;
        
        // Build execution plan
        const executionPlan = this.buildExecutionPlan(campaign.nodes, triggerNode);
        
        // Queue nodes for execution
        this.executionQueues.set(instanceId, executionPlan);
        
        // Start processing
        await this.processNextNode(instanceId);
    }

    private buildExecutionPlan(nodes: CampaignNode[], startNode: CampaignNode): CampaignNode[] {
        const plan: CampaignNode[] = [];
        const visited = new Set<string>();
        
        function addNode(node: CampaignNode) {
            if (visited.has(node.node_id)) return;
            visited.add(node.node_id);
            plan.push(node);
            
            // Find children
            const children = nodes.filter(n => n.parent_node_id === node.node_id);
            
            // Group by parallel_group
            const groups = new Map<number | undefined, CampaignNode[]>();
            for (const child of children) {
                const group = child.parallel_group;
                if (!groups.has(group)) groups.set(group, []);
                groups.get(group)!.push(child);
            }
            
            // Add nodes (parallel groups will be handled separately)
            for (const [group, groupNodes] of groups.entries()) {
                for (const child of groupNodes) {
                    addNode(child);
                }
            }
        }
        
        addNode(startNode);
        return plan;
    }

    private async processNextNode(instanceId: number): Promise<void> {
        const queue = this.executionQueues.get(instanceId);
        if (!queue || queue.length === 0) {
            await this.completeInstance(instanceId);
            return;
        }
        
        const node = queue.shift()!;
        await this.executeNode(instanceId, node);
    }

    private async executeNode(instanceId: number, node: CampaignNode): Promise<void> {
        const instance = this.activeInstances.get(instanceId);
        if (!instance) return;
        
        console.log(`⚙️ Executing ${node.node_type} node ${node.node_id} for instance ${instanceId}`);
        
        // Update current node
        instance.current_node_id = node.node_id;
        await execute(
            `UPDATE campaign_runtime_instances SET current_node_id = ? WHERE id = ?`,
            [node.node_id, instanceId]
        );
        
        const step: ExecutionStep = {
            node_id: node.node_id,
            node_type: node.node_type,
            started_at: Date.now(),
            status: 'success'
        };
        
        try {
            let result: any;
            
            switch (node.node_type) {
                case 'filter':
                    result = await this.executeFilter(instance, node.config as FilterConfig);
                    break;
                case 'monitor':
                    result = await this.executeMonitor(instance, node.config as MonitorConfig);
                    break;
                case 'action':
                    result = await this.executeAction(instance, node.config as ActionConfig);
                    break;
                default:
                    // Trigger nodes are already processed
                    result = { success: true };
            }
            
            step.completed_at = Date.now();
            step.result = result;
            
            if (result.success === false) {
                step.status = 'failed';
                await this.handleNodeFailure(instanceId, node, result);
            } else {
                await this.logEvent(instanceId, instance.campaign_id, node.node_id, 
                    node.node_type === 'filter' ? 'filter_passed' : 
                    node.node_type === 'monitor' ? 'monitor_detected' :
                    'action_executed', result);
                
                // Continue to next node
                await this.processNextNode(instanceId);
            }
        } catch (error: any) {
            step.status = 'failed';
            step.error = error.message;
            step.completed_at = Date.now();
            
            await this.handleNodeFailure(instanceId, node, { error: error.message });
        }
        
        // Add step to execution log
        instance.execution_log = instance.execution_log || [];
        instance.execution_log.push(step);
        
        await execute(
            `UPDATE campaign_runtime_instances 
             SET execution_log = ? 
             WHERE id = ?`,
            [JSON.stringify(instance.execution_log), instanceId]
        );
    }

    private async executeFilter(instance: RuntimeInstance, config: FilterConfig): Promise<any> {
        // Get wallet info
        if (!instance.trigger_wallet) {
            return { success: false, reason: 'No wallet to filter' };
        }
        
        try {
            const pubkey = new PublicKey(instance.trigger_wallet);
            const accountInfo = await this.connection.getAccountInfo(pubkey);
            
            if (!accountInfo) {
                return { success: false, reason: 'Account not found' };
            }
            
            // Calculate account age
            const accountAge = Date.now() - (accountInfo.rentEpoch || 0) * 1000; // Approximation
            
            // Evaluate filter expression
            if (config.expression) {
                // In production, use a safe expression evaluator
                // For now, we'll do basic checks
                const context = {
                    account_age_seconds: Math.floor(accountAge / 1000),
                    prior_balance_lamports: accountInfo.lamports,
                    is_executable: accountInfo.executable,
                    owner: accountInfo.owner.toString()
                };
                
                // Simple evaluation (replace with safe evaluator in production)
                let expression = config.expression;
                for (const [key, value] of Object.entries(context)) {
                    expression = expression.replace(new RegExp(key, 'g'), String(value));
                }
                
                try {
                    const result = eval(expression);
                    return { success: result, context };
                } catch (e) {
                    return { success: false, error: 'Invalid expression' };
                }
            }
            
            return { success: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async executeMonitor(instance: RuntimeInstance, config: MonitorConfig): Promise<any> {
        if (!instance.trigger_wallet) {
            return { success: true, skipped: true, reason: 'No wallet to monitor' };
        }
        
        // Register monitoring with SolanaEventDetector
        const detector = getSolanaEventDetector();
        await detector.addMonitoringTarget(
            instance.trigger_wallet,
            instance.campaign_id,
            instance.id!,
            config
        );
        
        // Monitor nodes are async - they don't block execution
        // The monitor will emit events when it detects something
        return { 
            success: true, 
            monitoring: true,
            wallet: instance.trigger_wallet,
            window_ms: config.window_ms
        };
    }

    private async executeAction(instance: RuntimeInstance, config: ActionConfig): Promise<any> {
        switch (config.action_type) {
            case 'webhook':
                return await this.executeWebhook(instance, config);
            case 'tag_db':
                return await this.executeTagDb(instance, config);
            case 'send_to_fetcher':
                return await this.executeSendToFetcher(instance, config);
            case 'create_alert':
                return await this.executeCreateAlert(instance, config);
            default:
                return { success: false, error: 'Unknown action type' };
        }
    }

    private async executeWebhook(instance: RuntimeInstance, config: ActionConfig): Promise<any> {
        if (!config.webhook_url) {
            return { success: false, error: 'No webhook URL configured' };
        }
        
        try {
            // Build payload
            let payload = config.webhook_payload_template || '{}';
            
            // Replace placeholders
            payload = payload
                .replace('{{wallet}}', instance.trigger_wallet || '')
                .replace('{{signature}}', instance.trigger_tx_signature || '')
                .replace('{{campaign_id}}', String(instance.campaign_id))
                .replace('{{instance_id}}', String(instance.id))
                .replace('{{timestamp}}', new Date().toISOString());
            
            const parsedPayload = JSON.parse(payload);
            
            // Log webhook call
            const webhookId = await execute(
                `INSERT INTO campaign_webhook_calls 
                 (campaign_id, instance_id, node_id, webhook_url, payload)
                 VALUES (?, ?, ?, ?, ?)`,
                [instance.campaign_id, instance.id!, 'action', config.webhook_url, payload]
            );
            
            // Make request
            const response = await axios({
                method: config.webhook_method || 'POST',
                url: config.webhook_url,
                data: parsedPayload,
                headers: config.webhook_headers || {},
                timeout: 30000
            });
            
            // Update webhook record
            await execute(
                `UPDATE campaign_webhook_calls 
                 SET response_status = ?, response_body = ? 
                 WHERE id = ?`,
                [response.status, JSON.stringify(response.data), webhookId.lastInsertRowid]
            );
            
            return { 
                success: true, 
                webhook_id: webhookId.lastInsertRowid,
                status: response.status 
            };
        } catch (error: any) {
            return { 
                success: false, 
                error: error.message,
                status: error.response?.status 
            };
        }
    }

    private async executeTagDb(instance: RuntimeInstance, config: ActionConfig): Promise<any> {
        try {
            await execute(
                `INSERT INTO campaign_tags (campaign_id, instance_id, tag_type, tag_value, metadata)
                 VALUES (?, ?, ?, ?, ?)`,
                [
                    instance.campaign_id,
                    instance.id!,
                    'custom',
                    config.tag_value || config.tag_name || 'campaign_tag',
                    JSON.stringify({
                        wallet: instance.trigger_wallet,
                        signature: instance.trigger_tx_signature,
                        ...config.metadata
                    })
                ]
            );
            
            return { success: true, tag: config.tag_value };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async executeSendToFetcher(instance: RuntimeInstance, config: ActionConfig): Promise<any> {
        // Integration with Fetcher Trading Bot
        // This would send the detected wallet/token to the trading system
        const ws = getWebSocketServer();
        
        ws.broadcast('campaign_fetcher_signal', {
            campaign_id: instance.campaign_id,
            instance_id: instance.id,
            wallet: instance.trigger_wallet,
            signature: instance.trigger_tx_signature,
            metadata: config.metadata
        });
        
        return { success: true, sent_to: 'fetcher' };
    }

    private async executeCreateAlert(instance: RuntimeInstance, config: ActionConfig): Promise<any> {
        try {
            await execute(
                `INSERT INTO campaign_alerts 
                 (campaign_id, instance_id, alert_type, alert_level, title, message, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                [
                    instance.campaign_id,
                    instance.id!,
                    'detection',
                    config.priority || 'info',
                    config.alert_title || 'Campaign Alert',
                    config.alert_message || `Campaign ${instance.campaign_id} detected event`,
                    JSON.stringify({
                        wallet: instance.trigger_wallet,
                        signature: instance.trigger_tx_signature,
                        ...config.metadata
                    })
                ]
            );
            
            // Broadcast alert via WebSocket
            const ws = getWebSocketServer();
            ws.broadcast('campaign_alert', {
                campaign_id: instance.campaign_id,
                instance_id: instance.id,
                title: config.alert_title,
                message: config.alert_message,
                level: config.priority
            });
            
            return { success: true, alert_created: true };
        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    private async handleNodeFailure(instanceId: number, node: CampaignNode, error: any): Promise<void> {
        console.log(`❌ Node ${node.node_id} failed for instance ${instanceId}:`, error);
        
        // Log failure event
        await this.logEvent(instanceId, this.activeInstances.get(instanceId)?.campaign_id || 0,
            node.node_id, 'filter_failed', error);
        
        // For filters, stop execution
        if (node.node_type === 'filter') {
            await this.failInstance(instanceId, `Filter ${node.node_id} failed: ${error.reason || error.error}`);
        } else {
            // For other nodes, continue execution
            await this.processNextNode(instanceId);
        }
    }

    private async handleMonitorDetected(data: { campaign_id: number, instance_id: number, detection: any }): Promise<void> {
        const { instance_id, detection } = data;
        const instance = this.activeInstances.get(instance_id);
        
        if (!instance) return;
        
        console.log(`🔍 Monitor detected event for instance ${instance_id}`);
        
        // Continue execution if there are nodes after the monitor
        const queue = this.executionQueues.get(instance_id);
        if (queue && queue.length > 0) {
            await this.processNextNode(instance_id);
        }
    }

    private async completeInstance(instanceId: number): Promise<void> {
        console.log(`✅ Completing instance ${instanceId}`);
        
        await execute(
            `UPDATE campaign_runtime_instances 
             SET status = 'completed', completed_at = ? 
             WHERE id = ?`,
            [Math.floor(Date.now() / 1000), instanceId]
        );
        
        // Update campaign success count
        const instance = this.activeInstances.get(instanceId);
        if (instance) {
            await execute(
                `UPDATE campaigns 
                 SET successful_instances = successful_instances + 1 
                 WHERE id = ?`,
                [instance.campaign_id]
            );
        }
        
        this.activeInstances.delete(instanceId);
        this.executionQueues.delete(instanceId);
        
        // Emit completion event
        this.emit('instance_completed', instanceId);
        
        // Broadcast via WebSocket
        const ws = getWebSocketServer();
        ws.broadcast('campaign_instance_completed', {
            instance_id: instanceId,
            campaign_id: instance?.campaign_id
        });
    }

    private async failInstance(instanceId: number, error: string): Promise<void> {
        console.log(`❌ Failing instance ${instanceId}: ${error}`);
        
        await execute(
            `UPDATE campaign_runtime_instances 
             SET status = 'failed', completed_at = ?, error_message = ? 
             WHERE id = ?`,
            [Math.floor(Date.now() / 1000), error, instanceId]
        );
        
        this.activeInstances.delete(instanceId);
        this.executionQueues.delete(instanceId);
        
        // Emit failure event
        this.emit('instance_failed', { instanceId, error });
    }

    private async logEvent(
        instanceId: number, 
        campaignId: number, 
        nodeId: string, 
        eventType: string, 
        eventData: any
    ): Promise<void> {
        await execute(
            `INSERT INTO campaign_events 
             (instance_id, campaign_id, node_id, event_type, event_data, tx_signature, block_time)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                instanceId,
                campaignId,
                nodeId,
                eventType,
                JSON.stringify(eventData),
                eventData.signature || null,
                eventData.timestamp ? Math.floor(eventData.timestamp / 1000) : null
            ]
        );
        
        // Update metrics
        const metricDate = new Date().toISOString().split('T')[0];
        const metricField = eventType === 'trigger_fired' ? 'triggers_fired' :
                           eventType === 'filter_passed' ? 'filters_passed' :
                           eventType === 'filter_failed' ? 'filters_failed' :
                           eventType === 'monitor_detected' ? 'monitors_completed' :
                           eventType === 'action_executed' ? 'actions_executed' : null;
        
        if (metricField) {
            await execute(
                `INSERT INTO campaign_metrics (campaign_id, metric_date, ${metricField})
                 VALUES (?, ?, 1)
                 ON CONFLICT(campaign_id, metric_date) 
                 DO UPDATE SET ${metricField} = ${metricField} + 1`,
                [campaignId, metricDate]
            );
        }
    }

    // Public method to get active instances
    getActiveInstances(): RuntimeInstance[] {
        return Array.from(this.activeInstances.values());
    }

    // Public method to get instance by ID
    getInstance(instanceId: number): RuntimeInstance | undefined {
        return this.activeInstances.get(instanceId);
    }
}

// Singleton instance
let campaignExecutor: CampaignExecutor | null = null;

export function getCampaignExecutor(): CampaignExecutor {
    if (!campaignExecutor) {
        campaignExecutor = new CampaignExecutor();
    }
    return campaignExecutor;
}
