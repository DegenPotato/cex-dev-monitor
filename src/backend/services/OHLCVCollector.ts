import fetch from 'cross-fetch';
import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';

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
  
  // Rate limiting
  private readonly BACKFILL_INTERVAL = 5 * 60 * 1000; // Run backfill every 5 minutes
  private readonly REQUESTS_PER_MINUTE = 30; // Conservative GeckoTerminal limit
  private readonly REQUEST_DELAY = Math.ceil((60 * 1000) / this.REQUESTS_PER_MINUTE);
  private readonly MAX_CANDLES_PER_REQUEST = 1000; // GeckoTerminal max
  
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
      
      console.log(`📊 [OHLCV] Processing ${tokens.length} tokens...`);
      
      // Process each token
      for (const token of tokens) {
        if (!this.isRunning) {
          console.log('📊 [OHLCV] Stopped during cycle');
          return;
        }
        
        await this.processToken(token.mint_address, token.creation_timestamp);
      }
      
      console.log('📊 [OHLCV] Backfill cycle complete');
    } catch (error: any) {
      console.error('📊 [OHLCV] Error in backfill cycle:', error.message);
    }
  }
  
  /**
   * Process a single token - fetch pool and backfill all timeframes
   */
  private async processToken(mintAddress: string, creationTimestamp: number) {
    try {
      // Step 1: Ensure we have pool address
      const poolAddress = await this.ensurePoolAddress(mintAddress);
      if (!poolAddress) {
        console.log(`📊 [OHLCV] No pool found for ${mintAddress.slice(0, 8)}...`);
        return;
      }
      
      // Step 2: Process each timeframe
      for (const timeframe of this.TIMEFRAMES) {
        if (!this.isRunning) return;
        
        await this.backfillTimeframe(mintAddress, poolAddress, timeframe, creationTimestamp);
        await this.delay(this.REQUEST_DELAY); // Rate limiting between timeframes
      }
    } catch (error: any) {
      console.error(`📊 [OHLCV] Error processing ${mintAddress.slice(0, 8)}...:`, error.message);
    }
  }
  
  /**
   * Ensure token has pool address (fetch if needed)
   */
  private async ensurePoolAddress(mintAddress: string): Promise<string | null> {
    // Check if we already have it
    const existing = await queryOne<{ pool_address: string }>(
      `SELECT pool_address FROM token_pools WHERE mint_address = ?`,
      [mintAddress]
    );
    
    if (existing) {
      return existing.pool_address;
    }
    
    // Fetch from GeckoTerminal
    try {
      const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}`;
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const relationships = data?.data?.relationships;
      
      // Get the top pool
      const topPoolData = relationships?.top_pools?.data;
      if (!topPoolData || topPoolData.length === 0) {
        return null;
      }
      
      const poolId = topPoolData[0]?.id; // Format: "solana_POOL_ADDRESS"
      if (!poolId) {
        return null;
      }
      
      const poolAddress = poolId.replace('solana_', '');
      
      // Store it
      await execute(
        `INSERT OR REPLACE INTO token_pools 
         (mint_address, pool_address, discovered_at) 
         VALUES (?, ?, ?)`,
        [mintAddress, poolAddress, Date.now()]
      );
      saveDatabase();
      
      console.log(`✅ [OHLCV] Found pool for ${mintAddress.slice(0, 8)}...: ${poolAddress.slice(0, 8)}...`);
      
      return poolAddress;
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error fetching pool for ${mintAddress.slice(0, 8)}...:`, error.message);
      return null;
    }
  }
  
  /**
   * Backfill a specific timeframe for a token
   * Fetches oldest data first and works forward
   */
  private async backfillTimeframe(
    mintAddress: string,
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    creationTimestamp: number
  ) {
    try {
      // Get progress
      const progress = await queryOne<{
        oldest_timestamp: number | null;
        newest_timestamp: number | null;
        backfill_complete: number;
      }>(
        `SELECT * FROM ohlcv_backfill_progress 
         WHERE mint_address = ? AND timeframe = ?`,
        [mintAddress, timeframe.name]
      );
      
      // If backfill complete, skip
      if (progress?.backfill_complete) {
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
        this.markBackfillComplete(mintAddress, timeframe.name);
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
        `SELECT fetch_count FROM ohlcv_backfill_progress WHERE mint_address = ? AND timeframe = ?`,
        [mintAddress, timeframe.name]
      );
      const fetchCount = (currentProgress?.fetch_count || 0) + 1;
      
      await execute(
        `INSERT OR REPLACE INTO ohlcv_backfill_progress 
         (mint_address, timeframe, oldest_timestamp, newest_timestamp, backfill_complete, last_fetch_at, fetch_count)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          mintAddress,
          timeframe.name,
          progress?.oldest_timestamp ? Math.min(progress.oldest_timestamp, oldestFetched) : oldestFetched,
          progress?.newest_timestamp ? Math.max(progress.newest_timestamp, newestFetched) : newestFetched,
          isComplete ? 1 : 0,
          Date.now(),
          fetchCount
        ]
      );
      saveDatabase();
      
      console.log(`✅ [OHLCV] ${mintAddress.slice(0, 8)}... ${timeframe.name}: ${stored} candles (${isComplete ? 'COMPLETE' : 'continuing'})`);
      
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error backfilling ${mintAddress.slice(0, 8)}... ${timeframe.name}:`, error.message);
      
      // Track error
      const currentProgress = await queryOne<{ error_count: number }>(
        `SELECT error_count FROM ohlcv_backfill_progress WHERE mint_address = ? AND timeframe = ?`,
        [mintAddress, timeframe.name]
      );
      const errorCount = (currentProgress?.error_count || 0) + 1;
      
      await execute(
        `UPDATE ohlcv_backfill_progress 
         SET error_count = ?, last_error = ?
         WHERE mint_address = ? AND timeframe = ?`,
        [errorCount, error.message, mintAddress, timeframe.name]
      );
      saveDatabase();
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
    
    const data = await response.json();
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
   * Mark backfill as complete for a token/timeframe
   */
  private async markBackfillComplete(mintAddress: string, timeframe: string) {
    await execute(
      `UPDATE ohlcv_backfill_progress 
       SET backfill_complete = 1 
       WHERE mint_address = ? AND timeframe = ?`,
      [mintAddress, timeframe]
    );
    saveDatabase();
    
    console.log(`✅ [OHLCV] Backfill complete for ${mintAddress.slice(0, 8)}... ${timeframe}`);
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
  
  /**
   * Delay utility
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
