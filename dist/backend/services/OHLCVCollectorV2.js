/**
 * OHLCV Data Collector V2
 *
 * Comprehensive collector that:
 * - Handles growing token lists efficiently
 * - Respects rate limits strictly
 * - Fetches full history (up to 1000 candles per request)
 * - Maintains real-time updates after backfill
 * - Properly handles timestamps
 */
import { queryAll, queryOne, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
// Helper to save database - just a placeholder for now
const saveDatabase = () => {
    // Database saves automatically with SQLite
};
export class OHLCVCollectorV2 {
    constructor() {
        this.GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
        this.MAX_CANDLES = 1000; // GeckoTerminal max per request
        this.BATCH_SIZE = 100; // Database batch insert size
        this.isRunning = false;
        // Timeframes to collect
        this.TIMEFRAMES = [
            { name: '1m', api: 'minute', aggregate: 1 },
            { name: '15m', api: 'minute', aggregate: 15 },
            { name: '1h', api: 'hour', aggregate: 1 },
            { name: '4h', api: 'hour', aggregate: 4 },
            { name: '1d', api: 'day', aggregate: 1 }
        ];
    }
    /**
     * Start the collector
     */
    async start() {
        if (this.isRunning) {
            console.log('📊 [OHLCV-V2] Already running');
            return;
        }
        this.isRunning = true;
        console.log('📊 [OHLCV-V2] Starting comprehensive collector...');
        // Run immediately, then every 15 minutes
        this.runCycle();
        setInterval(() => {
            if (this.isRunning) {
                this.runCycle();
            }
        }, 15 * 60 * 1000);
    }
    /**
     * Stop the collector
     */
    stop() {
        console.log('📊 [OHLCV-V2] Stopping...');
        this.isRunning = false;
    }
    /**
     * Run a collection cycle
     */
    async runCycle() {
        console.log('\n📊 [OHLCV-V2] Starting collection cycle...');
        try {
            // Get tokens ordered by priority (newest first, then by activity)
            const tokens = await queryAll(`
        SELECT 
          tm.mint_address,
          tm.timestamp
        FROM token_mints tm
        LEFT JOIN (
          SELECT mint_address, MAX(newest_timestamp) as last_update
          FROM ohlcv_backfill_progress
          GROUP BY mint_address
        ) obp ON tm.mint_address = obp.mint_address
        ORDER BY 
          CASE WHEN obp.last_update IS NULL THEN 0 ELSE 1 END, -- Prioritize tokens with no data
          tm.timestamp DESC -- Then newest tokens
        LIMIT 50 -- Process 50 tokens per cycle to avoid overload
      `);
            if (tokens.length === 0) {
                console.log('📊 [OHLCV-V2] No tokens to process');
                return;
            }
            console.log(`📊 [OHLCV-V2] Processing ${tokens.length} tokens...`);
            for (const token of tokens) {
                if (!this.isRunning)
                    break;
                await this.processToken(token);
            }
            console.log('📊 [OHLCV-V2] Cycle complete\n');
        }
        catch (error) {
            console.error('❌ [OHLCV-V2] Cycle error:', error);
        }
    }
    /**
     * Process a single token
     */
    async processToken(token) {
        const mintAddress = token.mint_address;
        console.log(`\n🪙 [OHLCV-V2] Processing ${mintAddress.slice(0, 8)}...`);
        // Step 1: Get pools for this token
        const pools = await this.discoverPools(mintAddress);
        if (pools.length === 0) {
            console.log(`  ⚠️ No pools found`);
            return;
        }
        console.log(`  ✅ Found ${pools.length} pool(s)`);
        // Step 2: Process each pool
        for (const pool of pools) {
            console.log(`  📊 Processing pool ${pool.pool_address.slice(0, 8)}... (${pool.dex})`);
            // Step 3: Process each timeframe
            for (const timeframe of this.TIMEFRAMES) {
                await this.collectTimeframe(mintAddress, pool, timeframe, token.timestamp);
            }
        }
    }
    /**
     * Discover pools for a token
     */
    async discoverPools(mintAddress) {
        // Check cache first
        const cached = await queryAll(`
      SELECT pool_address, dex, volume_24h_usd, liquidity_usd
      FROM token_pools
      WHERE mint_address = ?
      ORDER BY is_primary DESC, volume_24h_usd DESC
    `, [mintAddress]);
        if (cached.length > 0) {
            return cached;
        }
        // Fetch from GeckoTerminal
        try {
            const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
                const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}`;
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return response.json();
            });
            const topPools = data?.data?.relationships?.top_pools?.data || [];
            const included = data?.included || [];
            const pools = [];
            for (const poolRef of topPools) {
                const poolId = poolRef.id;
                const poolAddress = poolId.replace('solana_', '');
                // Find pool details
                const poolDetails = included.find((item) => item.id === poolId);
                const attributes = poolDetails?.attributes || {};
                const pool = {
                    pool_address: poolAddress,
                    dex: attributes.dex_id || 'unknown',
                    volume_24h_usd: parseFloat(attributes.volume_usd?.h24 || '0'),
                    liquidity_usd: parseFloat(attributes.reserve_in_usd || '0')
                };
                pools.push(pool);
                // Store in cache
                await execute(`
          INSERT OR REPLACE INTO token_pools
          (mint_address, pool_address, dex, volume_24h_usd, liquidity_usd, price_usd, is_primary, discovered_at, last_verified)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    mintAddress,
                    pool.pool_address,
                    pool.dex,
                    pool.volume_24h_usd,
                    pool.liquidity_usd,
                    parseFloat(attributes.base_token_price_usd || '0'),
                    pools.length === 1 ? 1 : 0, // First pool is primary
                    Date.now(),
                    Date.now()
                ]);
            }
            return pools;
        }
        catch (error) {
            console.log(`  ⚠️ Failed to fetch pools: ${error.message}`);
            return [];
        }
    }
    /**
     * Collect OHLCV data for a specific timeframe
     */
    async collectTimeframe(mintAddress, pool, timeframe, creationTimestampMs) {
        // Check current progress
        const progress = await queryOne(`
      SELECT oldest_timestamp, newest_timestamp, backfill_complete
      FROM ohlcv_backfill_progress
      WHERE mint_address = ? AND pool_address = ? AND timeframe = ?
    `, [mintAddress, pool.pool_address, timeframe.name]);
        const nowUnix = Math.floor(Date.now() / 1000);
        const creationUnix = Math.floor(creationTimestampMs / 1000);
        // Determine what to fetch
        let fetchMode;
        let beforeTimestamp;
        if (!progress) {
            // No data yet - fetch initial batch from now
            fetchMode = 'initial';
            beforeTimestamp = nowUnix;
        }
        else if (progress.backfill_complete) {
            // Backfill complete - fetch only new candles
            fetchMode = 'update';
            beforeTimestamp = nowUnix;
        }
        else if (progress.oldest_timestamp && progress.oldest_timestamp > creationUnix) {
            // Continue backfill - fetch older data
            fetchMode = 'backfill';
            beforeTimestamp = progress.oldest_timestamp;
        }
        else {
            // Already complete
            fetchMode = 'skip';
            beforeTimestamp = 0;
        }
        if (fetchMode === 'skip') {
            return;
        }
        console.log(`    ${timeframe.name}: ${fetchMode} mode`);
        // Fetch candles
        const candles = await this.fetchCandles(pool.pool_address, timeframe, beforeTimestamp);
        if (candles.length === 0) {
            console.log(`      No candles returned`);
            // If initial fetch returns nothing, mark as having no data
            if (fetchMode === 'initial') {
                await this.updateProgress(mintAddress, pool.pool_address, timeframe.name, nowUnix, nowUnix, true // Mark complete since no data exists
                );
            }
            return;
        }
        console.log(`      Got ${candles.length} candles`);
        // Store candles
        let stored = 0;
        let duplicates = 0;
        for (let i = 0; i < candles.length; i += this.BATCH_SIZE) {
            const batch = candles.slice(i, i + this.BATCH_SIZE);
            for (const candle of batch) {
                try {
                    await execute(`
            INSERT OR IGNORE INTO ohlcv_data
            (mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                        mintAddress,
                        pool.pool_address,
                        timeframe.name,
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
                catch {
                    duplicates++;
                }
            }
        }
        console.log(`      Stored ${stored} new, ${duplicates} duplicates`);
        // Update progress
        if (stored > 0) {
            const timestamps = candles.map(c => c.timestamp);
            const oldestFetched = Math.min(...timestamps);
            const newestFetched = Math.max(...timestamps);
            // Determine new progress values
            const newOldest = progress?.oldest_timestamp
                ? Math.min(progress.oldest_timestamp, oldestFetched)
                : oldestFetched;
            const newNewest = progress?.newest_timestamp
                ? Math.max(progress.newest_timestamp, newestFetched)
                : newestFetched;
            // Check if backfill is complete
            const isComplete = newOldest <= creationUnix || candles.length < this.MAX_CANDLES;
            await this.updateProgress(mintAddress, pool.pool_address, timeframe.name, newOldest, newNewest, isComplete);
            saveDatabase();
        }
    }
    /**
     * Fetch OHLCV candles from GeckoTerminal
     */
    async fetchCandles(poolAddress, timeframe, beforeTimestamp) {
        try {
            const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
                const url = `${this.GECKOTERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${timeframe.api}`;
                const params = new URLSearchParams({
                    aggregate: timeframe.aggregate.toString(),
                    before_timestamp: beforeTimestamp.toString(),
                    limit: this.MAX_CANDLES.toString(),
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
            // Debug: Log first candle to see timestamp format
            if (ohlcvList.length > 0) {
                const firstCandle = ohlcvList[0];
                const timestamp = firstCandle[0];
                console.log(`      📊 First candle timestamp: ${timestamp}`);
                console.log(`        As seconds: ${new Date(timestamp * 1000).toISOString()}`);
                console.log(`        As millis:  ${new Date(timestamp).toISOString()}`);
                // If timestamp is in milliseconds (> 1 billion), convert to seconds
                // Unix seconds for 2020+ would be > 1,577,836,800
                // Unix milliseconds for 2020+ would be > 1,577,836,800,000
                if (timestamp > 1000000000000) {
                    console.log(`        ✅ Detected milliseconds, converting to seconds`);
                    return ohlcvList.map((candle) => ({
                        timestamp: Math.floor(candle[0] / 1000), // Convert ms to seconds
                        open: candle[1],
                        high: candle[2],
                        low: candle[3],
                        close: candle[4],
                        volume: candle[5]
                    }));
                }
            }
            return ohlcvList.map((candle) => ({
                timestamp: candle[0],
                open: candle[1],
                high: candle[2],
                low: candle[3],
                close: candle[4],
                volume: candle[5]
            }));
        }
        catch (error) {
            console.log(`      ⚠️ Fetch error: ${error.message}`);
            return [];
        }
    }
    /**
     * Update backfill progress
     */
    async updateProgress(mintAddress, poolAddress, timeframe, oldestTimestamp, newestTimestamp, complete) {
        await execute(`
      INSERT OR REPLACE INTO ohlcv_backfill_progress
      (mint_address, pool_address, timeframe, oldest_timestamp, newest_timestamp, backfill_complete, last_fetch_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
            mintAddress,
            poolAddress,
            timeframe,
            oldestTimestamp,
            newestTimestamp,
            complete ? 1 : 0,
            Date.now()
        ]);
    }
}
export const ohlcvCollectorV2 = new OHLCVCollectorV2();
