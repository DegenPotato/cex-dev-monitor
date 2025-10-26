import { queryOne, queryAll, execute } from '../database/helpers.js';
import { getSolanaEventDetector } from './SolanaEventDetector.js';
export class CampaignManager {
    constructor() {
        console.log('📊 CampaignManager initialized');
    }
    // ==================== Campaign CRUD ====================
    async createCampaign(userId, campaign) {
        const result = await execute(`INSERT INTO campaigns (user_id, name, description, enabled, tags, lifetime_ms, max_instances)
             VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            userId,
            campaign.name || 'New Campaign',
            campaign.description || '',
            campaign.enabled !== false ? 1 : 0,
            JSON.stringify(campaign.tags || []),
            campaign.lifetime_ms || null,
            campaign.max_instances || 100
        ]);
        const newCampaign = {
            id: result.lastInsertRowid,
            user_id: userId,
            name: campaign.name || 'New Campaign',
            description: campaign.description,
            enabled: campaign.enabled !== false,
            tags: campaign.tags || [],
            lifetime_ms: campaign.lifetime_ms,
            max_instances: campaign.max_instances || 100,
            created_at: Date.now()
        };
        // Create nodes if provided
        if (campaign.nodes && campaign.nodes.length > 0) {
            for (const node of campaign.nodes) {
                await this.addNode(newCampaign.id, node);
            }
            newCampaign.nodes = campaign.nodes;
        }
        console.log(`✅ Created campaign ${newCampaign.id}: ${newCampaign.name}`);
        return newCampaign;
    }
    async getCampaign(campaignId, userId) {
        const whereClause = userId ? 'c.id = ? AND c.user_id = ?' : 'c.id = ?';
        const params = userId ? [campaignId, userId] : [campaignId];
        const campaign = await queryOne(`SELECT c.*,
                (SELECT json_group_array(json_object(
                    'node_id', node_id,
                    'node_type', node_type,
                    'parent_node_id', parent_node_id,
                    'parallel_group', parallel_group,
                    'config', config,
                    'position_x', position_x,
                    'position_y', position_y
                ))
                FROM campaign_nodes 
                WHERE campaign_id = c.id
                ) as nodes_json
             FROM campaigns c
             WHERE ${whereClause}`, params);
        if (!campaign)
            return null;
        // Parse JSON fields
        if (campaign.tags)
            campaign.tags = JSON.parse(campaign.tags);
        if (campaign.nodes_json) {
            campaign.nodes = JSON.parse(campaign.nodes_json);
            campaign.nodes.forEach((node) => {
                if (typeof node.config === 'string') {
                    node.config = JSON.parse(node.config);
                }
            });
        }
        delete campaign.nodes_json;
        return campaign;
    }
    async getUserCampaigns(userId) {
        const campaigns = await queryAll(`SELECT c.*,
                (SELECT COUNT(*) FROM campaign_runtime_instances 
                 WHERE campaign_id = c.id AND status = 'running') as active_instances,
                (SELECT COUNT(*) FROM campaign_runtime_instances 
                 WHERE campaign_id = c.id 
                 AND date(started_at, 'unixepoch') = date('now')) as today_instances
             FROM campaigns c
             WHERE c.user_id = ?
             ORDER BY c.created_at DESC`, [userId]);
        // Parse JSON fields
        for (const campaign of campaigns) {
            if (campaign.tags)
                campaign.tags = JSON.parse(campaign.tags);
        }
        return campaigns;
    }
    async updateCampaign(campaignId, userId, updates) {
        const fields = [];
        const values = [];
        if (updates.name !== undefined) {
            fields.push('name = ?');
            values.push(updates.name);
        }
        if (updates.description !== undefined) {
            fields.push('description = ?');
            values.push(updates.description);
        }
        if (updates.enabled !== undefined) {
            fields.push('enabled = ?');
            values.push(updates.enabled ? 1 : 0);
        }
        if (updates.tags !== undefined) {
            fields.push('tags = ?');
            values.push(JSON.stringify(updates.tags));
        }
        if (updates.lifetime_ms !== undefined) {
            fields.push('lifetime_ms = ?');
            values.push(updates.lifetime_ms);
        }
        if (updates.max_instances !== undefined) {
            fields.push('max_instances = ?');
            values.push(updates.max_instances);
        }
        fields.push('updated_at = ?');
        values.push(Math.floor(Date.now() / 1000));
        values.push(campaignId, userId);
        await execute(`UPDATE campaigns SET ${fields.join(', ')} WHERE id = ? AND user_id = ?`, values);
        return true;
    }
    async deleteCampaign(campaignId, userId) {
        // First, stop any running instances
        await execute(`UPDATE campaign_runtime_instances 
             SET status = 'failed', error_message = 'Campaign deleted'
             WHERE campaign_id = ? AND status = 'running'`, [campaignId]);
        // Delete the campaign (cascades to nodes, events, etc.)
        const result = await execute(`DELETE FROM campaigns WHERE id = ? AND user_id = ?`, [campaignId, userId]);
        return result.changes > 0;
    }
    async activateCampaign(campaignId, userId) {
        await execute(`UPDATE campaigns 
             SET enabled = 1, last_activated_at = ? 
             WHERE id = ? AND user_id = ?`, [Math.floor(Date.now() / 1000), campaignId, userId]);
        // Reload in detector
        const detector = getSolanaEventDetector();
        await detector['loadActiveCampaigns']();
        return true;
    }
    async deactivateCampaign(campaignId, userId) {
        await execute(`UPDATE campaigns SET enabled = 0 WHERE id = ? AND user_id = ?`, [campaignId, userId]);
        return true;
    }
    // ==================== Node Management ====================
    async addNode(campaignId, node) {
        const result = await execute(`INSERT INTO campaign_nodes 
             (campaign_id, node_id, node_type, parent_node_id, parallel_group, config, position_x, position_y)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
            campaignId,
            node.node_id,
            node.node_type,
            node.parent_node_id || null,
            node.parallel_group || null,
            JSON.stringify(node.config),
            node.position_x || 0,
            node.position_y || 0
        ]);
        node.id = result.lastInsertRowid;
        node.campaign_id = campaignId;
        return node;
    }
    async updateNode(campaignId, nodeId, updates) {
        const fields = [];
        const values = [];
        if (updates.parent_node_id !== undefined) {
            fields.push('parent_node_id = ?');
            values.push(updates.parent_node_id);
        }
        if (updates.parallel_group !== undefined) {
            fields.push('parallel_group = ?');
            values.push(updates.parallel_group);
        }
        if (updates.config !== undefined) {
            fields.push('config = ?');
            values.push(JSON.stringify(updates.config));
        }
        if (updates.position_x !== undefined) {
            fields.push('position_x = ?');
            values.push(updates.position_x);
        }
        if (updates.position_y !== undefined) {
            fields.push('position_y = ?');
            values.push(updates.position_y);
        }
        if (fields.length === 0)
            return false;
        values.push(campaignId, nodeId);
        await execute(`UPDATE campaign_nodes SET ${fields.join(', ')} WHERE campaign_id = ? AND node_id = ?`, values);
        return true;
    }
    async deleteNode(campaignId, nodeId) {
        // Update children to have no parent
        await execute(`UPDATE campaign_nodes SET parent_node_id = NULL 
             WHERE campaign_id = ? AND parent_node_id = ?`, [campaignId, nodeId]);
        // Delete the node
        const result = await execute(`DELETE FROM campaign_nodes WHERE campaign_id = ? AND node_id = ?`, [campaignId, nodeId]);
        return result.changes > 0;
    }
    // ==================== Runtime & Monitoring ====================
    async getRunningInstances(userId) {
        const whereClause = userId
            ? `ri.status = 'running' AND c.user_id = ?`
            : `ri.status = 'running'`;
        const params = userId ? [userId] : [];
        const instances = await queryAll(`SELECT ri.*, c.name as campaign_name
             FROM campaign_runtime_instances ri
             JOIN campaigns c ON ri.campaign_id = c.id
             WHERE ${whereClause}
             ORDER BY ri.started_at DESC`, params);
        // Parse JSON fields
        for (const instance of instances) {
            if (instance.trigger_data)
                instance.trigger_data = JSON.parse(instance.trigger_data);
            if (instance.execution_log)
                instance.execution_log = JSON.parse(instance.execution_log);
        }
        return instances;
    }
    async getInstanceHistory(campaignId, limit = 50) {
        const instances = await queryAll(`SELECT * FROM campaign_runtime_instances 
             WHERE campaign_id = ?
             ORDER BY started_at DESC
             LIMIT ?`, [campaignId, limit]);
        // Parse JSON fields
        for (const instance of instances) {
            if (instance.trigger_data)
                instance.trigger_data = JSON.parse(instance.trigger_data);
            if (instance.execution_log)
                instance.execution_log = JSON.parse(instance.execution_log);
        }
        return instances;
    }
    async getCampaignEvents(instanceId) {
        const events = await queryAll(`SELECT * FROM campaign_events 
             WHERE instance_id = ?
             ORDER BY created_at ASC`, [instanceId]);
        // Parse JSON fields
        for (const event of events) {
            if (event.event_data)
                event.event_data = JSON.parse(event.event_data);
            if (event.raw_instructions)
                event.raw_instructions = JSON.parse(event.raw_instructions);
        }
        return events;
    }
    async getCampaignAlerts(userId, acknowledged = false) {
        const alerts = await queryAll(`SELECT a.*, c.name as campaign_name
             FROM campaign_alerts a
             JOIN campaigns c ON a.campaign_id = c.id
             WHERE c.user_id = ? AND a.acknowledged = ?
             ORDER BY a.created_at DESC
             LIMIT 100`, [userId, acknowledged ? 1 : 0]);
        // Parse JSON fields
        for (const alert of alerts) {
            if (alert.metadata)
                alert.metadata = JSON.parse(alert.metadata);
        }
        return alerts;
    }
    async acknowledgeAlert(alertId, userId) {
        const result = await execute(`UPDATE campaign_alerts 
             SET acknowledged = 1 
             WHERE id = ? AND campaign_id IN (
                SELECT id FROM campaigns WHERE user_id = ?
             )`, [alertId, userId]);
        return result.changes > 0;
    }
    async getCampaignMetrics(campaignId, days = 7) {
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];
        const metrics = await queryAll(`SELECT * FROM campaign_metrics 
             WHERE campaign_id = ? AND metric_date >= ?
             ORDER BY metric_date DESC`, [campaignId, startDateStr]);
        return metrics;
    }
    // ==================== Templates ====================
    async exportCampaignAsTemplate(campaignId) {
        const campaign = await this.getCampaign(campaignId);
        if (!campaign)
            throw new Error('Campaign not found');
        const template = {
            name: campaign.name,
            description: campaign.description || '',
            category: 'custom',
            tags: campaign.tags || [],
            nodes: campaign.nodes || [],
            version: '1.0.0'
        };
        return template;
    }
    async importCampaignFromTemplate(userId, template) {
        const campaign = {
            name: template.name + ' (Imported)',
            description: template.description,
            tags: template.tags,
            nodes: template.nodes,
            enabled: false // Start disabled
        };
        return await this.createCampaign(userId, campaign);
    }
    // ==================== Predefined Templates ====================
    getPresetTemplates() {
        return [
            {
                name: '2 SOL → Token Launch Detector',
                description: 'Detects wallets receiving exactly 2 SOL, monitors for token minting within 1 hour',
                category: 'token_launch',
                tags: ['token', 'launch', 'mint'],
                nodes: [
                    {
                        node_id: 't1',
                        node_type: 'trigger',
                        config: {
                            trigger_type: 'transfer_credited',
                            lamports_exact: 2000000000,
                            dedupe_window_ms: 600000
                        }
                    },
                    {
                        node_id: 'f1',
                        node_type: 'filter',
                        parent_node_id: 't1',
                        config: {
                            filter_type: 'account_age',
                            expression: 'account_age_seconds <= 300'
                        }
                    },
                    {
                        node_id: 'm1',
                        node_type: 'monitor',
                        parent_node_id: 'f1',
                        config: {
                            window_ms: 3600000,
                            programs_to_watch: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'],
                            events: ['InitializeMint', 'MintTo']
                        }
                    },
                    {
                        node_id: 'a1',
                        node_type: 'action',
                        parent_node_id: 'm1',
                        config: {
                            action_type: 'create_alert',
                            alert_title: 'Token Launch Detected',
                            alert_message: 'Wallet {{wallet}} launched a token',
                            priority: 'high'
                        }
                    }
                ]
            },
            {
                name: 'MEV Bot Tracker',
                description: 'Tracks wallets performing high-frequency trades on specific programs',
                category: 'mev',
                tags: ['mev', 'bot', 'trading'],
                nodes: [
                    {
                        node_id: 't1',
                        node_type: 'trigger',
                        config: {
                            trigger_type: 'program_log',
                            program_id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium
                            log_pattern: 'swap.*success',
                            aggregation: 'per_block'
                        }
                    },
                    {
                        node_id: 'a1',
                        node_type: 'action',
                        parent_node_id: 't1',
                        config: {
                            action_type: 'tag_db',
                            tag_name: 'mev_bot',
                            tag_value: 'potential_mev'
                        }
                    }
                ]
            },
            {
                name: 'Wash Trading Detector',
                description: 'Identifies circular token movements indicating wash trading',
                category: 'fraud_detection',
                tags: ['wash', 'trading', 'fraud'],
                nodes: [
                    {
                        node_id: 't1',
                        node_type: 'trigger',
                        config: {
                            trigger_type: 'transfer_credited',
                            lamports_min: 1000000,
                            aggregation: 'per_tx'
                        }
                    },
                    {
                        node_id: 'm1',
                        node_type: 'monitor',
                        parent_node_id: 't1',
                        config: {
                            window_ms: 300000, // 5 minutes
                            programs_to_watch: ['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'],
                            min_events: 5
                        }
                    },
                    {
                        node_id: 'a1',
                        node_type: 'action',
                        parent_node_id: 'm1',
                        config: {
                            action_type: 'webhook',
                            webhook_url: 'https://your-webhook.com/wash-trading',
                            webhook_payload_template: '{"wallet": "{{wallet}}", "type": "wash_trading", "timestamp": "{{timestamp}}"}'
                        }
                    }
                ]
            }
        ];
    }
    // ==================== Analytics ====================
    async getCampaignStats(userId) {
        const stats = await queryOne(`SELECT 
                COUNT(*) as total_campaigns,
                COUNT(CASE WHEN enabled = 1 THEN 1 END) as active_campaigns,
                SUM(total_instances) as total_instances,
                SUM(successful_instances) as successful_instances,
                (SELECT COUNT(*) FROM campaign_runtime_instances ri 
                 JOIN campaigns c ON ri.campaign_id = c.id 
                 WHERE c.user_id = ? AND ri.status = 'running') as running_instances,
                (SELECT COUNT(*) FROM campaign_alerts a 
                 JOIN campaigns c ON a.campaign_id = c.id 
                 WHERE c.user_id = ? AND a.acknowledged = 0) as unread_alerts
             FROM campaigns 
             WHERE user_id = ?`, [userId, userId, userId]);
        return stats;
    }
}
// Singleton instance
let campaignManager = null;
export function getCampaignManager() {
    if (!campaignManager) {
        campaignManager = new CampaignManager();
    }
    return campaignManager;
}
