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
  private requestQueue: Array<() => void> = [];
  private requestTimestamps: number[] = [];
  private readonly maxRequestsPerMinute: number;
  private readonly windowMs = 60 * 1000; // 1 minute window
  private isProcessing = false;
  
  constructor(maxRequestsPerMinute: number = 10) {
    this.maxRequestsPerMinute = maxRequestsPerMinute;
    console.log(`🚦 [GeckoTerminal] Rate limiter initialized: ${maxRequestsPerMinute} req/min`);
  }
  
  /**
   * Execute a GeckoTerminal API call with rate limiting
   * Automatically queues if limit reached
   */
  async executeRequest<T>(requestFn: () => Promise<T>, endpoint: string = 'unknown'): Promise<T> {
    return new Promise((resolve, reject) => {
      this.requestQueue.push(async () => {
        const startTime = Date.now();
        try {
          const result = await requestFn();
          const responseTime = Date.now() - startTime;
          
          // Track successful call
          apiProviderTracker.trackCall('GeckoTerminal', endpoint, true, responseTime);
          
          resolve(result);
        } catch (error: any) {
          const responseTime = Date.now() - startTime;
          const statusCode = error?.response?.status || error?.status;
          
          // Track failed call
          apiProviderTracker.trackCall(
            'GeckoTerminal', 
            endpoint, 
            false, 
            responseTime,
            statusCode,
            error?.message
          );
          
          reject(error);
        }
      });
      
      this.processQueue();
    });
  }
  
  /**
   * Process the request queue with rate limiting
   */
  private async processQueue() {
    if (this.isProcessing) {
      return; // Already processing
    }
    
    this.isProcessing = true;
    
    while (this.requestQueue.length > 0) {
      // Clean up old timestamps outside the window
      const now = Date.now();
      this.requestTimestamps = this.requestTimestamps.filter(
        timestamp => now - timestamp < this.windowMs
      );
      
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
        
        // Small delay between requests to prevent bursts
        const delayBetweenRequests = Math.ceil(this.windowMs / this.maxRequestsPerMinute);
        await this.delay(delayBetweenRequests);
      }
    }
    
    this.isProcessing = false;
  }
  
  /**
   * Get current status
   */
  getStatus() {
    const now = Date.now();
    const recentRequests = this.requestTimestamps.filter(
      timestamp => now - timestamp < this.windowMs
    );
    
    return {
      queueLength: this.requestQueue.length,
      requestsInLastMinute: recentRequests.length,
      maxRequestsPerMinute: this.maxRequestsPerMinute,
      utilizationPercent: (recentRequests.length / this.maxRequestsPerMinute) * 100
    };
  }
  
  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global singleton instance
export const globalGeckoTerminalLimiter = new GeckoTerminalRateLimiter(25); // 25 req/min (safe under 30 limit)
