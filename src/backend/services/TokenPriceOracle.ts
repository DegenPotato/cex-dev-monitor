/**
 * Token Price Oracle Service
 * Fetches real-time token prices from GeckoTerminal using batch endpoint
 * Stores prices in token_market_data table for dashboard/portfolio use
 */

import { queryAll, execute } from '../database/helpers.js';
import { apiProviderTracker } from './ApiProviderTracker.js';

interface TokenPrice {
  address: string;
  symbol?: string;
  name?: string;
  priceUSD: number;
  priceSOL?: number;
  priceChange24h?: number;
  volume24h?: number;
  marketCapUSD?: number;
  fdv?: number;
  liquidityUSD?: number;
  lastUpdated: number;
}

interface GeckoTerminalToken {
  id: string;
  type: string;
  attributes: {
    address: string;
    symbol: string;
    name: string;
    price_usd: string;
    price_change_percentage_h24: string;
    volume_usd_h24: string;
    market_cap_usd?: string;
    fdv_usd?: string;
    total_reserve_in_usd?: string;
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
            this.priceCache.set(price.address, price);
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
        address: attrs.address,
        symbol: attrs.symbol,
        name: attrs.name,
        priceUSD: parseFloat(attrs.price_usd || '0'),
        priceSOL: this.solPrice > 0 ? parseFloat(attrs.price_usd || '0') / this.solPrice : undefined,
        priceChange24h: parseFloat(attrs.price_change_percentage_h24 || '0'),
        volume24h: parseFloat(attrs.volume_usd_h24 || '0'),
        marketCapUSD: attrs.market_cap_usd ? parseFloat(attrs.market_cap_usd) : undefined,
        fdv: attrs.fdv_usd ? parseFloat(attrs.fdv_usd) : undefined,
        liquidityUSD: attrs.total_reserve_in_usd ? parseFloat(attrs.total_reserve_in_usd) : undefined,
        lastUpdated: Date.now()
      };
    } catch (error) {
      console.error('🪙 [Token Oracle] Error parsing token data:', error);
      return null;
    }
  }

  /**
   * Save token price to database
   */
  private async saveToDatabase(price: TokenPrice): Promise<void> {
    try {
      await execute(`
        INSERT OR REPLACE INTO token_market_data (
          mint_address,
          symbol,
          name,
          price_usd,
          price_sol,
          price_change_24h,
          volume_24h_usd,
          market_cap_usd,
          fdv,
          liquidity_usd,
          platform,
          last_updated
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'geckoterminal', datetime('now'))
      `, [
        price.address,
        price.symbol || null,
        price.name || null,
        price.priceUSD,
        price.priceSOL || null,
        price.priceChange24h || null,
        price.volume24h || null,
        price.marketCapUSD || null,
        price.fdv || null,
        price.liquidityUSD || null
      ]);
    } catch (error) {
      console.error('🪙 [Token Oracle] Error saving to database:', error);
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
}

// Export singleton instance
export const tokenPriceOracle = TokenPriceOracle.getInstance();
