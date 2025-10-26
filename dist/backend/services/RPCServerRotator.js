/**
 * RPC Server Rotator
 * Rotates through individual RPC pool servers to bypass rate limits
 * Uses Host header trick to access servers directly while maintaining compatibility
 */
export class RPCServerRotator {
    constructor() {
        this.servers = [
            'https://tyo73.nodes.rpcpool.com',
            'https://tyo79.nodes.rpcpool.com',
            'https://tyo142.nodes.rpcpool.com',
            'https://tyo173.nodes.rpcpool.com',
            'https://tyo208.nodes.rpcpool.com',
            'https://sg110.nodes.rpcpool.com',
            'https://nyc71.nodes.rpcpool.com',
            'https://pit36.nodes.rpcpool.com',
            'https://pit37.nodes.rpcpool.com',
            'https://ash2.nodes.rpcpool.com',
            'https://ash24.nodes.rpcpool.com',
            'https://dal17.nodes.rpcpool.com',
            'https://fra113.nodes.rpcpool.com',
            'https://fra130.nodes.rpcpool.com',
            'https://fra155.nodes.rpcpool.com',
            'https://fra59.nodes.rpcpool.com',
            'https://fra60.nodes.rpcpool.com',
            'https://ams346.nodes.rpcpool.com',
            'https://fra119.nodes.rpcpool.com',
            'https://fra120.nodes.rpcpool.com'
        ];
        this.currentIndex = 0;
        this.enabled = false;
        this.hostHeader = 'api.mainnet-beta.solana.com';
        // Stats tracking
        this.serverStats = new Map();
        // Per-server rate limiting (safety ceiling: never exceed 90 req/10s per server)
        this.MAX_REQUESTS_PER_10S = 90;
        this.serverRequestTimestamps = new Map();
        // Initialize stats for all servers
        this.servers.forEach(server => {
            this.serverStats.set(server, { requests: 0, failures: 0 });
        });
    }
    /**
     * Enable server rotation
     */
    enable() {
        this.enabled = true;
        console.log(`🔄 [RPCServerRotator] ENABLED - Rotating through ${this.servers.length} servers`);
    }
    /**
     * Disable server rotation
     */
    disable() {
        this.enabled = false;
        console.log('🔄 [RPCServerRotator] DISABLED');
    }
    /**
     * Check if rotation is enabled
     */
    isEnabled() {
        return this.enabled;
    }
    /**
     * Clean old timestamps for a server (older than 10 seconds)
     */
    cleanOldTimestamps(server) {
        const timestamps = this.serverRequestTimestamps.get(server) || [];
        const now = Date.now();
        const tenSecondsAgo = now - 10000;
        const recent = timestamps.filter(ts => ts > tenSecondsAgo);
        this.serverRequestTimestamps.set(server, recent);
    }
    /**
     * Check if server is at rate limit (safety ceiling)
     */
    async waitIfServerAtLimit(server) {
        this.cleanOldTimestamps(server);
        const timestamps = this.serverRequestTimestamps.get(server) || [];
        const serverName = server.replace('https://', '').split('.')[0];
        // Debug: Log current load every 20 requests
        if (timestamps.length > 0 && timestamps.length % 20 === 0) {
            console.log(`📊 [RPC-Safety] ${serverName} current load: ${timestamps.length}/${this.MAX_REQUESTS_PER_10S} in last 10s`);
        }
        if (timestamps.length >= this.MAX_REQUESTS_PER_10S) {
            // Hit safety ceiling - wait for oldest request to expire
            const oldestTimestamp = timestamps[0];
            const waitTime = Math.max(0, 10000 - (Date.now() - oldestTimestamp)) + 100;
            if (waitTime > 0) {
                console.log(`⚠️  [RPC-Rotation] ${serverName} at safety limit (${timestamps.length}/${this.MAX_REQUESTS_PER_10S}), waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                this.cleanOldTimestamps(server);
            }
        }
    }
    /**
     * Track request for server
     */
    trackRequest(server) {
        const timestamps = this.serverRequestTimestamps.get(server) || [];
        timestamps.push(Date.now());
        this.serverRequestTimestamps.set(server, timestamps);
    }
    /**
     * Get next server in rotation (with safety ceiling)
     */
    async getNextServer() {
        if (!this.enabled) {
            return 'https://api.mainnet-beta.solana.com';
        }
        const server = this.servers[this.currentIndex];
        this.currentIndex = (this.currentIndex + 1) % this.servers.length;
        // Safety ceiling: wait if server at 90 req/10s limit
        await this.waitIfServerAtLimit(server);
        // Track this request
        this.trackRequest(server);
        // Update stats
        const stats = this.serverStats.get(server);
        if (stats) {
            stats.requests++;
            // Log every 10th rotation
            if (stats.requests % 10 === 0) {
                const serverName = server.replace('https://', '').split('.')[0];
                console.log(`🔄 [RPC-Rotation] Using ${serverName} (${stats.requests} requests)`);
            }
        }
        return server;
    }
    /**
     * Get Host header for requests
     */
    getHostHeader() {
        return this.enabled ? this.hostHeader : '';
    }
    /**
     * Mark a server as failed (for future smart rotation)
     */
    markFailure(server) {
        const stats = this.serverStats.get(server);
        if (stats) {
            stats.failures++;
        }
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            enabled: this.enabled,
            totalServers: this.servers.length,
            currentServer: this.servers[this.currentIndex],
            serverStats: Array.from(this.serverStats.entries()).map(([server, stats]) => ({
                server: server.replace('https://', ''),
                requests: stats.requests,
                failures: stats.failures,
                successRate: stats.requests > 0 ? ((stats.requests - stats.failures) / stats.requests * 100).toFixed(1) : '100'
            }))
        };
    }
    /**
     * Reset statistics
     */
    resetStats() {
        this.serverStats.forEach(stats => {
            stats.requests = 0;
            stats.failures = 0;
        });
        console.log('📊 [RPCServerRotator] Stats reset');
    }
    /**
     * Get all servers
     */
    getServers() {
        return [...this.servers];
    }
    /**
     * Add custom server
     */
    addServer(server) {
        if (!this.servers.includes(server)) {
            this.servers.push(server);
            this.serverStats.set(server, { requests: 0, failures: 0 });
            console.log(`✅ [RPCServerRotator] Added server: ${server}`);
        }
    }
    /**
     * Remove server
     */
    removeServer(server) {
        const index = this.servers.indexOf(server);
        if (index > -1) {
            this.servers.splice(index, 1);
            this.serverStats.delete(server);
            console.log(`❌ [RPCServerRotator] Removed server: ${server}`);
        }
    }
}
// Global instance
export const globalRPCServerRotator = new RPCServerRotator();
