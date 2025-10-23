import { ConfigProvider } from '../providers/ConfigProvider.js';
import { apiProviderTracker } from './ApiProviderTracker.js';

/**
 * SOL Price Oracle
 * Uses GeckoTerminal API for SOL/USD price
 */
export class SolPriceOracle {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  
  private readonly GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price';
  private readonly SOL_ADDRESS = 'So11111111111111111111111111111111111111112';
  private readonly POLL_INTERVAL = 30000; // 30 seconds
  
  private currentPrice: number = 150; // Fallback default
  private lastUpdate: number = 0

  /**
   * Start the price oracle
   */
  async start() {
    if (this.isRunning) {
      console.log('💰 [SOL Oracle] Already running');
      return;
    }

    this.isRunning = true;
    console.log('💰 [SOL Oracle] Starting with GeckoTerminal API (30s interval)');
    
    // Load existing price from DB
    const storedPrice = await ConfigProvider.get('sol_price_usd');
    if (storedPrice) {
      this.currentPrice = parseFloat(storedPrice);
      console.log(`💰 [SOL Oracle] Loaded cached price: $${this.currentPrice.toFixed(2)}`);
    }
    
    // Fetch immediately
    await this.fetchPrice();
    
    // Then poll every 30 seconds
    this.intervalId = setInterval(() => {
      this.fetchPrice();
    }, this.POLL_INTERVAL);
  }

  /**
   * Stop the price oracle
   */
  stop() {
    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    
    console.log('💰 [SOL Oracle] Stopped');
  }

  /**
   * Fetch price via GeckoTerminal API
   */
  private async fetchPrice() {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `${this.GECKOTERMINAL_API}/${this.SOL_ADDRESS}`,
        { headers: { 'Accept': 'application/json' } }
      );

      if (!response.ok) {
        const responseTime = Date.now() - startTime;
        apiProviderTracker.trackCall('GeckoTerminal', '/token_price', false, responseTime, response.status);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      // GeckoTerminal response format: { data: { attributes: { token_prices: { [address]: "price" } } } }
      const priceStr = data.data?.attributes?.token_prices?.[this.SOL_ADDRESS.toLowerCase()];
      const newPrice = priceStr ? parseFloat(priceStr) : null;

      if (newPrice && typeof newPrice === 'number' && newPrice > 0) {
        await this.updatePriceValue(newPrice);
        apiProviderTracker.trackCall('GeckoTerminal', '/token_price', true, responseTime, 200);
      } else {
        apiProviderTracker.trackCall('GeckoTerminal', '/token_price', false, responseTime, 200, 'Invalid data structure');
        console.warn('💰 [SOL Oracle] Invalid price data received:', JSON.stringify(data));
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      apiProviderTracker.trackCall('GeckoTerminal', '/token_price', false, responseTime, undefined, error.message);
      console.error('💰 [SOL Oracle] Error fetching price:', error.message);
    }
  }
  
  /**
   * Update price value and store in database
   */
  private async updatePriceValue(newPrice: number) {
    this.currentPrice = newPrice;
    this.lastUpdate = Date.now();
    
    // Store in database
    await ConfigProvider.set('sol_price_usd', newPrice.toString());
    await ConfigProvider.set('sol_price_updated_at', this.lastUpdate.toString());
    
    console.log(`💰 [SOL Oracle] Updated: $${newPrice.toFixed(2)}`);
  }

  /**
   * Get current SOL price
   * @returns SOL price in USD
   */
  getPrice(): number {
    return this.currentPrice;
  }

  /**
   * Get current SOL price asynchronously (loads from DB if not in memory)
   * @returns SOL price in USD
   */
  async getPriceAsync(): Promise<number> {
    if (this.currentPrice) {
      return this.currentPrice;
    }
    
    // Try to load from DB
    const storedPrice = await ConfigProvider.get('sol_price_usd');
    if (storedPrice) {
      this.currentPrice = parseFloat(storedPrice);
      return this.currentPrice;
    }
    
    // Fallback default
    return 150;
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      currentPrice: this.currentPrice,
      lastUpdate: this.lastUpdate,
      method: 'GeckoTerminal REST'
    };
  }
}

// Global singleton instance
export const solPriceOracle = new SolPriceOracle();
