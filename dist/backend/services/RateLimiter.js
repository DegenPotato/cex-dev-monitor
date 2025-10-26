/**
 * Advanced Rate Limiter with Queuing
 * Implements Solana RPC rate limits with sliding window and token bucket algorithms
 *
 * Solana Mainnet-Beta Limits (per IP):
 * - 100 requests per 10 seconds (total)
 * - 40 requests per 10 seconds per RPC endpoint
 * - 40 concurrent connections
 * - 40 connection rate per 10 seconds
 */
export class RateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
        // Sliding window tracking
        this.requestTimestamps = [];
        this.endpointTimestamps = new Map();
        this.connectionTimestamps = [];
        // Concurrent connection tracking
        this.activeConnections = 0;
        // Limits (Solana RPC) - configurable via updateConfig()
        this.MAX_REQUESTS_PER_10S = 90; // 90 instead of 100 for safety margin
        this.MAX_REQUESTS_PER_ENDPOINT_10S = 35; // 35 instead of 40 for safety
        this.MAX_CONCURRENT_CONNECTIONS = 35; // 35 instead of 40 for safety
        this.MAX_CONNECTION_RATE_10S = 35; // 35 instead of 40 for safety
        this.WINDOW_MS = 10000; // 10 seconds
        // Minimum delay between requests to prevent bursts - configurable
        this.MIN_DELAY_MS = 105; // ~9.5 requests/second = 95 req/10s max
        this.lastRequestTime = 0;
        this.enabled = false; // Only active when proxies are disabled
        // Cleanup old timestamps every 5 seconds
        setInterval(() => this.cleanupOldTimestamps(), 5000);
    }
    /**
     * Enable rate limiting (call when proxies are disabled)
     */
    enable() {
        this.enabled = true;
        console.log('🚦 [RateLimiter] ENABLED - Enforcing Solana RPC limits (not using proxies or RPC rotation)');
    }
    /**
     * Disable rate limiting (when using proxies or RPC rotation)
     */
    disable() {
        this.enabled = false;
        console.log('🚦 [RateLimiter] DISABLED - No limits (using proxies or RPC rotation)');
    }
    /**
     * Execute a request with rate limiting
     */
    async execute(fn, endpoint) {
        // If disabled (using proxies or RPC rotation), execute immediately without limiting
        if (!this.enabled) {
            return await fn();
        }
        return new Promise((resolve, reject) => {
            this.queue.push({
                fn,
                resolve,
                reject,
                timestamp: Date.now(),
                endpoint
            });
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            const request = this.queue[0];
            // Check if we can execute this request
            if (!this.canExecuteRequest(request.endpoint)) {
                // Need to wait - calculate how long
                const waitTime = this.calculateWaitTime(request.endpoint);
                if (waitTime > 0) {
                    console.log(`⏳ [RateLimiter] Queue size: ${this.queue.length}, waiting ${waitTime}ms (limits enforced)`);
                    await this.delay(waitTime);
                    continue; // Re-check after waiting
                }
            }
            // Remove from queue and execute
            this.queue.shift();
            // Enforce minimum delay between requests
            const timeSinceLastRequest = Date.now() - this.lastRequestTime;
            if (timeSinceLastRequest < this.MIN_DELAY_MS) {
                await this.delay(this.MIN_DELAY_MS - timeSinceLastRequest);
            }
            // Track this request
            const now = Date.now();
            this.requestTimestamps.push(now);
            this.connectionTimestamps.push(now);
            this.lastRequestTime = now;
            if (request.endpoint) {
                if (!this.endpointTimestamps.has(request.endpoint)) {
                    this.endpointTimestamps.set(request.endpoint, []);
                }
                this.endpointTimestamps.get(request.endpoint).push(now);
            }
            // Execute with concurrent connection tracking
            this.activeConnections++;
            try {
                const result = await request.fn();
                request.resolve(result);
            }
            catch (error) {
                request.reject(error);
            }
            finally {
                this.activeConnections--;
            }
        }
        this.processing = false;
    }
    canExecuteRequest(endpoint) {
        const now = Date.now();
        const windowStart = now - this.WINDOW_MS;
        // Clean up old timestamps
        this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
        this.connectionTimestamps = this.connectionTimestamps.filter(t => t > windowStart);
        // Check total requests limit
        if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_10S) {
            return false;
        }
        // Check concurrent connections
        if (this.activeConnections >= this.MAX_CONCURRENT_CONNECTIONS) {
            return false;
        }
        // Check connection rate
        if (this.connectionTimestamps.length >= this.MAX_CONNECTION_RATE_10S) {
            return false;
        }
        // Check per-endpoint limit
        if (endpoint) {
            const endpointRequests = this.endpointTimestamps.get(endpoint) || [];
            const recentEndpointRequests = endpointRequests.filter(t => t > windowStart);
            if (recentEndpointRequests.length >= this.MAX_REQUESTS_PER_ENDPOINT_10S) {
                return false;
            }
        }
        return true;
    }
    calculateWaitTime(endpoint) {
        const now = Date.now();
        const windowStart = now - this.WINDOW_MS;
        let waitTimes = [];
        // Wait time for total requests
        if (this.requestTimestamps.length >= this.MAX_REQUESTS_PER_10S) {
            const oldestRequest = this.requestTimestamps[0];
            waitTimes.push(oldestRequest + this.WINDOW_MS - now);
        }
        // Wait time for connection rate
        if (this.connectionTimestamps.length >= this.MAX_CONNECTION_RATE_10S) {
            const oldestConnection = this.connectionTimestamps[0];
            waitTimes.push(oldestConnection + this.WINDOW_MS - now);
        }
        // Wait time for endpoint
        if (endpoint) {
            const endpointRequests = this.endpointTimestamps.get(endpoint) || [];
            const recentEndpointRequests = endpointRequests.filter(t => t > windowStart);
            if (recentEndpointRequests.length >= this.MAX_REQUESTS_PER_ENDPOINT_10S) {
                const oldestEndpointRequest = recentEndpointRequests[0];
                waitTimes.push(oldestEndpointRequest + this.WINDOW_MS - now);
            }
        }
        // Return the maximum wait time
        return waitTimes.length > 0 ? Math.max(...waitTimes, 0) : 0;
    }
    cleanupOldTimestamps() {
        const now = Date.now();
        const windowStart = now - this.WINDOW_MS;
        this.requestTimestamps = this.requestTimestamps.filter(t => t > windowStart);
        this.connectionTimestamps = this.connectionTimestamps.filter(t => t > windowStart);
        // Cleanup endpoint timestamps
        for (const [endpoint, timestamps] of this.endpointTimestamps) {
            const recentTimestamps = timestamps.filter(t => t > windowStart);
            if (recentTimestamps.length > 0) {
                this.endpointTimestamps.set(endpoint, recentTimestamps);
            }
            else {
                this.endpointTimestamps.delete(endpoint);
            }
        }
    }
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get current statistics
     */
    getStats() {
        const now = Date.now();
        const windowStart = now - this.WINDOW_MS;
        return {
            enabled: this.enabled,
            queueSize: this.queue.length,
            activeConnections: this.activeConnections,
            requestsLast10s: this.requestTimestamps.filter(t => t > windowStart).length,
            connectionsLast10s: this.connectionTimestamps.filter(t => t > windowStart).length,
            limits: {
                maxRequestsPer10s: this.MAX_REQUESTS_PER_10S,
                maxRequestsPerEndpoint: this.MAX_REQUESTS_PER_ENDPOINT_10S,
                maxConcurrentConnections: this.MAX_CONCURRENT_CONNECTIONS,
                maxConnectionRate: this.MAX_CONNECTION_RATE_10S
            }
        };
    }
    getQueueSize() {
        return this.queue.length;
    }
    /**
     * Update rate limiter configuration
     */
    updateConfig(config) {
        if (config.maxRequestsPer10s !== undefined) {
            this.MAX_REQUESTS_PER_10S = config.maxRequestsPer10s;
            this.MAX_CONNECTION_RATE_10S = config.maxRequestsPer10s; // Keep in sync
            console.log(`🚦 [RateLimiter] Max requests per 10s updated to ${config.maxRequestsPer10s}`);
        }
        if (config.maxConcurrentConnections !== undefined) {
            this.MAX_CONCURRENT_CONNECTIONS = config.maxConcurrentConnections;
            this.MAX_REQUESTS_PER_ENDPOINT_10S = config.maxConcurrentConnections; // Keep in sync
            console.log(`🚦 [RateLimiter] Max concurrent connections updated to ${config.maxConcurrentConnections}`);
        }
        if (config.minDelayMs !== undefined) {
            this.MIN_DELAY_MS = config.minDelayMs;
            console.log(`🚦 [RateLimiter] Min delay updated to ${config.minDelayMs}ms`);
        }
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            maxRequestsPer10s: this.MAX_REQUESTS_PER_10S,
            maxConcurrentConnections: this.MAX_CONCURRENT_CONNECTIONS,
            minDelayMs: this.MIN_DELAY_MS
        };
    }
}
// Global rate limiter instance
export const globalRateLimiter = new RateLimiter();
