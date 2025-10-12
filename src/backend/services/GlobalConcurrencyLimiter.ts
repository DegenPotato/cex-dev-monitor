/**
 * Global Concurrency Limiter
 * Limits total concurrent requests across ALL services
 * Prevents request bursts that overwhelm RPC servers even with rotation
 */

export class GlobalConcurrencyLimiter {
  private maxConcurrent: number = 20; // Default: 20 concurrent requests max
  private currentRequests: number = 0;
  private queue: Array<() => void> = [];
  private enabled: boolean = true;
  private periodicLogger: NodeJS.Timeout | null = null;

  constructor(maxConcurrent: number = 20) {
    this.maxConcurrent = maxConcurrent;
    this.startPeriodicLogging();
  }

  /**
   * Start periodic logging of current state (every 3 seconds)
   */
  private startPeriodicLogging(): void {
    if (this.periodicLogger) return;
    
    this.periodicLogger = setInterval(() => {
      if (this.currentRequests > 0 || this.queue.length > 0) {
        const utilization = ((this.currentRequests / this.maxConcurrent) * 100).toFixed(1);
        console.log(`⚡ [GlobalLimiter] ${this.currentRequests}/${this.maxConcurrent} concurrent (${utilization}%), ${this.queue.length} queued`);
      }
    }, 3000); // Log every 3 seconds if there's activity
  }

  /**
   * Update max concurrent requests
   */
  setMaxConcurrent(max: number): void {
    // Clamp between 1-2000 (with 10k proxies, we can go higher)
    // Higher values = faster but more RAM/CPU usage
    // Recommended: 200-500 for most use cases
    this.maxConcurrent = Math.max(1, Math.min(max, 2000));
    console.log(`🔧 [GlobalLimiter] Max concurrent updated to ${this.maxConcurrent}`);
  }

  /**
   * Get current config
   */
  getConfig() {
    return {
      enabled: this.enabled,
      maxConcurrent: this.maxConcurrent,
      currentRequests: this.currentRequests,
      queuedRequests: this.queue.length
    };
  }

  /**
   * Enable limiter
   */
  enable(): void {
    this.enabled = true;
    console.log('✅ [GlobalLimiter] ENABLED');
  }

  /**
   * Disable limiter
   */
  disable(): void {
    this.enabled = false;
    console.log('⏸️  [GlobalLimiter] DISABLED');
  }

  /**
   * Execute with concurrency limit
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // If disabled, execute immediately
    if (!this.enabled) {
      return await fn();
    }

    // Wait for slot if at capacity
    if (this.currentRequests >= this.maxConcurrent) {
      await new Promise<void>(resolve => {
        this.queue.push(resolve);
      });
    }

    // Acquire slot
    this.currentRequests++;

    try {
      const result = await fn();
      return result;
    } finally {
      // Release slot
      this.currentRequests--;

      // Process queue
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }

  /**
   * Get stats
   */
  getStats() {
    return {
      enabled: this.enabled,
      maxConcurrent: this.maxConcurrent,
      currentRequests: this.currentRequests,
      queuedRequests: this.queue.length,
      utilizationPercent: ((this.currentRequests / this.maxConcurrent) * 100).toFixed(1)
    };
  }
}

// Global instance
export const globalConcurrencyLimiter = new GlobalConcurrencyLimiter(20);
