import fetch from 'cross-fetch';
import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';

/**
 * OHLCV Data Collector using GeckoTerminal API
 * 
 * Features:
 * - Backfills historical data (oldest first)
 * - Supports multiple timeframes: 1m, 15m, 1h, 4h, 1d
 * - Deduplication via unique constraints
 * - Progress tracking for resume capability
 * - Rate limiting for growing token database
 * - Pool address discovery
 * 
 * NOT auto-starting - manual control only
 */
export class OHLCVCollector {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
  
  // Timeframe configurations
  private readonly TIMEFRAMES = [
    { name: '1m', api: 'minute', aggregate: 1, intervalMs: 60 * 1000 },
    { name: '15m', api: 'minute', aggregate: 15, intervalMs: 15 * 60 * 1000 },
    { name: '1h', api: 'hour', aggregate: 1, intervalMs: 60 * 60 * 1000 },
    { name: '4h', api: 'hour', aggregate: 4, intervalMs: 4 * 60 * 60 * 1000 },
    { name: '1d', api: 'day', aggregate: 1, intervalMs: 24 * 60 * 60 * 1000 }
  ];
  
  // Rate limiting - Global rate limiter handles all pacing
  private readonly BACKFILL_INTERVAL = 5 * 60 * 1000; // Run backfill every 5 minutes
  private readonly REQUESTS_PER_MINUTE = 10; // Very conservative GeckoTerminal limit (for display only)
  private readonly MAX_CANDLES_PER_REQUEST = 1000; // GeckoTerminal max
  // NOTE: We process ALL tokens every cycle - global rate limiter queues and paces ALL requests automatically
  
  constructor() {
    console.log('📊 [OHLCV] Collector initialized (NOT auto-starting)');
    console.log(`📊 [OHLCV] Timeframes: ${this.TIMEFRAMES.map(t => t.name).join(', ')}`);
    console.log(`📊 [OHLCV] Rate limit: ${this.REQUESTS_PER_MINUTE} req/min`);
  }
  
