import fetch from 'cross-fetch';
import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
import { OHLCVCollector } from './OHLCVCollector.js';

/**
 * Activity-Based OHLCV Collector
 * 
 * Smart collector that prioritizes active pools for real-time updates
 * Uses /pools/multi endpoint to check activity efficiently (30 pools per call)
 * Then fetches OHLCV data based on activity tiers
 * 
 * Tiers:
 * - REALTIME: User-toggled tokens → Every 1 minute
 * - HOT: Volume > $10k/15m → Every 2 minutes
 * - ACTIVE: Volume > $1k/h → Every 5 minutes
 * - NORMAL: Any activity/24h → Every 15 minutes
 * - DORMANT: No activity → Daily check
 */
export class ActivityBasedOHLCVCollector extends OHLCVCollector {
  private activityCheckInterval: NodeJS.Timeout | null = null;
  private realtimeUpdateInterval: NodeJS.Timeout | null = null;
  private poolDiscoveryInterval: NodeJS.Timeout | null = null;
  
  // Update tier configurations (in milliseconds)
  private readonly UPDATE_TIERS = {
    REALTIME: 60 * 1000,      // 1 minute (user-toggled)
    HOT: 2 * 60 * 1000,        // 2 minutes (very active)
    ACTIVE: 5 * 60 * 1000,     // 5 minutes (moderately active)
    NORMAL: 15 * 60 * 1000,    // 15 minutes (low activity)
    DORMANT: 24 * 60 * 60 * 1000  // 24 hours (no activity)
  };
  
  // Activity thresholds
  private readonly ACTIVITY_THRESHOLDS = {
    HOT_VOLUME_15M: 10000,     // $10k volume in 15 minutes
    HOT_TXNS_15M: 50,          // 50 transactions in 15 minutes
    ACTIVE_VOLUME_1H: 1000,    // $1k volume in 1 hour
    ACTIVE_TXNS_1H: 10,        // 10 transactions in 1 hour
    DORMANT_DAYS: 7            // No activity for 7 days = dormant
  };
  
  constructor() {
    super();
    console.log('🚀 [OHLCV] Activity-Based Collector initialized');
    console.log('🚀 [OHLCV] Update tiers:', Object.entries(this.UPDATE_TIERS).map(
      ([tier, ms]) => `${tier}: ${ms / 1000}s`
    ).join(', '));
  }
  
  /**
   * Start the enhanced collector with activity-based updates
   */
  async start() {
    await super.start(); // Start base collector for backfilling
    
    console.log('🚀 [OHLCV] Starting activity-based updates...');
    
    // Discover missing pools on startup
    await this.discoverMissingPools();
    
    // Continue discovering missing pools every 5 minutes
    this.poolDiscoveryInterval = setInterval(() => {
      this.discoverMissingPools();
    }, 5 * 60 * 1000); // Run every 5 minutes to gradually process all 488 tokens
    
    // Check pool activity every minute
    this.checkPoolActivity();
    this.activityCheckInterval = setInterval(() => {
      this.checkPoolActivity();
    }, 60 * 1000);
    
    // Process real-time tier every minute
    this.processRealtimeTier();
    this.realtimeUpdateInterval = setInterval(() => {
      this.processRealtimeTier();
    }, 60 * 1000);
  }
  
  /**
   * Discover pools for tokens that don't have any pools yet
   */
  private async discoverMissingPools() {
    try {
      console.log('🔍 [OHLCV] Discovering pools for tokens without pools...');
      
      // Get tokens that have no pools - increased limit to process more tokens
      const tokensWithoutPools = await queryAll<{ mint_address: string }>(
        `SELECT DISTINCT r.token_mint as mint_address 
         FROM token_registry r
         WHERE NOT EXISTS (
           SELECT 1 FROM token_pools p 
           WHERE p.mint_address = r.token_mint
         )
         ORDER BY r.first_seen_at DESC
         LIMIT 100`  // Process 100 tokens per batch instead of 20
      );
      
      if (tokensWithoutPools.length === 0) {
        console.log('✅ [OHLCV] All tokens have pools');
        return;
      }
      
      console.log(`🔍 [OHLCV] Fetching pools for ${tokensWithoutPools.length} tokens...`);
      
      for (const token of tokensWithoutPools) {
        try {
          // Use parent class processToken to discover and store pools
          const tokenCreationTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // Default to 30 days ago
          await this.processToken(token.mint_address, tokenCreationTime);
          
          // Small delay to avoid rate limiting
          await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error: any) {
          console.error(`❌ [OHLCV] Error fetching pools for ${token.mint_address.slice(0, 8)}...:`, error.message);
        }
      }
      
      console.log('✅ [OHLCV] Pool discovery complete');
    } catch (error: any) {
      console.error('❌ [OHLCV] Error discovering pools:', error);
    }
  }
  
