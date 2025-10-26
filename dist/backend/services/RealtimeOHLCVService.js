/**
 * Real-time OHLCV Service
 *
 * Provides 60-second interval updates for a single token per user.
 * Uses WebSocket for pushing updates and manages user subscriptions.
 */
import { queryOne, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
export class RealtimeOHLCVService {
    constructor() {
        this.GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
        this.UPDATE_INTERVAL = 60 * 1000; // 60 seconds
        this.MAX_CANDLES_PER_FETCH = 100; // Limit for real-time
        this.subscriptions = new Map(); // userId -> subscription
        this.io = null;
        // Timeframes to update
        this.TIMEFRAMES = [
            { name: '1m', api: 'minute', aggregate: 1, priority: 1 },
            { name: '15m', api: 'minute', aggregate: 15, priority: 2 },
            { name: '1h', api: 'hour', aggregate: 1, priority: 3 },
            { name: '4h', api: 'hour', aggregate: 4, priority: 4 },
            { name: '1d', api: 'day', aggregate: 1, priority: 5 }
        ];
    }
    /**
     * Initialize with Socket.IO server
     */
    initialize(io) {
        this.io = io;
        console.log('🚀 [Realtime OHLCV] Service initialized');
        // Listen for subscription requests
        io.on('connection', (socket) => {
            socket.on('ohlcv:subscribe', async (data) => {
                await this.handleSubscribe(socket, data);
            });
            socket.on('ohlcv:unsubscribe', async (data) => {
                await this.handleUnsubscribe(socket, data);
            });
            socket.on('disconnect', () => {
                this.handleDisconnect(socket);
            });
        });
    }
    /**
     * Handle subscription request
     */
    async handleSubscribe(socket, data) {
        const { userId, mintAddress, poolAddress } = data;
        console.log(`📊 [Realtime OHLCV] User ${userId} subscribing to ${mintAddress.slice(0, 8)}...`);
        // Check if user already has an active subscription
        const existingSubscription = this.subscriptions.get(userId);
        if (existingSubscription && existingSubscription.isActive) {
            // Stop existing subscription
            console.log(`⏸️  [Realtime OHLCV] Stopping existing subscription for user ${userId}`);
            await this.stopSubscription(userId);
            // Notify about the switch
            socket.emit('ohlcv:subscription_switched', {
                previousToken: existingSubscription.mintAddress,
                newToken: mintAddress
            });
        }
        // Get pool if not provided
        let targetPoolAddress = poolAddress;
        if (!targetPoolAddress) {
            const pool = await queryOne(`
        SELECT pool_address 
        FROM token_pools 
        WHERE mint_address = ? 
        ORDER BY is_primary DESC, volume_24h_usd DESC 
        LIMIT 1
      `, [mintAddress]);
            targetPoolAddress = pool?.pool_address;
            if (!targetPoolAddress) {
                socket.emit('ohlcv:error', {
                    error: 'No pool found for token',
                    mintAddress
                });
                return;
            }
        }
        // Create new subscription
        const subscription = {
            userId,
            mintAddress,
            poolAddress: targetPoolAddress,
            lastUpdate: 0,
            isActive: true
        };
        // Start update cycle
        subscription.intervalId = setInterval(() => {
            this.updateToken(subscription);
        }, this.UPDATE_INTERVAL);
        // Save subscription
        this.subscriptions.set(userId, subscription);
        // Join room for this token
        socket.join(`ohlcv:${mintAddress}`);
        socket.join(`user:${userId}`);
        // Do initial update immediately
        await this.updateToken(subscription);
        // Confirm subscription
        socket.emit('ohlcv:subscribed', {
            mintAddress,
            poolAddress: targetPoolAddress,
            updateInterval: this.UPDATE_INTERVAL
        });
        // Log to database
        await execute(`
      INSERT INTO realtime_ohlcv_subscriptions
      (user_id, mint_address, pool_address, started_at, is_active)
      VALUES (?, ?, ?, ?, 1)
    `, [userId, mintAddress, targetPoolAddress, Date.now()]);
    }
    /**
     * Handle unsubscribe request
     */
    async handleUnsubscribe(socket, data) {
        const { userId } = data;
        await this.stopSubscription(userId);
        socket.emit('ohlcv:unsubscribed', { userId });
    }
    /**
     * Handle socket disconnect
     */
    handleDisconnect(_socket) {
        // We don't auto-unsubscribe on disconnect
        // User might refresh page and reconnect
        console.log('Socket disconnected, maintaining subscriptions');
    }
    /**
     * Stop a user's subscription
     */
    async stopSubscription(userId) {
        const subscription = this.subscriptions.get(userId);
        if (subscription) {
            subscription.isActive = false;
            if (subscription.intervalId) {
                clearInterval(subscription.intervalId);
            }
            // Update database
            await execute(`
        UPDATE realtime_ohlcv_subscriptions
        SET is_active = 0, ended_at = ?
        WHERE user_id = ? AND mint_address = ? AND is_active = 1
      `, [Date.now(), userId, subscription.mintAddress]);
            // Remove from map
            this.subscriptions.delete(userId);
            console.log(`🛑 [Realtime OHLCV] Stopped subscription for user ${userId}`);
        }
    }
    /**
     * Update token data for a subscription
     */
    async updateToken(subscription) {
        if (!subscription.isActive)
            return;
        const startTime = Date.now();
        console.log(`🔄 [Realtime OHLCV] Updating ${subscription.mintAddress.slice(0, 8)}...`);
        const updates = [];
        let errorCount = 0;
        // Process each timeframe in sequence (respecting rate limits)
        for (const timeframe of this.TIMEFRAMES) {
            try {
                const data = await this.fetchOHLCVData(subscription.poolAddress, timeframe);
                if (data.length > 0) {
                    // Store in database
                    await this.storeOHLCVData(subscription.mintAddress, subscription.poolAddress, timeframe.name, data);
                    updates.push({
                        timeframe: timeframe.name,
                        count: data.length,
                        latest: data[data.length - 1]
                    });
                }
                // Small delay between timeframes to respect rate limits
                await this.delay(100);
            }
            catch (error) {
                console.error(`❌ [Realtime OHLCV] Error fetching ${timeframe.name}:`, error.message);
                errorCount++;
            }
        }
        const elapsed = Date.now() - startTime;
        subscription.lastUpdate = Date.now();
        // Emit update to user
        if (this.io) {
            this.io.to(`user:${subscription.userId}`).emit('ohlcv:update', {
                mintAddress: subscription.mintAddress,
                poolAddress: subscription.poolAddress,
                updates,
                errorCount,
                timestamp: subscription.lastUpdate,
                elapsed
            });
        }
        console.log(`✅ [Realtime OHLCV] Updated ${updates.length} timeframes in ${elapsed}ms`);
    }
    /**
     * Fetch OHLCV data from GeckoTerminal
     */
    async fetchOHLCVData(poolAddress, timeframe) {
        const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
            const url = `${this.GECKOTERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${timeframe.api}`;
            const params = new URLSearchParams({
                aggregate: timeframe.aggregate.toString(),
                limit: this.MAX_CANDLES_PER_FETCH.toString(),
                currency: 'usd'
            });
            const response = await fetch(`${url}?${params}`, {
                headers: { 'Accept': 'application/json' }
            });
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }
            return response.json();
        });
        const ohlcvList = data?.data?.attributes?.ohlcv_list || [];
        if (ohlcvList.length === 0) {
            return [];
        }
        // Check timestamp format and convert if needed
        const firstTimestamp = ohlcvList[0][0];
        const isMilliseconds = firstTimestamp > 1000000000000;
        return ohlcvList.map((candle) => ({
            timestamp: isMilliseconds ? Math.floor(candle[0] / 1000) : candle[0],
            open: candle[1],
            high: candle[2],
            low: candle[3],
            close: candle[4],
            volume: candle[5]
        }));
    }
    /**
     * Store OHLCV data in database
     */
    async storeOHLCVData(mintAddress, poolAddress, timeframe, data) {
        let stored = 0;
        for (const candle of data) {
            try {
                await execute(`
          INSERT OR REPLACE INTO ohlcv_data
          (mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    mintAddress,
                    poolAddress,
                    timeframe,
                    candle.timestamp,
                    candle.open,
                    candle.high,
                    candle.low,
                    candle.close,
                    candle.volume,
                    Date.now()
                ]);
                stored++;
            }
            catch (error) {
                // Ignore duplicates
            }
        }
        if (stored > 0) {
            console.log(`    Stored ${stored} ${timeframe} candles`);
        }
    }
    /**
     * Get active subscription for a user
     */
    getSubscription(userId) {
        return this.subscriptions.get(userId);
    }
    /**
     * Get all active subscriptions
     */
    getAllSubscriptions() {
        return Array.from(this.subscriptions.values());
    }
    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    /**
     * Cleanup all subscriptions
     */
    async cleanup() {
        console.log('🧹 [Realtime OHLCV] Cleaning up all subscriptions...');
        for (const [userId] of this.subscriptions) {
            await this.stopSubscription(userId);
        }
        this.subscriptions.clear();
    }
}
export const realtimeOHLCVService = new RealtimeOHLCVService();
