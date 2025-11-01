/**
 * Token Price Monitor Service
 * Real-time price monitoring for any Solana token using Jupiter quotes
 * Supports multiple simultaneous token tracking
 */

import { EventEmitter } from 'events';
import fetch from 'cross-fetch';
import { LAMPORTS_PER_SOL } from '@solana/web3.js';

const JUPITER_API_URL = 'https://lite-api.jup.ag/swap/v1';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

export interface PriceUpdate {
  tokenMint: string;
  price: number; // Price in SOL
  priceUSD: number; // Price in USD
  timestamp: number;
}

export interface TokenStats {
  tokenMint: string;
  startPrice: number; // Starting price in SOL
  startPriceUSD: number; // Starting price in USD
  currentPrice: number;
  currentPriceUSD: number;
  high: number;
  low: number;
  highUSD: number;
  lowUSD: number;
  changePercent: number;
  startTime: number;
  lastUpdate: number;
  updateCount: number;
}

interface MonitoredToken {
  tokenMint: string;
  interval: NodeJS.Timeout;
  stats: TokenStats;
}

/**
 * Token Price Monitor Service
 * Polls Jupiter for real-time quotes and emits price updates
 */
export class TokenPriceMonitor extends EventEmitter {
  private monitoredTokens: Map<string, MonitoredToken> = new Map();
  private solPriceUSD: number = 0;
  private updateIntervalMs: number = 1000; // 1 second updates

  constructor(updateIntervalMs: number = 1000) {
    super();
    this.updateIntervalMs = updateIntervalMs;
    this.startSOLPriceUpdates();
  }

  /**
   * Start monitoring SOL/USD price
   */
  private async startSOLPriceUpdates() {
    // Initial fetch
    await this.updateSOLPrice();
    
    // Update every 5 seconds
    setInterval(() => this.updateSOLPrice(), 5000);
  }

  /**
   * Update SOL/USD price from CoinGecko
   */
  private async updateSOLPrice() {
    try {
      const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await response.json();
      this.solPriceUSD = data.solana?.usd || 0;
      console.log(`💰 SOL Price: $${this.solPriceUSD.toFixed(2)}`);
    } catch (error) {
      console.error('Failed to fetch SOL price:', error);
    }
  }

  /**
   * Start monitoring a token
   */
  async startMonitoring(tokenMint: string): Promise<TokenStats> {
    if (this.monitoredTokens.has(tokenMint)) {
      console.log(`⚠️ Already monitoring ${tokenMint}`);
      return this.monitoredTokens.get(tokenMint)!.stats;
    }

    console.log(`📊 Starting price monitoring for ${tokenMint}...`);

    // Get initial price
    const initialPrice = await this.fetchTokenPrice(tokenMint);
    if (initialPrice === null) {
      throw new Error('Failed to fetch initial price');
    }

    const initialPriceUSD = initialPrice * this.solPriceUSD;

    // Initialize stats
    const stats: TokenStats = {
      tokenMint,
      startPrice: initialPrice,
      startPriceUSD: initialPriceUSD,
      currentPrice: initialPrice,
      currentPriceUSD: initialPriceUSD,
      high: initialPrice,
      low: initialPrice,
      highUSD: initialPriceUSD,
      lowUSD: initialPriceUSD,
      changePercent: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      updateCount: 0
    };

    // Start polling
    const interval = setInterval(async () => {
      await this.updateTokenPrice(tokenMint);
    }, this.updateIntervalMs);

    this.monitoredTokens.set(tokenMint, {
      tokenMint,
      interval,
      stats
    });

    console.log(`✅ Monitoring started for ${tokenMint}`);
    this.emit('monitoring_started', { tokenMint, stats });

    return stats;
  }

  /**
   * Stop monitoring a token
   */
  stopMonitoring(tokenMint: string) {
    const monitored = this.monitoredTokens.get(tokenMint);
    if (!monitored) {
      console.log(`⚠️ Token ${tokenMint} not being monitored`);
      return;
    }

    clearInterval(monitored.interval);
    this.monitoredTokens.delete(tokenMint);
    
    console.log(`🛑 Stopped monitoring ${tokenMint}`);
    this.emit('monitoring_stopped', { tokenMint });
  }

