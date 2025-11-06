/**
 * Live OHLCV Builder Test
 * Monitors Pumpfun for a buy transaction, then builds OHLCV for that token
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

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

const TIMEFRAME_MINUTES = 5;
const LOOKBACK_HOURS = 1;

console.log('🚀 Live OHLCV Builder Test\n');
console.log('📡 Monitoring Pumpfun for buy transactions...');
console.log('   Will test OHLCV builder on first detected token\n');

async function buildOHLCVForToken(tokenMint) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📊 Building OHLCV for: ${tokenMint}`);
  console.log('='.repeat(80));

  const startTime = Date.now();
  
  try {
    console.log('\n📡 Step 1: Fetching token signatures...');
    const tokenPubkey = new PublicKey(tokenMint);
    const now = Math.floor(Date.now() / 1000);
    const lookbackTime = now - (LOOKBACK_HOURS * 3600);

    let signatures = await connection.getSignaturesForAddress(tokenPubkey, {
      limit: 1000
    });

    console.log(`   Found ${signatures.length} total signatures`);
    
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
      console.log('❌ No recent activity for this token');
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

      for (const tx of transactions) {
        if (!tx || !tx.meta) continue;

        const swapData = parseSwapTransaction(tx, tokenMint);
        if (swapData) {
          swaps.push(swapData);
        }
      }
    }

    console.log(`\n   Extracted ${swaps.length} swaps\n`);

    if (swaps.length === 0) {
      console.log('❌ No swaps found for this token');
      return;
    }

    console.log('📊 Step 3: Building OHLCV candles...');
    swaps.sort((a, b) => a.timestamp - b.timestamp);

    const candles = buildCandles(swaps, TIMEFRAME_MINUTES);
    console.log(`   Built ${candles.length} candles\n`);

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

    // Show first 5 candles
    console.log('📊 First 5 Candles:');
    candles.slice(0, 5).forEach((c, i) => {
      const date = new Date(c.time * 1000).toLocaleString();
      const change = ((c.close - c.open) / c.open * 100).toFixed(2);
      const color = c.close >= c.open ? '🟢' : '🔴';
      console.log(`   ${i+1}. ${date} ${color} O:${c.open.toFixed(8)} H:${c.high.toFixed(8)} L:${c.low.toFixed(8)} C:${c.close.toFixed(8)} V:${c.volume.toFixed(2)} (${change}%)`);
    });

    // Generate HTML report
    generateHTMLReport(candles, swaps, {
      totalSwaps: swaps.length,
      totalVolume,
      buys,
      sells,
      timeframe: TIMEFRAME_MINUTES,
      token: tokenMint
    });

    console.log('\n📄 HTML report generated: test-ohlcv-results.html');
    console.log('   Run: start test-ohlcv-results.html\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    console.error(error.stack);
  }
}

function parseSwapTransaction(tx, tokenMint) {
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
        
        if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
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

    // Extract token balance change
    let tokenAmount = 0;
    let decimals = 6;

    if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
      for (const post of tx.meta.postTokenBalances) {
        if (post.mint === tokenMint) {
          const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
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

    // Calculate SOL spent/received
    let solAmount = 0;
    if (tx.meta.preBalances && tx.meta.postBalances) {
      const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      solAmount = Math.abs(change / 1e9);
    }

    if (tokenAmount <= 0 || solAmount <= 0) return null;

    const price = solAmount / tokenAmount;

    return {
      timestamp: tx.blockTime,
      type: isBuy ? 'buy' : 'sell',
      price,
      tokenAmount,
      solAmount
    };
  } catch (err) {
    return null;
  }
}

function buildCandles(swaps, timeframeMinutes) {
  if (swaps.length === 0) return [];

  const candles = [];
  const bucketSize = timeframeMinutes * 60;
  const firstTime = swaps[0].timestamp;
  const lastTime = swaps[swaps.length - 1].timestamp;

  for (let t = firstTime; t <= lastTime; t += bucketSize) {
    const bucketEnd = t + bucketSize;
    const bucketSwaps = swaps.filter(s => s.timestamp >= t && s.timestamp < bucketEnd);

    if (bucketSwaps.length === 0) continue;

    const open = bucketSwaps[0].price;
    const close = bucketSwaps[bucketSwaps.length - 1].price;
    const high = Math.max(...bucketSwaps.map(s => s.price));
    const low = Math.min(...bucketSwaps.map(s => s.price));
    const volume = bucketSwaps.reduce((sum, s) => sum + s.solAmount, 0);

    candles.push({ time: t, open, high, low, close, volume });
  }

  return candles;
}

function generateHTMLReport(candles, swaps, metadata) {
  const html = `<!DOCTYPE html>
<html>
<head>
  <title>OHLCV Test Results</title>
  <script src="https://unpkg.com/lightweight-charts@4.1.3/dist/lightweight-charts.standalone.production.js"></script>
  <style>
    body { font-family: Arial; background: #0f172a; color: #e2e8f0; padding: 20px; margin: 0; }
    h1 { color: #f97316; }
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
    .trade-time { color: #64748b; font-size: 10px; }
    .trade-type { font-weight: bold; }
    .trade-type.buy { color: #10b981; }
    .trade-type.sell { color: #ef4444; }
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
  <h1>🚀 Live OHLCV Builder Test Results</h1>
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
  
  <div class="container">
    <div class="main-col">
      <div id="chart"></div>
    </div>
    <div class="trade-log">
      <h3>📊 Trade Feed</h3>
      <div class="trade-list" id="tradeList">
        ${swaps.slice().reverse().map(swap => `
          <div class="trade-item">
            <div class="trade-time">${new Date(swap.timestamp * 1000).toLocaleTimeString()}</div>
            <div class="trade-type ${swap.type}">${swap.type.toUpperCase()}</div>
            <div class="trade-details">
              <div>
                <div class="trade-label">Price</div>
                <div class="trade-value">${swap.price.toFixed(8)}</div>
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
          </div>
        `).join('')}
      </div>
    </div>
  </div>
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
        precision: 8,
        minMove: 0.00000001,
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

// Monitor for live token
const subscriptionId = connection.onLogs(
  PUMPFUN_PROGRAM_ID,
  async (logs) => {
    try {
      const signature = logs.signature;
      
      const tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta?.innerInstructions) return;

      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys;

      if (message.addressTableLookups && tx.meta.loadedAddresses) {
        const allKeys = [...accountKeys];
        if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
        accountKeys = allKeys;
      }

      // Check for buy transaction
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = accountKeys[ix.programIdIndex];
          
          if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
            const data = Buffer.from(ix.data, 'base64');
            if (data.length < 8) continue;
            
            const discriminator = data.slice(0, 8).toString('hex');
            const isBuy = BUY_DISCRIMINATORS.includes(discriminator);
            
            if (isBuy) {
              // Extract token mint
              const accounts = ix.accounts;
              if (accounts && accounts.length >= 3) {
                const tokenMint = accountKeys[accounts[2]].toBase58();
                
                console.log(`\n✅ Detected buy transaction!`);
                console.log(`   Token: ${tokenMint}`);
                console.log(`   Signature: ${signature}\n`);
                
                // Unsubscribe
                await connection.removeOnLogsListener(subscriptionId);
                
                // Build OHLCV for this token
                await buildOHLCVForToken(tokenMint);
                return;
              }
            }
          }
        }
      }
    } catch (error) {
      // Ignore errors
    }
  },
  'confirmed'
);

console.log('⏳ Waiting for buy transaction...\n');
