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

interface TokenMetadata {
  name: string;
  symbol: string;
  uri: string;
  description: string | null;
  image: string | null;
}

/**
 * Unified OHLCV Service
 * Builds historical candles, then transitions to live monitoring
 */
export class UnifiedOHLCVService extends EventEmitter {
  private connection: Connection;
  private tokenMint: PublicKey;
  private bondingCurve: PublicKey | null = null;
  private subscriptionId: number | null = null;
  private isLiveMonitoring = false;
  
  // Candle storage
  private timeframes = [1, 15, 60, 300, 900, 3600, 14400, 86400]; // seconds
  private candles: TimeframeCandles = {};
  private swaps: Swap[] = [];
  private firstSlot: number | null = null;
  
  private readonly PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
  private readonly BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');
  private readonly METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
  
  constructor(rpcUrl: string, tokenMint: string) {
    super();
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.tokenMint = new PublicKey(tokenMint);
    
    // Initialize empty candle arrays
    this.timeframes.forEach(tf => {
      this.candles[this.formatTimeframe(tf)] = [];
    });
  }
  
  /**
   * Main entry point: Build historical + start live monitoring
   */
  async start(lookbackHours: number = 24): Promise<void> {
    console.log(`\n🚀 [UnifiedOHLCV] Starting for token ${this.tokenMint.toBase58()}`);
    
    try {
      // Phase 1: Build historical OHLCV
      await this.buildHistoricalOHLCV(lookbackHours);
      
      // Phase 2: Transition to live monitoring
      await this.startLiveMonitoring();
      
      this.emit('ready', {
        tokenMint: this.tokenMint.toBase58(),
        candles: this.candles,
        swaps: this.swaps
      });
      
    } catch (error) {
      console.error('❌ [UnifiedOHLCV] Startup failed:', error);
      this.emit('error', error);
      throw error;
    }
  }
  
  /**
   * Phase 1: Build historical OHLCV data
   */
  private async buildHistoricalOHLCV(lookbackHours: number): Promise<void> {
    console.log(`\n📊 Phase 1: Building historical OHLCV (${lookbackHours}h)`);
    console.log('='.repeat(80));
    
    // Step 1: Get metadata
    this.emit('status', { phase: 'metadata', message: 'Fetching token metadata...' });
    const metadata = await this.getTokenMetadata();
    if (metadata) {
      console.log(`   ✅ ${metadata.name} (${metadata.symbol})`);
      this.emit('metadata', metadata);
    }
    
    // Step 2: Extract bonding curve
    this.emit('status', { phase: 'bondingCurve', message: 'Extracting bonding curve...' });
    this.bondingCurve = await this.extractBondingCurve();
    if (!this.bondingCurve) {
      throw new Error('Could not find bonding curve');
    }
    console.log(`   ✅ Found bonding curve: ${this.bondingCurve.toBase58()}`);
    
    // Step 3: Fetch all signatures
    this.emit('status', { phase: 'signatures', message: 'Fetching transaction signatures...' });
    const signatures = await this.fetchAllSignatures(lookbackHours);
    console.log(`   Found ${signatures.length} signatures in lookback period`);
    
    if (signatures.length === 0) {
      throw new Error('No transactions found for this token');
    }
    
    // Step 4: Parse transactions
    this.emit('status', { phase: 'parsing', message: 'Parsing transactions...' });
    await this.parseTransactions(signatures);
    console.log(`   Extracted ${this.swaps.length} swaps`);
    
    // Step 5: Build candles
    this.emit('status', { phase: 'candles', message: 'Building OHLCV candles...' });
    this.buildAllCandles();
    
    const candleCount = this.candles['1m'].length;
    console.log(`   Generated ${candleCount} candles\n`);
    
    this.emit('historicalComplete', {
      swaps: this.swaps.length,
      candles: this.candles
    });
  }
  
  /**
   * Phase 2: Start live monitoring
   */
  private async startLiveMonitoring(): Promise<void> {
    if (!this.bondingCurve) {
      throw new Error('Bonding curve not initialized');
    }
    
    console.log(`\n📡 Phase 2: Starting live monitoring`);
    console.log('='.repeat(80));
    
    this.subscriptionId = this.connection.onLogs(
      this.bondingCurve,
      async (logs) => {
        if (!this.isLiveMonitoring) return;
        
        const signature = logs.signature;
        await this.processLiveTransaction(signature);
      },
      'confirmed'
    );
    
    this.isLiveMonitoring = true;
    console.log(`   ✅ Subscribed to bonding curve`);
    console.log(`   🎯 Now broadcasting real-time updates...\n`);
    
    this.emit('liveMonitoringStarted');
  }
  
  /**
   * Get token metadata from Metaplex
   */
  private async getTokenMetadata(): Promise<TokenMetadata | null> {
    try {
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          this.METADATA_PROGRAM_ID.toBuffer(),
          this.tokenMint.toBuffer()
        ],
        this.METADATA_PROGRAM_ID
      );
      
