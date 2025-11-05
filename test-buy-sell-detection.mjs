/**
 * Live Buy/Sell Detection Test
 * Samples 100 real Pumpfun transactions and analyzes detection logic
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Known discriminators from SmartMoneyTracker (verified via live test + manual analysis)
const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0', // 16-account buy
  'e6345c8dd8b14540', // 14-account buy
  '48feac982b20e013', // 19-account buy (46% of txs!)
  '00b08712a8402815'  // 19-account buy variant (<1%)
];
const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad', // Original sell
  'db0d98c38ed07cfd'  // New sell variant (21% of txs)
];

// Known wrappers (NOT tracked - paired with actual buy/sell in same tx):
const WRAPPER_DISCRIMINATORS = [
  'e3c092e6b37125bf', // ATA setup (3% of txs)
  '8b8dd6794046280e', // Setup wrapper (<1%)
  'e5986f6e9dcba52c'  // Unknown wrapper (<1%)
];

// Results tracking
const results = {
  total: 0,
  buys: 0,
  sells: 0,
  wrappers: 0,
  unknown: 0,
  discriminators: new Map(),
  unknownTransactions: [],
  walletPositions: new Map(), // wallet-token -> {buys: [], sells: []}
  sellsWithPosition: 0,
  sellsWithoutPosition: 0
};

console.log('🔍 Live Buy/Sell Detection Test');
console.log('📊 Sampling 100 Pumpfun transactions...\n');

// Sample transactions
const sampleTransactions = async () => {
  return new Promise((resolve) => {
    const subscriptionId = connection.onLogs(
      PUMPFUN_PROGRAM_ID,
      async (logs, context) => {
        try {
          const signature = logs.signature;
          results.total++;

          // Fetch full transaction
          const tx = await connection.getTransaction(signature, {
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          });

          if (!tx || !tx.meta?.innerInstructions) {
            console.log(`⚠️  [${results.total}] No inner instructions: ${signature.slice(0, 8)}`);
            return;
          }

          // Analyze inner instructions
          let detected = false;
          let detectionType = 'unknown';
          let discriminator = null;

          const message = tx.transaction.message;
          let accountKeys = message.staticAccountKeys || [];

          // Add loaded addresses for versioned transactions
          if (message.addressTableLookups && tx.meta?.loadedAddresses) {
            if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
            if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
          }

          for (const inner of tx.meta.innerInstructions) {
            for (const ix of inner.instructions) {
              const programId = accountKeys[ix.programIdIndex];
              
              if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
                // Get discriminator (first 8 bytes of instruction data)
                const data = Buffer.from(ix.data, 'base64');
                if (data.length >= 8) {
                  discriminator = data.slice(0, 8).toString('hex');
                  
                  // Track all discriminators
                  const count = results.discriminators.get(discriminator) || 0;
                  results.discriminators.set(discriminator, count + 1);
                  
                  // Check detection
                  if (BUY_DISCRIMINATORS.includes(discriminator)) {
                    results.buys++;
                    detectionType = 'BUY';
                    detected = true;
                  } else if (SELL_DISCRIMINATORS.includes(discriminator)) {
                    results.sells++;
                    detectionType = 'SELL';
                    detected = true;
                  } else if (WRAPPER_DISCRIMINATORS.includes(discriminator)) {
                    results.wrappers++;
                    detectionType = 'WRAPPER';
                    detected = true;
                  }
                  break;
                }
              }
            }
            if (detected) break;
          }

          if (!detected) {
            results.unknown++;
            results.unknownTransactions.push({
              signature,
              discriminator,
              accountCount: tx.transaction.message.staticAccountKeys.length
            });
          }

          // Extract wallet and token for buy/sell tracking
          if (detectionType === 'BUY' || detectionType === 'SELL') {
            if (tx.meta?.postTokenBalances?.length) {
              for (const post of tx.meta.postTokenBalances) {
                const pre = tx.meta.preTokenBalances?.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
                const postAmount = BigInt(post.uiTokenAmount.amount);
                const change = postAmount - preAmount;
                
                if ((detectionType === 'BUY' && change > 0n) || (detectionType === 'SELL' && change < 0n)) {
                  const wallet = post.owner;
                  const token = post.mint;
                  const positionKey = `${wallet}-${token}`;
                  
                  if (!results.walletPositions.has(positionKey)) {
                    results.walletPositions.set(positionKey, { buys: [], sells: [] });
                  }
                  
                  if (detectionType === 'BUY') {
                    results.walletPositions.get(positionKey).buys.push(signature);
                  } else {
                    const position = results.walletPositions.get(positionKey);
                    position.sells.push(signature);
                    
                    // Check if this sell has a corresponding buy
                    if (position.buys.length > 0) {
                      results.sellsWithPosition++;
                      console.log(`   ✅ Sell has position (${position.buys.length} buys tracked)`);
                    } else {
                      results.sellsWithoutPosition++;
                      console.log(`   ⚠️  Sell WITHOUT position! Wallet: ${wallet.slice(0,8)} Token: ${token.slice(0,8)}`);
                    }
                  }
                  break;
                }
              }
            }
          }

          // Progress update
          const emoji = detectionType === 'BUY' ? '💰' : 
                        detectionType === 'SELL' ? '💸' : 
                        detectionType === 'WRAPPER' ? '📦' : '❓';
          console.log(`${emoji} [${results.total}/100] ${detectionType.padEnd(7)} - Disc: ${discriminator || 'none'} - ${signature.slice(0, 8)}`);

          // Stop after 100 samples
          if (results.total >= 100) {
            await connection.removeOnLogsListener(subscriptionId);
            resolve();
          }
        } catch (error) {
          console.error(`❌ Error processing transaction:`, error.message);
        }
      },
      'confirmed'
    );

    console.log('📡 WebSocket subscription active - waiting for transactions...\n');
  });
};

// Run test
await sampleTransactions();

// Print analysis
console.log('\n' + '='.repeat(80));
console.log('📊 DETECTION ANALYSIS RESULTS');
console.log('='.repeat(80));
console.log(`\n📈 Total Transactions: ${results.total}`);
console.log(`💰 Detected Buys:      ${results.buys} (${((results.buys / results.total) * 100).toFixed(1)}%)`);
console.log(`💸 Detected Sells:     ${results.sells} (${((results.sells / results.total) * 100).toFixed(1)}%)`);
console.log(`📦 Wrappers (labeled): ${results.wrappers} (${((results.wrappers / results.total) * 100).toFixed(1)}%)`);
console.log(`❓ Unknown:            ${results.unknown} (${((results.unknown / results.total) * 100).toFixed(1)}%)`);

console.log('\n' + '-'.repeat(80));
console.log('🎯 SELL TRACKING ANALYSIS:');
console.log('-'.repeat(80));
console.log(`Total positions tracked: ${results.walletPositions.size}`);
console.log(`✅ Sells WITH buy position:    ${results.sellsWithPosition}`);
console.log(`⚠️  Sells WITHOUT buy position: ${results.sellsWithoutPosition}`);
if (results.sells > 0) {
  const matchRate = (results.sellsWithPosition / results.sells) * 100;
  console.log(`📊 Position match rate: ${matchRate.toFixed(1)}%`);
  if (matchRate < 100) {
    console.log(`⚠️  WARNING: ${results.sellsWithoutPosition} sells detected without corresponding buy!`);
    console.log(`   This means these wallets bought BEFORE monitoring started.`);
  }
}

console.log('\n' + '-'.repeat(80));
console.log('🔢 ALL DISCRIMINATORS FOUND:');
console.log('-'.repeat(80));

// Sort discriminators by frequency
const sortedDiscriminators = Array.from(results.discriminators.entries())
  .sort((a, b) => b[1] - a[1]);

for (const [disc, count] of sortedDiscriminators) {
  const isBuy = BUY_DISCRIMINATORS.includes(disc);
  const isSell = SELL_DISCRIMINATORS.includes(disc);
  const isWrapper = WRAPPER_DISCRIMINATORS.includes(disc);
  const label = isBuy ? '✅ BUY ' : isSell ? '✅ SELL' : isWrapper ? '📦 WRAP' : '❌ UNKN';
  const pct = ((count / results.total) * 100).toFixed(1);
  console.log(`${label} | ${disc} | Count: ${count.toString().padStart(3)} (${pct.padStart(5)}%)`);  
}

if (results.unknownTransactions.length > 0) {
  console.log('\n' + '-'.repeat(80));
  console.log('❓ UNKNOWN TRANSACTIONS (need investigation):');
  console.log('-'.repeat(80));
  
  for (const tx of results.unknownTransactions.slice(0, 10)) {
    console.log(`Signature: ${tx.signature}`);
    console.log(`  Discriminator: ${tx.discriminator || 'NONE'}`);
    console.log(`  Account Count: ${tx.accountCount}`);
    console.log(`  Investigate: https://solscan.io/tx/${tx.signature}\n`);
  }
  
  if (results.unknownTransactions.length > 10) {
    console.log(`... and ${results.unknownTransactions.length - 10} more unknown transactions\n`);
  }
}

console.log('\n' + '='.repeat(80));
console.log('🎯 RECOMMENDATIONS:');
console.log('='.repeat(80));

const detectionRate = ((results.buys + results.sells) / results.total) * 100;
if (detectionRate >= 95) {
  console.log('✅ Detection logic is EXCELLENT (>95% coverage)');
} else if (detectionRate >= 80) {
  console.log('⚠️  Detection logic is GOOD but could be improved (80-95% coverage)');
  console.log('   → Check unknown transactions for new discriminator patterns');
} else {
  console.log('❌ Detection logic needs IMPROVEMENT (<80% coverage)');
  console.log('   → Missing discriminators for common transaction types');
  console.log('   → Review unknown transactions immediately');
}

if (results.discriminators.size > BUY_DISCRIMINATORS.length + SELL_DISCRIMINATORS.length) {
  const unknownCount = results.discriminators.size - BUY_DISCRIMINATORS.length - SELL_DISCRIMINATORS.length;
  console.log(`\n📋 Found ${unknownCount} new discriminator(s) to add to detection logic`);
}

console.log('\n' + '='.repeat(80));
process.exit(0);
