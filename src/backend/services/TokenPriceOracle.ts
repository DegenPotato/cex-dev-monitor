/**
 * Token Price Oracle Service
 * Fetches real-time token prices from GeckoTerminal using batch endpoint
 * Stores prices in token_market_data table for dashboard/portfolio use
 */

import { queryAll, queryOne, execute } from '../database/helpers.js';
import { apiProviderTracker } from './ApiProviderTracker.js';

interface TokenPrice {
  mintAddress: string;
  symbol: string;
  name: string;
  priceUsd: number;
  priceSol: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
  lastUpdated: number;
  
  // Additional fields from comprehensive data
  imageUrl?: string;
  totalSupply?: string;
  normalizedTotalSupply?: string;
  totalReserveUsd?: number;
  
  // Launchpad details
  launchpadCompleted?: boolean;
  launchpadGraduationPercentage?: number;
  launchpadCompletedAt?: string;
  launchpadMigratedPoolAddress?: string;
  
  // Price changes for multiple timeframes
  priceChange6h?: number;
  priceChange1h?: number;
  priceChange30m?: number;
  priceChange15m?: number;
  priceChange5m?: number;
  
  // Top pool info
  topPoolAddress?: string;
  poolData?: PoolData;
}

interface PoolData {
  address: string;
  name: string;
  dexId: string;
  baseTokenAddress: string;
  quoteTokenAddress: string;
  poolCreatedAt: string;
  reserveInUsd: number;
  
  // Transaction metrics
  transactions: {
    h24: { buys: number; sells: number; buyers: number; sellers: number };
    h6: { buys: number; sells: number; buyers: number; sellers: number };
    h1: { buys: number; sells: number; buyers: number; sellers: number };
    m30: { buys: number; sells: number; buyers: number; sellers: number };
    m15: { buys: number; sells: number; buyers: number; sellers: number };
    m5: { buys: number; sells: number; buyers: number; sellers: number };
  };
  
  // Volume by timeframe
  volume: {
    h24: number;
    h6: number;
    h1: number;
    m30: number;
    m15: number;
    m5: number;
  };
  
  // Price changes
  priceChanges: {
    h24: number;
    h6: number;
    h1: number;
    m30: number;
    m15: number;
    m5: number;
  };
}

interface GeckoTerminalToken {
  id: string;
  type: string;
  attributes: {
    address: string;
    symbol: string;
    name: string;
    decimals?: number;
    image_url?: string;
    coingecko_coin_id?: string | null;
    total_supply?: string;
    normalized_total_supply?: string;
    price_usd: string;
    fdv_usd?: string;
    total_reserve_in_usd?: string;
    volume_usd?: {
      h24?: string;
      h6?: string;
      h1?: string;
      m30?: string;
      m15?: string;
      m5?: string;
    };
    market_cap_usd?: string | null;
    price_change?: {
      h24?: string;
      h6?: string;
      h1?: string;
      m30?: string;
      m15?: string;
      m5?: string;
    };
    launchpad_details?: {
      graduation_percentage?: number;
      completed?: boolean;
      completed_at?: string;
      migrated_destination_pool_address?: string;
    };
  };
}

export class TokenPriceOracle {
  private static instance: TokenPriceOracle;
  
  private readonly GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
  private readonly BATCH_SIZE = 30; // GeckoTerminal max is 30 tokens per request
  private readonly UPDATE_INTERVAL = 60000; // Update every 60 seconds
  private readonly CACHE_DURATION = 30000; // Cache prices for 30 seconds
  
  private priceCache: Map<string, TokenPrice> = new Map();
  private updateInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  private solPrice: number = 150; // Fallback SOL price
  private wsClients: Set<any> = new Set(); // WebSocket clients for broadcasting

  private constructor() {}

  static getInstance(): TokenPriceOracle {
    if (!TokenPriceOracle.instance) {
      TokenPriceOracle.instance = new TokenPriceOracle();
    }
    return TokenPriceOracle.instance;
  }

