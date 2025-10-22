/**
 * Telegram API Rate Limiter & Traffic Tracker
 * Handles flood prevention and comprehensive metrics
 */

import EventEmitter from 'events';

interface TelegramAPICall {
  method: string;
  timestamp: number;
  userId: number;
  duration?: number;
  success: boolean;
  error?: string;
  floodWaitSeconds?: number;
}

interface RateLimitConfig {
  // API method-specific limits (per second)
  methodLimits: Map<string, number>;
  // Global limits
  globalCallsPerSecond: number;
  globalCallsPerMinute: number;
  // Adaptive delays based on flood feedback
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

export class TelegramRateLimiter extends EventEmitter {
  private static instance: TelegramRateLimiter;
  
  // Traffic tracking
  private apiCalls: TelegramAPICall[] = [];
  private floodWaitHistory = new Map<string, number[]>();
  
  // Rate limiting
  private lastCallTime = 0;
  private currentDelayMs = 300; // Start with 300ms between calls
  private consecutiveFloodErrors = 0;
  
  // Configuration
  private config: RateLimitConfig = {
    methodLimits: new Map([
      ['GetFullChannel', 1], // 1 per second max
      ['GetParticipants', 0.5], // 1 every 2 seconds
      ['GetFullUser', 0.5], // 1 every 2 seconds
      ['ExportChatInvite', 0.2], // 1 every 5 seconds
      ['GetParticipant', 1], // 1 per second
      ['GetFullChat', 1], // 1 per second
      ['GetDialogs', 0.1], // 1 every 10 seconds
    ]),
    globalCallsPerSecond: 3,
    globalCallsPerMinute: 100,
    baseDelayMs: 300,
    maxDelayMs: 5000,
    backoffMultiplier: 1.5
  };
  
  // Metrics tracking
  private metrics = {
    totalCalls: 0,
    successfulCalls: 0,
    failedCalls: 0,
    floodErrors: 0,
    averageDelay: 0,
    methodMetrics: new Map<string, {
      calls: number;
      success: number;
      failed: number;
      avgDuration: number;
      lastFloodWait?: number;
    }>()
  };
  
  private constructor() {
    super();
    this.startMetricsReporting();
    console.log('🚦 [TelegramRateLimiter] Initialized with adaptive rate limiting');
  }
  
  static getInstance(): TelegramRateLimiter {
    if (!TelegramRateLimiter.instance) {
      TelegramRateLimiter.instance = new TelegramRateLimiter();
    }
    return TelegramRateLimiter.instance;
  }
  
  /**
   * Execute a Telegram API call with rate limiting
   */
  async executeCall<T>(
    method: string,
    callFn: () => Promise<T>,
    userId: number,
    priority: 'high' | 'normal' | 'low' = 'normal'
  ): Promise<T> {
    const startTime = Date.now();
    
    // Wait for rate limit
    await this.waitForRateLimit(method, priority);
    
    // Track call start
    const call: TelegramAPICall = {
      method,
      timestamp: Date.now(),
      userId,
      success: false
    };
    
    try {
      // Execute the call
      const result = await callFn();
      
      // Success - track metrics
      call.success = true;
      call.duration = Date.now() - startTime;
      this.trackSuccess(method, call.duration);
      
      // Reduce delay on success (adaptive)
      if (this.consecutiveFloodErrors > 0) {
        this.consecutiveFloodErrors = 0;
        this.currentDelayMs = Math.max(
          this.config.baseDelayMs,
          this.currentDelayMs * 0.9
        );
      }
      
      return result;
      
    } catch (error: any) {
      // Track failure
      call.success = false;
      call.error = error.message;
      call.duration = Date.now() - startTime;
      
      // Handle flood wait specifically
      if (error.errorMessage === 'FLOOD' || error.message?.includes('flood')) {
        const waitSeconds = error.seconds || 60;
        call.floodWaitSeconds = waitSeconds;
        
        console.warn(`⚠️  [TelegramRateLimiter] FloodWait for ${method}: ${waitSeconds}s`);
        
        // Track flood wait
        this.trackFloodWait(method, waitSeconds);
        
        // Increase delay exponentially
        this.consecutiveFloodErrors++;
        this.currentDelayMs = Math.min(
          this.config.maxDelayMs,
          this.currentDelayMs * this.config.backoffMultiplier
        );
        
        // Wait out the flood wait
        await this.delay(waitSeconds * 1000);
        
        // Retry once after flood wait
        return this.executeCall(method, callFn, userId, priority);
      }
      
      // Track other errors
      this.trackError(method, error);
      throw error;
      
    } finally {
      // Store call record
      this.apiCalls.push(call);
      
      // Cleanup old records (keep last hour)
      const oneHourAgo = Date.now() - 3600000;
      this.apiCalls = this.apiCalls.filter(c => c.timestamp > oneHourAgo);
    }
  }
  
