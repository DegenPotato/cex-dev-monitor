/**
 * Manual OHLCV Builder Test
 * Usage: node test-ohlcv-manual.mjs <TOKEN_CA> [TIMEFRAME_MINUTES] [LOOKBACK_HOURS]
 * Example: node test-ohlcv-manual.mjs fzMxQJ4pA3ckd6Cgv99zvyNRRevyv5Q1Ej9XKZupump 5 1
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateEnhancedHTML } from './test-ohlcv-enhanced.mjs';
import { WebSocketServer } from 'ws';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

// Discriminators from SmartMoneyTracker
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

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length === 0) {
  console.log('❌ Error: Please provide a token CA');
  console.log('\nUsage: node test-ohlcv-manual.mjs <TOKEN_CA> [LOOKBACK_HOURS]');
  console.log('Example: node test-ohlcv-manual.mjs fzMxQJ4pA3ckd6Cgv99zvyNRRevyv5Q1Ej9XKZupump 24\n');
  process.exit(1);
}

const TOKEN_CA = args[0];
const TIMEFRAMES = [1/60, 15/60, 1, 5, 15, 60, 240, 1440]; // 1s, 15s, 1m, 5m, 15m, 1h, 4h, 1D in minutes
const LOOKBACK_HOURS = args[1] ? parseInt(args[1]) : 24;

console.log('🚀 Manual OHLCV Builder Test\n');
console.log(`Token: ${TOKEN_CA}`);
console.log(`Timeframes: ${TIMEFRAMES.map(tf => tf >= 1440 ? `${tf/1440}D` : tf >= 60 ? `${tf/60}H` : tf >= 1 ? `${tf}m` : `${tf*60}s`).join(', ')}`);
console.log(`Lookback: ${LOOKBACK_HOURS}h\n`);

/**
 * Get Metaplex metadata PDA for a token
 */
function getMetadataPDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Extract token metadata from Metaplex
 */
async function getTokenMetadata(tokenMint) {
  try {
    const metadataPDA = getMetadataPDA(tokenMint);
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    
    if (!accountInfo) return null;
    
    const data = accountInfo.data;
    let offset = 1; // Skip key byte
    offset += 32; // Update authority
    offset += 32; // Mint
    
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
    
    // Fetch JSON metadata from URI
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
    
    return {
      name: name.trim(),
      symbol: symbol.trim(),
      uri: uri.trim(),
      description,
      image
    };
  } catch (error) {
    console.warn(`   ⚠️  Could not fetch metadata: ${error.message}`);
    return null;
  }
}

