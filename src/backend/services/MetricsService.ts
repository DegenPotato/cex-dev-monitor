/**
 * Comprehensive Metrics Service
 * Centralized metrics collection, aggregation, and reporting for all services
 */

import { EventEmitter } from 'events';
import os from 'os';

// Metric types
export interface LatencyMetric {
  min: number;
  max: number;
  avg: number;
  p50: number;
  p95: number;
  p99: number;
  samples: number[];
}

export interface ThroughputMetric {
  current: number;
  peak: number;
  average: number;
  total: number;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: {
    heapUsed: number;
    heapTotal: number;
    external: number;
    rss: number;
  };
  uptime: number;
  loadAverage: number[];
}

export interface ServiceHealth {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  lastCheck: number;
  errorRate: number;
  latency: number;
}

export interface ComprehensiveMetrics {
  timestamp: number;
  service: {
    name: string;
    version: string;
    instanceId: string;
    environment: string;
  };
  
  // Telegram specific metrics
  telegram: {
    messages: ThroughputMetric;
    contracts: ThroughputMetric;
    latencies: {
      goToRedis: LatencyMetric;
      redisToWebSocket: LatencyMetric;
      databaseBatch: LatencyMetric;
      endToEnd: LatencyMetric;
    };
    redis: {
      queueSize: number;
      pendingMessages: number;
      consumerLag: number;
      connectionPool: {
        active: number;
        idle: number;
        waiting: number;
      };
    };
    websocket: {
      connections: number;
      authenticatedClients: number;
      messagesDelivered: number;
      deliveryRate: number;
    };
    errors: {
      total: number;
      rate: number;
      lastError?: string;
      byType: Record<string, number>;
    };
  };
  
  // Wallet monitoring metrics
  wallets: {
    active: number;
    total: number;
    transactionsPerSecond: number;
    latency: LatencyMetric;
    errors: number;
  };
  
  // Token monitoring metrics
  tokens: {
    tracked: number;
    newDetections: number;
    priceUpdates: number;
    latency: LatencyMetric;
  };
  
  // System metrics
  system: SystemMetrics;
  
  // Service health
  health: {
    overall: 'healthy' | 'degraded' | 'unhealthy';
    services: ServiceHealth[];
    alerts: Array<{
      level: 'info' | 'warning' | 'error' | 'critical';
      message: string;
      timestamp: number;
    }>;
  };
}

class MetricsService extends EventEmitter {
  private static instance: MetricsService;
  private metrics: ComprehensiveMetrics;
  private latencyBuffers: Map<string, number[]> = new Map();
  private throughputCounters: Map<string, number> = new Map();
  private errorCounters: Map<string, number> = new Map();
  private startTime: number;
  private metricsHistory: ComprehensiveMetrics[] = [];
  private maxHistorySize: number = 100;
  
  private constructor() {
    super();
    this.startTime = Date.now();
    this.metrics = this.initializeMetrics();
    this.startAggregation();
  }
  
  static getInstance(): MetricsService {
    if (!MetricsService.instance) {
      MetricsService.instance = new MetricsService();
    }
    return MetricsService.instance;
  }
  
  private initializeMetrics(): ComprehensiveMetrics {
    return {
      timestamp: Date.now(),
      service: {
        name: process.env.SERVICE_NAME || 'cex-monitor',
        version: process.env.SERVICE_VERSION || '1.0.0',
        instanceId: `${os.hostname()}-${process.pid}`,
        environment: process.env.NODE_ENV || 'development'
      },
      telegram: {
        messages: { current: 0, peak: 0, average: 0, total: 0 },
        contracts: { current: 0, peak: 0, average: 0, total: 0 },
        latencies: {
          goToRedis: this.createEmptyLatencyMetric(),
          redisToWebSocket: this.createEmptyLatencyMetric(),
          databaseBatch: this.createEmptyLatencyMetric(),
          endToEnd: this.createEmptyLatencyMetric()
        },
        redis: {
          queueSize: 0,
          pendingMessages: 0,
          consumerLag: 0,
          connectionPool: { active: 0, idle: 0, waiting: 0 }
        },
        websocket: {
          connections: 0,
          authenticatedClients: 0,
          messagesDelivered: 0,
          deliveryRate: 0
        },
        errors: {
          total: 0,
          rate: 0,
          byType: {}
        }
      },
      wallets: {
        active: 0,
        total: 0,
        transactionsPerSecond: 0,
        latency: this.createEmptyLatencyMetric(),
        errors: 0
      },
      tokens: {
        tracked: 0,
        newDetections: 0,
        priceUpdates: 0,
        latency: this.createEmptyLatencyMetric()
      },
      system: {
        cpuUsage: 0,
        memoryUsage: process.memoryUsage(),
        uptime: process.uptime(),
        loadAverage: os.loadavg()
      },
      health: {
        overall: 'healthy',
        services: [],
        alerts: []
      }
    };
  }
  
