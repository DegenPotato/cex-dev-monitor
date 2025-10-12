/**
 * Global Concurrency Limiter
 * Limits total concurrent requests across ALL services
 * Separate configs for Proxy Rotation vs RPC Rotation
 */

export class GlobalConcurrencyLimiter {
  private proxyMaxConcurrent: number = 20; // Proxy rotation can handle more
  private rpcMaxConcurrent: number = 2;    // RPC rotation needs to be conservative
  private currentRequests: number = 0;
  private queue: Array<() => void> = [];
  private enabled: boolean = true;
  private periodicLogger: NodeJS.Timeout | null = null;
  private useProxyConfig: boolean = false; // Which config to use

  constructor(proxyMaxConcurrent: number = 20, rpcMaxConcurrent: number = 2) {
    this.proxyMaxConcurrent = proxyMaxConcurrent;
    this.rpcMaxConcurrent = rpcMaxConcurrent;
    this.startPeriodicLogging();
  }
  
  /**
   * Get currently active max concurrent (based on rotation mode)
   */
  private getCurrentMaxConcurrent(): number {
    return this.useProxyConfig ? this.proxyMaxConcurrent : this.rpcMaxConcurrent;
  }

  /**
   * Start periodic logging of current state (every 3 seconds)
   */
  private startPeriodicLogging(): void {
    if (this.periodicLogger) return;
    
    this.periodicLogger = setInterval(() => {
      if (this.currentRequests > 0 || this.queue.length > 0) {
        const maxConcurrent = this.getCurrentMaxConcurrent();
        const mode = this.useProxyConfig ? 'PROXY' : 'RPC';
        const utilization = ((this.currentRequests / maxConcurrent) * 100).toFixed(1);
        console.log(`⚡ [GlobalLimiter-${mode}] ${this.currentRequests}/${maxConcurrent} concurrent (${utilization}%), ${this.queue.length} queued`);
      }
    }, 3000); // Log every 3 seconds if there's activity
  }

  /**
   * Switch to proxy rotation mode
   */
  useProxyRotation(): void {
    this.useProxyConfig = true;
    console.log(`🔧 [GlobalLimiter] Switched to PROXY mode (max: ${this.proxyMaxConcurrent})`);
  }

  /**
   * Switch to RPC rotation mode
   */
  useRPCRotation(): void {
    this.useProxyConfig = false;
    console.log(`🔧 [GlobalLimiter] Switched to RPC mode (max: ${this.rpcMaxConcurrent})`);
  }

  /**
   * Update proxy rotation max concurrent
   */
  setProxyMaxConcurrent(max: number): void {
    this.proxyMaxConcurrent = Math.max(1, Math.min(max, 2000));
    console.log(`🔧 [GlobalLimiter] Proxy max concurrent updated to ${this.proxyMaxConcurrent}`);
  }

  /**
   * Update RPC rotation max concurrent
   */
  setRPCMaxConcurrent(max: number): void {
    this.rpcMaxConcurrent = Math.max(1, Math.min(max, 100));
    console.log(`🔧 [GlobalLimiter] RPC max concurrent updated to ${this.rpcMaxConcurrent}`);
  }

  /**
   * Get current config
   */
  getConfig() {
    return {
      enabled: this.enabled,
      mode: this.useProxyConfig ? 'proxy' : 'rpc',
      proxyMaxConcurrent: this.proxyMaxConcurrent,
      rpcMaxConcurrent: this.rpcMaxConcurrent,
      activeMaxConcurrent: this.getCurrentMaxConcurrent(),
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
    const maxConcurrent = this.getCurrentMaxConcurrent();
    if (this.currentRequests >= maxConcurrent) {
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
    const maxConcurrent = this.getCurrentMaxConcurrent();
    return {
      enabled: this.enabled,
      mode: this.useProxyConfig ? 'proxy' : 'rpc',
      proxyMaxConcurrent: this.proxyMaxConcurrent,
      rpcMaxConcurrent: this.rpcMaxConcurrent,
      activeMaxConcurrent: maxConcurrent,
      currentRequests: this.currentRequests,
      queuedRequests: this.queue.length,
      utilizationPercent: ((this.currentRequests / maxConcurrent) * 100).toFixed(1)
    };
  }
}

// Global instance
export const globalConcurrencyLimiter = new GlobalConcurrencyLimiter(20);
