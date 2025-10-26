import * as fs from 'fs';
import * as path from 'path';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';
export class ProxyManager {
    constructor(proxyFilePath) {
        this.proxyList = [];
        this.currentProxyIndex = 0;
        this.usageCount = 0;
        this.proxyUsage = new Map(); // Track per-proxy usage
        this.requestsOnCurrentProxy = 0; // Track requests on current proxy
        // Rate limit config (conservative estimate for residential proxies)
        this.RATE_LIMIT_PER_PROXY = 100; // requests per minute per proxy
        this.RATE_LIMIT_THRESHOLD = 0.8; // 80% of limit
        this.RATE_LIMIT_WINDOW = 60000; // 1 minute in ms
        this.ROTATE_AFTER_REQUESTS = 10; // Rotate every 10 requests for better distribution
        this.proxyList = this.loadProxyList(proxyFilePath);
        if (this.proxyList.length > 0) {
            console.log(`🔐 Proxy Manager initialized: ${this.proxyList.length} proxies loaded`);
            console.log(`🌍 First proxy: ${this.maskProxyCredentials(this.proxyList[0])}`);
            console.log(`⚡ Smart rate limiting: ${this.RATE_LIMIT_PER_PROXY} req/min per proxy, rotating at ${this.RATE_LIMIT_THRESHOLD * 100}%`);
        }
        else {
            console.warn(`⚠️ No proxies loaded! Using direct connections.`);
        }
    }
    /**
     * Load proxy list from file
     */
    loadProxyList(proxyFilePath) {
        const filePath = proxyFilePath || path.join(process.cwd(), 'proxies.txt');
        try {
            if (fs.existsSync(filePath)) {
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const proxies = fileContent
                    .split('\n')
                    .map(line => line.trim())
                    .filter(line => line && !line.startsWith('#')); // Filter empty lines and comments
                console.log(`📄 Loaded ${proxies.length} proxies from: ${filePath}`);
                return proxies;
            }
        }
        catch (error) {
            console.warn(`⚠️ Failed to load proxies from file: ${error.message}`);
        }
        return [];
    }
    /**
     * Get next proxy with smart rate limiting
     * Automatically rotates when current proxy approaches rate limit OR after N requests
     * Returns both proxy string and its index for proper logging
     */
    getNextProxy() {
        if (this.proxyList.length === 0) {
            throw new Error('No proxies available');
        }
        // Check if current proxy is approaching rate limit
        const currentUsage = this.getProxyUsage(this.currentProxyIndex);
        const maxRequests = this.RATE_LIMIT_PER_PROXY * this.RATE_LIMIT_THRESHOLD;
        // Rotate if: 1) at 80% capacity OR 2) after N requests (for better distribution)
        if (currentUsage >= maxRequests || this.requestsOnCurrentProxy >= this.ROTATE_AFTER_REQUESTS) {
            // Rotate to next proxy
            this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
            this.requestsOnCurrentProxy = 0; // Reset counter for new proxy
        }
        const proxyIndex = this.currentProxyIndex;
        const proxy = this.proxyList[proxyIndex];
        // Track usage for this proxy
        this.recordProxyUsage(proxyIndex);
        this.requestsOnCurrentProxy++;
        this.usageCount++;
        return { proxy, index: proxyIndex };
    }
    /**
     * Get current usage count for a proxy within the rate limit window
     */
    getProxyUsage(proxyIndex) {
        const usage = this.proxyUsage.get(proxyIndex);
        if (!usage)
            return 0;
        const now = Date.now();
        const windowAge = now - usage.windowStart;
        // Reset if window expired
        if (windowAge >= this.RATE_LIMIT_WINDOW) {
            this.proxyUsage.delete(proxyIndex);
            return 0;
        }
        return usage.count;
    }
    /**
     * Record a request for a proxy
     */
    recordProxyUsage(proxyIndex) {
        const now = Date.now();
        const usage = this.proxyUsage.get(proxyIndex);
        if (!usage || (now - usage.windowStart) >= this.RATE_LIMIT_WINDOW) {
            // Start new window
            this.proxyUsage.set(proxyIndex, {
                count: 1,
                windowStart: now
            });
        }
        else {
            // Increment in current window
            usage.count++;
        }
    }
    /**
     * Parse iproyal format: HOST:PORT@USER:PASS to http://user:pass@host:port
     */
    parseIproyalProxy(proxy) {
        try {
            // iproyal format: HOST:PORT@USER:PASS
            const [hostPort, userPass] = proxy.split('@');
            if (!hostPort || !userPass) {
                throw new Error('Invalid proxy format');
            }
            return `http://${userPass}@${hostPort}`;
        }
        catch (error) {
            console.warn(`⚠️ Failed to parse proxy: ${proxy} - ${error.message}`);
            return null;
        }
    }
    /**
     * Create proxy agent for HTTP requests from an existing proxy string
     */
    createProxyAgent(rawProxy, proxyIndex, url) {
        const proxyUrl = this.parseIproyalProxy(rawProxy);
        if (!proxyUrl) {
            throw new Error(`Failed to parse proxy: ${rawProxy}`);
        }
        try {
            const isHttps = url.startsWith('https');
            const agent = isHttps ? new HttpsProxyAgent(proxyUrl) : new HttpProxyAgent(proxyUrl);
            console.log(`🔄 Using proxy #${proxyIndex}/${this.proxyList.length}: ${this.maskProxyCredentials(rawProxy)}`);
            return agent;
        }
        catch (error) {
            console.warn(`⚠️ Failed to create proxy agent: ${error.message}`);
            throw error;
        }
    }
    /**
     * Get proxy URL for fetch/axios
     */
    getProxyUrl() {
        const { proxy: rawProxy, index: proxyIndex } = this.getNextProxy();
        const proxyUrl = this.parseIproyalProxy(rawProxy);
        if (!proxyUrl) {
            throw new Error(`Failed to parse proxy: ${rawProxy}`);
        }
        console.log(`🔄 Using proxy #${proxyIndex}/${this.proxyList.length}: ${this.maskProxyCredentials(rawProxy)}`);
        return proxyUrl;
    }
    /**
     * Mask proxy credentials for secure logging
     */
    maskProxyCredentials(proxy) {
        if (!proxy)
            return 'none';
        try {
            // For iproyal format: HOST:PORT@USER:PASS
            const [hostPort, userPass] = proxy.split('@');
            if (!hostPort || !userPass)
                return proxy;
            const [user] = userPass.split(':');
            const maskedUser = user ? user.substring(0, 3) + '***' : '***';
            const maskedPass = '***';
            return `${hostPort}@${maskedUser}:${maskedPass}`;
        }
        catch (error) {
            return proxy.substring(0, 10) + '***';
        }
    }
    /**
     * Get current proxy stats
     */
    getStats() {
        return {
            totalProxies: this.proxyList.length,
            currentIndex: this.currentProxyIndex,
            usageCount: this.usageCount,
            hasProxies: this.proxyList.length > 0
        };
    }
    /**
     * Check if proxies are available
     */
    hasProxies() {
        return this.proxyList.length > 0;
    }
}