  private createEmptyLatencyMetric(): LatencyMetric {
    return {
      min: 0,
      max: 0,
      avg: 0,
      p50: 0,
      p95: 0,
      p99: 0,
      samples: []
    };
  }
  
  /**
   * Record a latency measurement
   */
  recordLatency(metric: string, value: number) {
    if (!this.latencyBuffers.has(metric)) {
      this.latencyBuffers.set(metric, []);
    }
    
    const buffer = this.latencyBuffers.get(metric)!;
    buffer.push(value);
    
    // Keep only last 1000 samples
    if (buffer.length > 1000) {
      buffer.shift();
    }
    
    // Update metric immediately for critical paths
    this.updateLatencyMetric(metric, buffer);
  }
  
  /**
   * Increment throughput counter
   */
  incrementThroughput(metric: string, count: number = 1) {
    const current = this.throughputCounters.get(metric) || 0;
    this.throughputCounters.set(metric, current + count);
  }
  
  /**
   * Record an error
   */
  recordError(type: string, message?: string) {
    const current = this.errorCounters.get(type) || 0;
    this.errorCounters.set(type, current + 1);
    
    this.metrics.telegram.errors.total++;
    this.metrics.telegram.errors.byType[type] = (this.metrics.telegram.errors.byType[type] || 0) + 1;
    
    if (message) {
      this.metrics.telegram.errors.lastError = message;
    }
    
    // Check if we need to raise an alert
    this.checkErrorThresholds();
  }
  
  /**
   * Update Redis metrics
   */
  updateRedisMetrics(data: {
    queueSize?: number;
    pendingMessages?: number;
    consumerLag?: number;
    connectionPool?: { active: number; idle: number; waiting: number };
  }) {
    if (data.queueSize !== undefined) {
      this.metrics.telegram.redis.queueSize = data.queueSize;
    }
    if (data.pendingMessages !== undefined) {
      this.metrics.telegram.redis.pendingMessages = data.pendingMessages;
    }
    if (data.consumerLag !== undefined) {
      this.metrics.telegram.redis.consumerLag = data.consumerLag;
    }
    if (data.connectionPool) {
      this.metrics.telegram.redis.connectionPool = data.connectionPool;
    }
    
    // Alert if queue is getting too large
    if (this.metrics.telegram.redis.queueSize > 1000) {
      this.addAlert('warning', `Redis queue size high: ${this.metrics.telegram.redis.queueSize}`);
    }
  }
  
  /**
   * Update WebSocket metrics
   */
  updateWebSocketMetrics(data: {
    connections?: number;
    authenticatedClients?: number;
    messagesDelivered?: number;
  }) {
    if (data.connections !== undefined) {
      this.metrics.telegram.websocket.connections = data.connections;
    }
    if (data.authenticatedClients !== undefined) {
      this.metrics.telegram.websocket.authenticatedClients = data.authenticatedClients;
    }
    if (data.messagesDelivered !== undefined) {
      this.metrics.telegram.websocket.messagesDelivered = data.messagesDelivered;
      this.metrics.telegram.websocket.deliveryRate = 
        data.messagesDelivered / ((Date.now() - this.startTime) / 1000);
    }
  }
  
  /**
   * Update service health
   */
  updateServiceHealth(name: string, health: Partial<ServiceHealth>) {
    const existingIndex = this.metrics.health.services.findIndex(s => s.name === name);
    const serviceHealth: ServiceHealth = {
      name,
      status: health.status || 'healthy',
      lastCheck: Date.now(),
      errorRate: health.errorRate || 0,
      latency: health.latency || 0
    };
    
    if (existingIndex >= 0) {
      this.metrics.health.services[existingIndex] = serviceHealth;
    } else {
      this.metrics.health.services.push(serviceHealth);
    }
    
    // Update overall health
    this.updateOverallHealth();
  }
  
  private updateLatencyMetric(metricPath: string, samples: number[]) {
    if (samples.length === 0) return;
    
    const sorted = [...samples].sort((a, b) => a - b);
    const latencyMetric: LatencyMetric = {
      min: sorted[0],
      max: sorted[sorted.length - 1],
      avg: samples.reduce((a, b) => a + b, 0) / samples.length,
      p50: sorted[Math.floor(samples.length * 0.5)],
      p95: sorted[Math.floor(samples.length * 0.95)],
      p99: sorted[Math.floor(samples.length * 0.99)],
      samples: samples.slice(-10) // Keep last 10 for inspection
    };
    
    // Update the appropriate metric
    const parts = metricPath.split('.');
    if (parts[0] === 'telegram' && parts[1] === 'latencies') {
      const latencyType = parts[2] as keyof typeof this.metrics.telegram.latencies;
      this.metrics.telegram.latencies[latencyType] = latencyMetric;
    } else if (parts[0] === 'wallets') {
      this.metrics.wallets.latency = latencyMetric;
    } else if (parts[0] === 'tokens') {
      this.metrics.tokens.latency = latencyMetric;
    }
  }
  
