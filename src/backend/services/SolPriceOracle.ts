import { ConfigProvider } from '../providers/ConfigProvider.js';

/**
 * SOL Price Oracle
 * Fetches SOL/USD price every 60 seconds and stores in database
 * Uses CoinGecko's free public API
 */
export class SolPriceOracle {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly UPDATE_INTERVAL = 60 * 1000; // 60 seconds
  private readonly COINGECKO_API = 'https://api.coingecko.com/api/v3/simple/price';
  private currentPrice: number = 150; // Fallback default

  /**
   * Start the price oracle
   */
  async start() {
    if (this.isRunning) {
      console.log('💰 [SOL Oracle] Already running');
      return;
    }

    this.isRunning = true;
    console.log('💰 [SOL Oracle] Starting (60s interval)');
    
    // Load existing price from DB
    const storedPrice = await ConfigProvider.get('sol_price_usd');
    if (storedPrice) {
      this.currentPrice = parseFloat(storedPrice);
      console.log(`💰 [SOL Oracle] Loaded cached price: $${this.currentPrice.toFixed(2)}`);
    }
    
    // Fetch immediately, then every 60 seconds
    await this.updatePrice();
    this.intervalId = setInterval(() => {
      this.updatePrice();
    }, this.UPDATE_INTERVAL);
  }

  /**
   * Stop the price oracle
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('💰 [SOL Oracle] Stopped');
  }

  /**
   * Fetch and update SOL price
   */
  private async updatePrice() {
    try {
      const response = await fetch(
        `${this.COINGECKO_API}?ids=solana&vs_currencies=usd`,
        {
          headers: { 'Accept': 'application/json' }
        }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const newPrice = data?.solana?.usd;

      if (newPrice && typeof newPrice === 'number') {
        this.currentPrice = newPrice;
        
        // Store in database
        await ConfigProvider.set('sol_price_usd', newPrice.toString());
        await ConfigProvider.set('sol_price_updated_at', Date.now().toString());
        
        console.log(`💰 [SOL Oracle] Updated: $${newPrice.toFixed(2)}`);
      } else {
        console.warn('💰 [SOL Oracle] Invalid price data received');
      }
    } catch (error: any) {
      console.error('💰 [SOL Oracle] Error fetching price:', error.message);
      // Keep using last known price
    }
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
      updateInterval: this.UPDATE_INTERVAL
    };
  }
}

// Global singleton instance
export const solPriceOracle = new SolPriceOracle();