async function buildOHLCVForToken(tokenMint) {
  const startTime = Date.now();
  
  console.log('='.repeat(80));
  console.log(`📊 Building OHLCV`);
  console.log('='.repeat(80) + '\n');

  try {
    const tokenPubkey = new PublicKey(tokenMint);
    
    console.log('\n📡 Step 1: Fetching token metadata...');
    const metadata = await getTokenMetadata(tokenPubkey);
    
    if (metadata) {
      console.log(`   ✅ ${metadata.name} (${metadata.symbol})`);
      if (metadata.description) console.log(`   📝 ${metadata.description.slice(0, 100)}${metadata.description.length > 100 ? '...' : ''}`);
    }
    
    console.log('\n📡 Step 2: Deriving bonding curve address...');
    
    // Derive bonding curve PDA (Program Derived Address)
    // Seeds: ["bonding-curve", token_mint]
    const [bondingCurveAddress] = await PublicKey.findProgramAddress(
      [Buffer.from('bonding-curve'), tokenPubkey.toBuffer()],
      PUMPFUN_PROGRAM_ID
    );
    
    // Verify it exists and is actually a bonding curve
    try {
      const info = await connection.getAccountInfo(bondingCurveAddress);
      if (!info) {
        console.log('❌ Bonding curve account does not exist');
        console.log('   💡 Token may have graduated to Raydium or is not a pump.fun token');
        return;
      }
      
      if (!info.owner.equals(PUMPFUN_PROGRAM_ID)) {
        console.log('❌ Account is not owned by pump.fun program');
        return;
      }
      
      if (info.data.length < 8 || !info.data.slice(0, 8).equals(BONDING_CURVE_DISCRIMINATOR)) {
        console.log('❌ Account is not a bonding curve');
        return;
      }
      
      console.log(`   ✅ Found bonding curve: ${bondingCurveAddress.toBase58()}`);
    } catch (e) {
      console.log('❌ Failed to fetch bonding curve:', e.message);
      return;
    }
    
    const now = Math.floor(Date.now() / 1000);
    const lookbackTime = now - (LOOKBACK_HOURS * 3600);

    console.log('   Fetching ALL signatures from bonding curve (paginated)...');
    let allSignatures = [];
    let before = undefined;
    let batch = 0;
    
    while (true) {
      batch++;
      const sigs = await connection.getSignaturesForAddress(bondingCurveAddress, {
        before,
        limit: 1000
      });
      
      if (sigs.length === 0) break;
      
      process.stdout.write(`   Batch ${batch}: ${sigs.length} signatures (total: ${allSignatures.length + sigs.length})\r`);
      
      allSignatures.push(...sigs);
      
      // Check if we've gone past the cutoff time
      const oldest = sigs[sigs.length - 1];
      if (oldest.blockTime && oldest.blockTime < lookbackTime) {
        // Filter out old ones
        allSignatures = allSignatures.filter(s => !s.blockTime || s.blockTime >= lookbackTime);
        break;
      }
      
      if (sigs.length < 1000) break;
      
      before = oldest.signature;
    }
    
    console.log(`\n   Found ${allSignatures.length} total signatures`);
    let signatures = allSignatures;
    
    if (signatures.length > 0) {
      const firstSig = signatures[signatures.length - 1];
      const lastSig = signatures[0];
      const firstTime = new Date(firstSig.blockTime * 1000).toLocaleString();
      const lastTime = new Date(lastSig.blockTime * 1000).toLocaleString();
      console.log(`   First tx: ${firstTime}`);
      console.log(`   Last tx:  ${lastTime}`);
    }

    // Filter by time
    signatures = signatures.filter(sig => {
      const blockTime = sig.blockTime || 0;
      return blockTime >= lookbackTime;
    });

    console.log(`   ${signatures.length} signatures in lookback period\n`);

    if (signatures.length === 0) {
      console.log('❌ No recent activity for this token in the lookback period');
      console.log('   Try increasing lookback hours (3rd argument)\n');
      return;
    }

    console.log('📦 Step 2: Fetching and parsing transactions...');
  
  const swaps = [];
  const batchSize = 100;

    for (let i = 0; i < signatures.length; i += batchSize) {
      const batch = signatures.slice(i, i + batchSize);
      const txSigs = batch.map(sig => sig.signature);
      
      process.stdout.write(`   Batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(signatures.length / batchSize)} (${txSigs.length} txs)...\r`);
      
      const transactions = await connection.getTransactions(txSigs, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      for (let txIdx = 0; txIdx < transactions.length; txIdx++) {
        const tx = transactions[txIdx];
        const sig = txSigs[txIdx];
        if (!tx || !tx.meta) continue;
        
        const swap = parseSwapTransaction(tx, tokenMint, sig, bondingCurveAddress);
        if (swap) swaps.push(swap);
      }
    }

    console.log(`\n   Extracted ${swaps.length} swaps\n`);

    if (swaps.length === 0) {
      console.log('❌ No swaps found for this token in the lookback period');
      console.log('   This might not be a Pumpfun token or has no trading activity\n');
      return;
    }

    // Sort swaps by SLOT first, with special handling for mint transaction
    swaps.sort((a, b) => {
      // Different slots - sort by slot
      if (a.slot !== b.slot) return a.slot - b.slot;
      
      // Same slot - prioritize mint transaction (no pre token balances)
      if (a.isMint && !b.isMint) return -1;
      if (!a.isMint && b.isMint) return 1;
      
      // Both same type - sort by timestamp
      return a.timestamp - b.timestamp;
    });
    
    // NOW apply tags after sorting, using the actual first slot
    const firstSlot = swaps[0]?.slot;
    
    if (firstSlot) {
      for (const swap of swaps) {
        const tags = [];
        
        // 1. Check if this is the mint/create transaction (block 0)
        if (swap.slot === firstSlot) {
          // Only tag the FIRST transaction in block 0 as MINT/DEV
          if (swap === swaps[0]) {
            tags.push('MINT', 'BLOCK_0', 'DEV');
          } else {
            // Other transactions in block 0 are bundlers
            tags.push('BUNDLER', 'BLOCK_0');
          }
        }
        
        // 2. Detect early snipers (blocks 1-2 after mint)
        if (swap.slot > firstSlot && swap.slot <= firstSlot + 2) {
          tags.push('EARLY_SNIPER');
          tags.push(`BLOCK_${swap.slot - firstSlot}`);
        }
        
        // 3. Detect volume bots (check if has both buy and sell in original data)
        if (swap.isVolumeBot) {
          tags.push('VOLUME_BOT');
        }
        
        // 4. Detect large buys (>10 SOL)
        if (swap.type === 'buy' && swap.solAmount > 10) {
          tags.push('LARGE_BUY');
        }
        
        // 5. Detect large sells (>10 SOL)
        if (swap.type === 'sell' && swap.solAmount > 10) {
          tags.push('LARGE_SELL');
        }
        
        // Apply tags
        if (tags.length > 0) {
          swap.tags = tags;
        }
      }
    }
    
    console.log(`📌 First transaction: Slot ${swaps[0].slot}, ${swaps[0].tags?.join(', ') || 'No tags'}`);

    console.log('📊 Step 3: Fetching SOL price from Orca pool...');
    let solPrice = 0;
    try {
      // Orca SOL/USDC pool (most accurate on-chain price)
      const ORCA_SOL_VAULT = new PublicKey('ANP74VNsHwSrq9uUSjiSNyNWvf6ZPrKTmE4gHoNd13Lg');
      const ORCA_USDC_VAULT = new PublicKey('75HgnSvXbWKZBpZHveX68ZzAhDqMzNDS29X6BGLtxMo1');
      
      const [solVault, usdcVault] = await Promise.all([
        connection.getAccountInfo(ORCA_SOL_VAULT),
        connection.getAccountInfo(ORCA_USDC_VAULT)
      ]);
      
      if (solVault && usdcVault) {
        // Parse token account data (balance at offset 64)
        const solBalance = Number(solVault.data.readBigUInt64LE(64)) / 1e9; // SOL 9 decimals
        const usdcBalance = Number(usdcVault.data.readBigUInt64LE(64)) / 1e6; // USDC 6 decimals
        solPrice = usdcBalance / solBalance;
        console.log(`   SOL Price: $${solPrice.toFixed(2)} (from Orca SOL/USDC pool)\n`);
      } else {
        console.log('   ⚠️ Could not fetch Orca pool data\n');
      }
    } catch (err) {
      console.log(`   ⚠️ Could not fetch SOL price: ${err.message}\n`);
    }

    console.log('📊 Step 4: Building OHLCV candles for multiple timeframes...');
    
    const allTimeframeCandles = {};
    
    for (const tf of TIMEFRAMES) {
      const candles = buildCandles(swaps, tf);
      const label = tf >= 1440 ? `${tf/1440}D` : tf >= 60 ? `${tf/60}H` : tf >= 1 ? `${tf}m` : `${tf*60}s`;
      allTimeframeCandles[label] = candles;
      console.log(`   ${label}: ${candles.length} candles`);
    }
    
    const candles = allTimeframeCandles['1m']; // Default for console output
    console.log();

    // Calculate stats
    const totalVolume = swaps.reduce((sum, s) => sum + s.solAmount, 0);
    const buys = swaps.filter(s => s.type === 'buy').length;
    const sells = swaps.filter(s => s.type === 'sell').length;

    // Display results
    console.log('✅ RESULTS:\n');
    console.log(`📈 Total Swaps: ${swaps.length} (${buys} buys, ${sells} sells)`);
    console.log(`💰 Total Volume: ${totalVolume.toFixed(2)} SOL`);
    console.log(`🕯️  Candles Generated: ${candles.length}`);
    console.log(`⏱️  Time Taken: ${((Date.now() - startTime) / 1000).toFixed(1)}s\n`);

    // Show first and last 3 candles
    console.log('📊 First 3 Candles:');
    candles.slice(0, 3).forEach((c, i) => {
      const date = new Date(c.time * 1000).toLocaleString();
      const change = ((c.close - c.open) / c.open * 100).toFixed(2);
      const color = c.close >= c.open ? '🟢' : '🔴';
      console.log(`   ${i+1}. ${date} ${color} O:${c.open.toFixed(12)} H:${c.high.toFixed(12)} L:${c.low.toFixed(12)} C:${c.close.toFixed(12)} V:${c.volume.toFixed(2)} (${change}%)`);
    });

    if (candles.length > 3) {
      console.log('\n📊 Last 3 Candles:');
      candles.slice(-3).forEach((c, i) => {
        const date = new Date(c.time * 1000).toLocaleString();
        const change = ((c.close - c.open) / c.open * 100).toFixed(2);
        const color = c.close >= c.open ? '🟢' : '🔴';
        console.log(`   ${candles.length - 2 + i}. ${date} ${color} O:${c.open.toFixed(12)} H:${c.high.toFixed(12)} L:${c.low.toFixed(12)} C:${c.close.toFixed(12)} V:${c.volume.toFixed(2)} (${change}%)`);
      });
    }

    // Generate enhanced HTML report with all timeframes
    const html = generateEnhancedHTML(allTimeframeCandles, swaps, signatures, {
      totalSwaps: swaps.length,
      totalVolume,
      buys,
      sells,
      token: tokenMint,
      bondingCurve: bondingCurveAddress.toBase58(),
      solPrice,
      metadata
    });
    
    fs.writeFileSync('test-ohlcv-results.html', html);

    console.log('\n📄 HTML report generated: test-ohlcv-results.html');
    console.log('   Run: start test-ohlcv-results.html\n');

    // Start live monitoring
    console.log('📡 Starting live monitoring...');
    console.log('   Listening for new transactions...');
    console.log('   Press Ctrl+C to stop\n');
    
    // Get the last processed timestamp to detect gaps
    const lastProcessedTimestamp = swaps[swaps.length - 1]?.timestamp || Math.floor(Date.now() / 1000);
    
    await startLiveMonitoring(bondingCurveAddress, tokenMint, allTimeframeCandles, swaps, solPrice, lastProcessedTimestamp);

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

/**
 * Start live monitoring - picks up where historical build left off
 */
async function startLiveMonitoring(bondingCurve, tokenMint, candles, swaps, solPrice, lastProcessedTimestamp) {
  // CRITICAL: Catch up on any transactions missed during transition
  console.log('🔍 Checking for gap transactions...');
  const gapSigs = await connection.getSignaturesForAddress(bondingCurve, { limit: 100 });
  
  let gapCount = 0;
  for (const sig of gapSigs) {
    // Only process transactions newer than last processed
    if (sig.blockTime && sig.blockTime > lastProcessedTimestamp) {
      const tx = await connection.getTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (tx && tx.meta && !tx.meta.err) {
        const swap = parseSwapTransaction(tx, tokenMint, sig.signature, bondingCurve);
        if (swap) {
          if (swap.type === 'burn') {
            swaps.push(swap);
            gapCount++;
            continue;
          }
          swaps.push(swap);
          gapCount++;

          // Update candles for gap transactions
          for (const [timeframe, tfCandles] of Object.entries(candles)) {
            const timeframeSeconds = parseTimeframeToSeconds(timeframe);
            const candleTime = Math.floor(swap.timestamp / timeframeSeconds) * timeframeSeconds;
            
            let candle = tfCandles.find(c => c.time === candleTime);
            
            if (!candle) {
              const prevCandle = tfCandles[tfCandles.length - 1];
              const open = prevCandle ? prevCandle.close : swap.price;
              
              candle = {
                time: candleTime,
                open,
                high: swap.price,
                low: swap.price,
                close: swap.price,
                volume: swap.solAmount
              };
              
              tfCandles.push(candle);
            } else {
              candle.high = Math.max(candle.high, swap.price);
              candle.low = Math.min(candle.low, swap.price);
              candle.close = swap.price;
              candle.volume += swap.solAmount;
            }
          }
        }
      }
    }
  }
  
  if (gapCount > 0) {
    console.log(`   ✅ Caught up on ${gapCount} gap transactions\n`);
  } else {
    console.log(`   ✅ No gap - continuous coverage\n`);
  }
  
  // Start WebSocket server for broadcasting
  const wss = new WebSocketServer({ port: 8889 });
  console.log('🔌 WebSocket server started on ws://localhost:8889\n');
  
  wss.on('connection', (ws) => {
    console.log('📱 Client connected - sending current state');
    
    // Send CURRENT state (includes historical + all live updates)
    ws.send(JSON.stringify({
      type: 'initial',
      candles, // This now includes all updates from live monitoring
      swaps: swaps.slice(-200) // Last 200 swaps (including live ones)
    }));
    
    console.log('   📊 Sent current candles with all live updates');
  });
  
  function broadcast(message) {
    wss.clients.forEach((client) => {
      if (client.readyState === 1) { // OPEN
        client.send(JSON.stringify(message));
      }
    });
  }
  
  const subscriptionId = connection.onLogs(
    bondingCurve,
    async (logs) => {
      const signature = logs.signature;
      
      try {
        // Fetch the transaction
        const tx = await connection.getTransaction(signature, {
          maxSupportedTransactionVersion: 0,
          commitment: 'confirmed'
        });
        
        if (!tx || !tx.meta || tx.meta.err) return;
        
        // Parse the swap
        const swap = parseSwapTransaction(tx, tokenMint, signature, bondingCurve);
        if (!swap) return;
        
        // Add to swaps array
        swaps.push(swap);

        if (swap.type === 'burn') {
          console.log(`\n🔥 LIVE: BURN detected`);
          console.log(`   Signature: ${signature.slice(0, 8)}...`);
          console.log(`   Amount burned: ${swap.tokenAmount.toFixed(2)} tokens`);
          broadcast({ type: 'burn', data: swap });
          return;
        }

        console.log(`\n🔴 LIVE: ${swap.type.toUpperCase()} detected`);
        console.log(`   Signature: ${signature.slice(0, 8)}...`);
        console.log(`   Price: ${swap.price.toFixed(12)} SOL`);
        console.log(`   Amount: ${swap.tokenAmount.toFixed(2)} tokens`);
        console.log(`   Volume: ${swap.solAmount.toFixed(4)} SOL`);
        if (swap.tags) console.log(`   Tags: ${swap.tags.join(', ')}`);
        
        // Broadcast new swap to clients
        broadcast({ type: 'swap', data: swap });
        
        // Update candles for all timeframes
        for (const [timeframe, tfCandles] of Object.entries(candles)) {
          const timeframeSeconds = parseTimeframeToSeconds(timeframe);
          const candleTime = Math.floor(swap.timestamp / timeframeSeconds) * timeframeSeconds;
          
          let candle = tfCandles.find(c => c.time === candleTime);
          
          if (!candle) {
            // New candle - use previous close as open
            const prevCandle = tfCandles[tfCandles.length - 1];
            const open = prevCandle ? prevCandle.close : swap.price;
            
            candle = {
              time: candleTime,
              open,
              high: swap.price,
              low: swap.price,
              close: swap.price,
              volume: swap.solAmount
            };
            
            tfCandles.push(candle);
            console.log(`   📊 New ${timeframe} candle created`);
          } else {
            // Update existing candle
            candle.high = Math.max(candle.high, swap.price);
            candle.low = Math.min(candle.low, swap.price);
            candle.close = swap.price;
            candle.volume += swap.solAmount;
            console.log(`   📊 ${timeframe} candle updated`);
          }
          
          // Broadcast candle update
          broadcast({
            type: 'candleUpdate',
            timeframe,
            candle
          });
        }
        
      } catch (error) {
        console.error(`   ❌ Error processing live transaction:`, error.message);
      }
    },
    'confirmed'
  );
  
  console.log(`✅ Live monitoring started (subscription ID: ${subscriptionId})`);
  
  // Keep the process running
  process.on('SIGINT', async () => {
    console.log('\n\n⏹️  Stopping live monitoring...');
    await connection.removeOnLogsListener(subscriptionId);
    console.log('✅ Stopped\n');
    process.exit(0);
  });
}

/**
 * Parse timeframe string to seconds
 */
function parseTimeframeToSeconds(timeframe) {
  const match = timeframe.match(/^(\d+)([smHD])$/);
  if (!match) return 60; // Default to 1m
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return value;
    case 'm': return value * 60;
    case 'H': return value * 3600;
    case 'D': return value * 86400;
    default: return 60;
  }
}

function parseSwapTransaction(tx, tokenMint, signature, bondingCurveAddress) {
  try {
    if (!tx || !tx.meta) return null;

    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys || [];

    // Add loaded addresses for versioned transactions
    if (message.addressTableLookups && tx.meta.loadedAddresses) {
      if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
    }

    // ENHANCED: Detect BOTH buy and sell - volume bots can do both in one tx
    // Track all increases and decreases separately
    let buyAmount = 0;
    let sellAmount = 0;
    let decimals = 6;

    // CRITICAL: Handle mint transaction where preTokenBalances might not exist
    if (tx.meta.postTokenBalances || tx.meta.preTokenBalances) {
      // Check ALL accounts that appear in EITHER pre OR post
      const allAccountIndices = new Set();
      
      if (tx.meta.preTokenBalances) {
        tx.meta.preTokenBalances.forEach(b => {
          if (b.mint === tokenMint) allAccountIndices.add(b.accountIndex);
        });
      }
      
      if (tx.meta.postTokenBalances) {
        tx.meta.postTokenBalances.forEach(b => {
          if (b.mint === tokenMint) allAccountIndices.add(b.accountIndex);
        });
      }
      
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === tokenMint);
        const post = tx.meta.postTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === tokenMint);
        
        // Skip bonding curve vault
        const owner = post?.owner || pre?.owner;
        if (owner === bondingCurveAddress.toBase58()) continue;
        
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
        const change = postAmount - preAmount;
        
        if (change === 0n) continue;
        
        const tokenDecimals = post?.uiTokenAmount.decimals || pre?.uiTokenAmount.decimals || 6;
        decimals = tokenDecimals;

        if (change > 0n) {
          // Accumulate all buys
          buyAmount += Number(change) / Math.pow(10, tokenDecimals);
        } else if (change < 0n) {
          // Accumulate all sells
          sellAmount += Math.abs(Number(change)) / Math.pow(10, tokenDecimals);
        }
      }
    }
    
    // If no user balance changes, check bonding curve vault change as fallback
    // This catches volume bots that buy+sell in same tx (net user change = 0)
    if (buyAmount === 0 && sellAmount === 0) {
      const vaultPre = tx.meta.preTokenBalances?.find(b => 
        b.mint === tokenMint && b.owner === bondingCurveAddress.toBase58()
      );
      const vaultPost = tx.meta.postTokenBalances?.find(b => 
        b.mint === tokenMint && b.owner === bondingCurveAddress.toBase58()
      );
      
      if (vaultPre && vaultPost) {
        const vaultChange = BigInt(vaultPost.uiTokenAmount.amount) - BigInt(vaultPre.uiTokenAmount.amount);
        if (vaultChange !== 0n) {
          decimals = vaultPost.uiTokenAmount.decimals;
          // Vault increased = user sold, vault decreased = user bought
          if (vaultChange > 0n) {
            sellAmount = Number(vaultChange) / Math.pow(10, decimals);
          } else {
            buyAmount = Math.abs(Number(vaultChange)) / Math.pow(10, decimals);
          }
        }
      }
    }
    
    if (buyAmount === 0 && sellAmount === 0) return null;
    
    // Determine trade direction FIRST (needed for SOL amount detection)
    const isBuy = buyAmount > sellAmount;
    const isSell = sellAmount > buyAmount;
    
    // If amounts are equal (perfect volume bot), default to buy
    if (buyAmount === sellAmount && buyAmount > 0) {
      return null; // Skip perfect volume bots for now
    }
    
    // For single-direction swaps, use that amount
    // For volume bots (buy+sell), use the larger amount
    const tokenAmount = Math.max(buyAmount, sellAmount);

    // Calculate SOL amount by finding the bonding curve's SOL balance change
    // This is THE most accurate method - works for all swaps including Jupiter-routed
    let solAmount = 0;
    
    if (tx.meta.postBalances && tx.meta.preBalances && bondingCurveAddress) {
      // Method 1: Find the bonding curve account index directly
      let bondingCurveIndex = -1;
      
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i]?.equals(bondingCurveAddress)) {
          bondingCurveIndex = i;
          break;
        }
      }
      
      if (bondingCurveIndex >= 0 && bondingCurveIndex < tx.meta.preBalances.length) {
        // For buys: curve's SOL goes UP, for sells: curve's SOL goes DOWN
        const curveChange = tx.meta.postBalances[bondingCurveIndex] - tx.meta.preBalances[bondingCurveIndex];
        solAmount = Math.abs(curveChange / 1e9);
      }
      
      // Method 2: If not found, find the account (not fee payer) with SOL change closest to expected
      // Skip index 0 (fee payer) and look for non-zero changes
      if (solAmount === 0) {
        const balanceChanges = [];
        
        for (let i = 1; i < tx.meta.preBalances.length; i++) {
          const change = tx.meta.postBalances[i] - tx.meta.preBalances[i];
          if (change !== 0) {
            balanceChanges.push({
              index: i,
              change: Math.abs(change / 1e9),
              rawChange: change
            });
          }
        }
        
        // For sell: find account that received SOL (positive change)
        // For buy: find account that lost SOL (negative change)
        if (isSell) {
          const recipient = balanceChanges.find(b => b.rawChange > 0);
          if (recipient) solAmount = recipient.change;
        } else if (isBuy) {
          const sender = balanceChanges.find(b => b.rawChange < 0 && b.index !== 0);
          if (sender) solAmount = sender.change;
        }
      }
    }
    
    // Detect burn/close transactions (tokens moved but no SOL exchanged)
    // Do this BEFORE fallback to detect true burns
    if (solAmount === 0) {
      return {
        signature,
        timestamp: tx.blockTime,
        slot: tx.slot,
        type: 'burn',
        price: 0,
        tokenAmount,
        solAmount: 0,
        isVolumeBot: false,
        isMint: false
      };
    }

    const price = solAmount / tokenAmount;
    
    // Flag volume bots for later tagging
    const isVolumeBot = buyAmount > 0 && sellAmount > 0;
    
    // Detect mint transaction: has token in POST but NOT in PRE
    const hasPreTokenBalance = tx.meta.preTokenBalances?.some(b => b.mint === tokenMint) || false;
    const hasPostTokenBalance = tx.meta.postTokenBalances?.some(b => b.mint === tokenMint) || false;
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

