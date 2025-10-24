/**
 * OHLCV Data Collector V3 - Enhanced for PumpFun migrations
 * 
 * Key features:
 * - Fetches ALL pools (bonding curve + DEX)
 * - Handles PumpFun token migrations
 * - Properly tags pool types for chart stitching
 * - Fixed timestamp conversion
 * - Prioritizes all timeframes including 1m
 */

import { queryAll, queryOne, execute } from '../database/helpers.js';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';

interface Token {
  mint_address: string;
  timestamp: number; // Creation timestamp (in milliseconds)
  migrated_pool_address?: string | null;
  graduated_at?: number | null;
}

interface Pool {
  pool_address: string;
  dex: string;
  pool_type: 'bonding_curve' | 'dex' | 'unknown';
  volume_24h_usd: number;
  liquidity_usd: number;
}

interface Candle {
  timestamp: number; // Unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class OHLCVCollectorV3 {
  private readonly GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
  private readonly MAX_CANDLES = 1000;
  private readonly BATCH_SIZE = 100;
  private isRunning = false;
  
  // All timeframes with 1m first (priority)
  private readonly TIMEFRAMES = [
    { name: '1m', api: 'minute', aggregate: 1 },
    { name: '15m', api: 'minute', aggregate: 15 },
    { name: '1h', api: 'hour', aggregate: 1 },
    { name: '4h', api: 'hour', aggregate: 4 },
    { name: '1d', api: 'day', aggregate: 1 }
  ];

