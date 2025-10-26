import { EventEmitter } from 'events';
/**
 * Platform types that can be monitored
 */
export var SnifferPlatform;
(function (SnifferPlatform) {
    SnifferPlatform["TELEGRAM"] = "telegram";
    SnifferPlatform["TWITTER"] = "twitter";
    SnifferPlatform["DISCORD"] = "discord";
    SnifferPlatform["TWITTER_SPACES"] = "twitter_spaces";
    SnifferPlatform["TWITTER_COMMUNITIES"] = "twitter_communities";
    SnifferPlatform["ONCHAIN_SOLANA"] = "onchain_solana";
    SnifferPlatform["ONCHAIN_ETH"] = "onchain_eth";
    SnifferPlatform["REDDIT"] = "reddit";
    SnifferPlatform["FARCASTER"] = "farcaster";
})(SnifferPlatform || (SnifferPlatform = {}));
/**
 * Base class for all platform sniffers
 */
export class BaseSnifferService extends EventEmitter {
    constructor(platform) {
        super();
        this.isConnected = false;
        this.monitoredChats = new Map();
        this.activeMonitors = new Map();
        this.platform = platform;
    }
    /**
     * Search chats by query
     */
    async searchChats(query, chats) {
        const searchableChats = chats || Array.from(this.monitoredChats.values());
        const lowerQuery = query.toLowerCase();
        return searchableChats.filter(chat => {
            return (chat.name?.toLowerCase().includes(lowerQuery) ||
                chat.displayName?.toLowerCase().includes(lowerQuery) ||
                chat.handle?.toLowerCase().includes(lowerQuery) ||
                chat.description?.toLowerCase().includes(lowerQuery) ||
                chat.platformId.includes(query));
        });
    }
    /**
     * Filter chats by criteria
     */
    async filterChats(criteria, chats) {
        const filterableChats = chats || Array.from(this.monitoredChats.values());
        return filterableChats.filter(chat => {
            if (criteria.type && chat.type !== criteria.type)
                return false;
            if (criteria.isPublic !== undefined && chat.isPublic !== criteria.isPublic)
                return false;
            if (criteria.isVerified !== undefined && chat.isVerified !== criteria.isVerified)
                return false;
            if (criteria.minMembers && (!chat.memberCount || chat.memberCount < criteria.minMembers))
                return false;
            if (criteria.hasAccess !== undefined && chat.hasAccess !== criteria.hasAccess)
                return false;
            if (criteria.platform && chat.platform !== criteria.platform)
                return false;
            return true;
        });
    }
    /**
     * Process detected content through automation pipeline
     */
    async processDetection(content, config) {
        // Check rate limits
        if (config.rateLimit) {
            // Implement rate limiting logic
        }
        // Process through each action
        if (config.actions) {
            for (const action of config.actions) {
                if (this.shouldTriggerAction(content, action)) {
                    await this.executeAction(content, action);
                    content.actionsTriggered = content.actionsTriggered || [];
                    content.actionsTriggered.push(action.id);
                }
            }
        }
        // Emit event for external handlers
        this.emit('content:detected', content);
    }
    /**
     * Check if an action should be triggered
     */
    shouldTriggerAction(content, action) {
        return this.evaluateTriggerCondition(content, action.trigger);
    }
    /**
     * Evaluate a trigger condition
     */
    evaluateTriggerCondition(content, condition) {
        let result = false;
        switch (condition.type) {
            case 'keyword':
                result = condition.operator === 'contains'
                    ? content.content.toLowerCase().includes(condition.value.toLowerCase())
                    : content.content.toLowerCase() === condition.value.toLowerCase();
                break;
            case 'pattern':
                const pattern = new RegExp(condition.value, 'gi');
                result = pattern.test(content.content);
                break;
            case 'user':
                result = content.senderId === condition.value || content.senderHandle === condition.value;
                break;
            case 'contract':
                // Solana address pattern
                const solPattern = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/;
                result = solPattern.test(content.content);
                break;
            default:
                result = false;
        }
        // Handle additional conditions
        if (condition.additionalConditions && condition.additionalConditions.length > 0) {
            const additionalResults = condition.additionalConditions.map(c => this.evaluateTriggerCondition(content, c));
            if (condition.combineWith === 'AND') {
                result = result && additionalResults.every(r => r === true);
            }
            else if (condition.combineWith === 'OR') {
                result = result || additionalResults.some(r => r === true);
            }
        }
        return result;
    }
    /**
     * Execute an automation action
     */
    async executeAction(content, action) {
        console.log(`🎯 [${this.platform}] Executing action ${action.type} for ${action.id}`);
        switch (action.type) {
            case 'webhook':
                await this.sendWebhook(action.config.url, content);
                break;
            case 'forward':
                await this.forwardContent(content, action.config);
                break;
            case 'alert':
                this.emit('alert', { content, action });
                break;
            case 'analyze':
                await this.analyzeContent(content, action.config);
                break;
            case 'execute':
                // Execute custom function
                if (action.config.function) {
                    await action.config.function(content);
                }
                break;
        }
    }
    /**
     * Send content to webhook
     */
    async sendWebhook(url, content) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    platform: this.platform,
                    timestamp: new Date().toISOString(),
                    content: content
                })
            });
            if (!response.ok) {
                console.error(`❌ [${this.platform}] Webhook failed: ${response.statusText}`);
            }
        }
        catch (error) {
            console.error(`❌ [${this.platform}] Webhook error:`, error);
        }
    }
    /**
     * Get platform statistics
     */
    getStatistics() {
        return {
            platform: this.platform,
            isConnected: this.isConnected,
            totalChats: this.monitoredChats.size,
            activeMonitors: this.activeMonitors.size,
            chatsMonitored: Array.from(this.monitoredChats.values()).filter(c => c.monitoringConfig?.isActive).length
        };
    }
}
