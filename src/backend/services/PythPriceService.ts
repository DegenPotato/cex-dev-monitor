/**
 * Pyth Network Real-Time Price Service
 * WebSocket-based live price feeds for testing alerts
 */

import WebSocket from 'ws';
import { EventEmitter } from 'events';

export interface PriceUpdate {
  symbol: string;
  price: number;
  confidence: number;
  emaPrice: number;
  timestamp: number;
  status: 'trading' | 'unknown' | 'halted';
}

export interface PriceStats {
  symbol: string;
  startPrice: number;
  currentPrice: number;
  high: number;
  low: number;
  changePercent: number;
  startTime: number;
  lastUpdate: number;
}

/**
 * Pyth Network WebSocket Price Service
 */
export class PythPriceService extends EventEmitter {
  private ws: WebSocket | null = null;
  private subscribedSymbols: Set<string> = new Set();
  private priceStats: Map<string, PriceStats> = new Map();
  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private readonly WS_URL = 'wss://hermes.pyth.network/ws';

  constructor() {
    super();
  }

  /**
   * Connect to Pyth WebSocket
   */
  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      console.log('🔗 Pyth WebSocket already connected');
      return;
    }

    console.log('🔗 Connecting to Pyth Network WebSocket...');
    
    this.ws = new WebSocket(this.WS_URL);

    this.ws.on('open', () => {
      console.log('✅ Pyth WebSocket connected');
      this.reconnectAttempts = 0;
      
      // Resubscribe to all symbols
      if (this.subscribedSymbols.size > 0) {
        this.resubscribeAll();
      }
      
      this.emit('connected');
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(message);
      } catch (error) {
        console.error('❌ Failed to parse Pyth message:', error);
      }
    });

    this.ws.on('error', (error) => {
      console.error('❌ Pyth WebSocket error:', error);
      this.emit('error', error);
    });

    this.ws.on('close', () => {
      console.log('🔌 Pyth WebSocket disconnected');
      this.ws = null;
      this.emit('disconnected');
      this.scheduleReconnect();
    });
  }

  /**
   * Schedule reconnection with exponential backoff
   */
  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('❌ Max reconnection attempts reached');
      return;
    }

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), 30000);
    this.reconnectAttempts++;

    console.log(`🔄 Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to price feed for a token
   */
  subscribe(symbol: string, tokenMint?: string) {
    console.log(`📊 Subscribing to ${symbol} price feed...`);
    
    this.subscribedSymbols.add(symbol);
    
    // Initialize price stats
    if (!this.priceStats.has(symbol)) {
      this.priceStats.set(symbol, {
        symbol,
        startPrice: 0,
        currentPrice: 0,
        high: 0,
        low: Infinity,
        changePercent: 0,
        startTime: Date.now(),
        lastUpdate: Date.now()
      });
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // Subscribe to price feed
      // For Solana tokens, we'll use the mint address to get Pyth price ID
      const subscribeMessage = {
        type: 'subscribe',
        ids: [this.getPythPriceId(symbol, tokenMint)]
      };
      
      this.ws.send(JSON.stringify(subscribeMessage));
      console.log(`✅ Subscribed to ${symbol}`);
    } else {
      console.log(`⏳ Will subscribe to ${symbol} once connected`);
    }
  }

  /**
   * Unsubscribe from price feed
   */
  unsubscribe(symbol: string) {
    console.log(`📊 Unsubscribing from ${symbol} price feed...`);
    
    this.subscribedSymbols.delete(symbol);
    this.priceStats.delete(symbol);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      const unsubscribeMessage = {
        type: 'unsubscribe',
        ids: [this.getPythPriceId(symbol)]
      };
      
      this.ws.send(JSON.stringify(unsubscribeMessage));
    }
  }

  /**
   * Resubscribe to all symbols
   */
  private resubscribeAll() {
    for (const symbol of this.subscribedSymbols) {
      this.subscribe(symbol);
    }
  }

  /**
   * Get Pyth price ID for a symbol
   */
  private getPythPriceId(symbol: string, tokenMint?: string): string {
    // Common Pyth price feed IDs
    const priceIds: Record<string, string> = {
      'SOL': 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', // SOL/USD
      'BTC': 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', // BTC/USD
      'ETH': 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', // ETH/USD
      'USDC': '41f3625971ca2ed2263e78573fe5ce23e13d2558ed3f2e47ab0f84fb9e7ae722', // USDC/USD
      'USDT': '1fc18861232290221461220bd4e2acd1dcdfbc89c84092c93c18bdc7756c1588', // USDT/USD
    };

    // If we have a tokenMint, we could map it to Pyth price ID
    // For now, use symbol mapping
    return priceIds[symbol.toUpperCase()] || priceIds['SOL'];
  }

  /**
   * Handle WebSocket message
   */
  private handleMessage(message: any) {
    if (message.type === 'price_update') {
      const update = this.parsePriceUpdate(message);
      if (update) {
        this.updatePriceStats(update);
        this.emit('price', update);
      }
    }
  }

  /**
   * Parse price update from Pyth message
   */
  private parsePriceUpdate(message: any): PriceUpdate | null {
    try {
      const priceData = message.price_feed;
      if (!priceData) return null;

      // Find symbol from price ID
      const symbol = this.findSymbolByPriceId(message.id);
      if (!symbol) return null;

      const price = Number(priceData.price) * Math.pow(10, priceData.expo);
      const confidence = Number(priceData.conf) * Math.pow(10, priceData.expo);
      const emaPrice = Number(priceData.ema_price) * Math.pow(10, priceData.expo);

      return {
        symbol,
        price,
        confidence,
        emaPrice,
        timestamp: Date.now(),
        status: priceData.status || 'trading'
      };
    } catch (error) {
      console.error('❌ Failed to parse price update:', error);
      return null;
    }
  }

  /**
   * Find symbol by price ID
   */
  private findSymbolByPriceId(priceId: string): string | null {
    // Reverse lookup from price ID to symbol
    // For now, return first subscribed symbol
    return Array.from(this.subscribedSymbols)[0] || null;
  }

  /**
   * Update price statistics
   */
  private updatePriceStats(update: PriceUpdate) {
    const stats = this.priceStats.get(update.symbol);
    if (!stats) return;

    // Set start price on first update
    if (stats.startPrice === 0) {
      stats.startPrice = update.price;
      stats.currentPrice = update.price;
      stats.high = update.price;
      stats.low = update.price;
    } else {
      stats.currentPrice = update.price;
      stats.high = Math.max(stats.high, update.price);
      stats.low = Math.min(stats.low, update.price);
    }

    // Calculate change percent
    stats.changePercent = ((stats.currentPrice - stats.startPrice) / stats.startPrice) * 100;
    stats.lastUpdate = update.timestamp;

    this.emit('stats', stats);
  }

  /**
   * Get current price stats
   */
  getStats(symbol: string): PriceStats | null {
    return this.priceStats.get(symbol) || null;
  }

  /**
   * Get all tracked symbols
   */
  getTrackedSymbols(): string[] {
    return Array.from(this.subscribedSymbols);
  }

  /**
   * Reset stats for a symbol
   */
  resetStats(symbol: string) {
    const stats = this.priceStats.get(symbol);
    if (stats) {
      stats.startPrice = stats.currentPrice;
      stats.high = stats.currentPrice;
      stats.low = stats.currentPrice;
      stats.changePercent = 0;
      stats.startTime = Date.now();
      console.log(`♻️ Reset stats for ${symbol}`);
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect() {
    console.log('🔌 Disconnecting Pyth WebSocket...');
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.subscribedSymbols.clear();
    this.priceStats.clear();
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }
}

// Singleton instance
let pythPriceService: PythPriceService | null = null;

export function getPythPriceService(): PythPriceService {
  if (!pythPriceService) {
    pythPriceService = new PythPriceService();
  }
  return pythPriceService;
}
