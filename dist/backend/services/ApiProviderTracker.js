/**
 * API Provider Tracker
 * Comprehensive tracking of all external API calls by provider
 * Monitors rates, success/failure, response times, and quotas
 */
export class ApiProviderTracker {
    constructor() {
        this.providers = new Map();
        this.callHistory = [];
        this.MAX_HISTORY = 10000;
        this.MINUTE_MS = 60 * 1000;
        this.HOUR_MS = 60 * 60 * 1000;
        // Cleanup old history every 5 minutes
        setInterval(() => this.cleanupOldHistory(), 5 * 60 * 1000);
    }
    static getInstance() {
        if (!ApiProviderTracker.instance) {
            ApiProviderTracker.instance = new ApiProviderTracker();
        }
        return ApiProviderTracker.instance;
    }
    /**
     * Track an API call
     */
    trackCall(provider, endpoint, success, responseTime, statusCode, error) {
        const now = Date.now();
        // Get or create provider stats
        let providerStats = this.providers.get(provider);
        if (!providerStats) {
            providerStats = {
                provider,
                totalCalls: 0,
                successCalls: 0,
                failedCalls: 0,
                rateLimitHits: 0,
                avgResponseTime: 0,
                callsLastMinute: 0,
                callsLastHour: 0,
                lastCallTime: now,
                endpoints: new Map()
            };
            this.providers.set(provider, providerStats);
        }
        // Update provider stats
        providerStats.totalCalls++;
        providerStats.lastCallTime = now;
        if (success) {
            providerStats.successCalls++;
        }
        else {
            providerStats.failedCalls++;
            // Check if it's a rate limit error
            if (statusCode === 429 || error?.toLowerCase().includes('rate limit')) {
                providerStats.rateLimitHits++;
            }
        }
        // Update average response time
        const totalTime = providerStats.avgResponseTime * (providerStats.totalCalls - 1);
        providerStats.avgResponseTime = (totalTime + responseTime) / providerStats.totalCalls;
        // Get or create endpoint stats
        let endpointStats = providerStats.endpoints.get(endpoint);
        if (!endpointStats) {
            endpointStats = {
                endpoint,
                totalCalls: 0,
                successCalls: 0,
                failedCalls: 0,
                avgResponseTime: 0,
                lastCallTime: now
            };
            providerStats.endpoints.set(endpoint, endpointStats);
        }
        // Update endpoint stats
        endpointStats.totalCalls++;
        endpointStats.lastCallTime = now;
        if (success) {
            endpointStats.successCalls++;
        }
        else {
            endpointStats.failedCalls++;
        }
        // Update endpoint average response time
        const endpointTotalTime = endpointStats.avgResponseTime * (endpointStats.totalCalls - 1);
        endpointStats.avgResponseTime = (endpointTotalTime + responseTime) / endpointStats.totalCalls;
        // Add to call history
        this.callHistory.push({
            provider,
            endpoint,
            timestamp: now,
            success,
            responseTime,
            statusCode,
            error
        });
        // Limit history size
        if (this.callHistory.length > this.MAX_HISTORY) {
            this.callHistory.shift();
        }
    }
    /**
     * Get stats for a specific provider
     */
    getProviderStats(provider) {
        const stats = this.providers.get(provider);
        if (!stats)
            return null;
        // Calculate recent call rates
        const now = Date.now();
        const minuteAgo = now - this.MINUTE_MS;
        const hourAgo = now - this.HOUR_MS;
        stats.callsLastMinute = this.callHistory.filter(call => call.provider === provider && call.timestamp >= minuteAgo).length;
        stats.callsLastHour = this.callHistory.filter(call => call.provider === provider && call.timestamp >= hourAgo).length;
        return stats;
    }
    /**
     * Get all provider stats
     */
    getAllStats() {
        const now = Date.now();
        const minuteAgo = now - this.MINUTE_MS;
        const hourAgo = now - this.HOUR_MS;
        const result = {};
        for (const [provider, stats] of this.providers) {
            // Calculate recent rates
            const recentCalls = this.callHistory.filter(call => call.provider === provider && call.timestamp >= minuteAgo);
            const hourCalls = this.callHistory.filter(call => call.provider === provider && call.timestamp >= hourAgo);
            // Convert endpoints Map to object
            const endpoints = {};
            for (const [endpointName, endpointStats] of stats.endpoints) {
                endpoints[endpointName] = {
                    totalCalls: endpointStats.totalCalls,
                    successCalls: endpointStats.successCalls,
                    failedCalls: endpointStats.failedCalls,
                    successRate: endpointStats.totalCalls > 0
                        ? Math.round((endpointStats.successCalls / endpointStats.totalCalls) * 100)
                        : 100,
                    avgResponseTime: Math.round(endpointStats.avgResponseTime),
                    lastCallTime: endpointStats.lastCallTime,
                    lastCallAgo: Math.round((now - endpointStats.lastCallTime) / 1000) // seconds ago
                };
            }
            result[provider] = {
                totalCalls: stats.totalCalls,
                successCalls: stats.successCalls,
                failedCalls: stats.failedCalls,
                rateLimitHits: stats.rateLimitHits,
                successRate: stats.totalCalls > 0
                    ? Math.round((stats.successCalls / stats.totalCalls) * 100)
                    : 100,
                avgResponseTime: Math.round(stats.avgResponseTime),
                callsLastMinute: recentCalls.length,
                callsLastHour: hourCalls.length,
                callsPerMinute: Math.round(hourCalls.length / 60),
                lastCallTime: stats.lastCallTime,
                lastCallAgo: Math.round((now - stats.lastCallTime) / 1000), // seconds ago
                endpoints
            };
        }
        return result;
    }
    /**
     * Get recent call history
     */
    getRecentCalls(provider, limit = 100) {
        let calls = this.callHistory;
        if (provider) {
            calls = calls.filter(call => call.provider === provider);
        }
        return calls.slice(-limit).reverse(); // Most recent first
    }
    /**
     * Get aggregated metrics
     */
    getAggregatedMetrics() {
        const totalCalls = this.callHistory.length;
        const successCalls = this.callHistory.filter(c => c.success).length;
        const failedCalls = this.callHistory.filter(c => !c.success).length;
        const now = Date.now();
        const minuteAgo = now - this.MINUTE_MS;
        const hourAgo = now - this.HOUR_MS;
        const callsLastMinute = this.callHistory.filter(c => c.timestamp >= minuteAgo).length;
        const callsLastHour = this.callHistory.filter(c => c.timestamp >= hourAgo).length;
        return {
            totalCalls,
            successCalls,
            failedCalls,
            successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 100,
            callsLastMinute,
            callsLastHour,
            callsPerMinute: Math.round(callsLastHour / 60),
            providerCount: this.providers.size,
            providers: Array.from(this.providers.keys())
        };
    }
    /**
     * Reset all stats
     */
    reset() {
        this.providers.clear();
        this.callHistory = [];
    }
    /**
     * Cleanup old history (keep last hour only)
     */
    cleanupOldHistory() {
        const cutoff = Date.now() - this.HOUR_MS;
        this.callHistory = this.callHistory.filter(call => call.timestamp >= cutoff);
    }
}
// Global singleton
export const apiProviderTracker = ApiProviderTracker.getInstance();
