import fetch from 'cross-fetch';
import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
import { ConfigProvider } from '../providers/ConfigProvider.js';
import { poolActivityTracker } from './PoolActivityTracker.js';

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
  
  // State tracking for monitoring visibility
  private poolStates: Map<string, {
    state: 'backfilling' | 'realtime' | 'idle' | 'error';
    progress: number; // Percentage complete
    lastUpdate: number;
    timeframe: string;
  }> = new Map();
  
  // Deduplication cache (per pool+timeframe) - reserved for future use
  // private processedPools: Set<string> = new Set();
  
  // Timeframe configurations with smart intervals
  // Fetch different timeframes at different intervals for efficiency
  protected readonly TIMEFRAMES = [
    { name: '1m', api: 'minute', aggregate: 1, intervalMs: 60 * 1000 },      // Every 1 minute
    { name: '15m', api: 'minute', aggregate: 15, intervalMs: 15 * 60 * 1000 }, // Every 15 minutes
    { name: '1h', api: 'hour', aggregate: 1, intervalMs: 60 * 60 * 1000 },     // Every hour
    { name: '4h', api: 'hour', aggregate: 4, intervalMs: 4 * 60 * 60 * 1000 },  // Every 4 hours
    { name: '1d', api: 'day', aggregate: 1, intervalMs: 24 * 60 * 60 * 1000 }   // Every day
  ];
  
  // Rate limiting - Global rate limiter handles all pacing
  private readonly BACKFILL_INTERVAL = 15 * 60 * 1000; // Run backfill every 15 minutes
  private readonly REQUESTS_PER_MINUTE = 30; // GeckoTerminal limit (for display only)
  private readonly MAX_CANDLES_PER_REQUEST = 1000; // GeckoTerminal max
  private readonly CANDLE_BATCH_SIZE = 100; // Incremental checkpoint interval
  // NOTE: We process ALL tokens every cycle - global rate limiter queues and paces ALL requests automatically
  
  constructor() {
    console.log('📊 [OHLCV] Collector initialized (NOT auto-starting)');
    console.log(`📊 [OHLCV] Timeframes: ${this.TIMEFRAMES.map(t => t.name).join(', ')}`);
    console.log(`📊 [OHLCV] Rate limit: ${this.REQUESTS_PER_MINUTE} req/min`);
  }
  
  /**
   * Start the OHLCV backfilling process
   */
  async start() {
    if (this.isRunning) {
      console.log('📊 [OHLCV] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('📊 [OHLCV] Starting backfill collector...');
    
    // Save running state
    await ConfigProvider.set('ohlcv_collector_running', 'true');
    
    // Run immediately, then every 5 minutes
    this.runBackfillCycle();
    this.intervalId = setInterval(() => {
      this.runBackfillCycle();
    }, this.BACKFILL_INTERVAL);
  }
  
  /**
   * Stop the collector
   */
  async stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    
    // Save running state
    await ConfigProvider.set('ohlcv_collector_running', 'false');
    
    console.log('📊 [OHLCV] Collector stopped');
  }
  
  /**
   * Initialize collector on startup - restore previous running state
   */
  async initialize() {
    try {
      const wasRunning = await ConfigProvider.get('ohlcv_collector_running');
      
      if (wasRunning === 'true') {
        console.log('📊 [OHLCV] Restoring previous running state - auto-starting...');
        await this.start();
      } else {
        console.log('📊 [OHLCV] Previous state: stopped (not auto-starting)');
      }
    } catch (error) {
      console.error('📊 [OHLCV] Error restoring state:', error);
    }
  }
  
  /**
   * Main backfill cycle - processes tokens in priority order
   */
  protected async runBackfillCycle() {
    try {
      console.log('📊 [OHLCV] Starting backfill cycle...');
      
      // Get all tokens from token_registry (source of truth)
      const tokens = await queryAll<{ mint_address: string; creation_timestamp: number }>(
        `SELECT token_mint as mint_address, 
                COALESCE(first_seen_at, strftime('%s', 'now')) as creation_timestamp 
         FROM token_registry 
         ORDER BY first_seen_at DESC`
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
   * @param forceRun - If true, bypass isRunning check (for testing)
   */
  async processToken(mintAddress: string, creationTimestamp: number, forceRun = false) {
    try {
      console.log(`📊 [OHLCV] Processing token ${mintAddress.slice(0, 8)}...`);
      
      // Step 1: Ensure we have pool addresses (may return multiple)
      const pools = await this.ensurePoolAddresses(mintAddress);
      if (pools.length === 0) {
        console.log(`📊 [OHLCV] No pools found for ${mintAddress.slice(0, 8)}...`);
        return;
      }
      
      console.log(`📊 [OHLCV] Found ${pools.length} pool(s) for ${mintAddress.slice(0, 8)}..., processing timeframes`);

      // Step 2: Process each pool (INCLUDING pre-migration pump.fun AND post-migration Raydium)
      // This ensures we capture the complete trading history:
      // - Pre-migration: Pump.fun bonding curve data
      // - Post-migration: Raydium DEX data
      // Frontend will merge these chronologically with migration marker at launchpad_completed_at
      for (const pool of pools) {
        if (!forceRun && !this.isRunning) return;
        
        console.log(`📊 [OHLCV] Processing pool ${pool.pool_address.slice(0, 8)}... (${pool.dex || 'unknown'})`);
        
        // Step 3: Process each timeframe for this pool
        for (const timeframe of this.TIMEFRAMES) {
          if (!forceRun && !this.isRunning) return;
          
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
   * Enhanced with deduplication guarantees
   */
  private async ensurePoolAddresses(mintAddress: string): Promise<Array<{
    pool_address: string;
    dex: string | null;
    volume_24h_usd: number | null;
    is_primary: number;
  }>> {
    // First, use the enhanced pool search to find ALL pools
    const poolsFound = await poolActivityTracker.trackPoolsForToken(mintAddress);
    
    if (poolsFound > 0) {
      console.log(`✅ [OHLCV] Found and tracked ${poolsFound} pools via search endpoint`);
    }
    
    // Check if we already have pools (DEDUPLICATION CHECK)
    const existing = await queryAll<{ 
      pool_address: string;
      dex: string | null;
      volume_24h_usd: number | null;
      is_primary: number;
    }>(
      `SELECT pool_address, dex_id as dex, 0 as volume_24h_usd, 0 as is_primary 
       FROM pool_info 
       WHERE token_mint = ?
       ORDER BY pool_created_at DESC`,
      [mintAddress]
    );
    
    if (existing.length > 0) {
      console.log(`♻️  [Dedup] Using ${existing.length} cached pool(s) for ${mintAddress.slice(0, 8)}...`);
      return existing;
    }
    
    // Check if token has a migrated_pool_address (from pump.fun graduation)
    const tokenInfo = await queryOne<{ 
      migrated_pool_address: string | null;
      graduated_at: number | null;
    }>(
      `SELECT migrated_pool_address, graduated_at FROM token_registry WHERE token_mint = ?`,
      [mintAddress]
    );
    
    const migratedPoolAddress = tokenInfo?.migrated_pool_address;
    const migrationTimestamp = tokenInfo?.graduated_at;
    
    if (migratedPoolAddress) {
      console.log(`🎓 [OHLCV] Token ${mintAddress.slice(0, 8)}... migrated to Raydium: ${migratedPoolAddress.slice(0, 8)}... at ${migrationTimestamp ? new Date(migrationTimestamp * 1000).toISOString() : 'unknown'}`);
    }
    
    // Fetch ALL pools from GeckoTerminal using global rate limiter
    try {
      const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
        const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}?include=top_pools`;
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
      
      // Sort pools by preference (for marking which is "primary" for display)
      // NOTE: We still collect OHLCV data from ALL pools to ensure complete history
      // Primary pool priority:
      // 1. Migrated pool (PumpSwap/Raydium for graduated tokens)
      // 2. Other PumpSwap/Raydium pools
      // 3. Highest volume pools
      pools.sort((a, b) => {
        // Highest priority: migrated pool address (post-graduation trading)
        if (migratedPoolAddress) {
          if (a.pool_address === migratedPoolAddress) return -1;
          if (b.pool_address === migratedPoolAddress) return 1;
        }
        // Then prefer PumpSwap/Raydium DEX
        const aPriority = (a.dex === 'pumpswap' || a.dex === 'raydium') ? 1 : 0;
        const bPriority = (b.dex === 'pumpswap' || b.dex === 'raydium') ? 1 : 0;
        if (aPriority !== bPriority) return bPriority - aPriority;
        // Finally by volume (most active pool)
        return b.volume_24h_usd - a.volume_24h_usd;
      });
      
      // Store all pools, mark first as primary (ENHANCED DEDUPLICATION)
      for (let i = 0; i < pools.length; i++) {
        const pool = pools[i];
        const isPrimary = i === 0 ? 1 : 0;
        
        // Pre-check to avoid overwriting existing pool data (DEDUPLICATION GUARANTEE)
        const existingPool = await queryOne<{ pool_address: string }>(
          `SELECT pool_address FROM pool_info WHERE token_mint = ? AND pool_address = ?`,
          [mintAddress, pool.pool_address]
        );
        
        if (existingPool) {
          // Pool exists - UPDATE metadata only (preserve pool_created_at)
          await execute(
            `UPDATE pool_info 
             SET dex_id = ?, last_updated = ?
             WHERE token_mint = ? AND pool_address = ?`,
            [pool.dex, Date.now(), mintAddress, pool.pool_address]
          );
          console.log(`♻️  [Dedup] Updated pool ${pool.pool_address.slice(0, 8)}... metadata`);
        } else {
          // New pool - INSERT
          await execute(
            `INSERT OR REPLACE INTO pool_info 
             (pool_address, token_mint, name, base_token_address, base_token_symbol, quote_token_address, quote_token_symbol, dex_id, is_primary, pool_created_at, last_updated) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [pool.pool_address, mintAddress, `${pool.dex} Pool`, null, null, null, null, pool.dex, isPrimary, Date.now(), Date.now()]
          );
          console.log(`✅ [New] Inserted pool ${pool.pool_address.slice(0, 8)}...`);
        }
      }
      saveDatabase();
      
      // If we have a migrated pool but it wasn't found in GeckoTerminal results, add it manually
      if (migratedPoolAddress && !pools.some(p => p.pool_address === migratedPoolAddress)) {
        console.log(`⚠️ [OHLCV] Migrated pool ${migratedPoolAddress.slice(0, 8)}... not found in GeckoTerminal, adding manually`);
        
        // Check if already exists in database
        const existingMigrated = await queryOne<{ pool_address: string }>(
          `SELECT pool_address FROM pool_info WHERE token_mint = ? AND pool_address = ?`,
          [mintAddress, migratedPoolAddress]
        );
        
        if (!existingMigrated) {
          await execute(
            `INSERT OR REPLACE INTO pool_info 
             (pool_address, token_mint, name, base_token_address, base_token_symbol, quote_token_address, quote_token_symbol, dex_id, is_primary, pool_created_at, last_updated) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [migratedPoolAddress, mintAddress, 'Raydium Pool', null, null, null, null, 'raydium', 1, Date.now(), Date.now()]
          );
          console.log(`✅ [OHLCV] Manually added migrated pool ${migratedPoolAddress.slice(0, 8)}...`);
          saveDatabase();
        }
        
        // Add to pools array at front (as primary)
        pools.unshift({
          pool_address: migratedPoolAddress,
          dex: 'raydium',
          volume_24h_usd: 0,
          liquidity_usd: 0,
          price_usd: 0
        });
      }
      
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
   * Enhanced with incremental checkpointing and state tracking
   */
  private async backfillTimeframe(
    mintAddress: string,
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    creationTimestamp: number
  ) {
    const stateKey = `${poolAddress}_${timeframe.name}`;
    
    try {
      // Update state: backfilling
      this.poolStates.set(stateKey, {
        state: 'backfilling',
        progress: 0,
        lastUpdate: Date.now(),
        timeframe: timeframe.name
      });
      // Get progress (per-pool tracking) - DEDUPLICATION CHECK
      const progress = await queryOne<{
        oldest_timestamp: number | null;
        newest_timestamp: number | null;
        backfill_complete: number;
      }>(
        `SELECT oldest_timestamp, newest_timestamp, backfill_complete 
         FROM ohlcv_backfill_progress 
         WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      
      // If backfill complete, switch to real-time mode
      if (progress?.backfill_complete) {
        this.poolStates.set(stateKey, {
          state: 'realtime',
          progress: 100,
          lastUpdate: Date.now(),
          timeframe: timeframe.name
        });
        await this.fetchLatestCandles(mintAddress, poolAddress, timeframe, progress.newest_timestamp || 0);
        return;
      }
      
      // Determine fetch target
      const creationUnix = Math.floor(creationTimestamp / 1000);
      const nowUnix = Math.floor(Date.now() / 1000);
      
      // Convert timeframe to seconds (1m=60, 15m=900, 1h=3600, 4h=14400)
      const timeframeSeconds = timeframe.aggregate * (timeframe.name.includes('m') ? 60 : 3600);
      
      let targetTimestamp: number;
      
      if (!progress?.oldest_timestamp) {
        // FIRST FETCH: Get the oldest data possible
        // Add small buffer after creation to ensure we get data
        targetTimestamp = creationUnix + (timeframeSeconds * 10); // 10 candles after creation
        console.log(`🎯 [OHLCV] Initial fetch - getting oldest data first`);
      } else if (progress.newest_timestamp && progress.newest_timestamp < nowUnix - timeframeSeconds) {
        // SUBSEQUENT FETCHES: Work forward from what we have
        // Fetch data after our newest timestamp to fill the gap
        targetTimestamp = progress.newest_timestamp + (timeframeSeconds * 1000); // Jump forward
        console.log(`⏩ [OHLCV] Working forward - filling gap from ${progress.newest_timestamp} to now`);
      } else {
        // We're caught up, switch to real-time mode
        console.log(`✅ [OHLCV] Caught up to present - switching to real-time`);
        await this.markBackfillComplete(poolAddress, timeframe.name);
        return;
      }
      
      // Fetch OHLCV data
      console.log(`🔍 [OHLCV] Fetching ${mintAddress.slice(0, 8)}... ${timeframe.name}: before timestamp ${targetTimestamp} (${new Date(targetTimestamp * 1000).toISOString()})`);
      
      const candles = await this.fetchOHLCV(
        poolAddress,
        timeframe,
        targetTimestamp
      );
      
      console.log(`📊 [OHLCV] Received ${candles.length} candles for ${mintAddress.slice(0, 8)}... ${timeframe.name}`);
      
      if (candles.length === 0) {
        console.log(`📊 [OHLCV] No data for ${mintAddress.slice(0, 8)}... ${timeframe.name}`);
        // If we already have some data and now get 0 candles, we've reached the limit of available data
        if (progress?.oldest_timestamp) {
          console.log(`✅ [OHLCV] Marking backfill complete - no more historical data available`);
          await this.markBackfillComplete(poolAddress, timeframe.name);
        }
        return;
      }
      
      // ENHANCED: Store candles with incremental checkpointing
      let stored = 0;
      let duplicates = 0;
      
      // Process in batches for incremental checkpoints
      for (let i = 0; i < candles.length; i += this.CANDLE_BATCH_SIZE) {
        const batch = candles.slice(i, Math.min(i + this.CANDLE_BATCH_SIZE, candles.length));
        
        // Store batch with deduplication
        for (const candle of batch) {
          try {
            const result = await execute(
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
            // Check if row was inserted (changes > 0 means new row)
            if ((result as any)?.changes > 0) {
              stored++;
            } else {
              duplicates++;
            }
          } catch (e) {
            duplicates++; // Count duplicates for reporting
          }
        }
        
        // INCREMENTAL CHECKPOINT: Save progress after each batch
        if (stored > 0) {
          const batchTimestamps = batch.map(c => c.timestamp);
          const batchOldest = Math.min(...batchTimestamps);
          const batchNewest = Math.max(...batchTimestamps);
          
          await this.updateProgress(poolAddress, timeframe.name, mintAddress, {
            oldest: progress?.oldest_timestamp ? Math.min(progress.oldest_timestamp, batchOldest) : batchOldest,
            newest: progress?.newest_timestamp ? Math.max(progress.newest_timestamp, batchNewest) : batchNewest,
            complete: false
          });
          
          saveDatabase();
          
          // Update state progress
          const progressPct = Math.floor(((i + batch.length) / candles.length) * 100);
          this.poolStates.set(stateKey, {
            state: 'backfilling',
            progress: progressPct,
            lastUpdate: Date.now(),
            timeframe: timeframe.name
          });
          
          console.log(`💾 [Checkpoint] ${poolAddress.slice(0, 8)}... ${timeframe.name}: Batch ${Math.floor(i / this.CANDLE_BATCH_SIZE) + 1} saved (${stored} stored, ${duplicates} duplicates)`);
        }
      }
      
      if (duplicates > 0) {
        console.log(`♻️  [Dedup] Skipped ${duplicates} duplicate candles for ${poolAddress.slice(0, 8)}... ${timeframe.name}`);
      }
      
      // Final progress update
      const timestamps = candles.map(c => c.timestamp);
      const oldestFetched = Math.min(...timestamps);
      const newestFetched = Math.max(...timestamps);
      
      // Mark complete if: 1) reached token creation, OR 2) not making progress (same oldest timestamp)
      const notMakingProgress = !!(progress?.oldest_timestamp && oldestFetched >= progress.oldest_timestamp);
      const isComplete = oldestFetched <= creationUnix || notMakingProgress;
      
      if (notMakingProgress) {
        console.log(`✅ [OHLCV] No more historical data - oldest timestamp unchanged (${oldestFetched})`);
      }
      
      // Update final progress with completion status
      await this.updateProgress(poolAddress, timeframe.name, mintAddress, {
        oldest: progress?.oldest_timestamp ? Math.min(progress.oldest_timestamp, oldestFetched) : oldestFetched,
        newest: progress?.newest_timestamp ? Math.max(progress.newest_timestamp, newestFetched) : newestFetched,
        complete: isComplete
      });
      saveDatabase();
      
      // Update state
      if (isComplete) {
        this.poolStates.set(stateKey, {
          state: 'realtime',
          progress: 100,
          lastUpdate: Date.now(),
          timeframe: timeframe.name
        });
      }
      
      console.log(`✅ [OHLCV] ${poolAddress.slice(0, 8)}... ${timeframe.name}: ${stored} candles stored, ${duplicates} duplicates (${isComplete ? 'COMPLETE' : 'continuing'})`);
      
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error backfilling ${poolAddress.slice(0, 8)}... ${timeframe.name}:`, error.message);
      
      // Get current progress to determine error state
      const errorProgress = await queryOne<{ oldest_timestamp: number | null }>(
        `SELECT oldest_timestamp FROM ohlcv_backfill_progress WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      
      // Update error state (PRESERVE CHECKPOINT!)
      this.poolStates.set(stateKey, {
        state: 'error',
        progress: errorProgress?.oldest_timestamp ? 50 : 0,
        lastUpdate: Date.now(),
        timeframe: timeframe.name
      });
      
      // Track error WITHOUT destroying progress
      const currentProgress = await queryOne<{ error_count: number }>(
        `SELECT error_count FROM ohlcv_backfill_progress WHERE pool_address = ? AND timeframe = ?`,
        [poolAddress, timeframe.name]
      );
      const errorCount = (currentProgress?.error_count || 0) + 1;
      
      await execute(
        `UPDATE ohlcv_backfill_progress 
         SET error_count = ?, last_error = ?, last_fetch_at = ?
         WHERE pool_address = ? AND timeframe = ?`,
        [errorCount, error.message, Date.now(), poolAddress, timeframe.name]
      );
      saveDatabase();
      
      console.log(`💾 [Error] Checkpoint preserved for ${poolAddress.slice(0, 8)}... ${timeframe.name}`);
    }
  }
  
  /**
   * Helper: Update progress with UPSERT logic (deduplication safe)
   */
  private async updateProgress(
    poolAddress: string,
    timeframe: string,
    mintAddress: string,
    data: { oldest: number; newest: number; complete: boolean }
  ): Promise<void> {
    // Check if progress exists (DEDUPLICATION CHECK)
    const existing = await queryOne<{ id: number; fetch_count: number }>(
      `SELECT id, fetch_count FROM ohlcv_backfill_progress WHERE pool_address = ? AND timeframe = ?`,
      [poolAddress, timeframe]
    );
    
    if (existing) {
      // UPDATE existing progress (preserve fetch_count)
      await execute(
        `UPDATE ohlcv_backfill_progress 
         SET oldest_timestamp = ?, newest_timestamp = ?, backfill_complete = ?, last_fetch_at = ?, fetch_count = ?
         WHERE pool_address = ? AND timeframe = ?`,
        [data.oldest, data.newest, data.complete ? 1 : 0, Date.now(), existing.fetch_count + 1, poolAddress, timeframe]
      );
    } else {
      // INSERT new progress
      await execute(
        `INSERT INTO ohlcv_backfill_progress 
         (mint_address, pool_address, timeframe, oldest_timestamp, newest_timestamp, backfill_complete, last_fetch_at, fetch_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [mintAddress, poolAddress, timeframe, data.oldest, data.newest, data.complete ? 1 : 0, Date.now(), 1]
      );
    }
  }
  
  /**
   * Fetch latest candles for a completed token (real-time updates)
   */
  protected async fetchLatestCandles(
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
      
      const fullUrl = `${url}?${params}`;
      console.log(`🌐 [OHLCV] Requesting: ${fullUrl}`);
      
      const response = await fetch(fullUrl, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    });
    const ohlcvArray = data?.data?.attributes?.ohlcv_list;
    
    if (!ohlcvArray || !Array.isArray(ohlcvArray)) {
      console.log(`⚠️ [OHLCV] No OHLCV data in response for ${poolAddress.slice(0, 8)}...`);
      return [];
    }
    
    console.log(`📊 [OHLCV] GeckoTerminal returned ${ohlcvArray.length} candles for ${poolAddress.slice(0, 8)}...`);
    
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
   * Get monitoring state for a pool+timeframe
   */
  getPoolState(poolAddress: string, timeframe: string): {
    state: 'backfilling' | 'realtime' | 'idle' | 'error';
    progress: number;
    lastUpdate: number;
    timeframe: string;
  } | null {
    const stateKey = `${poolAddress}_${timeframe}`;
    return this.poolStates.get(stateKey) || null;
  }
  
  /**
   * Get all pool states
   */
  getAllPoolStates(): Map<string, {
    state: 'backfilling' | 'realtime' | 'idle' | 'error';
    progress: number;
    lastUpdate: number;
    timeframe: string;
  }> {
    return this.poolStates;
  }
  
  /**
   * Get collector status with deduplication stats
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
      
      // Get deduplication stats
      const dedupStats = await queryOne<any>(`
        SELECT 
          COUNT(*) as total_pools,
          COUNT(CASE WHEN last_updated IS NOT NULL THEN 1 END) as verified_pools
        FROM pool_info
      `);
      
      return {
        isRunning: this.isRunning,
        backfillInterval: this.BACKFILL_INTERVAL,
        ...stats,
        ...progress,
        ...dedupStats,
        activeStates: this.poolStates.size,
        stateBreakdown: {
          backfilling: Array.from(this.poolStates.values()).filter(s => s.state === 'backfilling').length,
          realtime: Array.from(this.poolStates.values()).filter(s => s.state === 'realtime').length,
          error: Array.from(this.poolStates.values()).filter(s => s.state === 'error').length,
          idle: Array.from(this.poolStates.values()).filter(s => s.state === 'idle').length
        }
      };
    } catch (error) {
      return {
        isRunning: this.isRunning,
        backfillInterval: this.BACKFILL_INTERVAL
      };
    }
  }
}