  /**
   * Wait for rate limit based on method and global limits
   */
  private async waitForRateLimit(method: string, priority: string) {
    // Calculate method-specific delay
    const methodLimit = this.config.methodLimits.get(method) || 1;
    const methodDelayMs = Math.max(1000 / methodLimit, this.currentDelayMs);
    
    // Calculate global delay
    const timeSinceLastCall = Date.now() - this.lastCallTime;
    const globalDelayMs = Math.max(0, this.currentDelayMs - timeSinceLastCall);
    
    // Use the larger delay
    const delayMs = Math.max(methodDelayMs, globalDelayMs);
    
    // Apply priority modifier
    const priorityMultiplier = 
      priority === 'high' ? 0.5 :
      priority === 'low' ? 2.0 : 1.0;
    
    const finalDelay = Math.round(delayMs * priorityMultiplier);
    
    if (finalDelay > 0) {
      console.log(`⏱️  [TelegramRateLimiter] Waiting ${finalDelay}ms before ${method} (priority: ${priority})`);
      await this.delay(finalDelay);
    }
    
    this.lastCallTime = Date.now();
  }
  
  /**
   * Track successful call
   */
  private trackSuccess(method: string, duration: number) {
    this.metrics.totalCalls++;
    this.metrics.successfulCalls++;
    
    const methodMetric = this.metrics.methodMetrics.get(method) || {
      calls: 0, success: 0, failed: 0, avgDuration: 0
    };
    
    methodMetric.calls++;
    methodMetric.success++;
    methodMetric.avgDuration = 
      (methodMetric.avgDuration * (methodMetric.calls - 1) + duration) / methodMetric.calls;
    
    this.metrics.methodMetrics.set(method, methodMetric);
  }
  
  /**
   * Track error
   */
  private trackError(method: string, _error: any) {
    this.metrics.totalCalls++;
    this.metrics.failedCalls++;
    
    const methodMetric = this.metrics.methodMetrics.get(method) || {
      calls: 0, success: 0, failed: 0, avgDuration: 0
    };
    
    methodMetric.calls++;
    methodMetric.failed++;
    
    this.metrics.methodMetrics.set(method, methodMetric);
  }
  
  /**
   * Track flood wait occurrence
   */
  private trackFloodWait(method: string, seconds: number) {
    this.metrics.floodErrors++;
    
    const history = this.floodWaitHistory.get(method) || [];
    history.push(seconds);
    
    // Keep last 10 flood waits
    if (history.length > 10) {
      history.shift();
    }
    
    this.floodWaitHistory.set(method, history);
    
    const methodMetric = this.metrics.methodMetrics.get(method);
    if (methodMetric) {
      methodMetric.lastFloodWait = seconds;
    }
    
    // Emit event for monitoring
    this.emit('flood_wait', {
      method,
      seconds,
      currentDelay: this.currentDelayMs,
      consecutiveErrors: this.consecutiveFloodErrors
    });
  }
  
