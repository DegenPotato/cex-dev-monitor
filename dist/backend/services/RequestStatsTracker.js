/**
 * Real-time Request Statistics Tracker
 * Monitors all API calls, proxy usage, and request volumes
 */
export class RequestStatsTracker {
    constructor() {
        // Request counters
        this.totalRequests = 0;
        this.requestsByService = new Map();
        this.requestsByEndpoint = new Map(); // Track per RPC endpoint
        this.requestsByMinute = new Map(); // timestamp -> count
        this.recentRequests = [];
        // Performance tracking
        this.successCount = 0;
        this.failureCount = 0;
        this.avgResponseTime = 0;
        this.responseTimes = [];
        // Proxy tracking
        this.proxyRequests = 0;
        this.directRequests = 0;
        // Retry and rate limit tracking
        this.retryCount = 0;
        this.rateLimitErrors = 0;
        this.actualFailures = 0; // True failures after all retries
        this.eventualSuccesses = 0; // Succeeded after retries
        // Rate limiting
        this.MAX_RECENT_REQUESTS = 1000;
        this.MINUTE_WINDOW = 60000; // 1 minute in ms
        // Cleanup old minute data every minute
        setInterval(() => this.cleanupOldMinuteData(), 60000);
    }
    static getInstance() {
        if (!RequestStatsTracker.instance) {
            RequestStatsTracker.instance = new RequestStatsTracker();
        }
        return RequestStatsTracker.instance;
    }
    /**
     * Track a new request
     */
    trackRequest(service, success = true, responseTime, usedProxy = true, endpoint) {
        this.totalRequests++;
        // Service tracking
        const serviceCount = this.requestsByService.get(service) || 0;
        this.requestsByService.set(service, serviceCount + 1);
        // Endpoint tracking (for RPC servers)
        if (endpoint) {
            const endpointCount = this.requestsByEndpoint.get(endpoint) || 0;
            this.requestsByEndpoint.set(endpoint, endpointCount + 1);
        }
        // Success/failure tracking
        if (success) {
            this.successCount++;
        }
        else {
            this.failureCount++;
        }
        // Response time tracking
        if (responseTime !== undefined) {
            this.responseTimes.push(responseTime);
            if (this.responseTimes.length > 100) {
                this.responseTimes.shift(); // Keep last 100
            }
            this.avgResponseTime = this.responseTimes.reduce((a, b) => a + b, 0) / this.responseTimes.length;
        }
        // Proxy tracking
        if (usedProxy) {
            this.proxyRequests++;
        }
        else {
            this.directRequests++;
        }
        // Per-minute tracking
        const minuteKey = this.getMinuteKey(Date.now());
        const minuteCount = this.requestsByMinute.get(minuteKey) || 0;
        this.requestsByMinute.set(minuteKey, minuteCount + 1);
        // Recent requests
        this.recentRequests.push({
            service,
            endpoint,
            timestamp: Date.now(),
            success
        });
        // Limit recent requests array
        if (this.recentRequests.length > this.MAX_RECENT_REQUESTS) {
            this.recentRequests.shift();
        }
    }
    /**
     * Track a retry attempt
     */
    trackRetry(service, isRateLimit = false) {
        this.retryCount++;
        if (isRateLimit) {
            this.rateLimitErrors++;
        }
        console.log(`⚠️  [Stats] Retry tracked for ${service} (Rate Limit: ${isRateLimit})`);
    }
    /**
     * Track eventual outcome after retries
     */
    trackEventualOutcome(service, success, retries) {
        if (success) {
            this.eventualSuccesses++;
            if (retries > 0) {
                console.log(`✅ [Stats] ${service} succeeded after ${retries} retries`);
            }
        }
        else {
            this.actualFailures++;
            console.log(`❌ [Stats] ${service} failed after ${retries} retries`);
        }
    }
    /**
     * Get current statistics
     */
    getStats() {
        const now = Date.now();
        const oneMinuteAgo = now - this.MINUTE_WINDOW;
        // Calculate requests in last minute
        const recentCount = this.recentRequests.filter(req => req.timestamp >= oneMinuteAgo).length;
        // Calculate per-service rates
        const serviceRates = {};
        for (const [service, _] of this.requestsByService) {
            const serviceRecent = this.recentRequests.filter(req => req.service === service && req.timestamp >= oneMinuteAgo).length;
            serviceRates[service] = serviceRecent;
        }
        // Calculate per-endpoint rates (last minute)
        const endpointRates = {};
        for (const [endpoint, _] of this.requestsByEndpoint) {
            const endpointRecent = this.recentRequests.filter(req => req.endpoint === endpoint && req.timestamp >= oneMinuteAgo).length;
            endpointRates[endpoint] = endpointRecent;
        }
        // Success rates
        const totalAttempts = this.successCount + this.failureCount;
        const successRate = totalAttempts > 0 ? (this.successCount / totalAttempts) * 100 : 100;
        const totalWithRetries = this.eventualSuccesses + this.actualFailures;
        const eventualSuccessRate = totalWithRetries > 0 ? (this.eventualSuccesses / totalWithRetries) * 100 : 100;
        return {
            overview: {
                totalRequests: this.totalRequests,
                requestsPerMinute: recentCount,
                avgResponseTime: Math.round(this.avgResponseTime),
                successRate: Math.round(successRate * 100) / 100,
                eventualSuccessRate: Math.round(eventualSuccessRate * 100) / 100,
                uptime: process.uptime()
            },
            byService: Object.fromEntries(this.requestsByService),
            byEndpoint: Object.fromEntries(this.requestsByEndpoint),
            serviceRates,
            endpointRates,
            proxyUsage: {
                proxyRequests: this.proxyRequests,
                directRequests: this.directRequests,
                proxyPercentage: Math.round((this.proxyRequests / (this.proxyRequests + this.directRequests)) * 100)
            },
            performance: {
                successCount: this.successCount,
                failureCount: this.failureCount,
                avgResponseTime: Math.round(this.avgResponseTime)
            },
            retryStats: {
                totalRetries: this.retryCount,
                rateLimitErrors: this.rateLimitErrors,
                eventualSuccesses: this.eventualSuccesses,
                actualFailures: this.actualFailures,
                avgRetriesPerRequest: totalWithRetries > 0 ? Math.round((this.retryCount / totalWithRetries) * 100) / 100 : 0
            },
            recentActivity: this.recentRequests.slice(-50).reverse() // Last 50, newest first
        };
    }
    /**
     * Get real-time chart data for last N minutes
     */
    getTimeSeriesData(minutes = 10) {
        const now = Date.now();
        const labels = [];
        const data = [];
        for (let i = minutes - 1; i >= 0; i--) {
            const timestamp = now - (i * 60000);
            const minuteKey = this.getMinuteKey(timestamp);
            const count = this.requestsByMinute.get(minuteKey) || 0;
            const date = new Date(timestamp);
            labels.push(`${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`);
            data.push(count);
        }
        return { labels, data };
    }
    /**
     * Reset statistics
     */
    reset() {
        this.totalRequests = 0;
        this.requestsByService.clear();
        this.requestsByEndpoint.clear();
        this.requestsByMinute.clear();
        this.recentRequests = [];
        this.successCount = 0;
        this.failureCount = 0;
        this.avgResponseTime = 0;
        this.responseTimes = [];
        this.proxyRequests = 0;
        this.directRequests = 0;
        this.retryCount = 0;
        this.rateLimitErrors = 0;
        this.actualFailures = 0;
        this.eventualSuccesses = 0;
    }
    getMinuteKey(timestamp) {
        const date = new Date(timestamp);
        return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
    }
    cleanupOldMinuteData() {
        const cutoff = Date.now() - (60 * 60000); // Keep last 60 minutes
        const cutoffKey = this.getMinuteKey(cutoff);
        for (const [key] of this.requestsByMinute) {
            if (key < cutoffKey) {
                this.requestsByMinute.delete(key);
            }
        }
    }
}
