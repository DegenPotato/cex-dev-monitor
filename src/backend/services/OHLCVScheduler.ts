import { queryAll } from '../database/helpers.js';

/**
 * OHLCV Scheduler
 * Intelligently schedules OHLCV data fetches based on:
 * - Timeframe intervals
 * - Last update time
 * - Token priority (volume, age, activity)
 * - Rate limit budget
 */
export class OHLCVScheduler {
  private scheduleQueue: Map<string, {
    mintAddress: string;
    poolAddress: string;
    timeframe: string;
    priority: number;
    lastUpdate: number;
    nextUpdate: number;
  }> = new Map();

  /**
   * Get next batch of tokens to update based on priority and timing
   */
  async getNextBatch(maxItems: number = 10): Promise<Array<{
    mintAddress: string;
    poolAddress: string;
    timeframe: string;
  }>> {
    const now = Date.now();
    
    // Get all backfill progress to determine what needs updating
    const progress = await queryAll<{
      mint_address: string;
      pool_address: string;
      timeframe: string;
      last_fetch_at: number | null;
      backfill_complete: number;
      newest_timestamp: number | null;
    }>(`
      SELECT 
        mint_address,
        pool_address,
        timeframe,
        last_fetch_at,
        backfill_complete,
        newest_timestamp
      FROM ohlcv_backfill_progress
      ORDER BY 
        backfill_complete ASC,  -- Prioritize incomplete backfills
        last_fetch_at ASC        -- Then oldest updates
      LIMIT ?
    `, [maxItems * 5]); // Get more to filter

    // Get token priorities (based on volume, mentions, etc)
    const priorities = await this.getTokenPriorities();
    
    const batch: Array<{
      mintAddress: string;
      poolAddress: string;
      timeframe: string;
      score: number;
    }> = [];
    
    for (const item of progress) {
      const intervalMs = this.getIntervalForTimeframe(item.timeframe);
      const lastUpdate = item.last_fetch_at || 0;
      const timeSinceUpdate = now - lastUpdate;
      
      // Check if update is due
      if (timeSinceUpdate >= intervalMs || !item.backfill_complete) {
        const priority = priorities.get(item.mint_address) || 1;
        
        // Calculate priority score
        let score = 0;
        
        // Incomplete backfills get highest priority
        if (!item.backfill_complete) {
          score += 1000;
        }
        
        // Staleness factor (how overdue is the update)
        if (timeSinceUpdate > 0) {
          score += Math.min(100, (timeSinceUpdate / intervalMs) * 10);
        }
        
        // Token priority factor
        score += priority * 10;
        
        // Timeframe priority (1m > 15m > 1h > 4h > 1d)
        const timeframePriority = {
          '1m': 5,
          '15m': 4,
          '1h': 3,
          '4h': 2,
          '1d': 1
        }[item.timeframe] || 0;
        score += timeframePriority;
        
        batch.push({
          mintAddress: item.mint_address,
          poolAddress: item.pool_address,
          timeframe: item.timeframe,
          score
        });
      }
    }
    
    // Sort by score and return top items
    batch.sort((a, b) => b.score - a.score);
    
    return batch.slice(0, maxItems).map(item => ({
      mintAddress: item.mintAddress,
      poolAddress: item.poolAddress,
      timeframe: item.timeframe
    }));
  }
  
  /**
   * Get token priorities based on various factors
   */
  private async getTokenPriorities(): Promise<Map<string, number>> {
    const priorities = new Map<string, number>();
    
    // Get tokens with their metrics
    const tokens = await queryAll<{
      mint_address: string;
      telegram_mentions: number;
      current_mcap: number;
      timestamp: number;
    }>(`
      SELECT 
        token_mint as mint_address,
        telegram_mentions,
        0 as current_mcap,
        first_seen_at as timestamp
      FROM token_registry
    `);
    
    for (const token of tokens) {
      let priority = 1;
      
      // High telegram activity = higher priority
      if (token.telegram_mentions > 100) priority += 3;
      else if (token.telegram_mentions > 10) priority += 2;
      else if (token.telegram_mentions > 0) priority += 1;
      
      // High market cap = higher priority
      if (token.current_mcap > 10_000_000) priority += 3;
      else if (token.current_mcap > 1_000_000) priority += 2;
      else if (token.current_mcap > 100_000) priority += 1;
      
      // Newer tokens = higher priority (first 24 hours)
      const ageMs = Date.now() - token.timestamp;
      if (ageMs < 24 * 60 * 60 * 1000) priority += 2;
      else if (ageMs < 7 * 24 * 60 * 60 * 1000) priority += 1;
      
      priorities.set(token.mint_address, priority);
    }
    
    return priorities;
  }
  
  /**
   * Get the update interval for a timeframe
   */
  private getIntervalForTimeframe(timeframe: string): number {
    const intervals: Record<string, number> = {
      '1m': 60 * 1000,           // Every minute
      '15m': 5 * 60 * 1000,       // Every 5 minutes (more frequent than candle size)
      '1h': 15 * 60 * 1000,       // Every 15 minutes
      '4h': 60 * 60 * 1000,       // Every hour
      '1d': 4 * 60 * 60 * 1000   // Every 4 hours
    };
    
    return intervals[timeframe] || 60 * 1000;
  }
  
  /**
   * Mark a fetch as completed
   */
  async markCompleted(
    mintAddress: string,
    poolAddress: string,
    timeframe: string,
    success: boolean
  ) {
    const key = `${mintAddress}_${poolAddress}_${timeframe}`;
    
    if (success) {
      // Remove from queue if successful
      this.scheduleQueue.delete(key);
    } else {
      // Increase retry delay on failure
      const item = this.scheduleQueue.get(key);
      if (item) {
        item.nextUpdate = Date.now() + (60 * 1000); // Retry in 1 minute
        item.priority = Math.max(0, item.priority - 1); // Reduce priority
      }
    }
  }
  
  /**
   * Get scheduler statistics
   */
  getStats() {
    const now = Date.now();
    const overdueItems = Array.from(this.scheduleQueue.values())
      .filter(item => item.nextUpdate < now);
    
    return {
      queueSize: this.scheduleQueue.size,
      overdueCount: overdueItems.length,
      avgDelay: overdueItems.length > 0
        ? overdueItems.reduce((sum, item) => sum + (now - item.nextUpdate), 0) / overdueItems.length
        : 0
    };
  }
}

export const ohlcvScheduler = new OHLCVScheduler();