  /**
   * Start the OHLCV backfilling process
   */
  start() {
    if (this.isRunning) {
      console.log('📊 [OHLCV] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('📊 [OHLCV] Starting backfill collector...');
    
    // Run immediately, then every 5 minutes
    this.runBackfillCycle();
    this.intervalId = setInterval(() => {
      this.runBackfillCycle();
    }, this.BACKFILL_INTERVAL);
  }
  
  /**
   * Stop the collector
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 [OHLCV] Collector stopped');
  }
  
  /**
   * Main backfill cycle - processes tokens in priority order
   */
  private async runBackfillCycle() {
    try {
      console.log('📊 [OHLCV] Starting backfill cycle...');
      
      // Get all tokens
      const tokens = await queryAll<{ mint_address: string; creation_timestamp: number }>(
        `SELECT mint_address, timestamp as creation_timestamp 
         FROM token_mints 
         ORDER BY timestamp DESC`
      );
      
      if (tokens.length === 0) {
        console.log('📊 [OHLCV] No tokens to process');
        return;
      }
      
      console.log(`📊 [OHLCV] Processing all ${tokens.length} tokens (global rate limiter will pace requests)`);
      
      // Process each token - global rate limiter handles pacing
      for (const token of tokens) {
        if (!this.isRunning) {
          console.log('📊 [OHLCV] Stopped during cycle');
          return;
        }
        
        await this.processToken(token.mint_address, token.creation_timestamp);
      }
      
      console.log('📊 [OHLCV] Backfill cycle complete');
    } catch (error: any) {
      console.error('📊 [OHLCV] Error in backfill cycle:', error);
      console.error('📊 [OHLCV] Stack trace:', error.stack);
    }
  }
  
  /**
   * Process a single token - fetch pools and backfill all timeframes for each pool
   */
  private async processToken(mintAddress: string, creationTimestamp: number) {
    try {
      console.log(`📊 [OHLCV] Processing token ${mintAddress.slice(0, 8)}...`);
      
      // Step 1: Ensure we have pool addresses (may return multiple)
      const pools = await this.ensurePoolAddresses(mintAddress);
      if (pools.length === 0) {
        console.log(`📊 [OHLCV] No pools found for ${mintAddress.slice(0, 8)}...`);
        return;
      }
      
      console.log(`📊 [OHLCV] Found ${pools.length} pool(s) for ${mintAddress.slice(0, 8)}..., processing timeframes`);

      // Step 2: Process each pool
      for (const pool of pools) {
        if (!this.isRunning) return;
        
        console.log(`📊 [OHLCV] Processing pool ${pool.pool_address.slice(0, 8)}... (${pool.dex || 'unknown'})`);
        
        // Step 3: Process each timeframe for this pool
        for (const timeframe of this.TIMEFRAMES) {
          if (!this.isRunning) return;
          
          await this.backfillTimeframe(mintAddress, pool.pool_address, timeframe, creationTimestamp);
        }
      }
    } catch (error: any) {
      console.error(`📊 [OHLCV] Error processing ${mintAddress.slice(0, 8)}...:`, error);
      console.error(`📊 [OHLCV] Stack:`, error.stack);
    }
  }
  
  /**
   * Ensure token has pool addresses (fetch if needed)
   * Returns array of pools sorted by preference (primary/volume)
   */
  private async ensurePoolAddresses(mintAddress: string): Promise<Array<{
    pool_address: string;
    dex: string | null;
    volume_24h_usd: number | null;
    is_primary: number;
  }>> {
    // Check if we already have pools
    const existing = await queryAll<{ 
      pool_address: string;
      dex: string | null;
      volume_24h_usd: number | null;
      is_primary: number;
    }>(
      `SELECT pool_address, dex, volume_24h_usd, is_primary 
       FROM token_pools 
       WHERE mint_address = ?
       ORDER BY is_primary DESC, volume_24h_usd DESC`,
      [mintAddress]
    );
    
    if (existing.length > 0) {
      return existing;
    }
    
    // Fetch ALL pools from GeckoTerminal using global rate limiter
    try {
      const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
        const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}`;
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });
        
        if (response.status === 429) {
          throw new Error('RATE_LIMITED');
        }
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }
        
        return await response.json();
      });
      
      const relationships = data?.data?.relationships;
      const included = data?.included || [];
      
      // Get ALL top pools
      const topPoolData = relationships?.top_pools?.data;
      if (!topPoolData || topPoolData.length === 0) {
        console.warn(`⚠️ [OHLCV] Token ${mintAddress.slice(0, 8)}... has no pools on GeckoTerminal`);
        return [];
      }
      
      // Process each pool and extract metadata
      const pools: Array<{
        pool_address: string;
        dex: string;
        volume_24h_usd: number;
        liquidity_usd: number;
        price_usd: number;
      }> = [];
      
      for (const poolRef of topPoolData) {
        const poolId = poolRef.id; // Format: "solana_POOL_ADDRESS"
        if (!poolId) continue;
        
        const poolAddress = poolId.replace('solana_', '');
        
        // Find pool details in included data
        const poolDetails = included.find((item: any) => item.id === poolId);
        const attributes = poolDetails?.attributes || {};
        
        pools.push({
          pool_address: poolAddress,
          dex: attributes.dex_id || 'unknown',
          volume_24h_usd: parseFloat(attributes.volume_usd?.h24 || '0'),
          liquidity_usd: parseFloat(attributes.reserve_in_usd || '0'),
          price_usd: parseFloat(attributes.base_token_price_usd || '0')
        });
      }
      
      if (pools.length === 0) {
        return [];
      }
      
      // Sort pools by preference: Raydium first, then by volume
      pools.sort((a, b) => {
        // Prefer Raydium
        if (a.dex === 'raydium' && b.dex !== 'raydium') return -1;
        if (b.dex === 'raydium' && a.dex !== 'raydium') return 1;
        // Then by volume
        return b.volume_24h_usd - a.volume_24h_usd;
      });
      
      // Store all pools, mark first as primary
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const isPrimary = i === 0 ? 1 : 0;
        
        await execute(
          `INSERT OR REPLACE INTO token_pools 
           (mint_address, pool_address, dex, volume_24h_usd, liquidity_usd, price_usd, is_primary, discovered_at) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [mintAddress, pool.pool_address, pool.dex, pool.volume_24h_usd, pool.liquidity_usd, pool.price_usd, isPrimary, Date.now()]
        );
      }
      saveDatabase();
      
      console.log(`✅ [OHLCV] Found ${pools.length} pool(s) for ${mintAddress.slice(0, 8)}..., primary: ${pools[0].pool_address.slice(0, 8)}... (${pools[0].dex})`);
      
      return pools.map((p, i) => ({
        pool_address: p.pool_address,
        dex: p.dex,
        volume_24h_usd: p.volume_24h_usd,
        is_primary: i === 0 ? 1 : 0
      }));
    } catch (error: any) {
      if (error.message === 'RATE_LIMITED') {
        console.warn(`⚠️ [OHLCV] Rate limited discovering pools for ${mintAddress.slice(0, 8)}...`);
      } else if (error.message.startsWith('HTTP')) {
        console.warn(`⚠️ [OHLCV] No pool data for ${mintAddress.slice(0, 8)}... (${error.message})`);
      } else {
        console.error(`❌ [OHLCV] Error fetching pools for ${mintAddress.slice(0, 8)}...:`, error.message);
      }
      return [];
    }
  }
  
  /**
   * Backfill a specific timeframe for a token
   * Fetches oldest data first and works forward
   * Once backfill is complete, fetches latest candles to maintain real-time data
   */
  private async backfillTimeframe(
    mintAddress: string,
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    creationTimestamp: number
  ) {
    try {
      // Get progress (per-pool tracking)
      const progress = await queryOne<{
        oldest_timestamp: number | null;
        newest_timestamp: number | null;
        backfill_complete: number;
      }>(
        `SELECT * FROM ohlcv_backfill_progress 
         WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      
      // If backfill complete, fetch LATEST candles (real-time updates)
      if (progress?.backfill_complete) {
        await this.fetchLatestCandles(mintAddress, poolAddress, timeframe, progress.newest_timestamp || 0);
        return;
      }
      
      // Determine fetch target
      // If we have data, fetch before oldest; otherwise start from creation
      const targetTimestamp = progress?.oldest_timestamp 
        ? progress.oldest_timestamp 
        : Math.floor(Date.now() / 1000); // Start from now and go backwards
      
      const creationUnix = Math.floor(creationTimestamp / 1000);
      
      // Don't fetch before token creation
      if (targetTimestamp <= creationUnix) {
        await this.markBackfillComplete(poolAddress, timeframe.name);
        return;
      }
      
      // Fetch OHLCV data
      const candles = await this.fetchOHLCV(
        poolAddress,
        timeframe,
        targetTimestamp
      );
      
      if (candles.length === 0) {
        console.log(`📊 [OHLCV] No data for ${mintAddress.slice(0, 8)}... ${timeframe.name}`);
        return;
      }
      
      // Store candles (deduplication handled by UNIQUE constraint)
      let stored = 0;
      for (const candle of candles) {
        try {
          await execute(
            `INSERT OR IGNORE INTO ohlcv_data 
             (mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mintAddress,
              poolAddress,
              timeframe.name,
              candle.timestamp,
              candle.open,
              candle.high,
              candle.low,
              candle.close,
              candle.volume,
              Date.now()
            ]
          );
          stored++;
        } catch (e) {
          // Duplicate, skip
        }
      }
      if (stored > 0) {
        saveDatabase();
      }
      
      // Update progress
      const timestamps = candles.map(c => c.timestamp);
      const oldestFetched = Math.min(...timestamps);
      const newestFetched = Math.max(...timestamps);
      
      const isComplete = oldestFetched <= creationUnix;
      
      // Get current fetch count
      const currentProgress = await queryOne<{ fetch_count: number }>(
        `SELECT fetch_count FROM ohlcv_backfill_progress WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      const fetchCount = (currentProgress?.fetch_count || 0) + 1;
      
      await execute(
        `INSERT OR REPLACE INTO ohlcv_backfill_progress 
         (mint_address, pool_address, timeframe, oldest_timestamp, newest_timestamp, backfill_complete, last_fetch_at, fetch_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          mintAddress,
          poolAddress,
          timeframe.name,
          progress?.oldest_timestamp ? Math.min(progress.oldest_timestamp, oldestFetched) : oldestFetched,
          progress?.newest_timestamp ? Math.max(progress.newest_timestamp, newestFetched) : newestFetched,
          isComplete ? 1 : 0,
          Date.now(),
          fetchCount
        ]
      );
      saveDatabase();
      
      console.log(`✅ [OHLCV] ${poolAddress.slice(0, 8)}... ${timeframe.name}: ${stored} candles (${isComplete ? 'COMPLETE' : 'continuing'})`);
      
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error backfilling ${poolAddress.slice(0, 8)}... ${timeframe.name}:`, error.message);
      
      // Track error
      const currentProgress = await queryOne<{ error_count: number }>(
        `SELECT error_count FROM ohlcv_backfill_progress WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      const errorCount = (currentProgress?.error_count || 0) + 1;
      
      await execute(
        `UPDATE ohlcv_backfill_progress 
         SET error_count = ?, last_error = ?
         WHERE pool_address = ? AND timeframe = ?`,
        [errorCount, error.message, poolAddress, timeframe.name]
      );
      saveDatabase();
    }
  }
  
  /**
   * Fetch latest candles for a completed token (real-time updates)
   */
  private async fetchLatestCandles(
    mintAddress: string,
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    lastTimestamp: number
  ) {
    try {
      // Fetch candles that occurred AFTER our last stored timestamp
      const nowUnix = Math.floor(Date.now() / 1000);
      
      const candles = await this.fetchOHLCV(
        poolAddress,
        timeframe,
        nowUnix // Fetch up to now
      );
      
      if (candles.length === 0) {
        return;
      }
      
      // Only store candles newer than what we have
      const newCandles = candles.filter(c => c.timestamp > lastTimestamp);
      
      if (newCandles.length === 0) {
        return; // No new data
      }
      
      // Store new candles
      let stored = 0;
      for (const candle of newCandles) {
        try {
          await execute(
            `INSERT OR IGNORE INTO ohlcv_data 
             (mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              mintAddress,
              poolAddress,
              timeframe.name,
              candle.timestamp,
              candle.open,
              candle.high,
              candle.low,
              candle.close,
              candle.volume,
              Date.now()
            ]
          );
          stored++;
        } catch (e) {
          // Duplicate, skip
        }
      }
      
      if (stored > 0) {
        // Update newest timestamp
        const newestTimestamp = Math.max(...newCandles.map(c => c.timestamp));
        
        await execute(
          `UPDATE ohlcv_backfill_progress 
           SET newest_timestamp = ?, last_fetch_at = ?
           WHERE pool_address = ? AND timeframe = ?`,
          [newestTimestamp, Date.now(), poolAddress, timeframe.name]
        );
        
        saveDatabase();
        console.log(`🔄 [OHLCV] ${poolAddress.slice(0, 8)}... ${timeframe.name}: ${stored} new candles`);
      }
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error fetching latest for ${poolAddress.slice(0, 8)}... ${timeframe.name}:`, error.message);
    }
  }
  
  /**
   * Fetch OHLCV data from GeckoTerminal
   */
  private async fetchOHLCV(
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    beforeTimestamp: number
  ): Promise<Array<{
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>> {
    // Use global rate limiter
    const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
      const url = `${this.GECKOTERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${timeframe.api}`;
      
      const params = new URLSearchParams({
        aggregate: timeframe.aggregate.toString(),
        before_timestamp: beforeTimestamp.toString(),
        limit: this.MAX_CANDLES_PER_REQUEST.toString(),
        currency: 'usd'
      });
      
      const response = await fetch(`${url}?${params}`, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    });
    const ohlcvArray = data?.data?.attributes?.ohlcv_list;
    
    if (!ohlcvArray || !Array.isArray(ohlcvArray)) {
      return [];
    }
    
    // Parse OHLCV data: [timestamp, open, high, low, close, volume]
    return ohlcvArray.map((candle: any[]) => ({
      timestamp: candle[0],
      open: parseFloat(candle[1]),
      high: parseFloat(candle[2]),
      low: parseFloat(candle[3]),
      close: parseFloat(candle[4]),
      volume: parseFloat(candle[5])
    }));
  }
  
  /**
   * Mark backfill as complete for a pool/timeframe
   */
  private async markBackfillComplete(poolAddress: string, timeframe: string) {
    await execute(
      `UPDATE ohlcv_backfill_progress 
       SET backfill_complete = 1 
       WHERE pool_address = ? AND timeframe = ?`,
      [poolAddress, timeframe]
    );
    saveDatabase();
    
    console.log(`✅ [OHLCV] Backfill complete for pool ${poolAddress.slice(0, 8)}... ${timeframe}`);
  }
  
  /**
   * Get collector status
   */
  async getStatus() {
    try {
      const stats = await queryOne<any>(`
        SELECT 
          COUNT(DISTINCT mint_address) as total_tokens,
          COUNT(*) as total_candles,
          COUNT(CASE WHEN timeframe = '1m' THEN 1 END) as candles_1m,
          COUNT(CASE WHEN timeframe = '15m' THEN 1 END) as candles_15m,
          COUNT(CASE WHEN timeframe = '1h' THEN 1 END) as candles_1h,
          COUNT(CASE WHEN timeframe = '4h' THEN 1 END) as candles_4h,
          COUNT(CASE WHEN timeframe = '1d' THEN 1 END) as candles_1d
        FROM ohlcv_data
      `);
      
      const progress = await queryOne<any>(`
        SELECT 
          COUNT(*) as total_progress_entries,
          COUNT(CASE WHEN backfill_complete = 1 THEN 1 END) as completed,
          COUNT(CASE WHEN backfill_complete = 0 THEN 1 END) as in_progress
        FROM ohlcv_backfill_progress
      `);
      
      return {
        isRunning: this.isRunning,
        backfillInterval: this.BACKFILL_INTERVAL,
        ...stats,
        ...progress
      };
    } catch (error) {
      return {
        isRunning: this.isRunning,
        backfillInterval: this.BACKFILL_INTERVAL
      };
    }
  }
}