  private updateOverallHealth() {
    const unhealthyServices = this.metrics.health.services.filter(s => s.status === 'unhealthy');
    const degradedServices = this.metrics.health.services.filter(s => s.status === 'degraded');
    
    if (unhealthyServices.length > 0) {
      this.metrics.health.overall = 'unhealthy';
    } else if (degradedServices.length > 0) {
      this.metrics.health.overall = 'degraded';
    } else {
      this.metrics.health.overall = 'healthy';
    }
  }
  
  private checkErrorThresholds() {
    const errorRate = this.metrics.telegram.errors.total / ((Date.now() - this.startTime) / 1000);
    
    if (errorRate > 10) {
      this.addAlert('critical', `High error rate: ${errorRate.toFixed(2)} errors/sec`);
    } else if (errorRate > 5) {
      this.addAlert('error', `Elevated error rate: ${errorRate.toFixed(2)} errors/sec`);
    } else if (errorRate > 1) {
      this.addAlert('warning', `Increased errors: ${errorRate.toFixed(2)} errors/sec`);
    }
    
    this.metrics.telegram.errors.rate = errorRate;
  }
  
  private addAlert(level: 'info' | 'warning' | 'error' | 'critical', message: string) {
    this.metrics.health.alerts.push({
      level,
      message,
      timestamp: Date.now()
    });
    
    // Keep only last 50 alerts
    if (this.metrics.health.alerts.length > 50) {
      this.metrics.health.alerts.shift();
    }
    
    // Emit alert event
    this.emit('alert', { level, message });
  }
  
  /**
   * Start metrics aggregation
   */
  private startAggregation() {
    // Update system metrics every 5 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 5000);
    
    // Calculate throughput every second
    setInterval(() => {
      this.calculateThroughput();
    }, 1000);
    
    // Save metrics snapshot every 30 seconds
    setInterval(() => {
      this.saveMetricsSnapshot();
    }, 30000);
    
    // Log comprehensive report every 60 seconds
    setInterval(() => {
      this.logComprehensiveReport();
    }, 60000);
  }
  
  private updateSystemMetrics() {
    this.metrics.system = {
      cpuUsage: process.cpuUsage().user / 1000000, // Convert to seconds
      memoryUsage: process.memoryUsage(),
      uptime: process.uptime(),
      loadAverage: os.loadavg()
    };
  }
  
  private calculateThroughput() {
    // Calculate messages throughput
    const messageCount = this.throughputCounters.get('messages') || 0;
    const uptime = (Date.now() - this.startTime) / 1000;
    
    this.metrics.telegram.messages.current = messageCount;
    this.metrics.telegram.messages.average = messageCount / uptime;
    this.metrics.telegram.messages.peak = Math.max(
      this.metrics.telegram.messages.peak,
      messageCount
    );
    this.metrics.telegram.messages.total = messageCount;
    
    // Calculate contracts throughput
    const contractCount = this.throughputCounters.get('contracts') || 0;
    this.metrics.telegram.contracts.current = contractCount;
    this.metrics.telegram.contracts.average = contractCount / uptime;
    this.metrics.telegram.contracts.peak = Math.max(
      this.metrics.telegram.contracts.peak,
      contractCount
    );
    this.metrics.telegram.contracts.total = contractCount;
  }
  
  private saveMetricsSnapshot() {
    const snapshot = JSON.parse(JSON.stringify(this.metrics));
    this.metricsHistory.push(snapshot);
    
    if (this.metricsHistory.length > this.maxHistorySize) {
      this.metricsHistory.shift();
    }
  }
  