  /**
   * Get current metrics
   */
  getMetrics() {
    const recentCalls = this.apiCalls.filter(
      c => c.timestamp > Date.now() - 60000
    );
    
    const callsPerMinute = recentCalls.length;
    const successRate = this.metrics.totalCalls > 0 
      ? (this.metrics.successfulCalls / this.metrics.totalCalls * 100).toFixed(2)
      : '0';
    
    const methodBreakdown: any[] = [];
    for (const [method, metric] of this.metrics.methodMetrics) {
      methodBreakdown.push({
        method,
        calls: metric.calls,
        success: metric.success,
        failed: metric.failed,
        avgDuration: Math.round(metric.avgDuration),
        lastFloodWait: metric.lastFloodWait,
        successRate: metric.calls > 0 
          ? ((metric.success / metric.calls) * 100).toFixed(2) + '%'
          : 'N/A'
      });
    }
    
    // Sort by call count
    methodBreakdown.sort((a, b) => b.calls - a.calls);
    
    return {
      summary: {
        totalCalls: this.metrics.totalCalls,
        successfulCalls: this.metrics.successfulCalls,
        failedCalls: this.metrics.failedCalls,
        floodErrors: this.metrics.floodErrors,
        successRate: `${successRate}%`,
        callsPerMinute,
        currentDelay: `${this.currentDelayMs}ms`,
        adaptiveStatus: this.consecutiveFloodErrors > 0 
          ? `BACKING OFF (${this.consecutiveFloodErrors} floods)`
          : 'NORMAL'
      },
      methodBreakdown,
      floodWaitHistory: Array.from(this.floodWaitHistory.entries()).map(([method, waits]) => ({
        method,
        recentWaits: waits,
        maxWait: Math.max(...waits),
        avgWait: (waits.reduce((a, b) => a + b, 0) / waits.length).toFixed(1)
      }))
    };
  }
  
  /**
   * Report metrics periodically
   */
  private startMetricsReporting() {
    setInterval(() => {
      const metrics = this.getMetrics();
      
      // Log summary
      console.log(`📊 [Telegram Traffic] ${metrics.summary.callsPerMinute} calls/min | Success: ${metrics.summary.successRate} | Delay: ${metrics.summary.currentDelay} | ${metrics.summary.adaptiveStatus}`);
      
      // Emit detailed metrics event
      this.emit('metrics', metrics);
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Utility delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Adjust rate limits dynamically
   */
  adjustRateLimit(method: string, newLimit: number) {
    console.log(`🔧 [TelegramRateLimiter] Adjusting ${method} limit to ${newLimit} calls/sec`);
    this.config.methodLimits.set(method, newLimit);
  }
  
  /**
   * Reset adaptive delays (use after successful period)
   */
  resetDelays() {
    this.currentDelayMs = this.config.baseDelayMs;
    this.consecutiveFloodErrors = 0;
    console.log('🔄 [TelegramRateLimiter] Reset delays to baseline');
  }
  
  /**
   * Get traffic report for specific time period
   */
  getTrafficReport(minutes: number = 60) {
    const since = Date.now() - (minutes * 60000);
    const relevantCalls = this.apiCalls.filter(c => c.timestamp > since);
    
    // Group by method
    const byMethod = new Map<string, TelegramAPICall[]>();
    for (const call of relevantCalls) {
      const calls = byMethod.get(call.method) || [];
      calls.push(call);
      byMethod.set(call.method, calls);
    }
    
    // Generate report
    const report = {
      period: `Last ${minutes} minutes`,
      totalCalls: relevantCalls.length,
      uniqueMethods: byMethod.size,
      byMethod: Array.from(byMethod.entries()).map(([method, calls]) => ({
        method,
        count: calls.length,
        successRate: ((calls.filter(c => c.success).length / calls.length) * 100).toFixed(2) + '%',
        avgDuration: calls.reduce((sum, c) => sum + (c.duration || 0), 0) / calls.length,
        floodWaits: calls.filter(c => c.floodWaitSeconds).length
      })),
      floodEvents: relevantCalls.filter(c => c.floodWaitSeconds).map(c => ({
        method: c.method,
        timestamp: new Date(c.timestamp).toISOString(),
        waitSeconds: c.floodWaitSeconds
      }))
    };
    
    return report;
  }
}

// Export singleton instance
export const telegramRateLimiter = TelegramRateLimiter.getInstance();
