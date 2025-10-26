import { queryOne, queryAll } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';

/**
 * OHLCV Metrics Calculator
 * 
 * Calculates token market cap metrics from internal OHLCV data:
 * - starting_mcap: Price at first candle × total supply (from DB)
 * - ath_mcap: Highest price across all candles × total supply (from DB)
 * - current_mcap: Latest candle close price × total supply (from DB)
 * 
 * Uses total_supply from database (fetched by MarketDataTracker from GeckoTerminal)
 * Provides accurate, internally-sourced price metrics without additional API calls
 */
export class OHLCVMetricsCalculator {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 60 * 1000; // Update every 1 minute
  
  constructor() {
    console.log('📈 [Metrics] Calculator initialized (NOT auto-starting)');
  }
  
  /**
   * Start the metrics calculator
   */
  start() {
    if (this.isRunning) {
      console.log('📈 [Metrics] Already running');
      return;
    }
    
    this.isRunning = true;
    console.log('📈 [Metrics] Starting metrics calculator...');
    
    // Run immediately, then every minute
    this.calculateAllMetrics();
    this.intervalId = setInterval(() => {
      this.calculateAllMetrics();
    }, this.UPDATE_INTERVAL);
  }
  
  /**
   * Stop the calculator
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📈 [Metrics] Calculator stopped');
  }
  
  /**
   * Calculate metrics for all tokens that have OHLCV data
   */
  private async calculateAllMetrics() {
    try {
      // Get all tokens that have OHLCV data
      const tokensWithData = await queryAll<{ mint_address: string; platform: string }>(`
        SELECT DISTINCT tr.token_mint as mint_address, 'pumpfun' as platform
        FROM token_registry tr
        INNER JOIN ohlcv_data od ON tr.token_mint = od.mint_address
      `);
      
      if (tokensWithData.length === 0) {
        console.log('📈 [Metrics] No tokens with OHLCV data to process');
        return;
      }
      
      console.log(`📈 [Metrics] Calculating metrics for ${tokensWithData.length} tokens...`);
      
      let updated = 0;
      for (const token of tokensWithData) {
        const metrics = await this.calculateTokenMetrics(token.mint_address);
        
        if (metrics) {
          // Market cap metrics calculated but not stored to database
          // This data is now handled by TokenPriceOracle and stored in token_market_data
          updated++;
        }
      }
      
      if (updated > 0) {
        saveDatabase();
        console.log(`📈 [Metrics] Updated ${updated}/${tokensWithData.length} tokens`);
      }
    } catch (error: any) {
      console.error('📈 [Metrics] Error calculating metrics:', error.message);
    }
  }
  
  /**
   * Calculate metrics for a single token from OHLCV data
   */
  private async calculateTokenMetrics(mintAddress: string): Promise<{
    starting_mcap: number;
    ath_mcap: number;
    current_mcap: number;
  } | null> {
    try {
      // Get oldest candle (launch price) - use 1m timeframe for accuracy
      const oldestCandle = await queryOne<{ open: number; timestamp: number }>(`
        SELECT open, timestamp
        FROM ohlcv_data
        WHERE mint_address = ? AND timeframe = '1m'
        ORDER BY timestamp ASC
        LIMIT 1
      `, [mintAddress]);
      
      // Get highest price across all candles
      const athData = await queryOne<{ max_high: number }>(`
        SELECT MAX(high) as max_high
        FROM ohlcv_data
        WHERE mint_address = ? AND timeframe = '1m'
      `, [mintAddress]);
      
      // Get latest candle (current price)
      const latestCandle = await queryOne<{ close: number; timestamp: number }>(`
        SELECT close, timestamp
        FROM ohlcv_data
        WHERE mint_address = ? AND timeframe = '1m'
        ORDER BY timestamp DESC
        LIMIT 1
      `, [mintAddress]);
      
      if (!oldestCandle || !athData || !latestCandle) {
        return null;
      }
      
      // Fetch total supply from database (provided by GeckoTerminal)
      const tokenData = await queryOne<{ total_supply: string | null }>(`
        SELECT total_supply
        FROM gecko_token_latest
        WHERE mint_address = ?
      `, [mintAddress]);
      
      // Default to 1B if not available (Pump.fun standard)
      const totalSupply = tokenData?.total_supply ? parseFloat(tokenData.total_supply) : 1_000_000_000;
      
      const starting_mcap = oldestCandle.open * totalSupply;
      const ath_mcap = athData.max_high * totalSupply;
      const current_mcap = latestCandle.close * totalSupply;
      
      return {
        starting_mcap,
        ath_mcap,
        current_mcap
      };
    } catch (error: any) {
      console.error(`📈 [Metrics] Error calculating for ${mintAddress.slice(0, 8)}...:`, error.message);
      return null;
    }
  }
  
  /**
   * Get calculator status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      updateInterval: this.UPDATE_INTERVAL
    };
  }
}
