import { Connection, ConnectionConfig } from '@solana/web3.js';
import { ProxyManager } from './ProxyManager.js';
import { RequestStatsTracker } from './RequestStatsTracker.js';
import { globalRateLimiter } from './RateLimiter.js';
import { globalRPCServerRotator } from './RPCServerRotator.js';
import { globalConcurrencyLimiter } from './GlobalConcurrencyLimiter.js';
import fetch from 'cross-fetch';

/**
 * Proxied Solana Connection
 * Uses proxy rotation for RPC requests to avoid rate limits
 */
export class ProxiedSolanaConnection {
  private proxyManager: ProxyManager;
  private endpoint: string;
  private config: ConnectionConfig;
  private useProxies: boolean;
  private serviceName: string;
  private statsTracker: RequestStatsTracker;

  constructor(endpoint: string, config?: ConnectionConfig, proxyFilePath?: string, serviceName: string = 'unknown') {
    this.endpoint = endpoint;
    this.config = config || { commitment: 'confirmed' };
    this.proxyManager = new ProxyManager(proxyFilePath);
    this.serviceName = serviceName;
    this.statsTracker = RequestStatsTracker.getInstance();

    // Check if proxies are available
    this.useProxies = this.proxyManager.hasProxies();
    
    if (this.useProxies) {
      console.log(`✅ [${serviceName}] Initialized with ${this.proxyManager.getStats().totalProxies} proxies`);
    } else if (globalRPCServerRotator.isEnabled()) {
      console.log(`🔄 [${serviceName}] Initialized with RPC server rotation (20 servers)`);
    } else {
      console.log(`⚠️  [${serviceName}] Initialized with rate limiting (no proxies or rotation)`);
    }
  }

  /**
   * Create a standard Connection (no proxy)
   * Use this for critical operations like WebSocket subscriptions
   */
  getDirectConnection(): Connection {
    return new Connection(this.endpoint, this.config);
  }

  /**
   * Create a proxied connection with current proxy or rotated server
   */
  async getProxiedConnection(): Promise<Connection> {
    // Priority: Server Rotation > Proxies > Direct
    
    // 1. Try RPC server rotation first (no proxies needed)
    if (globalRPCServerRotator.isEnabled()) {
      const serverUrl = await globalRPCServerRotator.getNextServer(); // Async for safety ceiling
      const hostHeader = globalRPCServerRotator.getHostHeader();
      
      // Custom fetch with Host header trick
      const customFetch = (url: string, options?: any) => {
        return fetch(url, {
          ...options,
          headers: {
            ...options?.headers,
            'Host': hostHeader,
            'Content-Type': 'application/json'
          }
        });
      };
      
      return new Connection(
        serverUrl,
        {
          ...this.config,
          fetch: customFetch as any
        }
      );
    }
    
    // 2. Try proxy if available
    if (this.useProxies) {
      const proxyInfo = this.proxyManager.getNextProxy();
      if (!proxyInfo) {
        console.log('⚠️  No proxy available, falling back to direct connection');
        return this.getDirectConnection();
      }
      
      const proxyAgent = this.proxyManager.createProxyAgent(proxyInfo.proxy);
      
      const customFetch = (url: string, options?: any) => {
        return fetch(url, {
          ...options,
          agent: proxyAgent
        });
      };
      
      return new Connection(
        this.endpoint,
        {
          ...this.config,
          fetch: customFetch as any
        }
      );
    }
    
    // 3. Fallback to direct connection
    return this.getDirectConnection();
  }

  /**
   * Execute a function with a proxied connection
   * Automatically rotates to next proxy for each call
   * Includes rate limiting only when needed (no proxies AND no server rotation)
   */
  async withProxy<T>(fn: (connection: Connection) => Promise<T>, maxRetries: number = 3): Promise<T> {
    // Determine active mode: RPC Rotation > Proxies > Rate Limiting
    const usingRPCRotation = globalRPCServerRotator.isEnabled();
    const usingProxies = !usingRPCRotation && this.useProxies;
    const shouldRateLimit = !usingRPCRotation && !this.useProxies;
    
    const executeRequest = async () => {
      let lastError: any;
      let retryCount = 0;
      const startTime = Date.now();
      
      for (let attempt = 0; attempt < maxRetries; attempt++) {
        try {
          const connection = await this.getProxiedConnection();
          const result = await fn(connection);
          
          // Track successful request
          const responseTime = Date.now() - startTime;
          this.statsTracker.trackRequest(this.serviceName, true, responseTime, usingProxies);
          
          // Track eventual outcome
          this.statsTracker.trackEventualOutcome(this.serviceName, true, retryCount);
          
          return result;
        } catch (error: any) {
          lastError = error;
          retryCount++;
          
          // Check if it's a rate limit error
          const isRateLimit = error?.message?.includes('429') || 
                             error?.message?.includes('Too Many Requests') ||
                             error?.message?.includes('rate limit');
          
          // Track the retry
          this.statsTracker.trackRetry(this.serviceName, isRateLimit);
          
          // Log retry with correct mode
          if (attempt < maxRetries - 1) {
            const rateLimitMsg = isRateLimit ? ' [RATE LIMIT]' : '';
            const modeMsg = usingRPCRotation ? 'RPC server' : usingProxies ? 'proxy' : 'connection';
            console.log(`⚠️  ${modeMsg} error${rateLimitMsg} (attempt ${attempt + 1}/${maxRetries}), retrying with different ${modeMsg}...`);
          }
        }
      }
      
      // Track failed request
      const responseTime = Date.now() - startTime;
      this.statsTracker.trackRequest(this.serviceName, false, responseTime, usingProxies);
      
      // Track eventual failure
      this.statsTracker.trackEventualOutcome(this.serviceName, false, retryCount);
      
      // All retries failed
      const modeMsg = usingRPCRotation ? 'RPC rotation' : usingProxies ? 'proxy' : 'connection';
      throw new Error(`All ${maxRetries} ${modeMsg} attempts failed. Last error: ${lastError?.message}`);
    };
    
    // Execute with global concurrency limit AND optional rate limiting
    return await globalConcurrencyLimiter.execute(async () => {
      if (shouldRateLimit) {
        return await globalRateLimiter.execute(executeRequest, this.endpoint);
      } else {
        return await executeRequest();
      }
    });
  }

  /**
   * Get proxy stats
   */
  getProxyStats() {
    return this.proxyManager.getStats();
  }

  /**
   * Check if proxies are enabled
   */
  isProxyEnabled(): boolean {
    return this.useProxies;
  }

  /**
   * Enable proxy usage
   */
  enableProxies(): void {
    if (!this.proxyManager.hasProxies()) {
      console.log('⚠️  Cannot enable proxies - no proxies available');
      return;
    }
    
    this.useProxies = true;
    globalRateLimiter.disable(); // Disable rate limiting with proxies
    globalRPCServerRotator.disable(); // Disable server rotation with proxies
    console.log('✅ Proxies ENABLED - rate limiting and server rotation disabled');
  }

  /**
   * Disable proxy usage (enables server rotation as fallback)
   */
  disableProxies(): void {
    this.useProxies = false;
    
    // Enable server rotation as a high-performance alternative to proxies
    if (!globalRPCServerRotator.isEnabled()) {
      globalRPCServerRotator.enable();
      console.log('⏸️  Proxies DISABLED - server rotation ENABLED (20 servers)');
    }
    
    globalRateLimiter.disable();
  }

  /**
   * Toggle proxy usage
   */
  toggleProxies(): boolean {
    if (this.useProxies) {
      this.disableProxies();
    } else {
      this.enableProxies();
    }
    return this.useProxies;
  }
}
