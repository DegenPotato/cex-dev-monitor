import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { TokenMetadataFetcher } from './TokenMetadataFetcher.js';
import { solPriceOracle } from './SolPriceOracle.js';

/**
 * Market Data Tracker using GeckoTerminal API
 * - Polls every 30 minutes (slow to avoid competing with OHLCV collector)
 * - Fetches graduation data, prices, and metadata
 * - Batch support: 30 tokens per request
 * - Uses global rate limiter to coordinate with OHLCV collector
 */
export class MarketDataTracker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly POLL_INTERVAL = 30 * 60 * 1000; // 30 minutes (was 1 minute - too aggressive)
  private metadataFetcher: TokenMetadataFetcher;

  constructor() {
    this.metadataFetcher = new TokenMetadataFetcher();
  }

  /**
   * Detect migrated pool for a graduated token (PumpSwap or Raydium)
   */
  private async detectRaydiumPool(mintAddress: string): Promise<string | null> {
    try {
      const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${mintAddress}?include=top_pools`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const relationships = data?.data?.relationships;
      const included = data?.included || [];
      
      const topPoolData = relationships?.top_pools?.data;
      if (!topPoolData || topPoolData.length === 0) {
        return null;
      }
      
      // Find PumpSwap pool first (new standard), fallback to Raydium (legacy)
      for (const poolRef of topPoolData) {
        const poolId = poolRef.id; // Format: "solana_POOL_ADDRESS"
        if (!poolId) continue;
        
        const poolAddress = poolId.replace('solana_', '');
        const poolDetails = included.find((item: any) => item.id === poolId);
        const dexId = poolDetails?.attributes?.dex_id;
        
        // Return first PumpSwap or Raydium pool found
        if (dexId === 'pumpswap' || dexId === 'raydium') {
          console.log(`🔄 [MarketData] Found ${dexId} pool: ${poolAddress.slice(0, 8)}...`);
          return poolAddress;
        }
      }
      
      return null;
    } catch (error) {
      console.error(`❌ [MarketData] Error detecting migrated pool for ${mintAddress.slice(0, 8)}...:`, error);
      return null;
    }
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
    console.log('📊 [MarketData] Starting tracker via GeckoTerminal API (30 min interval)');
    
    // Run immediately, then poll every 30 minutes
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
      
      // Get current SOL price from oracle
      const SOL_PRICE_USD = solPriceOracle.getPrice();
      
      // Update each token with fetched data
      for (const token of tokens) {
        const data = marketDataMap.get(token.mint_address);
        
        if (data) {
          // Market Cap = Price × Total Supply (FDV)
          const marketCap = data.fdvUsd || null;
          
          const priceUsd = data.priceUsd || null;
          const priceSol = priceUsd ? priceUsd / SOL_PRICE_USD : null;
          
          // Parse launchpad completed timestamp
          let completedAt = null;
          if (data.launchpadCompletedAt) {
            try {
              completedAt = new Date(data.launchpadCompletedAt).getTime();
            } catch (e) {
              // Invalid date, keep null
            }
          }
          
          const updates: any = {
            current_mcap: marketCap,
            price_usd: priceUsd,
            price_sol: priceSol,
            graduation_percentage: data.launchpadGraduationPercentage || null,
            launchpad_completed: data.launchpadCompleted ? 1 : 0,
            launchpad_completed_at: completedAt,
            last_updated: Date.now()
          };

          // Update name/symbol if missing
          if (data.name && !token.name) {
            updates.name = data.name;
          }
          if (data.symbol && !token.symbol) {
            updates.symbol = data.symbol;
          }

          // If token just graduated, detect and store the migrated pool address (PumpSwap/Raydium)
          if (data.launchpadCompleted && !token.migrated_pool_address) {
            const migratedPool = await this.detectRaydiumPool(token.mint_address);
            if (migratedPool) {
              updates.migrated_pool_address = migratedPool;
              console.log(`🎓 [MarketData] Token ${token.mint_address.slice(0, 8)}... graduated! Migrated pool: ${migratedPool.slice(0, 8)}...`);
            }
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
