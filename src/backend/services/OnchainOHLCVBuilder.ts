import { Connection, PublicKey } from '@solana/web3.js';

// Pumpfun program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Buy/Sell discriminators
const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0',
  'e6345c8dd8b14540', 
  '48feac982b20e013',
  '00b08712a8402815'
];

const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad',
  'db0d98c38ed07cfd'
];

interface SwapData {
  signature: string;
  timestamp: number;
  price: number; // SOL per token
  tokens: number;
  sol: number;
  type: 'buy' | 'sell';
}

interface OHLCVCandle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number; // In SOL
}

export class OnchainOHLCVBuilder {
  private connection: Connection;
  private cache: Map<string, { swaps: SwapData[]; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 60000; // 1 minute cache

  constructor(rpcUrl: string) {
    this.connection = new Connection(rpcUrl, 'confirmed');
  }

  /**
   * Build OHLCV candles from onchain transactions
   */
  async buildOHLCV(
    tokenMint: string,
    timeframeMinutes: number = 5,
    lookbackHours: number = 24
  ): Promise<{
    candles: OHLCVCandle[];
    metadata: {
      tokenMint: string;
      totalSwaps: number;
      totalVolume: number;
      startTime: number;
      endTime: number;
    };
  }> {
    console.log(`📊 [OHLCV] Building ${timeframeMinutes}m candles for ${tokenMint.slice(0, 8)}... (${lookbackHours}h lookback)`);
    
    // Check cache
    const cacheKey = `${tokenMint}-${timeframeMinutes}-${lookbackHours}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
      console.log(`💾 [OHLCV] Using cached data (${cached.swaps.length} swaps)`);
      return this.buildCandlesFromSwaps(cached.swaps, timeframeMinutes, tokenMint);
    }

    // Fetch swap transactions
    const swaps = await this.fetchSwapTransactions(tokenMint, lookbackHours);
    
    // Cache the swaps
    this.cache.set(cacheKey, { swaps, timestamp: Date.now() });
    
    // Build candles
    return this.buildCandlesFromSwaps(swaps, timeframeMinutes, tokenMint);
  }

  /**
   * Fetch all swap transactions for a token
   */
  private async fetchSwapTransactions(
    tokenMint: string,
    lookbackHours: number
  ): Promise<SwapData[]> {
    const swaps: SwapData[] = [];
    
    const now = Math.floor(Date.now() / 1000);
    const startTime = now - (lookbackHours * 3600);

    console.log(`🔍 [OHLCV] Fetching signatures for ${tokenMint.slice(0, 8)}...`);
    
    // Fetch all signatures for the TOKEN MINT (not program)
    const tokenPubkey = new PublicKey(tokenMint);
    let signatures = await this.connection.getSignaturesForAddress(tokenPubkey, {
      limit: 1000 // Max limit
    });

    console.log(`📝 [OHLCV] Found ${signatures.length} total signatures for token`);

    // Filter by time
    signatures = signatures.filter(sig => {
      const blockTime = sig.blockTime || 0;
      return blockTime >= startTime;
    });

    console.log(`⏰ [OHLCV] ${signatures.length} signatures in lookback period`);

    // Fetch transactions in batches
    const batchSize = 100;
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      const txSigs = batch.map(sig => sig.signature);
      
      console.log(`📦 [OHLCV] Fetching batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(signatures.length / batchSize)} (${txSigs.length} txs)`);
      
      const transactions = await this.connection.getTransactions(txSigs, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      // Parse each transaction
      for (const tx of transactions) {
        if (!tx || !tx.meta) continue;

        const swapData = this.parseSwapTransaction(tx, tokenMint);
        if (swapData) {
          swaps.push(swapData);
        }
      }
    }

    console.log(`✅ [OHLCV] Extracted ${swaps.length} swaps from ${signatures.length} transactions`);
    
    // Sort by timestamp
    swaps.sort((a, b) => a.timestamp - b.timestamp);
    
    return swaps;
  }

  /**
   * Parse a single transaction to extract swap data
   * Uses proven SmartMoneyTracker logic
   */
  private parseSwapTransaction(
    tx: any,
    tokenMint: string
  ): SwapData | null {
    try {
      if (!tx || !tx.meta || !tx.meta.innerInstructions) return null;

      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];

      // Add loaded addresses for versioned transactions
      if (message.addressTableLookups && tx.meta.loadedAddresses) {
        if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
      }

      // Check inner instructions for buy/sell discriminator
      let isBuy = false;
      let isSell = false;

      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = accountKeys[ix.programIdIndex];
          
          if (programId && programId.toString() === PUMPFUN_PROGRAM_ID) {
            const data = Buffer.from(ix.data, 'base64');
            if (data.length < 8) continue;
            
            const discriminator = data.slice(0, 8).toString('hex');
            
            isBuy = BUY_DISCRIMINATORS.includes(discriminator);
            isSell = SELL_DISCRIMINATORS.includes(discriminator);
            
            if (isBuy || isSell) break;
          }
        }
        if (isBuy || isSell) break;
      }

      if (!isBuy && !isSell) return null;

      // Extract token balance change (SmartMoneyTracker method)
      let tokenAmount = 0;
      let decimals = 6;

      if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
        for (const post of tx.meta.postTokenBalances) {
          if (post.mint === tokenMint) {
            const pre = tx.meta.preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
            const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
            const postAmount = BigInt(post.uiTokenAmount.amount);
            const change = postAmount - preAmount;

            if ((isBuy && change > 0n) || (isSell && change < 0n)) {
              decimals = post.uiTokenAmount.decimals;
              tokenAmount = Math.abs(Number(change)) / Math.pow(10, decimals);
              break;
            }
          }
        }
      }

      // Calculate SOL spent/received (SmartMoneyTracker method)
      let solAmount = 0;
      if (tx.meta.preBalances && tx.meta.postBalances) {
        const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
        solAmount = Math.abs(change / 1e9);
      }

      if (tokenAmount <= 0 || solAmount <= 0) return null;

      // Calculate price
      const price = solAmount / tokenAmount;

      return {
        signature: tx.transaction.signatures[0],
        timestamp: tx.blockTime || 0,
        price,
        tokens: tokenAmount,
        sol: solAmount,
        type: isBuy ? 'buy' : 'sell'
      };
    } catch (err) {
      // Silently skip invalid transactions
    }
    return null;
  }

  /**
   * Build OHLCV candles from swap data
   */
  private buildCandlesFromSwaps(
    swaps: SwapData[],
    timeframeMinutes: number,
    tokenMint: string
  ): {
    candles: OHLCVCandle[];
    metadata: any;
  } {
    if (swaps.length === 0) {
      return {
        candles: [],
        metadata: {
          tokenMint,
          totalSwaps: 0,
          totalVolume: 0,
          startTime: 0,
          endTime: 0
        }
      };
    }

    const timeframeSeconds = timeframeMinutes * 60;
    const candleMap = new Map<number, OHLCVCandle>();

    // Group swaps into candles
    for (const swap of swaps) {
      // Round down to candle start time
      const candleTime = Math.floor(swap.timestamp / timeframeSeconds) * timeframeSeconds;

      let candle = candleMap.get(candleTime);
      if (!candle) {
        candle = {
          time: candleTime,
          open: swap.price,
          high: swap.price,
          low: swap.price,
          close: swap.price,
          volume: 0
        };
        candleMap.set(candleTime, candle);
      }

      // Update OHLC
      candle.high = Math.max(candle.high, swap.price);
      candle.low = Math.min(candle.low, swap.price);
      candle.close = swap.price; // Last swap in this candle
      candle.volume += swap.sol;
    }

    // Convert to array and sort
    const candles = Array.from(candleMap.values()).sort((a, b) => a.time - b.time);

    const totalVolume = swaps.reduce((sum, swap) => sum + swap.sol, 0);

    console.log(`📈 [OHLCV] Built ${candles.length} candles from ${swaps.length} swaps`);
    console.log(`💰 [OHLCV] Total volume: ${totalVolume.toFixed(2)} SOL`);

    return {
      candles,
      metadata: {
        tokenMint,
        totalSwaps: swaps.length,
        totalVolume,
        startTime: swaps[0].timestamp,
        endTime: swaps[swaps.length - 1].timestamp
      }
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }
}
