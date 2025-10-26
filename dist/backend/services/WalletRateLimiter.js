/**
 * Per-Wallet Rate Limiter
 * Throttles requests per individual wallet monitor
 * Default: 1 request per second (1000ms delay)
 */
export class WalletRateLimiter {
    constructor(walletAddress, requestsPerSecond = 1, enabled = true) {
        this.lastRequestTime = 0;
        this.walletAddress = walletAddress;
        this.requestsPerSecond = Math.max(0.1, Math.min(requestsPerSecond, 100)); // Clamp between 0.1 and 100 RPS
        this.enabled = enabled;
    }
    /**
     * Get delay in milliseconds between requests
     */
    getDelayMs() {
        return Math.floor(1000 / this.requestsPerSecond);
    }
    /**
     * Update rate limit (requests per second)
     */
    setRateLimit(rps) {
        this.requestsPerSecond = Math.max(0.1, Math.min(rps, 100));
        console.log(`🎚️  [RateLimit-${this.walletAddress.slice(0, 8)}] Updated to ${this.requestsPerSecond} RPS (${this.getDelayMs()}ms delay)`);
    }
    /**
     * Enable rate limiting
     */
    enable() {
        this.enabled = true;
        console.log(`✅ [RateLimit-${this.walletAddress.slice(0, 8)}] ENABLED at ${this.requestsPerSecond} RPS`);
    }
    /**
     * Disable rate limiting
     */
    disable() {
        this.enabled = false;
        console.log(`⏸️  [RateLimit-${this.walletAddress.slice(0, 8)}] DISABLED`);
    }
    /**
     * Check if rate limiting is enabled
     */
    isEnabled() {
        return this.enabled;
    }
    /**
     * Execute function with rate limiting
     * Throttles based on configured requests per second
     */
    async execute(fn) {
        if (!this.enabled) {
            return await fn();
        }
        const now = Date.now();
        const delayMs = this.getDelayMs();
        const timeSinceLastRequest = now - this.lastRequestTime;
        // If not enough time has passed, wait
        if (timeSinceLastRequest < delayMs && this.lastRequestTime > 0) {
            const waitTime = delayMs - timeSinceLastRequest;
            await this.sleep(waitTime);
        }
        // Update last request time
        this.lastRequestTime = Date.now();
        // Execute function
        return await fn();
    }
    /**
     * Helper: Sleep for specified milliseconds
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Get current configuration
     */
    getConfig() {
        return {
            walletAddress: this.walletAddress,
            enabled: this.enabled,
            requestsPerSecond: this.requestsPerSecond,
            delayMs: this.getDelayMs(),
            lastRequestTime: this.lastRequestTime
        };
    }
    /**
     * Get stats
     */
    getStats() {
        const now = Date.now();
        const timeSinceLastRequest = this.lastRequestTime > 0 ? now - this.lastRequestTime : 0;
        return {
            wallet: this.walletAddress.slice(0, 8),
            enabled: this.enabled,
            rps: this.requestsPerSecond,
            delayMs: this.getDelayMs(),
            timeSinceLastRequestMs: timeSinceLastRequest,
            canRequestNow: timeSinceLastRequest >= this.getDelayMs()
        };
    }
}
