/**
 * Test Unified OHLCV Service
 * Tests the complete flow: historical build → live monitoring
 */

import { Connection, PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Test token
const TOKEN_MINT = process.argv[2] || 'ArD82QtzQg1Uke9BVUkHT6BAP5qeFTqstFaJGEiLpump';
const LOOKBACK_HOURS = parseInt(process.argv[3]) || 1; // Short test period

console.log('🧪 Testing Unified OHLCV Service\n');
console.log(`Token: ${TOKEN_MINT}`);
console.log(`Lookback: ${LOOKBACK_HOURS}h\n`);
console.log('='.repeat(80) + '\n');

class TestUnifiedOHLCV extends EventEmitter {
  constructor(tokenMint) {
    super();
    this.tokenMint = new PublicKey(tokenMint);
    this.bondingCurve = null;
    this.subscriptionId = null;
    this.isLiveMonitoring = false;
    
    this.timeframes = [1, 15, 60, 300, 900, 3600, 14400, 86400];
    this.candles = {};
    this.swaps = [];
    this.firstSlot = null;
    
    this.timeframes.forEach(tf => {
      this.candles[this.formatTimeframe(tf)] = [];
    });
  }
  
  formatTimeframe(seconds) {
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${seconds / 60}m`;
    if (seconds < 86400) return `${seconds / 3600}H`;
    return `${seconds / 86400}D`;
  }
  
  async start(lookbackHours) {
    console.log('📊 Phase 1: Building Historical OHLCV');
    console.log('='.repeat(80));
    
    try {
      // Get metadata
      console.log('\n1️⃣  Fetching token metadata...');
      const metadata = await this.getTokenMetadata();
      if (metadata) {
        console.log(`   ✅ ${metadata.name} (${metadata.symbol})`);
        this.emit('metadata', metadata);
      }
      
      // Extract bonding curve
      console.log('\n2️⃣  Extracting bonding curve...');
      this.bondingCurve = await this.extractBondingCurve();
      if (!this.bondingCurve) throw new Error('Bonding curve not found');
      console.log(`   ✅ ${this.bondingCurve.toBase58()}`);
      
      // Fetch signatures
      console.log('\n3️⃣  Fetching transaction signatures...');
      const signatures = await this.fetchAllSignatures(lookbackHours);
      console.log(`   ✅ Found ${signatures.length} signatures`);
      
      if (signatures.length === 0) {
        console.log('   ⚠️  No transactions found in lookback period');
        return;
      }
      
      // Parse transactions
      console.log('\n4️⃣  Parsing transactions...');
      await this.parseTransactions(signatures);
      console.log(`   ✅ Extracted ${this.swaps.length} swaps`);
      
      // Build candles
      console.log('\n5️⃣  Building OHLCV candles...');
      this.buildAllCandles();
      const candleCount = this.candles['1m'].length;
      console.log(`   ✅ Generated ${candleCount} candles`);
      
      this.emit('historicalComplete', {
        swaps: this.swaps.length,
        candles: this.candles
      });
      
      // Start live monitoring
      console.log('\n\n📡 Phase 2: Starting Live Monitoring');
      console.log('='.repeat(80));
      await this.startLiveMonitoring();
      
      this.emit('ready', {
        tokenMint: this.tokenMint.toBase58(),
        candles: this.candles,
        swaps: this.swaps
      });
      
      console.log('\n✅ Service fully operational!');
      console.log('   Waiting for new transactions...');
      console.log('   Press Ctrl+C to stop\n');
      
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      this.emit('error', error);
    }
  }
  
  async getTokenMetadata() {
    try {
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          this.tokenMint.toBuffer()
        ],
        METADATA_PROGRAM_ID
      );
      
      const accountInfo = await connection.getAccountInfo(metadataPDA);
      if (!accountInfo) return null;
      
      const data = accountInfo.data;
      let offset = 1 + 32 + 32;
      
      const nameLen = data.readUInt32LE(offset);
      offset += 4;
      const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '');
      offset += nameLen;
      
      const symbolLen = data.readUInt32LE(offset);
      offset += 4;
      const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '');
      offset += symbolLen;
      
      const uriLen = data.readUInt32LE(offset);
      offset += 4;
      const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '');
      
      return { name: name.trim(), symbol: symbol.trim(), uri: uri.trim() };
    } catch (error) {
      return null;
    }
  }
  
  async extractBondingCurve() {
    const sigs = await connection.getSignaturesForAddress(this.tokenMint, { limit: 10 });
    if (sigs.length === 0) return null;
    
    const tx = await connection.getTransaction(sigs[0].signature, {
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
        const accountInfo = await connection.getAccountInfo(account);
        if (!accountInfo) continue;
        
        if (accountInfo.owner.equals(PUMPFUN_PROGRAM_ID) && 
            accountInfo.data.length >= 120) {
          const discriminator = accountInfo.data.slice(0, 8);
          if (discriminator.equals(BONDING_CURVE_DISCRIMINATOR)) {
            return account;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  }
  
  async fetchAllSignatures(lookbackHours) {
    const signatures = [];
    const cutoffTime = Math.floor(Date.now() / 1000) - (lookbackHours * 3600);
    let before = undefined;
    
    while (true) {
      const batch = await connection.getSignaturesForAddress(
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
      if (batch[batch.length - 1].blockTime && batch[batch.length - 1].blockTime < cutoffTime) break;
      
      before = batch[batch.length - 1].signature;
    }
    
    return signatures;
  }
  
  async parseTransactions(signatures) {
    const batchSize = 100;
    
    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      
      const transactions = await connection.getTransactions(batch, {
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
    }
    
    // Sort and apply tags
    this.swaps.sort((a, b) => {
      if (a.slot !== b.slot) return a.slot - b.slot;
      if (a.isMint && !b.isMint) return -1;
      if (!a.isMint && b.isMint) return 1;
      return a.timestamp - b.timestamp;
    });
    
    this.applyTags();
  }
  
  parseSwapTransaction(tx, signature) {
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
      
      const allAccountIndices = new Set();
      
      if (tx.meta.preTokenBalances) {
        tx.meta.preTokenBalances.forEach(b => {
          if (b.mint === this.tokenMint.toBase58()) allAccountIndices.add(b.accountIndex);
        });
      }
      
      if (tx.meta.postTokenBalances) {
        tx.meta.postTokenBalances.forEach(b => {
          if (b.mint === this.tokenMint.toBase58()) allAccountIndices.add(b.accountIndex);
        });
      }
      
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances?.find(b => b.accountIndex === accountIndex);
        const post = tx.meta.postTokenBalances?.find(b => b.accountIndex === accountIndex);
        
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
      const hasPreTokenBalance = tx.meta.preTokenBalances?.some(b => b.mint === this.tokenMint.toBase58()) || false;
      const hasPostTokenBalance = tx.meta.postTokenBalances?.some(b => b.mint === this.tokenMint.toBase58()) || false;
      const isMint = hasPostTokenBalance && !hasPreTokenBalance;
      
      return {
        signature,
        timestamp: tx.blockTime,
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
  
  applyTags() {
    if (!this.firstSlot || this.swaps.length === 0) return;
    
    for (const swap of this.swaps) {
      const tags = [];
      
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
  
  buildAllCandles() {
    for (const timeframeSeconds of this.timeframes) {
      const tf = this.formatTimeframe(timeframeSeconds);
      this.candles[tf] = this.buildCandles(timeframeSeconds);
    }
  }
  
  buildCandles(timeframeSeconds) {
    if (this.swaps.length === 0) return [];
    
    const candles = [];
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
  
  async startLiveMonitoring() {
    if (!this.bondingCurve) throw new Error('Bonding curve not initialized');
    
    this.subscriptionId = connection.onLogs(
      this.bondingCurve,
      async (logs) => {
        if (!this.isLiveMonitoring) return;
        
        const signature = logs.signature;
        console.log(`\n🔴 LIVE: New transaction detected - ${signature.slice(0, 8)}...`);
        
        await this.processLiveTransaction(signature);
      },
      'confirmed'
    );
    
    this.isLiveMonitoring = true;
    console.log('   ✅ Subscribed to bonding curve');
    this.emit('liveMonitoringStarted');
  }
  
  async processLiveTransaction(signature) {
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx || !tx.meta || tx.meta.err) return;
      
      const swap = this.parseSwapTransaction(tx, signature);
      if (!swap) {
        console.log('   ⚠️  Not a swap transaction');
        return;
      }
      
      this.swaps.push(swap);
      
      console.log(`   ✅ ${swap.type.toUpperCase()}: ${swap.tokenAmount.toFixed(2)} tokens @ ${swap.price.toExponential(4)} SOL`);
      console.log(`   💰 Volume: ${swap.solAmount.toFixed(4)} SOL`);
      if (swap.tags) console.log(`   🏷️  Tags: ${swap.tags.join(', ')}`);
      
      // Update candles
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
        
        this.emit('candleUpdate', { timeframe: tf, candle });
      }
      
      this.emit('swap', swap);
      
    } catch (error) {
      console.error(`   ❌ Error processing live tx:`, error.message);
    }
  }
  
  async stop() {
    if (this.subscriptionId !== null) {
      await connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }
    
    this.isLiveMonitoring = false;
    console.log('\n⏹️  Monitoring stopped');
  }
}

// Run test
const service = new TestUnifiedOHLCV(TOKEN_MINT);

// Event handlers
service.on('metadata', (metadata) => {
  console.log(`\n📋 Metadata Event:`, metadata);
});

service.on('historicalComplete', (data) => {
  console.log(`\n✅ Historical Complete Event:`);
  console.log(`   Swaps: ${data.swaps}`);
  console.log(`   Candles (1m): ${data.candles['1m'].length}`);
});

service.on('ready', (data) => {
  console.log(`\n🎯 Service Ready Event:`);
  console.log(`   Token: ${data.tokenMint}`);
  console.log(`   Total Swaps: ${data.swaps.length}`);
});

service.on('swap', (swap) => {
  // Real-time swap events logged in processLiveTransaction
});

service.on('candleUpdate', ({ timeframe, candle }) => {
  // Candle updates logged in processLiveTransaction
});

service.on('error', (error) => {
  console.error('\n❌ Service Error:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n\n⏹️  Shutting down...');
  await service.stop();
  process.exit(0);
});

// Start the service
service.start(LOOKBACK_HOURS);
