/**
 * High-Performance Redis Stream Consumer for Telegram Detections
 * Consumes from Go listener and pushes to WebSocket/Database
 */
import { createClient } from 'redis';
import { EventEmitter } from 'events';
import { execute } from '../database/helpers.js';
import os from 'os';
export class TelegramStreamConsumer extends EventEmitter {
    constructor() {
        super();
        this.redis = null;
        this.isConsuming = false;
        this.batchBuffer = [];
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectDelay = 1000; // Start with 1 second
        // Metrics tracking
        this.metrics = {
            messagesProcessed: 0,
            redisQueueSize: 0,
            avgGoToRedisLatency: 0,
            avgRedisToWebSocketLatency: 0,
            avgDatabaseBatchLatency: 0,
            batchesWritten: 0,
            websocketDeliveries: 0,
            errors: 0,
            uptime: Date.now(),
            memoryUsage: process.memoryUsage(),
            consumerGroupId: `node-${os.hostname()}-${process.pid}`
        };
        // Latency tracking arrays
        this.goToRedisLatencies = [];
        this.redisToWsLatencies = [];
        this.dbBatchLatencies = [];
        this.connectRedis();
        // Update metrics every 10 seconds
        setInterval(() => this.updateMetrics(), 10000);
    }
    /**
     * Connect to Redis with automatic reconnection
     */
    async connectRedis() {
        try {
            this.redis = createClient({
                url: process.env.REDIS_URL || 'redis://localhost:6379',
                socket: {
                    reconnectStrategy: (retries) => {
                        if (retries > this.maxReconnectAttempts) {
                            console.error('Max Redis reconnect attempts reached');
                            return new Error('Max reconnect attempts');
                        }
                        const delay = Math.min(retries * 1000, 30000);
                        console.log(`Reconnecting to Redis in ${delay}ms...`);
                        return delay;
                    }
                }
            });
            this.redis.on('error', (err) => {
                console.error('Redis Client Error:', err);
                this.metrics.errors++;
                this.metrics.lastError = err.message;
            });
            this.redis.on('ready', () => {
                console.log('✅ Redis stream consumer connected');
                this.reconnectAttempts = 0;
                this.reconnectDelay = 1000;
            });
            await this.redis.connect();
        }
        catch (error) {
            console.error('Failed to connect to Redis:', error);
            this.scheduleReconnect();
        }
    }
    /**
     * Schedule Redis reconnection with exponential backoff
     */
    scheduleReconnect() {
        if (this.reconnectTimer)
            return;
        this.reconnectTimer = setTimeout(async () => {
            this.reconnectTimer = undefined;
            this.reconnectAttempts++;
            this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30000);
            console.log(`Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            await this.connectRedis();
        }, this.reconnectDelay);
    }
    /**
     * Set WebSocket server for real-time updates
     */
    setWebSocketServer(wss) {
        this.wss = wss;
    }
    /**
     * Start consuming from Redis stream
     */
    async startConsuming() {
        if (this.isConsuming || !this.redis)
            return;
        this.isConsuming = true;
        console.log(`🚀 Starting Redis stream consumer with ID: ${this.metrics.consumerGroupId}`);
        // Create consumer group if doesn't exist
        try {
            await this.redis.xGroupCreate('telegram:detections', 'node-consumers', '$', {
                MKSTREAM: true
            });
        }
        catch (err) {
            // Group probably exists, that's OK
            if (!err.message.includes('BUSYGROUP')) {
                console.error('Failed to create consumer group:', err);
                this.metrics.errors++;
            }
        }
        // Start consuming
        this.consume();
        // Start metrics monitor
        this.startMetricsMonitor();
    }
    /**
     * Main consume loop with metrics tracking
     */
    async consume() {
        while (this.isConsuming && this.redis) {
            try {
                // Update queue size metric
                const queueInfo = await this.redis.xInfoStream('telegram:detections').catch(() => null);
                if (queueInfo) {
                    this.metrics.redisQueueSize = queueInfo.length;
                }
                // Read from stream (blocks for max 1 second)
                const messages = await this.redis.xReadGroup('node-consumers', this.metrics.consumerGroupId, [
                    {
                        key: 'telegram:detections',
                        id: '>' // Only new messages
                    }
                ], {
                    COUNT: 100, // Process up to 100 at a time
                    BLOCK: 1000 // Block for 1 second max
                });
                if (messages && messages.length > 0) {
                    for (const stream of messages) {
                        for (const message of stream.messages) {
                            const messageReceivedTime = Date.now();
                            // Track Go→Redis latency (estimate from message timestamp)
                            const messageData = JSON.parse(message.message.data);
                            const goToRedisLatency = messageReceivedTime - (messageData.detected_at * 1000);
                            this.trackLatency('goToRedis', goToRedisLatency);
                            await this.processMessage(message.id, message.message);
                            // Acknowledge message
                            await this.redis.xAck('telegram:detections', 'node-consumers', message.id);
                        }
                    }
                }
            }
            catch (error) {
                console.error('Stream consume error:', error);
                this.metrics.errors++;
                // Check if Redis connection lost
                if (!this.redis || !this.redis.isReady) {
                    console.log('Redis connection lost, attempting reconnect...');
                    await this.connectRedis();
                }
                await this.sleep(1000);
            }
        }
    }
    /**
     * Process individual detection with metrics
     */
    async processMessage(_messageId, data) {
        try {
            const wsStartTime = Date.now();
            const detection = JSON.parse(data.data);
            // INSTANT WebSocket broadcast (no database delay)
            this.broadcastToWebSocket(detection);
            // Track Redis→WebSocket latency
            const wsLatency = Date.now() - wsStartTime;
            this.trackLatency('redisToWs', wsLatency);
            // Add to batch for database write
            this.batchBuffer.push(detection);
            // Batch database writes every 100 messages or 1 second
            if (this.batchBuffer.length >= 100) {
                await this.flushBatch();
            }
            else if (!this.batchTimer) {
                this.batchTimer = setTimeout(() => this.flushBatch(), 1000);
            }
            // Emit event for other services
            this.emit('detection', detection);
            // Update metrics
            this.metrics.messagesProcessed++;
            // Log for monitoring (only sample to reduce noise)
            if (this.metrics.messagesProcessed % 10 === 0) {
                console.log(`📡 [${detection.type}] ${detection.contract.substring(0, 8)}... | Processed: ${this.metrics.messagesProcessed} | Queue: ${this.metrics.redisQueueSize}`);
            }
        }
        catch (error) {
            console.error('Failed to process message:', error);
            this.metrics.errors++;
        }
    }
    /**
     * Broadcast to all WebSocket clients immediately with authentication check
     */
    broadcastToWebSocket(detection) {
        if (!this.wss)
            return;
        const message = JSON.stringify({
            type: 'telegram_detection',
            data: {
                contract: detection.contract,
                type: detection.type,
                chatId: detection.chat_id,
                chatName: detection.chat_name || detection.chat_id,
                username: detection.username,
                forwarded: detection.forwarded || false,
                timestamp: detection.detected_at
            }
        });
        let delivered = 0;
        // Send to all authenticated clients
        this.wss.clients.forEach((client) => {
            if (client.readyState === 1 && client.isAuthenticated) { // Only send to authenticated clients
                client.send(message);
                delivered++;
            }
        });
        this.metrics.websocketDeliveries += delivered;
    }
    /**
     * Batch write to database with metrics
     */
    async flushBatch() {
        if (this.batchBuffer.length === 0)
            return;
        const batch = [...this.batchBuffer];
        this.batchBuffer = [];
        if (this.batchTimer) {
            clearTimeout(this.batchTimer);
            this.batchTimer = undefined;
        }
        const dbStartTime = Date.now();
        try {
            // Batch insert all detections
            for (const detection of batch) {
                await execute(`
          INSERT INTO telegram_detected_contracts 
          (user_id, chat_id, message_id, sender_id, sender_username, contract_address, 
           detection_type, original_format, message_text, forwarded, detected_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    detection.user_id,
                    detection.chat_id,
                    detection.message_id,
                    detection.sender_id,
                    detection.username,
                    detection.contract,
                    detection.type,
                    detection.contract, // original_format
                    detection.message.substring(0, 500), // Truncate long messages
                    0,
                    detection.detected_at,
                    Math.floor(Date.now() / 1000)
                ]);
            }
            // Track database batch latency
            const dbLatency = Date.now() - dbStartTime;
            this.trackLatency('dbBatch', dbLatency);
            this.metrics.batchesWritten++;
            console.log(`💾 Batch saved ${batch.length} detections in ${dbLatency}ms | Total batches: ${this.metrics.batchesWritten}`);
        }
        catch (error) {
            console.error('Failed to save batch to database:', error);
            this.metrics.errors++;
        }
    }
    /**
     * Track latency for metrics
     */
    trackLatency(type, latency) {
        const arrays = {
            goToRedis: this.goToRedisLatencies,
            redisToWs: this.redisToWsLatencies,
            dbBatch: this.dbBatchLatencies
        };
        const array = arrays[type];
        array.push(latency);
        // Keep only last 100 samples
        if (array.length > 100) {
            array.shift();
        }
    }
    /**
     * Update metrics calculations
     */
    updateMetrics() {
        // Calculate average latencies
        this.metrics.avgGoToRedisLatency = this.calculateAverage(this.goToRedisLatencies);
        this.metrics.avgRedisToWebSocketLatency = this.calculateAverage(this.redisToWsLatencies);
        this.metrics.avgDatabaseBatchLatency = this.calculateAverage(this.dbBatchLatencies);
        this.metrics.memoryUsage = process.memoryUsage();
    }
    /**
     * Calculate average of array
     */
    calculateAverage(arr) {
        if (arr.length === 0)
            return 0;
        return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
    }
    /**
     * Start metrics monitoring
     */
    startMetricsMonitor() {
        // Log metrics every 30 seconds
        setInterval(() => {
            console.log('📊 Telegram Stream Metrics:', {
                processed: this.metrics.messagesProcessed,
                queueSize: this.metrics.redisQueueSize,
                avgLatencies: {
                    goToRedis: `${this.metrics.avgGoToRedisLatency}ms`,
                    redisToWs: `${this.metrics.avgRedisToWebSocketLatency}ms`,
                    dbBatch: `${this.metrics.avgDatabaseBatchLatency}ms`
                },
                memory: `${Math.round(this.metrics.memoryUsage.heapUsed / 1024 / 1024)}MB`,
                errors: this.metrics.errors
            });
        }, 30000);
    }
    /**
     * Get current metrics
     */
    getMetrics() {
        this.updateMetrics();
        return {
            ...this.metrics,
            uptime: Date.now() - this.metrics.uptime
        };
    }
    /**
     * Stop consuming
     */
    async stop() {
        this.isConsuming = false;
        await this.flushBatch();
        if (this.redis) {
            await this.redis.quit();
        }
    }
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
// Export singleton
export const telegramStreamConsumer = new TelegramStreamConsumer();
