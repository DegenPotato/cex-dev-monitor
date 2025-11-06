import { Connection, PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';

interface Swap {
  signature: string;
  timestamp: number;
  slot: number;
  type: 'buy' | 'sell';
  price: number;
  tokenAmount: number;
  solAmount: number;
  tags?: string[];
  isVolumeBot: boolean;
  isMint: boolean;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TimeframeCandles {
  [timeframe: string]: Candle[];
}

/**
 * Live OHLCV Monitor - Real-time candle updates
 * Subscribes to bonding curve transactions and updates candles as trades happen
 */
export class LiveOHLCVMonitor extends EventEmitter {
  private connection: Connection;
  private tokenMint: PublicKey;
  private bondingCurve: PublicKey;
  private subscriptionId: number | null = null;
  private isRunning = false;
  
  // Candle storage for all timeframes (in seconds)
  private timeframes = [1, 15, 60, 300, 900, 3600, 14400, 86400]; // 1s, 15s, 1m, 5m, 15m, 1H, 4H, 1D
  private candles: TimeframeCandles = {};
  
  // Recent swaps buffer
  private recentSwaps: Swap[] = [];
  private maxSwapsBuffer = 10000; // Keep last 10k swaps
  
  constructor(
    rpcUrl: string,
    tokenMint: string,
    bondingCurve: string,
    initialCandles?: TimeframeCandles
  ) {
    super();
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.tokenMint = new PublicKey(tokenMint);
    this.bondingCurve = new PublicKey(bondingCurve);
    
    // Initialize with historical candles if provided
    if (initialCandles) {
      this.candles = initialCandles;
    } else {
      // Initialize empty candle arrays
      this.timeframes.forEach(tf => {
        this.candles[this.formatTimeframe(tf)] = [];
      });
    }
  }
  
  /**
   * Format timeframe in seconds to readable string
   */
  private formatTimeframe(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${seconds / 60}m`;
    if (seconds < 86400) return `${seconds / 3600}H`;
    return `${seconds / 86400}D`;
  }
  
  /**
   * Start monitoring for real-time updates
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  [LiveOHLCVMonitor] Already running');
      return;
    }
    
    console.log(`📡 [LiveOHLCVMonitor] Starting for token ${this.tokenMint.toBase58()}`);
    this.isRunning = true;
    
    // Subscribe to bonding curve logs
    this.subscriptionId = this.connection.onLogs(
      this.bondingCurve,
      async (logs) => {
        if (!this.isRunning) return;
        
        const signature = logs.signature;
        await this.processTransaction(signature);
      },
      'confirmed'
    );
    
    console.log(`✅ [LiveOHLCVMonitor] Subscribed to bonding curve ${this.bondingCurve.toBase58()}`);
    this.emit('started', { tokenMint: this.tokenMint.toBase58() });
  }
  
  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;
    
    console.log('⏹️  [LiveOHLCVMonitor] Stopping...');
    this.isRunning = false;
    
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    
    this.emit('stopped');
  }
  
  /**
   * Process a new transaction
   */
  private async processTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx || !tx.meta || tx.meta.err) return;
      
      const swap = this.parseSwapTransaction(tx, signature);
      if (!swap) return;
      
      // Add to recent swaps
      this.recentSwaps.push(swap);
      if (this.recentSwaps.length > this.maxSwapsBuffer) {
        this.recentSwaps.shift(); // Remove oldest
      }
      
      // Update all timeframe candles
      this.updateCandles(swap);
      
      // Emit new swap event
      this.emit('swap', swap);
      
      // Emit updated candles
      this.emit('candlesUpdated', {
        swap,
        candles: this.candles
      });
      
    } catch (error) {
      console.error(`❌ [LiveOHLCVMonitor] Error processing tx ${signature}:`, error);
    }
  }
  
  /**
   * Parse swap transaction (same logic as manual builder)
   */
  private parseSwapTransaction(tx: any, signature: string): Swap | null {
    try {
      if (!tx || !tx.meta) return null;
      
      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];
      
      // Add loaded addresses for versioned transactions
      if (message.addressTableLookups && tx.meta.loadedAddresses) {
        if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
      }
      
      // Track buy and sell amounts separately
      let buyAmount = 0;
      let sellAmount = 0;
      let decimals = 6;
      
      // Check ALL accounts in EITHER pre OR post balances
      const allAccountIndices = new Set<number>();
      
      if (tx.meta.preTokenBalances) {
        tx.meta.preTokenBalances.forEach((b: any) => {
          if (b.mint === this.tokenMint.toBase58()) allAccountIndices.add(b.accountIndex);
        });
      }
      
      if (tx.meta.postTokenBalances) {
        tx.meta.postTokenBalances.forEach((b: any) => {
          if (b.mint === this.tokenMint.toBase58()) allAccountIndices.add(b.accountIndex);
        });
      }
      
      // Check balance changes for each account
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances?.find((b: any) => b.accountIndex === accountIndex);
        const post = tx.meta.postTokenBalances?.find((b: any) => b.accountIndex === accountIndex);
        
        if (!post) continue;
        
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        decimals = post.uiTokenAmount.decimals;
        const changeFloat = Number(change) / Math.pow(10, decimals);
        
        if (change > 0n) {
          buyAmount += changeFloat;
        } else if (change < 0n) {
          sellAmount += Math.abs(changeFloat);
        }
      }
      
      // Determine if buy or sell
      const isBuy = buyAmount > sellAmount;
      const isSell = sellAmount > buyAmount;
      const tokenAmount = isBuy ? buyAmount : sellAmount;
      
      if (tokenAmount === 0 || (!isBuy && !isSell)) return null;
      
      // Calculate SOL amount from bonding curve balance change
      let solAmount = 0;
      
      if (tx.meta.postBalances && tx.meta.preBalances) {
        let bondingCurveIndex = -1;
        
        for (let i = 0; i < accountKeys.length; i++) {
          if (accountKeys[i]?.equals(this.bondingCurve)) {
            bondingCurveIndex = i;
            break;
          }
        }
        
        if (bondingCurveIndex >= 0 && bondingCurveIndex < tx.meta.preBalances.length) {
          const curveChange = tx.meta.postBalances[bondingCurveIndex] - tx.meta.preBalances[bondingCurveIndex];
          solAmount = Math.abs(curveChange / 1e9);
        }
      }
      
      // Fallback: use fee payer balance
      if (solAmount === 0 && tx.meta.preBalances && tx.meta.postBalances) {
        const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
        solAmount = Math.abs(change / 1e9);
      }
      
      if (solAmount === 0) return null;
      
      const price = solAmount / tokenAmount;
      const isVolumeBot = buyAmount > 0 && sellAmount > 0;
      const hasPreTokenBalance = tx.meta.preTokenBalances?.some((b: any) => b.mint === this.tokenMint.toBase58()) || false;
      const hasPostTokenBalance = tx.meta.postTokenBalances?.some((b: any) => b.mint === this.tokenMint.toBase58()) || false;
      const isMint = hasPostTokenBalance && !hasPreTokenBalance;
      
      return {
        signature,
        timestamp: tx.blockTime!,
        slot: tx.slot,
        type: isBuy ? 'buy' : 'sell',
        price,
        tokenAmount,
        solAmount,
        isVolumeBot,
        isMint
      };
    } catch (err) {
      return null;
    }
  }
  
  /**
   * Update candles for all timeframes with new swap
   */
  private updateCandles(swap: Swap): void {
    for (const timeframeSeconds of this.timeframes) {
      const tf = this.formatTimeframe(timeframeSeconds);
      const candleTime = Math.floor(swap.timestamp / timeframeSeconds) * timeframeSeconds;
      
      let candle = this.candles[tf].find(c => c.time === candleTime);
      
      if (!candle) {
        // Create new candle
        const prevCandle = this.candles[tf][this.candles[tf].length - 1];
        const open = prevCandle ? prevCandle.close : swap.price;
        
        candle = {
          time: candleTime,
          open,
          high: swap.price,
          low: swap.price,
          close: swap.price,
          volume: swap.solAmount
        };
        
        this.candles[tf].push(candle);
      } else {
        // Update existing candle
        candle.high = Math.max(candle.high, swap.price);
        candle.low = Math.min(candle.low, swap.price);
        candle.close = swap.price;
        candle.volume += swap.solAmount;
      }
      
      // Emit candle update
      this.emit('candleUpdated', {
        timeframe: tf,
        candle
      });
    }
  }
  
  /**
   * Get current candles for a specific timeframe
   */
  getCandles(timeframe: string): Candle[] {
    return this.candles[timeframe] || [];
  }
  
  /**
   * Get all candles
   */
  getAllCandles(): TimeframeCandles {
    return this.candles;
  }
  
  /**
   * Get recent swaps
   */
  getRecentSwaps(limit: number = 100): Swap[] {
    return this.recentSwaps.slice(-limit);
  }
}
