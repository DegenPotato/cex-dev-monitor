import { apiProviderTracker } from './ApiProviderTracker.js';
/**
 * Global Rate Limiter for GeckoTerminal API
 *
 * Prevents rate limit violations by coordinating ALL GeckoTerminal requests
 * across the entire application (OHLCV Collector, Market Data Tracker, etc.)
 *
 * Features:
 * - Single queue for all GeckoTerminal calls
 * - Configurable requests per minute
 * - Automatic queuing when limit reached
 * - Prevents bursts that trigger 429 errors
 */
export class GeckoTerminalRateLimiter {
    constructor(maxRequestsPerMinute = 10) {
        this.requestQueue = [];
        this.requestTimestamps = [];
        this.isProcessing = false;
        this.backoffMs = 2000; // Dynamic backoff, starts at 2 seconds
        this.MIN_REQUEST_INTERVAL = 2000; // Base interval: 2 seconds
        this.MAX_REQUEST_INTERVAL = 60000; // Max backoff: 60 seconds
        this.MAX_RETRIES = 3;
        this.consecutiveErrors = 0;
        this.windowMs = 60 * 1000; // 1 minute window
        this.maxRequestsPerMinute = maxRequestsPerMinute;
        console.log(`🚦 [GeckoTerminal] Rate limiter initialized: ${maxRequestsPerMinute} req/min`);
    }
    /**
     * Execute a GeckoTerminal API call with rate limiting
     * Automatically queues if limit reached
     */
    async executeRequest(requestFn, endpoint = 'unknown') {
        return new Promise((resolve, reject) => {
            this.requestQueue.push(async () => {
                const startTime = Date.now();
                let retries = 0;
                while (retries <= this.MAX_RETRIES) {
                    try {
                        const result = await requestFn();
                        const responseTime = Date.now() - startTime;
                        // Track successful call
                        apiProviderTracker.trackCall('GeckoTerminal', endpoint, true, responseTime);
                        // Reset backoff on success
                        this.consecutiveErrors = 0;
                        this.backoffMs = this.MIN_REQUEST_INTERVAL;
                        resolve(result);
                        return;
                    }
                    catch (error) {
                        const responseTime = Date.now() - startTime;
                        const statusCode = error?.response?.status || error?.status;
                        if (statusCode === 429 || error?.message === 'RATE_LIMITED') {
                            // Rate limit hit - increase backoff
                            this.consecutiveErrors++;
                            this.backoffMs = Math.min(this.backoffMs * 2, this.MAX_REQUEST_INTERVAL);
                            if (retries < this.MAX_RETRIES) {
                                console.log(`⚠️ [GeckoTerminal] Rate limited, retry ${retries + 1}/${this.MAX_RETRIES} after ${this.backoffMs}ms`);
                                await this.delay(this.backoffMs);
                                retries++;
                                continue;
                            }
                        }
                        // Track failed call
                        apiProviderTracker.trackCall('GeckoTerminal', endpoint, false, responseTime, statusCode, error?.message);
                        reject(error);
                        return;
                    }
                }
            });
            this.processQueue();
        });
    }
    /**
     * Process the request queue with rate limiting
     */
    async processQueue() {
        if (this.isProcessing) {
            return; // Already processing
        }
        this.isProcessing = true;
        while (this.requestQueue.length > 0) {
            // Clean up old timestamps outside the window
            const now = Date.now();
            this.requestTimestamps = this.requestTimestamps.filter((timestamp) => now - timestamp < this.windowMs);
            // Check if we can make another request
            if (this.requestTimestamps.length >= this.maxRequestsPerMinute) {
                // Wait until the oldest request expires
                const oldestTimestamp = this.requestTimestamps[0];
                const waitTime = this.windowMs - (now - oldestTimestamp);
                if (waitTime > 0) {
                    console.log(`⏳ [GeckoTerminal] Rate limit reached, waiting ${Math.ceil(waitTime / 1000)}s (${this.requestQueue.length} queued)`);
                    await this.delay(waitTime);
                    continue; // Re-check after waiting
                }
            }
            // Execute next request
            const request = this.requestQueue.shift();
            if (request) {
                this.requestTimestamps.push(Date.now());
                await request();
                // Add adaptive delay based on backoff
                const baseDelay = Math.ceil(this.windowMs / this.maxRequestsPerMinute);
                const adaptiveDelay = Math.max(baseDelay, this.backoffMs);
                await this.delay(adaptiveDelay);
            }
        }
        this.isProcessing = false;
    }
    /**
     * Get current status
     */
    getStatus() {
        const now = Date.now();
        const recentRequests = this.requestTimestamps.filter((timestamp) => now - timestamp < this.windowMs);
        return {
            queueLength: this.requestQueue.length,
            requestsInLastMinute: recentRequests.length,
            maxRequestsPerMinute: this.maxRequestsPerMinute,
            utilizationPercent: (recentRequests.length / this.maxRequestsPerMinute) * 100,
            currentBackoff: this.backoffMs,
            consecutiveErrors: this.consecutiveErrors
        };
    }
    /**
     * Delay utility
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// Global singleton instance
// VERY conservative: 10 req/min to avoid 429 errors completely
export const globalGeckoTerminalLimiter = new GeckoTerminalRateLimiter(10);