  /**
   * Stop the enhanced collector
   */
  async stop() {
    await super.stop();
    
    if (this.activityCheckInterval) {
      clearInterval(this.activityCheckInterval);
      this.activityCheckInterval = null;
    }
    
    if (this.realtimeUpdateInterval) {
      clearInterval(this.realtimeUpdateInterval);
      this.realtimeUpdateInterval = null;
    }
    
    if (this.poolDiscoveryInterval) {
      clearInterval(this.poolDiscoveryInterval);
      this.poolDiscoveryInterval = null;
    }
    
    console.log('🚀 [OHLCV] Activity-based collector stopped');
  }
  
  /**
   * Check pool activity using batch /pools/multi endpoint
   * Updates activity tiers for efficient OHLCV fetching
   */
  private async checkPoolActivity() {
    try {
      console.log('🔍 [OHLCV] Checking pool activity...');
      
      // Get pools that need activity check
      const pools = await queryAll<{
        pool_address: string;
        mint_address: string;
        last_activity_check: number | null;
      }>(
        `SELECT DISTINCT p.pool_address, p.mint_address, p.last_activity_check
         FROM token_pools p
         WHERE p.last_activity_check IS NULL 
            OR p.last_activity_check < strftime('%s', 'now') * 1000 - 300000  -- 5 minutes in ms
         ORDER BY p.last_activity_check ASC NULLS FIRST
         LIMIT 300`  // Process up to 300 pools (10 API calls)
      );
      
      if (pools.length === 0) {
        console.log('🔍 [OHLCV] No pools need activity check');
        return;
      }
      
      console.log(`🔍 [OHLCV] Checking activity for ${pools.length} pools...`);
      
      // Process in batches of 30 (API limit)
      for (let i = 0; i < pools.length; i += 30) {
        const batch = pools.slice(i, Math.min(i + 30, pools.length));
        const poolAddresses = batch.map(p => p.pool_address);
        
        try {
          await this.fetchAndUpdatePoolActivity(poolAddresses);
        } catch (error: any) {
          console.error(`❌ [OHLCV] Error checking batch ${i / 30 + 1}:`, error.message);
        }
      }
      
      console.log('✅ [OHLCV] Pool activity check complete');
    } catch (error: any) {
      console.error('❌ [OHLCV] Error in activity check:', error);
    }
  }
  
