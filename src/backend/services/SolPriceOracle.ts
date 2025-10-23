import { ConfigProvider } from '../providers/ConfigProvider.js';
import { apiProviderTracker } from './ApiProviderTracker.js';
import WebSocket from 'ws';

/**
 * SOL Price Oracle
 * Uses Jupiter Price API V2 WebSocket for real-time SOL/USD price updates
 * Falls back to REST polling if WebSocket fails
 */
export class SolPriceOracle {
  private isRunning = false;
  private ws: WebSocket | null = null;
  private reconnectTimeout: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private fallbackInterval: NodeJS.Timeout | null = null;
  
  private readonly JUPITER_WS = 'wss://price.jup.ag/v2';
  private readonly JUPITER_ULTRA_API = 'https://api.jup.ag/ultra/price/v3';
  private readonly JUPITER_API_KEY = '7aeace19-c170-493e-a4ed-4e2e61eeb49d';
  private readonly SOL_MINT = 'So11111111111111111111111111111111111111112';
  private readonly RECONNECT_DELAY = 5000; // 5 seconds
  private readonly HEARTBEAT_INTERVAL = 30000; // 30 seconds
  private readonly FALLBACK_INTERVAL = 30000; // 30 seconds (more frequent updates)
  
  private currentPrice: number = 150; // Fallback default
  private lastUpdate: number = 0;
  private useWebSocket = false; // Disabled due to DNS issues on some servers

  /**
   * Start the price oracle with WebSocket
   */
  async start() {
    if (this.isRunning) {
      console.log('💰 [SOL Oracle] Already running');
      return;
    }

    this.isRunning = true;
    console.log('💰 [SOL Oracle] Starting with Jupiter REST API');
    
    // Load existing price from DB
    const storedPrice = await ConfigProvider.get('sol_price_usd');
    if (storedPrice) {
      this.currentPrice = parseFloat(storedPrice);
      console.log(`💰 [SOL Oracle] Loaded cached price: $${this.currentPrice.toFixed(2)}`);
    }
    
    // Try WebSocket first, fall back to REST if it fails
    if (this.useWebSocket) {
      this.connectWebSocket();
    } else {
      this.startFallbackPolling();
    }
  }

  /**
   * Stop the price oracle
   */
  stop() {
    this.isRunning = false;
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    // Clear all timers
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    if (this.fallbackInterval) {
      clearInterval(this.fallbackInterval);
      this.fallbackInterval = null;
    }
    
    console.log('💰 [SOL Oracle] Stopped');
  }

  /**
   * Connect to Jupiter WebSocket
   */
  private connectWebSocket() {
    try {
      console.log('💰 [SOL Oracle] Connecting to Jupiter WebSocket...');
      this.ws = new WebSocket(this.JUPITER_WS);
      
      this.ws.on('open', () => {
        console.log('💰 [SOL Oracle] WebSocket connected');
        
        // Subscribe to SOL price updates
        this.ws?.send(JSON.stringify({
          method: 'subscribeTokenPrice',
          params: [this.SOL_MINT]
        }));
        
        // Start heartbeat
        this.startHeartbeat();
      });
      
      this.ws.on('message', async (data: WebSocket.Data) => {
        try {
          const message = JSON.parse(data.toString());
          
          // Handle price update
          if (message.type === 'price' && message.data) {
            const newPrice = message.data.price;
            if (newPrice && typeof newPrice === 'number' && newPrice > 0) {
              await this.updatePriceValue(newPrice, 'WebSocket');
            }
          }
        } catch (error: any) {
          console.error('💰 [SOL Oracle] Error parsing WebSocket message:', error.message);
        }
      });
      
      this.ws.on('error', (error) => {
        console.error('💰 [SOL Oracle] WebSocket error:', error.message);
        apiProviderTracker.trackCall('Jupiter', 'WebSocket', false, 0, undefined, error.message);
      });
      
      this.ws.on('close', () => {
        console.log('💰 [SOL Oracle] WebSocket disconnected');
        this.ws = null;
        
        if (this.heartbeatInterval) {
          clearInterval(this.heartbeatInterval);
          this.heartbeatInterval = null;
        }
        
        // Reconnect if still running
        if (this.isRunning) {
          console.log(`💰 [SOL Oracle] Reconnecting in ${this.RECONNECT_DELAY/1000}s...`);
          this.reconnectTimeout = setTimeout(() => {
            if (this.isRunning) {
              this.connectWebSocket();
            }
          }, this.RECONNECT_DELAY);
        }
      });
    } catch (error: any) {
      console.error('💰 [SOL Oracle] Failed to create WebSocket:', error.message);
      // Fall back to REST polling
      this.useWebSocket = false;
      this.startFallbackPolling();
    }
  }
  
  /**
   * Start heartbeat to keep WebSocket alive
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ method: 'ping' }));
      }
    }, this.HEARTBEAT_INTERVAL);
  }
  
  /**
   * Start fallback REST polling
   */
  private startFallbackPolling() {
    console.log('💰 [SOL Oracle] Starting REST polling (30s interval)');
    
    // Fetch immediately
    this.fetchPriceREST();
    
    // Then poll every 30 seconds
    this.fallbackInterval = setInterval(() => {
      this.fetchPriceREST();
    }, this.FALLBACK_INTERVAL);
  }
  
  /**
   * Fetch price via Jupiter Ultra API v3
   */
  private async fetchPriceREST() {
    const startTime = Date.now();
    try {
      const response = await fetch(
        `${this.JUPITER_ULTRA_API}?ids=${this.SOL_MINT}`,
        { 
          headers: { 
            'Accept': 'application/json',
            'X-API-KEY': this.JUPITER_API_KEY
          } 
        }
      );

      if (!response.ok) {
        const responseTime = Date.now() - startTime;
        apiProviderTracker.trackCall('Jupiter Ultra', '/price/v3', false, responseTime, response.status);
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const responseTime = Date.now() - startTime;
      
      // Jupiter Ultra API v3 response format: { data: { [mint]: { price: number } } }
      const priceData = data.data?.[this.SOL_MINT];
      const newPrice = priceData?.price;

      if (newPrice && typeof newPrice === 'number' && newPrice > 0) {
        await this.updatePriceValue(newPrice, 'Jupiter Ultra');
        apiProviderTracker.trackCall('Jupiter Ultra', '/price/v3', true, responseTime, 200);
      } else {
        apiProviderTracker.trackCall('Jupiter Ultra', '/price/v3', false, responseTime, 200, 'Invalid data structure');
        console.warn('💰 [SOL Oracle] Invalid price data received:', JSON.stringify(data));
      }
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      apiProviderTracker.trackCall('Jupiter Ultra', '/price/v3', false, responseTime, undefined, error.message);
      console.error('💰 [SOL Oracle] Error fetching price:', error.message);
    }
  }
  
  /**
   * Update price value and store in database
   */
  private async updatePriceValue(newPrice: number, source: string) {
    this.currentPrice = newPrice;
    this.lastUpdate = Date.now();
    
    // Store in database
    await ConfigProvider.set('sol_price_usd', newPrice.toString());
    await ConfigProvider.set('sol_price_updated_at', this.lastUpdate.toString());
    
    console.log(`💰 [SOL Oracle] Updated via ${source}: $${newPrice.toFixed(2)}`);
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
      method: this.useWebSocket ? 'WebSocket' : 'REST',
      connected: this.ws?.readyState === WebSocket.OPEN
    };
  }
}

// Global singleton instance
export const solPriceOracle = new SolPriceOracle();