function buildCandles(swaps, timeframeSeconds) {
  if (swaps.length === 0) return [];
  
  // Filter out burns - they don't affect price
  const tradeSwaps = swaps.filter(s => s.type !== 'burn');
  
  if (tradeSwaps.length === 0) return [];
  
  const candles = [];
  const bucketSize = timeframeSeconds;
  
  const firstTime = tradeSwaps[0].timestamp;
  const lastTime = tradeSwaps[tradeSwaps.length - 1].timestamp;
  
  // Floor first timestamp to nearest interval boundary
  const startBucket = Math.floor(firstTime / bucketSize) * bucketSize;
  const endBucket = Math.floor(lastTime / bucketSize) * bucketSize;

  for (let t = startBucket; t <= endBucket; t += bucketSize) {
    const bucketEnd = t + bucketSize;
    const bucketSwaps = tradeSwaps.filter(s => s.timestamp >= t && s.timestamp < bucketEnd);

    // Skip empty buckets (no trades = no candle)
    if (bucketSwaps.length === 0) {
      continue;
    }
    
    let open, high, low, close;
      // Has trades - calculate OHLC
      // CRITICAL: Open should ALWAYS equal previous candle's close for gap-free charts
      if (candles.length > 0) {
        open = candles[candles.length - 1].close;
      } else {
        open = bucketSwaps[0].price;
      }
      
      close = bucketSwaps[bucketSwaps.length - 1].price;
      high = Math.max(...bucketSwaps.map(s => s.price));
      low = Math.min(...bucketSwaps.map(s => s.price));
      
      // Ensure high/low respect the adjusted open
      high = Math.max(high, open);
      low = Math.min(low, open);
    
    const volume = bucketSwaps.reduce((sum, s) => sum + s.solAmount, 0);
    candles.push({ time: t, open, high, low, close, volume });
  }

  return candles;
}

