import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { TokenMetadataFetcher } from './TokenMetadataFetcher.js';

/**
 * Market Data Tracker using GeckoTerminal API
 * - Polls every 1 minute
 * - Updates current_mcap and ath_mcap
 * - Batch support: 30 tokens per request
 */
export class MarketDataTracker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 60 * 1000; // 1 minute
  private metadataFetcher: TokenMetadataFetcher;

  constructor() {
    this.metadataFetcher = new TokenMetadataFetcher();
  }

  /**
   * Start polling for market data
   */
  start() {
    if (this.isRunning) {
      console.log('📊 [MarketData] Already running');
      return;
    }

    this.isRunning = true;
    console.log('📊 [MarketData] Starting tracker via GeckoTerminal API');
    
    // Run immediately, then poll every minute
    this.updateAllTokens();
    this.intervalId = setInterval(() => {
      this.updateAllTokens();
    }, this.POLL_INTERVAL);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 [MarketData] Tracker stopped');
  }

  /**
   * Update all tokens from database using GeckoTerminal batch API
   */
  private async updateAllTokens() {
    try {
      const tokens = await TokenMintProvider.findAll();
      
      if (tokens.length === 0) {
        console.log('📊 [MarketData] No tokens to update');
        return;
      }

      console.log(`📊 [MarketData] Updating ${tokens.length} tokens via GeckoTerminal...`);

      let updated = 0;
      let failed = 0;

      // Fetch all tokens using batch API
      const addresses = tokens.map(t => t.mint_address);
      const marketDataMap = await this.metadataFetcher.fetchMetadataBatch(addresses);
      
      // Update each token with fetched data
      for (const token of tokens) {
        const data = marketDataMap.get(token.mint_address);
        
        if (data) {
          const updates: any = {
            current_mcap: data.fdvUsd || null,
            last_updated: Date.now()
          };

          // Update starting mcap if not set
          if (!token.starting_mcap && updates.current_mcap) {
            updates.starting_mcap = updates.current_mcap;
          }

          // Update ATH if current is higher
          if (updates.current_mcap && (!token.ath_mcap || updates.current_mcap > token.ath_mcap)) {
            updates.ath_mcap = updates.current_mcap;
          }

          // Update name/symbol if missing
          if (data.name && !token.name) {
            updates.name = data.name;
          }
          if (data.symbol && !token.symbol) {
            updates.symbol = data.symbol;
          }

          await TokenMintProvider.update(token.mint_address, updates);
          updated++;
        } else {
          failed++;
        }
      }

      console.log(`📊 [MarketData] Update complete: ${updated} updated, ${failed} failed/not found`);
    } catch (error) {
      console.error('📊 [MarketData] Error in updateAllTokens:', error);
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.POLL_INTERVAL
    };
  }
}