  async start() {
    if (this.isRunning) {
      console.log('📊 [OHLCV-V3] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('📊 [OHLCV-V3] Starting enhanced collector with PumpFun support...');
    
    // Run immediately, then every 15 minutes
    this.runCycle();
    setInterval(() => {
      if (this.isRunning) {
        this.runCycle();
      }
    }, 15 * 60 * 1000);
  }
  
  stop() {
    console.log('📊 [OHLCV-V3] Stopping...');
    this.isRunning = false;
  }
  
  private async runCycle() {
    console.log('\n📊 [OHLCV-V3] Starting collection cycle...');
    
    try {
      // Get tokens with migration info
      const tokens = await queryAll<Token>(`
        SELECT 
          r.token_mint as mint_address,
          r.first_seen_at * 1000 as timestamp,
          r.migrated_pool_address,
          r.graduated_at
        FROM token_registry r
        LEFT JOIN (
          SELECT mint_address, MIN(oldest_timestamp) as first_data
          FROM ohlcv_backfill_progress
          GROUP BY mint_address
        ) obp ON r.token_mint = obp.mint_address
        ORDER BY 
          CASE WHEN obp.first_data IS NULL THEN 0 ELSE 1 END,
          r.first_seen_at DESC
        LIMIT 30
      `);
      
      if (tokens.length === 0) {
        console.log('📊 [OHLCV-V3] No tokens to process');
        return;
      }
      
      console.log(`📊 [OHLCV-V3] Processing ${tokens.length} tokens...`);
      
      for (const token of tokens) {
        if (!this.isRunning) break;
        await this.processToken(token);
      }
      
      console.log('📊 [OHLCV-V3] Cycle complete\n');
      
    } catch (error) {
      console.error('❌ [OHLCV-V3] Cycle error:', error);
    }
  }
  
  private async processToken(token: Token) {
    const mintAddress = token.mint_address;
    console.log(`\n🪙 [OHLCV-V3] Processing ${mintAddress.slice(0, 8)}...`);
    
    // Check if this is a PumpFun token with migration
    const hasMigration = !!token.migrated_pool_address;
    if (hasMigration) {
      console.log(`  🎓 PumpFun token - migrated at ${token.graduated_at ? new Date(token.graduated_at * 1000).toISOString() : 'unknown'}`);
    }
    
    // Get ALL pools for this token
    const pools = await this.discoverAllPools(mintAddress, token.migrated_pool_address);
    
    if (pools.length === 0) {
      console.log(`  ⚠️ No pools found`);
      return;
    }
    
    console.log(`  ✅ Found ${pools.length} pool(s):`);
    pools.forEach(p => {
      console.log(`    - ${p.pool_address.slice(0, 8)}... (${p.dex}) [${p.pool_type}]`);
    });
    
    // Process each pool
    for (const pool of pools) {
      console.log(`\n  📊 Processing pool ${pool.pool_address.slice(0, 8)}... (${pool.pool_type})`);
      
      // Process all timeframes, starting with 1m
      for (const timeframe of this.TIMEFRAMES) {
        await this.collectTimeframe(
          mintAddress, 
          pool, 
          timeframe, 
          token.timestamp,
          token.graduated_at
        );
      }
    }
  }
  
  /**
   * Discover ALL pools including bonding curves and DEX pools
   */
  private async discoverAllPools(
    mintAddress: string, 
    migratedPoolAddress?: string | null
  ): Promise<Pool[]> {
    const pools: Pool[] = [];
    
    // 1. Check for cached pools
    const cached = await queryAll<{
      pool_address: string;
      dex: string;
      volume_24h_usd: number;
      liquidity_usd: number;
    }>(`
      SELECT pool_address, dex, volume_24h_usd, liquidity_usd
      FROM token_pools
      WHERE mint_address = ?
      ORDER BY is_primary DESC, volume_24h_usd DESC
    `, [mintAddress]);
    
    // Add cached pools with type detection
    for (const cachedPool of cached) {
      pools.push({
        pool_address: cachedPool.pool_address,
        dex: cachedPool.dex,
        pool_type: this.detectPoolType(cachedPool.dex, cachedPool.pool_address),
        volume_24h_usd: cachedPool.volume_24h_usd,
        liquidity_usd: cachedPool.liquidity_usd
      });
    }
    
    // 2. If we have a migrated pool address, ensure it's included
    if (migratedPoolAddress && !pools.some(p => p.pool_address === migratedPoolAddress)) {
      console.log(`  📌 Adding migrated Raydium pool: ${migratedPoolAddress.slice(0, 8)}...`);
      
      pools.push({
        pool_address: migratedPoolAddress,
        dex: 'raydium',
        pool_type: 'dex',
        volume_24h_usd: 0,
        liquidity_usd: 0
      });
      
      // Store it
      await execute(`
        INSERT OR REPLACE INTO token_pools
        (mint_address, pool_address, dex, volume_24h_usd, liquidity_usd, price_usd, is_primary, discovered_at, last_verified)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        mintAddress,
        migratedPoolAddress,
        'raydium',
        0,
        0,
        0,
        0, // Not primary, bonding curve is primary
        Date.now(),
        Date.now()
      ]);
    }
    
    // 3. Fetch from GeckoTerminal if we have no pools
    if (pools.length === 0) {
      try {
        const geckoData = await this.fetchPoolsFromGecko(mintAddress);
        
        for (const pool of geckoData) {
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
            0, // price_usd
            geckoData.indexOf(pool) === 0 ? 1 : 0, // First is primary
            Date.now(),
            Date.now()
          ]);
        }
      } catch (error: any) {
        console.log(`  ⚠️ GeckoTerminal fetch failed: ${error.message}`);
      }
    }
    
    return pools;
  }
  
  private detectPoolType(dex: string, poolAddress: string): 'bonding_curve' | 'dex' | 'unknown' {
    // PumpFun bonding curve pools are typically on pump.fun DEX
    if (dex === 'pump.fun' || dex === 'pumpfun') {
      return 'bonding_curve';
    }
    
    // Known DEXes
    if (['raydium', 'orca', 'meteora', 'jupiter'].includes(dex.toLowerCase())) {
      return 'dex';
    }
    
    // Check by address pattern (PumpFun bonding curves have specific patterns)
    // This is a heuristic - adjust based on actual patterns
    if (poolAddress.includes('pump') || poolAddress.includes('Pump')) {
      return 'bonding_curve';
    }
    
    return 'unknown';
  }
  
  private async fetchPoolsFromGecko(mintAddress: string): Promise<Pool[]> {
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
    const pools: Pool[] = [];
    
    for (const poolRef of topPools) {
      const poolId = poolRef.id;
      const poolAddress = poolId.replace('solana_', '');
      
      const poolDetails = included.find((item: any) => item.id === poolId);
      const attributes = poolDetails?.attributes || {};
      
      pools.push({
        pool_address: poolAddress,
        dex: attributes.dex_id || 'unknown',
        pool_type: this.detectPoolType(attributes.dex_id || 'unknown', poolAddress),
        volume_24h_usd: parseFloat(attributes.volume_usd?.h24 || '0'),
        liquidity_usd: parseFloat(attributes.reserve_in_usd || '0')
      });
    }
    
    return pools;
  }
  
  /**
   * Collect OHLCV data with migration timestamp tracking
   */
  private async collectTimeframe(
    mintAddress: string,
    pool: Pool,
    timeframe: typeof this.TIMEFRAMES[0],
    creationTimestampMs: number,
    migrationTimestampMs?: number | null
  ) {
    // Check progress
    const progress = await queryOne<{
      oldest_timestamp: number | null;
      newest_timestamp: number | null;
      backfill_complete: number;
    }>(`
      SELECT oldest_timestamp, newest_timestamp, backfill_complete
      FROM ohlcv_backfill_progress
      WHERE mint_address = ? AND pool_address = ? AND timeframe = ?
    `, [mintAddress, pool.pool_address, timeframe.name]);
    
    const nowUnix = Math.floor(Date.now() / 1000);
    const creationUnix = Math.floor(creationTimestampMs / 1000);
    const migrationUnix = migrationTimestampMs ? Math.floor(migrationTimestampMs / 1000) : null;
    
    let fetchMode: 'initial' | 'backfill' | 'update' | 'skip';
    let beforeTimestamp: number;
    
    if (!progress) {
      fetchMode = 'initial';
      beforeTimestamp = nowUnix;
    } else if (progress.backfill_complete) {
      fetchMode = 'update';
      beforeTimestamp = nowUnix;
    } else if (progress.oldest_timestamp && progress.oldest_timestamp > creationUnix) {
      fetchMode = 'backfill';
      beforeTimestamp = progress.oldest_timestamp;
    } else {
      fetchMode = 'skip';
      beforeTimestamp = 0;
    }
    
    if (fetchMode === 'skip') {
      return;
    }
    
    console.log(`    ${timeframe.name}: ${fetchMode} mode (${pool.pool_type})`);
    
    // Fetch candles
    const candles = await this.fetchCandles(
      pool.pool_address,
      timeframe,
      beforeTimestamp
    );
    
    if (candles.length === 0) {
      console.log(`      No data returned`);
      
      if (fetchMode === 'initial') {
        await this.updateProgress(
          mintAddress,
          pool.pool_address,
          timeframe.name,
          nowUnix,
          nowUnix,
          true,
          pool.pool_type,
          migrationUnix
        );
      }
      return;
    }
    
    console.log(`      Got ${candles.length} candles`);
    
    // Store candles with migration metadata
    let stored = 0;
    let duplicates = 0;
    
    for (let i = 0; i < candles.length; i += this.BATCH_SIZE) {
      const batch = candles.slice(i, i + this.BATCH_SIZE);
      
      for (const candle of batch) {
        try {
          // Determine if this candle is pre or post migration
          const isPostMigration = migrationUnix && candle.timestamp >= migrationUnix;
          
          await execute(`
            INSERT OR IGNORE INTO ohlcv_data
            (mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume, created_at, pool_type, is_post_migration)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
            Date.now(),
            pool.pool_type,
            isPostMigration ? 1 : 0
          ]);
          stored++;
        } catch {
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
      
      const newOldest = progress?.oldest_timestamp 
        ? Math.min(progress.oldest_timestamp, oldestFetched)
        : oldestFetched;
      const newNewest = progress?.newest_timestamp
        ? Math.max(progress.newest_timestamp, newestFetched)
        : newestFetched;
      
      const isComplete = newOldest <= creationUnix || candles.length < this.MAX_CANDLES;
      
      await this.updateProgress(
        mintAddress,
        pool.pool_address,
        timeframe.name,
        newOldest,
        newNewest,
        isComplete,
        pool.pool_type,
        migrationUnix
      );
    }
  }
  
  /**
   * Fetch candles with proper timestamp conversion
   */
  private async fetchCandles(
    poolAddress: string,
    timeframe: typeof this.TIMEFRAMES[0],
    beforeTimestamp: number
  ): Promise<Candle[]> {
    try {
      const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
        const url = `${this.GECKOTERMINAL_BASE}/networks/solana/pools/${poolAddress}/ohlcv/${timeframe.api}`;
        const params = new URLSearchParams({
          aggregate: timeframe.aggregate.toString(),
          before_timestamp: beforeTimestamp.toString(),
          limit: this.MAX_CANDLES.toString(),
          currency: 'usd'
        });
        
        const fullUrl = `${url}?${params}`;
        console.log(`      🌐 Fetching: ${fullUrl.substring(0, 100)}...`);
        
        const response = await fetch(fullUrl, {
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
      
      // Check timestamp format
      const firstTimestamp = ohlcvList[0][0];
      const isMilliseconds = firstTimestamp > 1000000000000;
      
      if (isMilliseconds) {
        console.log(`      ⏰ Converting milliseconds to seconds`);
      }
      
      return ohlcvList
        .map((candle: number[]) => ({
          timestamp: isMilliseconds ? Math.floor(candle[0] / 1000) : candle[0],
          open: candle[1],
          high: candle[2],
          low: candle[3],
          close: candle[4],
          volume: candle[5]
        }))
        .filter((candle: Candle) => 
          // Filter out invalid candles
          candle.timestamp > 0 &&
          candle.open > 0 &&
          candle.high > 0 &&
          candle.low > 0 &&
          candle.close > 0 &&
          !isNaN(candle.open) &&
          !isNaN(candle.high) &&
          !isNaN(candle.low) &&
          !isNaN(candle.close) &&
          candle.high >= candle.low &&
          candle.high >= candle.open &&
          candle.high >= candle.close &&
          candle.low <= candle.open &&
          candle.low <= candle.close
        );
      
    } catch (error: any) {
      console.log(`      ⚠️ Fetch error: ${error.message}`);
      return [];
    }
  }
  
  private async updateProgress(
    mintAddress: string,
    poolAddress: string,
    timeframe: string,
    oldestTimestamp: number,
    newestTimestamp: number,
    complete: boolean,
    poolType: string,
    migrationTimestamp?: number | null
  ) {
    await execute(`
      INSERT OR REPLACE INTO ohlcv_backfill_progress
      (mint_address, pool_address, timeframe, oldest_timestamp, newest_timestamp, backfill_complete, last_fetch_at, pool_type, migration_timestamp)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      mintAddress,
      poolAddress,
      timeframe,
      oldestTimestamp,
      newestTimestamp,
      complete ? 1 : 0,
      Date.now(),
      poolType,
      migrationTimestamp
    ]);
  }
}

export const ohlcvCollectorV3 = new OHLCVCollectorV3();