function generateHTMLReport(candles, swaps, allSignatures, metadata) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>OHLCV Test Results - ${metadata.token.slice(0, 8)}</title>
  <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    body { font-family: Arial; background: #0f172a; color: #e2e8f0; padding: 20px; margin: 0; }
    h1 { color: #f97316; }
    .token { font-family: monospace; font-size: 14px; color: #94a3b8; margin-top: 5px; }
    .container { display: grid; grid-template-columns: 1fr 400px; gap: 20px; }
    .main-col { min-width: 0; }
    .stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 15px; margin: 20px 0; }
    .stat { background: #1e293b; padding: 15px; border-radius: 8px; border: 1px solid #334155; }
    .stat-label { font-size: 12px; color: #94a3b8; }
    .stat-value { font-size: 24px; font-weight: bold; margin-top: 5px; }
    #chart { width: 100%; height: 600px; background: #1e293b; border-radius: 8px; border: 1px solid #334155; margin: 20px 0; }
    .trade-log { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 15px; height: 800px; display: flex; flex-direction: column; }
    .trade-log h3 { margin: 0 0 15px 0; color: #f97316; font-size: 16px; }
    .trade-list { flex: 1; overflow-y: auto; }
    .trade-item { padding: 8px; border-bottom: 1px solid #334155; font-size: 12px; }
    .trade-item:hover { background: #334155; }
    .tabs { display: flex; gap: 10px; margin: 20px 0; }
    .tab-button { background: #1e293b; color: #94a3b8; border: 1px solid #334155; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; transition: all 0.2s; }
    .tab-button:hover { background: #334155; }
    .tab-button.active { background: #f97316; color: white; border-color: #f97316; }
    .tab-content { display: none; }
    .tab-content.active { display: block; }
    .full-width-log { background: #1e293b; border-radius: 8px; border: 1px solid #334155; padding: 15px; max-height: 800px; display: flex; flex-direction: column; }
    .full-width-log h3 { margin: 0 0 15px 0; color: #f97316; font-size: 16px; }
    .full-width-log .trade-list { flex: 1; overflow-y: auto; }
    .trade-time { color: #64748b; font-size: 10px; }
    .trade-type { font-weight: bold; }
    .trade-type.buy { color: #10b981; }
    .trade-type.sell { color: #ef4444; }
    .trade-type.burn { color: #f97316; }
    .trade-details { margin-top: 4px; display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
    .trade-label { color: #64748b; }
    .trade-value { color: #e2e8f0; font-family: monospace; }
    @media (max-width: 1200px) {
      .container { grid-template-columns: 1fr; }
      .trade-log { height: 400px; }
    }
  </style>
</head>
<body>
  <h1>🚀 OHLCV Builder Test Results</h1>
  <div class="token">Token: ${metadata.token}</div>
  <div class="stats">
    <div class="stat">
      <div class="stat-label">Total Swaps</div>
      <div class="stat-value">${metadata.totalSwaps}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Buys / Sells</div>
      <div class="stat-value" style="color: #10b981">${metadata.buys}</div>
      <div class="stat-value" style="color: #ef4444">${metadata.sells}</div>
    </div>
    <div class="stat">
      <div class="stat-label">Total Volume</div>
      <div class="stat-value" style="color: #10b981">${metadata.totalVolume.toFixed(2)} SOL</div>
    </div>
    <div class="stat">
      <div class="stat-label">Candles (${metadata.timeframe}m)</div>
      <div class="stat-value" style="color: #f97316">${candles.length}</div>
    </div>
  </div>
  
  <div class="tabs">
    <button class="tab-button active" onclick="switchTab('chart')">📈 Chart</button>
    <button class="tab-button" onclick="switchTab('trades')">📊 Trades</button>
    <button class="tab-button" onclick="switchTab('signatures')">🔍 All Signatures</button>
  </div>
  
  <div id="chart-tab" class="tab-content active">
    <div class="container">
      <div class="main-col">
        <div id="chart"></div>
      </div>
      <div class="trade-log">
        <h3>📊 Trade Feed (${swaps.length} swaps)</h3>
      <div class="trade-list" id="tradeList">
        ${swaps.slice().reverse().map(swap => `
          <div class="trade-item">
            <div class="trade-time">${new Date(swap.timestamp * 1000).toLocaleTimeString()}</div>
            <div class="trade-type ${swap.type}">${swap.type.toUpperCase()}</div>
            <div class="trade-details">
              <div>
                <div class="trade-label">Price</div>
                <div class="trade-value">${swap.price.toFixed(12)}</div>
              </div>
              <div>
                <div class="trade-label">Amount</div>
                <div class="trade-value">${swap.tokenAmount.toFixed(2)}</div>
              </div>
              <div>
                <div class="trade-label">Volume</div>
                <div class="trade-value">${swap.solAmount.toFixed(4)} SOL</div>
              </div>
            </div>
            <div style="margin-top:6px">
              <a href="https://solscan.io/tx/${swap.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:10px;">Solscan ↗</a>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
    </div>
  </div>
  
  <div id="trades-tab" class="tab-content">
    <div class="full-width-log">
      <h3>📊 All Trades (${swaps.length} total)</h3>
      <div class="trade-list">
        ${swaps.slice().reverse().map((swap, idx) => `
          <div class="trade-item">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:#64748b; margin-right:8px;">#${swaps.length - idx}</span>
                <span class="trade-type ${swap.type}">${swap.type.toUpperCase()}</span>
                <span style="color:#64748b; margin-left:8px; font-size:10px;">${new Date(swap.timestamp * 1000).toLocaleString()}</span>
              </div>
              <a href="https://solscan.io/tx/${swap.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:10px;">Solscan ↗</a>
            </div>
            <div class="trade-details" style="grid-template-columns: repeat(4, 1fr); margin-top:8px;">
              <div>
                <div class="trade-label">Price</div>
                <div class="trade-value">${swap.price.toFixed(12)}</div>
              </div>
              <div>
                <div class="trade-label">Amount</div>
                <div class="trade-value">${swap.tokenAmount.toFixed(2)}</div>
              </div>
              <div>
                <div class="trade-label">Volume</div>
                <div class="trade-value">${swap.solAmount.toFixed(4)} SOL</div>
              </div>
              <div>
                <div class="trade-label">Signature</div>
                <div class="trade-value" style="font-size:9px;">${swap.signature.slice(0, 16)}...</div>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <div id="signatures-tab" class="tab-content">
    <div class="full-width-log">
      <h3>🔍 All Signatures (${allSignatures.length} total)</h3>
      <div style="margin-bottom:10px; color:#94a3b8; font-size:12px;">
        Bonding Curve: <span style="color:#60a5fa; font-family:monospace;">${metadata.bondingCurve}</span>
      </div>
      <div class="trade-list">
        ${allSignatures.map((sig, idx) => `
          <div class="trade-item">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <span style="color:#64748b; margin-right:8px;">#${idx + 1}</span>
                <span style="color:#e2e8f0; font-family:monospace; font-size:11px;">${sig.signature}</span>
              </div>
              <a href="https://solscan.io/tx/${sig.signature}" target="_blank" rel="noopener" style="color:#60a5fa; text-decoration:none; font-size:10px;">Solscan ↗</a>
            </div>
            <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-top:6px; font-size:11px;">
              <div>
                <span style="color:#64748b;">Time:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.blockTime ? new Date(sig.blockTime * 1000).toLocaleTimeString() : 'N/A'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Slot:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.slot || 'N/A'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Status:</span>
                <span style="color:${sig.err ? '#ef4444' : '#10b981'}; margin-left:4px;">${sig.err ? 'Failed' : 'Success'}</span>
              </div>
              <div>
                <span style="color:#64748b;">Fee:</span>
                <span style="color:#e2e8f0; margin-left:4px;">${sig.confirmationStatus || 'confirmed'}</span>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  </div>
  
  <script>
    function switchTab(tab) {
      document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-button').forEach(b => b.classList.remove('active'));
      
      if (tab === 'chart') {
        document.getElementById('chart-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[0].classList.add('active');
      } else if (tab === 'trades') {
        document.getElementById('trades-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[1].classList.add('active');
      } else if (tab === 'signatures') {
        document.getElementById('signatures-tab').classList.add('active');
        document.querySelectorAll('.tab-button')[2].classList.add('active');
      }
    }
  </script>
  <script>
    const chart = LightweightCharts.createChart(document.getElementById('chart'), {
      width: document.getElementById('chart').clientWidth,
      height: 600,
      layout: { background: { color: '#1e293b' }, textColor: '#d1d5db' },
      grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
      timeScale: { timeVisible: true, secondsVisible: false }
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: '#10b981', downColor: '#ef4444',
      borderUpColor: '#10b981', borderDownColor: '#ef4444',
      wickUpColor: '#10b981', wickDownColor: '#ef4444',
      priceFormat: {
        type: 'price',
        precision: 12,
        minMove: 0.000000000001,
      }
    });

    const volumeSeries = chart.addHistogramSeries({
      color: '#6366f1',
      priceScaleId: ''
    });

    volumeSeries.priceScale().applyOptions({
      scaleMargins: { top: 0.8, bottom: 0 }
    });

    const candles = ${JSON.stringify(candles)};
    
    candleSeries.setData(candles.map(c => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close
    })));

    volumeSeries.setData(candles.map(c => ({
      time: c.time,
      value: c.volume,
      color: c.close >= c.open ? '#10b98180' : '#ef444480'
    })));

    chart.timeScale().fitContent();
  </script>
</body>
</html>`;

  fs.writeFileSync('test-ohlcv-results.html', html);
}

// Run the builder
buildOHLCVForToken(TOKEN_CA);