  private logComprehensiveReport() {
    console.log(`
═══════════════════════════════════════════════════════════════
📊 COMPREHENSIVE METRICS REPORT - ${new Date().toISOString()}
═══════════════════════════════════════════════════════════════

🚀 SERVICE INFO
├─ Name: ${this.metrics.service.name}
├─ Version: ${this.metrics.service.version}
├─ Instance: ${this.metrics.service.instanceId}
└─ Environment: ${this.metrics.service.environment}

📨 TELEGRAM METRICS
├─ Messages: ${this.metrics.telegram.messages.total} total (${this.metrics.telegram.messages.average.toFixed(2)}/sec avg)
├─ Contracts: ${this.metrics.telegram.contracts.total} detected
├─ Queue Size: ${this.metrics.telegram.redis.queueSize}
├─ Consumer Lag: ${this.metrics.telegram.redis.consumerLag}ms
└─ Error Rate: ${this.metrics.telegram.errors.rate.toFixed(2)}/sec

⚡ LATENCIES
├─ Go→Redis: ${this.metrics.telegram.latencies.goToRedis.avg.toFixed(2)}ms (P95: ${this.metrics.telegram.latencies.goToRedis.p95.toFixed(2)}ms)
├─ Redis→WS: ${this.metrics.telegram.latencies.redisToWebSocket.avg.toFixed(2)}ms (P95: ${this.metrics.telegram.latencies.redisToWebSocket.p95.toFixed(2)}ms)
├─ DB Batch: ${this.metrics.telegram.latencies.databaseBatch.avg.toFixed(2)}ms
└─ End-to-End: ${this.metrics.telegram.latencies.endToEnd.avg.toFixed(2)}ms

🔌 WEBSOCKET
├─ Connections: ${this.metrics.telegram.websocket.connections}
├─ Authenticated: ${this.metrics.telegram.websocket.authenticatedClients}
└─ Delivery Rate: ${this.metrics.telegram.websocket.deliveryRate.toFixed(2)}/sec

💾 SYSTEM
├─ CPU: ${this.metrics.system.cpuUsage.toFixed(2)}%
├─ Memory: ${(this.metrics.system.memoryUsage.heapUsed / 1024 / 1024).toFixed(2)}MB / ${(this.metrics.system.memoryUsage.heapTotal / 1024 / 1024).toFixed(2)}MB
├─ Uptime: ${(this.metrics.system.uptime / 3600).toFixed(2)} hours
└─ Load: ${this.metrics.system.loadAverage.map(l => l.toFixed(2)).join(', ')}

❤️ HEALTH STATUS: ${this.metrics.health.overall.toUpperCase()}
${this.metrics.health.alerts.slice(-5).map(a => `├─ [${a.level.toUpperCase()}] ${a.message}`).join('\n')}

═══════════════════════════════════════════════════════════════
    `);
  }
  
  /**
   * Get current metrics
   */
  getMetrics(): ComprehensiveMetrics {
    this.metrics.timestamp = Date.now();
    return { ...this.metrics };
  }
  
  /**
   * Get metrics history
   */
  getHistory(): ComprehensiveMetrics[] {
    return [...this.metricsHistory];
  }
  
  /**
   * Get metrics for Prometheus export
   */
  getPrometheusMetrics(): string {
    const metrics: string[] = [];
    
    // Telegram metrics
    metrics.push(`# HELP telegram_messages_total Total messages processed`);
    metrics.push(`# TYPE telegram_messages_total counter`);
    metrics.push(`telegram_messages_total ${this.metrics.telegram.messages.total}`);
    
    metrics.push(`# HELP telegram_contracts_total Total contracts detected`);
    metrics.push(`# TYPE telegram_contracts_total counter`);
    metrics.push(`telegram_contracts_total ${this.metrics.telegram.contracts.total}`);
    
    // Latency metrics
    metrics.push(`# HELP telegram_latency_milliseconds Message processing latency`);
    metrics.push(`# TYPE telegram_latency_milliseconds summary`);
    
    Object.entries(this.metrics.telegram.latencies).forEach(([key, value]) => {
      metrics.push(`telegram_latency_milliseconds{stage="${key}",quantile="0.5"} ${value.p50}`);
      metrics.push(`telegram_latency_milliseconds{stage="${key}",quantile="0.95"} ${value.p95}`);
      metrics.push(`telegram_latency_milliseconds{stage="${key}",quantile="0.99"} ${value.p99}`);
    });
    
    // Redis metrics
    metrics.push(`# HELP redis_queue_size Current Redis queue size`);
    metrics.push(`# TYPE redis_queue_size gauge`);
    metrics.push(`redis_queue_size ${this.metrics.telegram.redis.queueSize}`);
    
    // System metrics
    metrics.push(`# HELP process_cpu_usage_percent CPU usage percentage`);
    metrics.push(`# TYPE process_cpu_usage_percent gauge`);
    metrics.push(`process_cpu_usage_percent ${this.metrics.system.cpuUsage}`);
    
    metrics.push(`# HELP process_memory_heap_bytes Memory heap usage`);
    metrics.push(`# TYPE process_memory_heap_bytes gauge`);
    metrics.push(`process_memory_heap_bytes ${this.metrics.system.memoryUsage.heapUsed}`);
    
    return metrics.join('\n');
  }
  
  /**
   * Reset metrics
   */
  reset() {
    this.metrics = this.initializeMetrics();
    this.latencyBuffers.clear();
    this.throughputCounters.clear();
    this.errorCounters.clear();
    this.metricsHistory = [];
    this.startTime = Date.now();
  }
}

// Export singleton instance
export const metricsService = MetricsService.getInstance();
