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
  decimals?: number;
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
  coingeckoCoinId?: string;
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
      const url = `${this.GECKOTERMINAL_API}/networks/solana/tokens/multi/${addressString}?include=top_pools&include_composition=true`;
      
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
      
      // Build a map of pools from the included data
      const poolMap = new Map();
      if (data.included && Array.isArray(data.included)) {
        for (const pool of data.included) {
          if (pool.type === 'pool') {
            poolMap.set(pool.id, pool);
          }
        }
      }
      
      // Process token data with associated pools
      if (data.data && Array.isArray(data.data)) {
        for (const token of data.data as any) {
          // Get the top pools for this token
          const topPools = [];
          if (token.relationships?.top_pools?.data) {
            for (const poolRef of token.relationships.top_pools.data) {
              const poolData = poolMap.get(poolRef.id);
              if (poolData) {
                topPools.push(poolData);
              }
            }
          }
          
          const price = this.parseTokenData(token, topPools);
          if (price) {
            this.priceCache.set(price.mintAddress, price);
            await this.saveToDatabase(price);
            
            // Save pool data separately
            for (const pool of topPools) {
              await this.savePoolData(pool);
            }
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
   * Parse GeckoTerminal token data with pool information
   */
  private parseTokenData(token: GeckoTerminalToken, topPools: any[] = []): TokenPrice | null {
    try {
      const attrs = token.attributes;
      
      // Get the primary pool address if available
      const primaryPool = topPools[0];
      const topPoolAddress = primaryPool ? primaryPool.attributes?.address : 
                            attrs.launchpad_details?.migrated_destination_pool_address;
      
      return {
        mintAddress: attrs.address,
        symbol: attrs.symbol || 'UNKNOWN',
        name: attrs.name || 'Unknown Token',
        decimals: attrs.decimals,
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
        coingeckoCoinId: attrs.coingecko_coin_id || undefined,
        
        // Pool reference
        topPoolAddress,
        
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
        
        // Add raw pool data for comprehensive storage
        poolData: primaryPool ? primaryPool.attributes : undefined
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
          coingecko_coin_id,
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
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now')
        )
      `, [
        price.mintAddress,
        price.symbol,
        price.name,
        price.decimals || null,
        price.imageUrl,
        price.coingeckoCoinId || null,
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
   * Save pool data from GeckoTerminal response
   */
  private async savePoolData(pool: any): Promise<void> {
    try {
      const attrs = pool.attributes;
      if (!attrs) return;
      
      // Extract base/quote token IDs from relationships
      const baseTokenId = pool.relationships?.base_token?.data?.id || '';
      const quoteTokenId = pool.relationships?.quote_token?.data?.id || '';
      const dexId = pool.relationships?.dex?.data?.id || '';
      
      // Extract token addresses from IDs (format: solana_<address>)
      const baseTokenAddress = baseTokenId.replace('solana_', '');
      const quoteTokenAddress = quoteTokenId.replace('solana_', '');
      
      await execute(`
        INSERT OR REPLACE INTO gecko_pool_data (
          pool_address,
          name,
          base_token_address,
          quote_token_address,
          dex_id,
          pool_created_at,
          reserve_in_usd,
          base_token_price_usd,
          base_token_price_native,
          base_token_balance,
          base_token_liquidity_usd,
          quote_token_price_usd,
          quote_token_price_native,
          quote_token_balance,
          quote_token_liquidity_usd,
          base_token_price_quote_token,
          quote_token_price_base_token,
          fdv_usd,
          market_cap_usd,
          price_change_24h,
          price_change_6h,
          price_change_1h,
          price_change_30m,
          price_change_15m,
          price_change_5m,
          volume_24h_usd,
          volume_6h_usd,
          volume_1h_usd,
          volume_30m_usd,
          volume_15m_usd,
          volume_5m_usd,
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
          updated_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, strftime('%s', 'now')
        )
      `, [
        attrs.address,
        attrs.name,
        baseTokenAddress,
        quoteTokenAddress,
        dexId,
        attrs.pool_created_at ? Math.floor(new Date(attrs.pool_created_at).getTime() / 1000) : null,
        attrs.reserve_in_usd ? parseFloat(attrs.reserve_in_usd) : null,
        attrs.base_token_price_usd ? parseFloat(attrs.base_token_price_usd) : null,
        attrs.base_token_price_native_currency ? parseFloat(attrs.base_token_price_native_currency) : null,
        attrs.base_token_balance ? parseFloat(attrs.base_token_balance) : null,
        attrs.base_token_liquidity_usd ? parseFloat(attrs.base_token_liquidity_usd) : null,
        attrs.quote_token_price_usd ? parseFloat(attrs.quote_token_price_usd) : null,
        attrs.quote_token_price_native_currency ? parseFloat(attrs.quote_token_price_native_currency) : null,
        attrs.quote_token_balance ? parseFloat(attrs.quote_token_balance) : null,
        attrs.quote_token_liquidity_usd ? parseFloat(attrs.quote_token_liquidity_usd) : null,
        attrs.base_token_price_quote_token ? parseFloat(attrs.base_token_price_quote_token) : null,
        attrs.quote_token_price_base_token ? parseFloat(attrs.quote_token_price_base_token) : null,
        attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : null,
        attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : null,
        attrs.price_change_percentage?.h24 ? parseFloat(attrs.price_change_percentage.h24) : null,
        attrs.price_change_percentage?.h6 ? parseFloat(attrs.price_change_percentage.h6) : null,
        attrs.price_change_percentage?.h1 ? parseFloat(attrs.price_change_percentage.h1) : null,
        attrs.price_change_percentage?.m30 ? parseFloat(attrs.price_change_percentage.m30) : null,
        attrs.price_change_percentage?.m15 ? parseFloat(attrs.price_change_percentage.m15) : null,
        attrs.price_change_percentage?.m5 ? parseFloat(attrs.price_change_percentage.m5) : null,
        attrs.volume_usd?.h24 ? parseFloat(attrs.volume_usd.h24) : null,
        attrs.volume_usd?.h6 ? parseFloat(attrs.volume_usd.h6) : null,
        attrs.volume_usd?.h1 ? parseFloat(attrs.volume_usd.h1) : null,
        attrs.volume_usd?.m30 ? parseFloat(attrs.volume_usd.m30) : null,
        attrs.volume_usd?.m15 ? parseFloat(attrs.volume_usd.m15) : null,
        attrs.volume_usd?.m5 ? parseFloat(attrs.volume_usd.m5) : null,
        attrs.transactions?.h24?.buys || 0,
        attrs.transactions?.h24?.sells || 0,
        attrs.transactions?.h24?.buyers || 0,
        attrs.transactions?.h24?.sellers || 0,
        attrs.transactions?.h6?.buys || 0,
        attrs.transactions?.h6?.sells || 0,
        attrs.transactions?.h6?.buyers || 0,
        attrs.transactions?.h6?.sellers || 0,
        attrs.transactions?.h1?.buys || 0,
        attrs.transactions?.h1?.sells || 0,
        attrs.transactions?.h1?.buyers || 0,
        attrs.transactions?.h1?.sellers || 0,
        attrs.transactions?.m30?.buys || 0,
        attrs.transactions?.m30?.sells || 0,
        attrs.transactions?.m30?.buyers || 0,
        attrs.transactions?.m30?.sellers || 0,
        attrs.transactions?.m15?.buys || 0,
        attrs.transactions?.m15?.sells || 0,
        attrs.transactions?.m15?.buyers || 0,
        attrs.transactions?.m15?.sellers || 0,
        attrs.transactions?.m5?.buys || 0,
        attrs.transactions?.m5?.sells || 0,
        attrs.transactions?.m5?.buyers || 0,
        attrs.transactions?.m5?.sellers || 0
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