      const accountInfo = await this.connection.getAccountInfo(metadataPDA);
      if (!accountInfo) return null;
      
      const data = accountInfo.data;
      let offset = 1 + 32 + 32; // key + update authority + mint
      
      // Name
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '');
      offset += nameLen;
      
      // Symbol
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '');
      offset += symbolLen;
      
      // URI
      const uriLen = data.readUInt32LE(offset);
      offset += 4;
      const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '');
      
      // Fetch JSON metadata
      let description = null;
      let image = null;
      
      if (uri && uri.startsWith('http')) {
        try {
          const response = await fetch(uri);
          const json = await response.json();
          description = json.description || null;
          image = json.image || null;
        } catch (e) {
          // Silent fail
        }
      }
      
      return { name: name.trim(), symbol: symbol.trim(), uri: uri.trim(), description, image };
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Extract bonding curve address
   */
  private async extractBondingCurve(): Promise<PublicKey | null> {
    try {
      const sigs = await this.connection.getSignaturesForAddress(this.tokenMint, { limit: 10 });
      if (sigs.length === 0) return null;
      
      const tx = await this.connection.getTransaction(sigs[0].signature, {
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) return null;
      
      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];
      
      if (message.addressTableLookups && tx.meta?.loadedAddresses) {
        if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
      }
      
      for (const account of accountKeys) {
        try {
          const accountInfo = await this.connection.getAccountInfo(account);
          if (!accountInfo) continue;
          
          if (accountInfo.owner.equals(this.PUMPFUN_PROGRAM_ID) && 
              accountInfo.data.length >= 120) {
            const discriminator = accountInfo.data.slice(0, 8);
            if (discriminator.equals(this.BONDING_CURVE_DISCRIMINATOR)) {
              return account;
            }
          }
        } catch (e) {
          continue;
        }
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Fetch all signatures from bonding curve
   */
  private async fetchAllSignatures(lookbackHours: number): Promise<string[]> {
    if (!this.bondingCurve) return [];
    
    const signatures: string[] = [];
    const cutoffTime = Math.floor(Date.now() / 1000) - (lookbackHours * 3600);
    let before: string | undefined = undefined;
    
    while (true) {
      const batch = await this.connection.getSignaturesForAddress(
        this.bondingCurve,
        { before, limit: 1000 }
      );
      
      if (batch.length === 0) break;
      
      for (const sig of batch) {
        if (sig.blockTime && sig.blockTime >= cutoffTime) {
          signatures.push(sig.signature);
        }
      }
      
      if (batch.length < 1000) break;
      if (batch[batch.length - 1].blockTime && batch[batch.length - 1].blockTime! < cutoffTime) break;
      
      before = batch[batch.length - 1].signature;
    }
    
    return signatures;
  }
  
  /**
   * Parse historical transactions
   */
  private async parseTransactions(signatures: string[]): Promise<void> {
    const batchSize = 100;
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      
      const transactions = await this.connection.getTransactions(batch, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      for (let txIdx = 0; txIdx < transactions.length; txIdx++) {
        const tx = transactions[txIdx];
        const sig = batch[txIdx];
        if (!tx || !tx.meta) continue;
        
        if (this.firstSlot === null && tx.slot) {
          this.firstSlot = tx.slot;
        }
        
        const swap = this.parseSwapTransaction(tx, sig);
        if (swap) this.swaps.push(swap);
      }
      
      this.emit('progress', {
        phase: 'parsing',
        current: Math.min(i + batchSize, signatures.length),
        total: signatures.length
      });
    }
    
    // Sort by slot, then apply tags
    this.swaps.sort((a, b) => {
      if (a.slot !== b.slot) return a.slot - b.slot;
      if (a.isMint && !b.isMint) return -1;
      if (!a.isMint && b.isMint) return 1;
      return a.timestamp - b.timestamp;
    });
    
    this.applyTags();
  }
  
  /**
   * Parse swap transaction
   */
  private parseSwapTransaction(tx: any, signature: string): Swap | null {
    try {
      if (!tx || !tx.meta) return null;
      
      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];
      
      if (message.addressTableLookups && tx.meta.loadedAddresses) {
        if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
      }
      
      let buyAmount = 0;
      let sellAmount = 0;
      let decimals = 6;
      
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
      
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances?.find((b: any) => b.accountIndex === accountIndex);
        const post = tx.meta.postTokenBalances?.find((b: any) => b.accountIndex === accountIndex);
        
        if (!post) continue;
        
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        decimals = post.uiTokenAmount.decimals;
        const changeFloat = Number(change) / Math.pow(10, decimals);
        
        if (change > 0n) buyAmount += changeFloat;
        else if (change < 0n) sellAmount += Math.abs(changeFloat);
      }
      
      const isBuy = buyAmount > sellAmount;
      const isSell = sellAmount > buyAmount;
      const tokenAmount = isBuy ? buyAmount : sellAmount;
      
      if (tokenAmount === 0 || (!isBuy && !isSell)) return null;
      
      // Calculate SOL amount
      let solAmount = 0;
      
      if (tx.meta.postBalances && tx.meta.preBalances && this.bondingCurve) {
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
   * Apply tags to swaps after sorting
   */
  private applyTags(): void {
    if (!this.firstSlot || this.swaps.length === 0) return;
    
    for (const swap of this.swaps) {
      const tags: string[] = [];
      
      if (swap.slot === this.firstSlot) {
        if (swap === this.swaps[0]) {
          tags.push('MINT', 'BLOCK_0', 'DEV');
        } else {
          tags.push('BUNDLER', 'BLOCK_0');
        }
      }
      
      if (swap.slot > this.firstSlot && swap.slot <= this.firstSlot + 2) {
        tags.push('EARLY_SNIPER');
        tags.push(`BLOCK_${swap.slot - this.firstSlot}`);
      }
      
      if (swap.isVolumeBot) tags.push('VOLUME_BOT');
      if (swap.type === 'buy' && swap.solAmount > 10) tags.push('LARGE_BUY');
      if (swap.type === 'sell' && swap.solAmount > 10) tags.push('LARGE_SELL');
      
      if (tags.length > 0) swap.tags = tags;
    }
  }
  
  /**
   * Build candles for all timeframes
   */
  private buildAllCandles(): void {
    for (const timeframeSeconds of this.timeframes) {
      const tf = this.formatTimeframe(timeframeSeconds);
      this.candles[tf] = this.buildCandles(timeframeSeconds);
    }
  }
  
  /**
   * Build candles for a specific timeframe
   */
  private buildCandles(timeframeSeconds: number): Candle[] {
    if (this.swaps.length === 0) return [];
    
    const candles: Candle[] = [];
    const bucketSize = timeframeSeconds;
    
    const firstTime = this.swaps[0].timestamp;
    const lastTime = this.swaps[this.swaps.length - 1].timestamp;
    
    const startBucket = Math.floor(firstTime / bucketSize) * bucketSize;
    const endBucket = Math.floor(lastTime / bucketSize) * bucketSize;
    
    for (let t = startBucket; t <= endBucket; t += bucketSize) {
      const bucketEnd = t + bucketSize;
      const bucketSwaps = this.swaps.filter(s => s.timestamp >= t && s.timestamp < bucketEnd);
      
      let open, high, low, close;
      
      if (bucketSwaps.length === 0) {
        if (candles.length > 0) {
          const prevClose = candles[candles.length - 1].close;
          open = high = low = close = prevClose;
        } else {
          continue;
        }
      } else {
        // CRITICAL: Open equals previous close for gap-free charts
        if (candles.length > 0) {
          open = candles[candles.length - 1].close;
        } else {
          open = bucketSwaps[0].price;
        }
        
        close = bucketSwaps[bucketSwaps.length - 1].price;
        high = Math.max(...bucketSwaps.map(s => s.price));
        low = Math.min(...bucketSwaps.map(s => s.price));
        
        high = Math.max(high, open);
        low = Math.min(low, open);
      }
      
      const volume = bucketSwaps.reduce((sum, s) => sum + s.solAmount, 0);
      candles.push({ time: t, open, high, low, close, volume });
    }
    
    return candles;
  }
  
  /**
   * Process live transaction
   */
  private async processLiveTransaction(signature: string): Promise<void> {
    try {
      const tx = await this.connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx || !tx.meta || tx.meta.err) return;
      
      const swap = this.parseSwapTransaction(tx, signature);
      if (!swap) return;
      
      // Add to swaps
      this.swaps.push(swap);
      
      // Update all timeframe candles
      for (const timeframeSeconds of this.timeframes) {
        const tf = this.formatTimeframe(timeframeSeconds);
        const candleTime = Math.floor(swap.timestamp / timeframeSeconds) * timeframeSeconds;
        
        let candle = this.candles[tf].find(c => c.time === candleTime);
        
        if (!candle) {
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
          candle.high = Math.max(candle.high, swap.price);
          candle.low = Math.min(candle.low, swap.price);
          candle.close = swap.price;
          candle.volume += swap.solAmount;
        }
        
        // Broadcast candle update
        this.emit('candleUpdate', {
          timeframe: tf,
          candle
        });
      }
      
      // Broadcast swap
      this.emit('swap', swap);
      
    } catch (error) {
      console.error(`❌ Error processing live tx ${signature}:`, error);
    }
  }
  
  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    
    this.isLiveMonitoring = false;
    this.emit('stopped');
  }
  
  /**
   * Get current candles
   */
  getCandles(timeframe?: string): TimeframeCandles | Candle[] {
    return timeframe ? this.candles[timeframe] : this.candles;
  }
  
  /**
   * Get recent swaps
   */
  getRecentSwaps(limit: number = 100): Swap[] {
    return this.swaps.slice(-limit);
  }
  
  /**
   * Format timeframe
   */
  private formatTimeframe(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${seconds / 60}m`;
    if (seconds < 86400) return `${seconds / 3600}H`;
    return `${seconds / 86400}D`;
  }
}