  /**
   * Fetch activity data for multiple pools and update their tiers
   */
  private async fetchAndUpdatePoolActivity(poolAddresses: string[]): Promise<void> {
    const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
      const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/multi/${poolAddresses.join(',')}`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      return await response.json();
    }, 'pools/multi');
    
    if (!data?.data || !Array.isArray(data.data)) {
      return;
    }
    
    const now = Date.now();
    
    // Process each pool's activity data
    for (const poolData of data.data) {
      const poolAddress = poolData.attributes?.address;
      if (!poolAddress) continue;
      
      const attrs = poolData.attributes;
      
      // Extract activity metrics
      const volume15m = parseFloat(attrs.volume_usd?.m15 || '0');
      const volume1h = parseFloat(attrs.volume_usd?.h1 || '0');
      const volume24h = parseFloat(attrs.volume_usd?.h24 || '0');
      
      const txns15m = (attrs.transactions?.m15?.buys || 0) + (attrs.transactions?.m15?.sells || 0);
      const txns1h = (attrs.transactions?.h1?.buys || 0) + (attrs.transactions?.h1?.sells || 0);
      const txns24h = (attrs.transactions?.h24?.buys || 0) + (attrs.transactions?.h24?.sells || 0);
      
      // Determine activity tier
      let tier = 'DORMANT';
      let nextUpdateMs = this.UPDATE_TIERS.DORMANT;
      
      // Check if user has enabled real-time for this token
      const tokenSettings = await queryOne<{ ohlcv_realtime_enabled: number }>(
        `SELECT ohlcv_realtime_enabled FROM token_mints WHERE mint_address = ?`,
        [poolData.id?.split('_')[1] || '']
      );
      
      if (tokenSettings?.ohlcv_realtime_enabled === 1) {
        tier = 'REALTIME';
        nextUpdateMs = this.UPDATE_TIERS.REALTIME;
      } else if (volume15m >= this.ACTIVITY_THRESHOLDS.HOT_VOLUME_15M || 
                 txns15m >= this.ACTIVITY_THRESHOLDS.HOT_TXNS_15M) {
        tier = 'HOT';
        nextUpdateMs = this.UPDATE_TIERS.HOT;
      } else if (volume1h >= this.ACTIVITY_THRESHOLDS.ACTIVE_VOLUME_1H || 
                 txns1h >= this.ACTIVITY_THRESHOLDS.ACTIVE_TXNS_1H) {
        tier = 'ACTIVE';
        nextUpdateMs = this.UPDATE_TIERS.ACTIVE;
      } else if (volume24h > 0 || txns24h > 0) {
        tier = 'NORMAL';
        nextUpdateMs = this.UPDATE_TIERS.NORMAL;
      }
      
      // Update pool activity data
      await execute(
        `UPDATE token_pools 
         SET activity_tier = ?, 
             last_activity_volume_15m = ?, 
             last_activity_volume_1h = ?,
             last_activity_txns_15m = ?,
             last_activity_check = ?,
             next_update_at = ?
         WHERE pool_address = ?`,
        [tier, volume15m, volume1h, txns15m, now, now + nextUpdateMs, poolAddress]
      );
      
      // Also ensure pool exists in backfill progress (for compatibility)
      await execute(
        `INSERT OR IGNORE INTO ohlcv_backfill_progress 
         (pool_address, mint_address, timeframe, backfill_complete, oldest_timestamp, newest_timestamp)
         VALUES (?, ?, '15m', 0, 0, 0)`,
        [poolAddress, poolData.id?.split('_')[1] || '']
      );
      
      // Update or insert into schedule table
      await execute(
        `INSERT OR REPLACE INTO ohlcv_update_schedule 
         (pool_address, mint_address, update_tier, last_activity_volume, 
          last_activity_txns, next_update)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          poolAddress,
          poolData.id?.split('_')[1] || '',
          tier,
          volume1h,
          txns1h,
          now + nextUpdateMs
        ]
      );
      
      console.log(`📊 [Activity] Pool ${poolAddress.slice(0, 8)}...: ${tier} (vol15m: $${volume15m.toFixed(0)}, txns15m: ${txns15m})`);
    }
    
    saveDatabase();
  }
  
  /**
   * Process pools in REALTIME tier (user-toggled tokens)
   */
  private async processRealtimeTier() {
    try {
      const now = Date.now();
      
      // Get pools due for real-time update
      const realtimePools = await queryAll<{
        pool_address: string;
        mint_address: string;
      }>(
        `SELECT s.pool_address, s.mint_address
         FROM ohlcv_update_schedule s
         WHERE s.update_tier = 'REALTIME'
           AND s.next_update <= ?
         ORDER BY s.next_update ASC
         LIMIT 10`,
        [now]
      );
      
      if (realtimePools.length === 0) {
        return;
      }
      
      console.log(`⚡ [OHLCV] Processing ${realtimePools.length} REALTIME pools...`);
      
      // Update OHLCV for each real-time pool
      for (const pool of realtimePools) {
        await this.updatePoolOHLCV(pool.pool_address, pool.mint_address);
        
        // Update next scheduled time
        await execute(
          `UPDATE ohlcv_update_schedule 
           SET last_update = ?, next_update = ?
           WHERE pool_address = ?`,
          [now, now + this.UPDATE_TIERS.REALTIME, pool.pool_address]
        );
      }
      
      saveDatabase();
    } catch (error: any) {
      console.error('❌ [OHLCV] Error processing realtime tier:', error);
    }
  }
  
  /**
   * Process pools based on their activity tiers
   */
  async runBackfillCycle() {
    try {
      const startTime = Date.now();
      console.log('📊 [OHLCV] Starting activity-based cycle...');
      
      // First, run normal backfill for incomplete pools
      await this.processBackfillQueue();
      
      // Then, update pools based on activity tiers
      await this.processTieredUpdates();
      
      const elapsed = Date.now() - startTime;
      console.log(`📊 [OHLCV] Activity cycle complete in ${elapsed}ms`);
    } catch (error: any) {
      console.error('❌ [OHLCV] Error in activity cycle:', error);
    }
  }
  
  /**
   * Process backfill for pools that haven't completed initial sync
   */
  private async processBackfillQueue() {
    const incompletePools = await queryAll<{
      mint_address: string;
      pool_address: string;
      creation_timestamp: number;
    }>(
      `SELECT DISTINCT p.mint_address, p.pool_address, t.timestamp as creation_timestamp
       FROM token_pools p
       INNER JOIN token_mints t ON p.mint_address = t.mint_address
       LEFT JOIN ohlcv_backfill_progress bp 
         ON p.pool_address = bp.pool_address AND bp.timeframe = '15m'
       WHERE bp.backfill_complete IS NULL OR bp.backfill_complete = 0
       ORDER BY t.timestamp DESC
       LIMIT 20`  // Process 20 pools per cycle for backfill
    );
    
    if (incompletePools.length > 0) {
      console.log(`📊 [OHLCV] Backfilling ${incompletePools.length} incomplete pools...`);
      
      for (const pool of incompletePools) {
        await this.processToken(pool.mint_address, pool.creation_timestamp);
      }
    }
  }
  
  /**
   * Process pools based on their activity tiers
   */
  private async processTieredUpdates() {
    const now = Date.now();
    
    // Get pools due for update (excluding REALTIME which has its own processor)
    const duePools = await queryAll<{
      pool_address: string;
      mint_address: string;
      update_tier: string;
    }>(
      `SELECT pool_address, mint_address, update_tier
       FROM ohlcv_update_schedule
       WHERE next_update <= ?
         AND update_tier != 'REALTIME'
       ORDER BY 
         CASE update_tier
           WHEN 'HOT' THEN 1
           WHEN 'ACTIVE' THEN 2
           WHEN 'NORMAL' THEN 3
           WHEN 'DORMANT' THEN 4
           ELSE 5
         END,
         next_update ASC
       LIMIT 50`,
      [now]
    );
    
    if (duePools.length === 0) {
      return;
    }
    
    console.log(`📊 [OHLCV] Processing ${duePools.length} pools by tier...`);
    
    // Group by tier for logging
    const tierCounts: Record<string, number> = {};
    for (const pool of duePools) {
      tierCounts[pool.update_tier] = (tierCounts[pool.update_tier] || 0) + 1;
    }
    console.log(`📊 [OHLCV] Tier breakdown:`, tierCounts);
    
    // Process each pool
    for (const pool of duePools) {
      await this.updatePoolOHLCV(pool.pool_address, pool.mint_address);
      
      // Update next scheduled time based on tier
      const nextUpdateMs = this.UPDATE_TIERS[pool.update_tier as keyof typeof this.UPDATE_TIERS] 
                          || this.UPDATE_TIERS.NORMAL;
      
      await execute(
        `UPDATE ohlcv_update_schedule 
         SET last_update = ?, next_update = ?
         WHERE pool_address = ?`,
        [now, now + nextUpdateMs, pool.pool_address]
      );
    }
    
    saveDatabase();
  }
  
  /**
   * Update OHLCV data for a specific pool
   */
  private async updatePoolOHLCV(poolAddress: string, mintAddress: string) {
    try {
      // Get the newest timestamp we have for each timeframe
      const timeframes = ['1m', '15m', '1h', '4h', '1d'];
      
      for (const timeframe of timeframes) {
        const progress = await queryOne<{ newest_timestamp: number }>(
          `SELECT newest_timestamp 
           FROM ohlcv_backfill_progress 
           WHERE pool_address = ? AND timeframe = ?`,
          [poolAddress, timeframe]
        );
        
        if (progress?.newest_timestamp) {
          // Fetch new candles since our last update
          await this.fetchLatestCandles(
            mintAddress,
            poolAddress,
            this.TIMEFRAMES.find(t => t.name === timeframe)!,
            progress.newest_timestamp
          );
        }
      }
    } catch (error: any) {
      console.error(`❌ [OHLCV] Error updating pool ${poolAddress.slice(0, 8)}...:`, error.message);
    }
  }
  
  /**
   * Get enhanced status with activity tier breakdown
   */
  async getStatus() {
    const baseStatus = await super.getStatus();
    
    try {
      // Get tier distribution
      const tierStats = await queryAll<{
        update_tier: string;
        count: number;
        avg_volume: number;
        avg_txns: number;
      }>(
        `SELECT 
          update_tier,
          COUNT(*) as count,
          AVG(last_activity_volume) as avg_volume,
          AVG(last_activity_txns) as avg_txns
         FROM ohlcv_update_schedule
         GROUP BY update_tier`
      );
      
      // Get real-time enabled tokens
      const realtimeCount = await queryOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM token_mints WHERE ohlcv_realtime_enabled = 1`
      );
      
      return {
        ...baseStatus,
        activityTiers: tierStats,
        realtimeTokens: realtimeCount?.count || 0,
        updateIntervals: this.UPDATE_TIERS
      };
    } catch (error) {
      return baseStatus;
    }
  }
}

// Export singleton instance
export const activityBasedOHLCVCollector = new ActivityBasedOHLCVCollector();