  /**
   * Start the oracle with automatic updates
   */
  async start(solPrice?: number) {
    if (this.isRunning) return;
    
    this.isRunning = true;
    if (solPrice) this.solPrice = solPrice;
    
    console.log('🪙 [Token Oracle] Starting with batch updates every 60s');
    
    // Initial fetch of all known tokens
    await this.updateAllTokenPrices();
    
    // Schedule regular updates
    this.updateInterval = setInterval(() => {
      this.updateAllTokenPrices();
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Stop the oracle
   */
  stop() {
    this.isRunning = false;
    
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }
    
    console.log('🪙 [Token Oracle] Stopped');
  }

  /**
   * Register a WebSocket client for price updates
   */
  registerClient(ws: any) {
    this.wsClients.add(ws);
    console.log(`🪙 [Token Oracle] Client registered. Total clients: ${this.wsClients.size}`);
  }

  /**
   * Unregister a WebSocket client
   */
  unregisterClient(ws: any) {
    this.wsClients.delete(ws);
    console.log(`🪙 [Token Oracle] Client unregistered. Total clients: ${this.wsClients.size}`);
  }

  /**
   * Broadcast price updates to all connected clients
   */
  private broadcastPriceUpdate(prices: Map<string, TokenPrice>) {
    if (this.wsClients.size === 0) return;

    const priceArray = Array.from(prices.values());
    const message = JSON.stringify({
      type: 'token_prices_update',
      data: priceArray,
      timestamp: Date.now()
    });

    this.wsClients.forEach(ws => {
      try {
        if (ws.readyState === 1) { // WebSocket.OPEN
          ws.send(message);
        }
      } catch (error) {
        console.error('🪙 [Token Oracle] Error broadcasting to client:', error);
      }
    });
  }

  /**
   * Get price for a single token (from cache or fetch if needed)
   */
  async getTokenPrice(mintAddress: string): Promise<TokenPrice | null> {
    // Check cache first
    const cached = this.priceCache.get(mintAddress);
    if (cached && Date.now() - cached.lastUpdated < this.CACHE_DURATION) {
      return cached;
    }

    // Fetch fresh price
    await this.fetchTokenPrices([mintAddress]);
    return this.priceCache.get(mintAddress) || null;
  }

  /**
   * Get prices for multiple tokens
   */
  async getTokenPrices(mintAddresses: string[]): Promise<Map<string, TokenPrice>> {
    const result = new Map<string, TokenPrice>();
    const toFetch: string[] = [];
    
    // Check cache first
    for (const address of mintAddresses) {
      const cached = this.priceCache.get(address);
      if (cached && Date.now() - cached.lastUpdated < this.CACHE_DURATION) {
        result.set(address, cached);
      } else {
        toFetch.push(address);
      }
    }
    
    // Fetch missing prices
    if (toFetch.length > 0) {
      await this.fetchTokenPrices(toFetch);
      for (const address of toFetch) {
        const price = this.priceCache.get(address);
        if (price) result.set(address, price);
      }
    }
    
    return result;
  }

  /**
   * Fetch token prices from GeckoTerminal in batches
   */
  private async fetchTokenPrices(mintAddresses: string[]): Promise<void> {
    if (mintAddresses.length === 0) return;
    
    // Split into batches of 30 (GeckoTerminal limit)
    const batches: string[][] = [];
    for (let i = 0; i < mintAddresses.length; i += this.BATCH_SIZE) {
      batches.push(mintAddresses.slice(i, i + this.BATCH_SIZE));
    }
    
    for (const batch of batches) {
      await this.fetchBatch(batch);
    }
  }

  /**
   * Fetch a single batch of token prices
   */
  private async fetchBatch(addresses: string[]): Promise<void> {
    const startTime = Date.now();
    
    try {
      const addressString = addresses.join(',');
      const url = `${this.GECKOTERMINAL_API}/networks/solana/tokens/multi/${addressString}`;
      
      const response = await fetch(url, {
        headers: { 'Accept': 'application/json' }
      });

      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        apiProviderTracker.trackCall('GeckoTerminal', '/tokens/multi', false, responseTime, response.status);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      apiProviderTracker.trackCall('GeckoTerminal', '/tokens/multi', true, responseTime, 200);
      
      // Process token data
      if (data.data && Array.isArray(data.data)) {
        for (const token of data.data as GeckoTerminalToken[]) {
          const price = this.parseTokenData(token);
          if (price) {
            this.priceCache.set(price.mintAddress, price);
            await this.saveToDatabase(price);
          }
        }
      }
      
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      apiProviderTracker.trackCall('GeckoTerminal', '/tokens/multi', false, responseTime, undefined, error.message);
      console.error('🪙 [Token Oracle] Error fetching batch:', error.message);
    }
  }

  /**
   * Parse GeckoTerminal token data
   */
  private parseTokenData(token: GeckoTerminalToken): TokenPrice | null {
    try {
      const attrs = token.attributes;
      
      return {
        mintAddress: attrs.address,
        symbol: attrs.symbol || 'UNKNOWN',
        name: attrs.name || 'Unknown Token',
        priceUsd: parseFloat(attrs.price_usd) || 0,
        priceSol: this.solPrice > 0 ? parseFloat(attrs.price_usd) / this.solPrice : 0,
        priceChange24h: attrs.price_change?.h24 ? parseFloat(attrs.price_change.h24) : 0,
        volume24h: attrs.volume_usd?.h24 ? parseFloat(attrs.volume_usd.h24) : 0,
        marketCap: attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : 0,
        fdv: attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : 0,
        liquidity: attrs.total_reserve_in_usd ? parseFloat(attrs.total_reserve_in_usd) : 0,
        lastUpdated: Date.now(),
        
        // Additional comprehensive data
        imageUrl: attrs.image_url,
        totalSupply: attrs.total_supply,
        normalizedTotalSupply: attrs.normalized_total_supply,
        totalReserveUsd: attrs.total_reserve_in_usd ? parseFloat(attrs.total_reserve_in_usd) : undefined,
        
        // Launchpad details
        launchpadCompleted: attrs.launchpad_details?.completed || false,
        launchpadGraduationPercentage: attrs.launchpad_details?.graduation_percentage,
        launchpadCompletedAt: attrs.launchpad_details?.completed_at,
        launchpadMigratedPoolAddress: attrs.launchpad_details?.migrated_destination_pool_address,
        
        // Extended price changes
        priceChange6h: attrs.price_change?.h6 ? parseFloat(attrs.price_change.h6) : undefined,
        priceChange1h: attrs.price_change?.h1 ? parseFloat(attrs.price_change.h1) : undefined,
        priceChange30m: attrs.price_change?.m30 ? parseFloat(attrs.price_change.m30) : undefined,
        priceChange15m: attrs.price_change?.m15 ? parseFloat(attrs.price_change.m15) : undefined,
        priceChange5m: attrs.price_change?.m5 ? parseFloat(attrs.price_change.m5) : undefined,
      };
    } catch (error) {
      console.error('🪙 [Token Oracle] Error parsing token data:', error);
      return null;
    }
  }

  /**
   * Save token price to database
   * Now only saves to gecko_token_data - token_market_data is a VIEW that auto-populates
   */
  private async saveToDatabase(price: TokenPrice): Promise<void> {
    try {
      // Save comprehensive data to gecko_token_data (source of truth)
      // token_market_data is now a VIEW that automatically pulls from this
      await this.saveComprehensiveData(price);
      
    } catch (error) {
      console.error('🪙 [Token Oracle] Error saving to database:', error);
    }
  }
  
  /**
   * Save comprehensive token and pool data
   * Now uses INSERT OR REPLACE to maintain single row per token
   */
  private async saveComprehensiveData(price: TokenPrice): Promise<void> {
    try {
      // Update ATH if current price is higher
      const existing = await queryOne<{ ath_price_usd: number; ath_market_cap_usd: number }>(
        'SELECT ath_price_usd, ath_market_cap_usd FROM gecko_token_data WHERE mint_address = ?',
        [price.mintAddress]
      );
      
      const athPrice = Math.max(price.priceUsd || 0, existing?.ath_price_usd || 0);
      const athMcap = Math.max(price.marketCap || 0, existing?.ath_market_cap_usd || 0);
      
      // Save token data - INSERT OR REPLACE maintains single row per token
      await execute(`
        INSERT OR REPLACE INTO gecko_token_data (
          mint_address,
          symbol,
          name,
          decimals,
          image_url,
          total_supply,
          normalized_total_supply,
          price_usd,
          price_sol,
          fdv_usd,
          market_cap_usd,
          total_reserve_in_usd,
          volume_24h_usd,
          volume_6h_usd,
          volume_1h_usd,
          price_change_24h,
          price_change_6h,
          price_change_1h,
          price_change_30m,
          price_change_15m,
          price_change_5m,
          ath_price_usd,
          ath_market_cap_usd,
          launchpad_graduation_percentage,
          launchpad_completed,
          launchpad_completed_at,
          launchpad_migrated_pool_address,
          top_pool_address,
          raw_response,
          last_updated
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now')
        )
      `, [
        price.mintAddress,
        price.symbol,
        price.name,
        null, // decimals - not in TokenPrice interface yet
        price.imageUrl,
        price.totalSupply,
        price.normalizedTotalSupply,
        price.priceUsd,
        price.priceSol,
        price.fdv,
        price.marketCap,
        price.totalReserveUsd,
        price.volume24h,
        null, // volume_6h - need to add
        null, // volume_1h - need to add
        price.priceChange24h,
        price.priceChange6h,
        price.priceChange1h,
        price.priceChange30m,
        price.priceChange15m,
        price.priceChange5m,
        athPrice,  // Use calculated ATH price
        athMcap,   // Use calculated ATH market cap
        price.launchpadGraduationPercentage,
        price.launchpadCompleted ? 1 : 0,
        price.launchpadCompletedAt ? Math.floor(new Date(price.launchpadCompletedAt).getTime() / 1000) : null,
        price.launchpadMigratedPoolAddress,
        price.topPoolAddress,
        null, // raw_response - will add later
      ]);
      
      // Save pool data if available
      if (price.poolData) {
        await this.savePoolData(price.poolData);
      }
      
      // Create snapshot for historical tracking
      await this.createSnapshot(price);
      
    } catch (error) {
      console.error('🪙 [Token Oracle] Error saving comprehensive data:', error);
    }
  }
  
  /**
   * Save pool data to database
   */
  private async savePoolData(pool: PoolData): Promise<void> {
    try {
      await execute(`
        INSERT INTO gecko_pool_data (
          pool_address,
          name,
          base_token_address,
          quote_token_address,
          dex_id,
          pool_created_at,
          reserve_in_usd,
          price_change_24h,
          price_change_6h,
          price_change_1h,
          price_change_30m,
          price_change_15m,
          price_change_5m,
          txns_24h_buys,
          txns_24h_sells,
          txns_24h_buyers,
          txns_24h_sellers,
          txns_6h_buys,
          txns_6h_sells,
          txns_6h_buyers,
          txns_6h_sellers,
          txns_1h_buys,
          txns_1h_sells,
          txns_1h_buyers,
          txns_1h_sellers,
          txns_30m_buys,
          txns_30m_sells,
          txns_30m_buyers,
          txns_30m_sellers,
          txns_15m_buys,
          txns_15m_sells,
          txns_15m_buyers,
          txns_15m_sellers,
          txns_5m_buys,
          txns_5m_sells,
          txns_5m_buyers,
          txns_5m_sellers,
          volume_24h_usd,
          volume_6h_usd,
          volume_1h_usd,
          volume_30m_usd,
          volume_15m_usd,
          volume_5m_usd,
          fetched_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now')
        )
      `, [
        pool.address,
        pool.name,
        pool.baseTokenAddress,
        pool.quoteTokenAddress,
        pool.dexId,
        pool.poolCreatedAt ? Math.floor(new Date(pool.poolCreatedAt).getTime() / 1000) : null,
        pool.reserveInUsd,
        pool.priceChanges.h24,
        pool.priceChanges.h6,
        pool.priceChanges.h1,
        pool.priceChanges.m30,
        pool.priceChanges.m15,
        pool.priceChanges.m5,
        pool.transactions.h24.buys,
        pool.transactions.h24.sells,
        pool.transactions.h24.buyers,
        pool.transactions.h24.sellers,
        pool.transactions.h6.buys,
        pool.transactions.h6.sells,
        pool.transactions.h6.buyers,
        pool.transactions.h6.sellers,
        pool.transactions.h1.buys,
        pool.transactions.h1.sells,
        pool.transactions.h1.buyers,
        pool.transactions.h1.sellers,
        pool.transactions.m30.buys,
        pool.transactions.m30.sells,
        pool.transactions.m30.buyers,
        pool.transactions.m30.sellers,
        pool.transactions.m15.buys,
        pool.transactions.m15.sells,
        pool.transactions.m15.buyers,
        pool.transactions.m15.sellers,
        pool.transactions.m5.buys,
        pool.transactions.m5.sells,
        pool.transactions.m5.buyers,
        pool.transactions.m5.sellers,
        pool.volume.h24,
        pool.volume.h6,
        pool.volume.h1,
        pool.volume.m30,
        pool.volume.m15,
        pool.volume.m5
      ]);
    } catch (error) {
      console.error('🪙 [Token Oracle] Error saving pool data:', error);
    }
  }
  
  /**
   * Create historical snapshot
   */
  private async createSnapshot(price: TokenPrice): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      
      await execute(`
        INSERT OR IGNORE INTO gecko_token_snapshots (
          mint_address,
          price_usd,
          market_cap_usd,
          fdv_usd,
          volume_24h_usd,
          reserve_usd,
          txns_24h_buys,
          txns_24h_sells,
          unique_buyers_24h,
          unique_sellers_24h,
          price_change_24h,
          price_change_6h,
          price_change_1h,
          is_graduated,
          graduation_percentage,
          snapshot_timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        price.mintAddress,
        price.priceUsd,
        price.marketCap,
        price.fdv,
        price.volume24h,
        price.totalReserveUsd,
        price.poolData?.transactions.h24.buys || null,
        price.poolData?.transactions.h24.sells || null,
        price.poolData?.transactions.h24.buyers || null,
        price.poolData?.transactions.h24.sellers || null,
        price.priceChange24h,
        price.priceChange6h,
        price.priceChange1h,
        price.launchpadCompleted ? 1 : 0,
        price.launchpadGraduationPercentage,
        now
      ]);
    } catch (error) {
      // Snapshots are optional, don't log errors
    }
  }

  /**
   * Update all token prices in the database
   */
  private async updateAllTokenPrices(): Promise<void> {
    try {
      console.log('🪙 [Token Oracle] Updating all token prices...');
      const startTime = Date.now();
      
      // Get all unique token addresses from recent trades and holdings
      const tokens = await queryAll(`
        SELECT DISTINCT token_mint as address
        FROM (
          SELECT DISTINCT token_mint FROM wallet_token_holdings
          WHERE updated_at > strftime('%s', 'now', '-7 days')
          
          UNION
          
          SELECT DISTINCT token_mint FROM trading_transactions
          WHERE created_at > strftime('%s', 'now', '-7 days')
          
          UNION
          
          SELECT DISTINCT token_mint FROM token_registry
          WHERE first_seen_at > strftime('%s', 'now', '-7 days')
        )
        WHERE token_mint IS NOT NULL
        AND token_mint != ''
        AND token_mint != 'So11111111111111111111111111111111111111112'
        LIMIT 300
      `);
      
      if (tokens.length === 0) {
        console.log('🪙 [Token Oracle] No tokens to update');
        return;
      }
      
      const addresses = tokens.map((t: any) => t.address as string);
      console.log(`🪙 [Token Oracle] Fetching prices for ${addresses.length} tokens...`);
      
      await this.fetchTokenPrices(addresses);
      
      // Broadcast updates to WebSocket clients
      this.broadcastPriceUpdate(this.priceCache);
      
      const elapsed = Date.now() - startTime;
      console.log(`🪙 [Token Oracle] Updated ${addresses.length} token prices in ${elapsed}ms`);
      
    } catch (error) {
      console.error('🪙 [Token Oracle] Error updating all tokens:', error);
    }
  }

  /**
   * Get all cached prices
   */
  getAllPrices(): Map<string, TokenPrice> {
    return new Map(this.priceCache);
  }
  
  /**
   * Set SOL price for calculating price in SOL
   */
  setSolPrice(price: number) {
    this.solPrice = price;
  }
  
  /**
   * Get oracle status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.UPDATE_INTERVAL,
      cacheSize: this.priceCache.size,
      solPrice: this.solPrice,
      lastUpdate: this.priceCache.size > 0 
        ? Math.max(...Array.from(this.priceCache.values()).map(p => p.lastUpdated || 0))
        : 0
    };
  }
}

// Export singleton instance
export const tokenPriceOracle = TokenPriceOracle.getInstance();