  /**
   * Fetch token price from Jupiter
   */
  private async fetchTokenPrice(tokenMint: string): Promise<number | null> {
    try {
      // Get quote for 1 token -> SOL
      // Use 1e9 (1 token with 9 decimals as default)
      const response = await fetch(
        `${JUPITER_API_URL}/quote?` +
        `inputMint=${tokenMint}&` +
        `outputMint=${SOL_MINT}&` +
        `amount=1000000000&` + // 1 token (9 decimals)
        `slippageBps=100`
      );

      if (!response.ok) {
        console.error(`Jupiter quote failed for ${tokenMint}:`, response.statusText);
        return null;
      }

      const data = await response.json();
      const outAmount = Number(data.outAmount);
      
      // Convert lamports to SOL
      const priceInSOL = outAmount / LAMPORTS_PER_SOL;
      
      return priceInSOL;
    } catch (error) {
      console.error(`Error fetching price for ${tokenMint}:`, error);
      return null;
    }
  }

  /**
   * Update token price
   */
  private async updateTokenPrice(tokenMint: string) {
    const monitored = this.monitoredTokens.get(tokenMint);
    if (!monitored) return;

    const price = await this.fetchTokenPrice(tokenMint);
    if (price === null) {
      console.error(`Failed to update price for ${tokenMint}`);
      return;
    }

    const priceUSD = price * this.solPriceUSD;
    const stats = monitored.stats;

    // Update stats
    stats.currentPrice = price;
    stats.currentPriceUSD = priceUSD;
    stats.high = Math.max(stats.high, price);
    stats.low = Math.min(stats.low, price);
    stats.highUSD = Math.max(stats.highUSD, priceUSD);
    stats.lowUSD = Math.min(stats.lowUSD, priceUSD);
    stats.changePercent = ((stats.currentPrice - stats.startPrice) / stats.startPrice) * 100;
    stats.lastUpdate = Date.now();
    stats.updateCount++;

    // Emit update
    const update: PriceUpdate = {
      tokenMint,
      price,
      priceUSD,
      timestamp: Date.now()
    };

    this.emit('price_update', update);
    this.emit('stats_update', stats);

    // Log every 10 updates
    if (stats.updateCount % 10 === 0) {
      console.log(`📊 ${tokenMint}: ${stats.currentPrice.toFixed(9)} SOL ($${stats.currentPriceUSD.toFixed(6)}) | ${stats.changePercent >= 0 ? '+' : ''}${stats.changePercent.toFixed(2)}%`);
    }
  }

  /**
   * Get stats for a token
   */
  getStats(tokenMint: string): TokenStats | null {
    const monitored = this.monitoredTokens.get(tokenMint);
    return monitored ? monitored.stats : null;
  }

  /**
   * Get all monitored tokens
   */
  getMonitoredTokens(): string[] {
    return Array.from(this.monitoredTokens.keys());
  }

  /**
   * Reset stats for a token (set new baseline)
   */
  resetStats(tokenMint: string) {
    const monitored = this.monitoredTokens.get(tokenMint);
    if (!monitored) return;

    const stats = monitored.stats;
    stats.startPrice = stats.currentPrice;
    stats.startPriceUSD = stats.currentPriceUSD;
    stats.high = stats.currentPrice;
    stats.low = stats.currentPrice;
    stats.highUSD = stats.currentPriceUSD;
    stats.lowUSD = stats.currentPriceUSD;
    stats.changePercent = 0;
    stats.startTime = Date.now();

    console.log(`♻️ Reset stats for ${tokenMint}`);
    this.emit('stats_reset', stats);
  }

  /**
   * Check if token is being monitored
   */
  isMonitoring(tokenMint: string): boolean {
    return this.monitoredTokens.has(tokenMint);
  }

  /**
   * Stop all monitoring
   */
  stopAll() {
    for (const tokenMint of this.monitoredTokens.keys()) {
      this.stopMonitoring(tokenMint);
    }
  }
}

// Singleton instance
let tokenPriceMonitor: TokenPriceMonitor | null = null;

export function getTokenPriceMonitor(): TokenPriceMonitor {
  if (!tokenPriceMonitor) {
    tokenPriceMonitor = new TokenPriceMonitor(1000); // 1 second updates
  }
  return tokenPriceMonitor;
}
