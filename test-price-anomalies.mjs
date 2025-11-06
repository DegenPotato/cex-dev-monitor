import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

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

const TOKEN_MINT = process.argv[2];
const PRICE_MIN = 0.000000028;  // Below starting mcap
const PRICE_MAX = 0.000000145;  // Above ATH

if (!TOKEN_MINT) {
  console.error('Usage: node test-price-anomalies.mjs <TOKEN_MINT>');
  process.exit(1);
}

function parseSwapTransaction(tx, tokenMint, signature, bondingCurveAddress) {
  try {
    if (!tx || !tx.meta || !tx.meta.innerInstructions) return null;

    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys || [];

    if (message.addressTableLookups && tx.meta.loadedAddresses) {
      if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
    }

    // Determine buy/sell from token balance change direction (NOT discriminators)
    // This is critical for token-to-token swaps
    let tokenAmount = 0;
    let decimals = 6;
    let isBuy = false;
    let isSell = false;

    if (tx.meta.postTokenBalances && tx.meta.preTokenBalances) {
      for (const post of tx.meta.postTokenBalances) {
        if (post.mint === tokenMint) {
          // Skip bonding curve token vault
          if (post.owner === bondingCurveAddress.toBase58()) continue;

          const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
          const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
          const postAmount = BigInt(post.uiTokenAmount.amount);
          const change = postAmount - preAmount;

          if (change > 0n) {
            const amount = Number(change) / Math.pow(10, post.uiTokenAmount.decimals);
            if (amount > tokenAmount) {
              isBuy = true;
              isSell = false;
              decimals = post.uiTokenAmount.decimals;
              tokenAmount = amount;
            }
          } else if (change < 0n) {
            const amount = Math.abs(Number(change)) / Math.pow(10, post.uiTokenAmount.decimals);
            if (amount > tokenAmount) {
              isBuy = false;
              isSell = true;
              decimals = post.uiTokenAmount.decimals;
              tokenAmount = amount;
            }
          }
        }
      }
    }
    
    if (tokenAmount === 0 || (!isBuy && !isSell)) return null;
    
    // Record discriminator for debugging (but don't use for buy/sell detection)
    let discriminator = null;
    for (const inner of tx.meta.innerInstructions) {
      for (const ix of inner.instructions) {
        const programId = accountKeys[ix.programIdIndex];
        if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
          const data = Buffer.from(ix.data, 'base64');
          if (data.length >= 8) {
            discriminator = data.slice(0, 8).toString('hex');
            break;
          }
        }
      }
      if (discriminator) break;
    }

    // Get SOL amount from bonding curve balance change
    let solAmount = 0;
    let bondingCurveIndex = -1;
    
    for (let i = 0; i < accountKeys.length; i++) {
      if (accountKeys[i]?.equals(bondingCurveAddress)) {
        bondingCurveIndex = i;
        break;
      }
    }
    
    if (bondingCurveIndex >= 0 && bondingCurveIndex < tx.meta.preBalances.length) {
      const curveChange = tx.meta.postBalances[bondingCurveIndex] - tx.meta.preBalances[bondingCurveIndex];
      solAmount = Math.abs(curveChange / 1e9);
    }
    
    // Fallback
    if (solAmount === 0 && tx.meta.preBalances && tx.meta.postBalances) {
      const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      solAmount = Math.abs(change / 1e9);
    }

    if (solAmount === 0) return null;

    const price = solAmount / tokenAmount;

    return {
      signature,
      timestamp: tx.blockTime || 0,
      type: isBuy ? 'buy' : 'sell',
      discriminator,
      tokenAmount,
      solAmount,
      price,
      bondingCurveIndex,
      feePayerBalance: tx.meta.preBalances[0] - tx.meta.postBalances[0],
      accountCount: accountKeys.length
    };
  } catch (error) {
    return null;
  }
}

async function main() {
  console.log('🔍 Price Anomaly Detection\n');
  console.log(`Token: ${TOKEN_MINT}`);
  console.log(`Valid Price Range: ${PRICE_MIN.toFixed(12)} - ${PRICE_MAX.toFixed(12)}\n`);

  const tokenPubkey = new PublicKey(TOKEN_MINT);
  
  // Extract bonding curve
  console.log('📡 Extracting bonding curve...');
  const sampleSigs = await connection.getSignaturesForAddress(tokenPubkey, { limit: 10 });
  
  let bondingCurveAddress = null;
  
  for (const sig of sampleSigs.slice(0, 3)) {
    const tx = await connection.getTransaction(sig.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) continue;
    
    const accountKeys = tx.transaction.message.staticAccountKeys || [];
    
    for (const accountKey of accountKeys) {
      try {
        const info = await connection.getAccountInfo(accountKey);
        if (!info) continue;
        
        if (info.owner.equals(PUMPFUN_PROGRAM_ID) && 
            info.data.length >= 8 &&
            info.data.slice(0, 8).equals(BONDING_CURVE_DISCRIMINATOR)) {
          bondingCurveAddress = accountKey;
          console.log(`   ✅ Found: ${bondingCurveAddress.toBase58()}\n`);
          break;
        }
      } catch (e) {}
    }
    
    if (bondingCurveAddress) break;
  }
  
  if (!bondingCurveAddress) {
    console.error('❌ Could not find bonding curve');
    process.exit(1);
  }

  // Fetch ALL signatures
  console.log('📡 Fetching all signatures...');
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
    
    process.stdout.write(`   Batch ${batch}: ${sigs.length} (total: ${allSignatures.length + sigs.length})\r`);
    allSignatures.push(...sigs);
    
    if (sigs.length < 1000) break;
    before = sigs[sigs.length - 1].signature;
  }
  
  console.log(`\n   ✅ Found ${allSignatures.length} signatures\n`);

  // Parse all swaps
  console.log('📦 Parsing swaps...');
  const swaps = [];
  
  for (let i = 0; i < allSignatures.length; i += 100) {
    const chunk = allSignatures.slice(i, i + 100);
    const txSigs = chunk.map(s => s.signature);
    
    process.stdout.write(`   Batch ${Math.floor(i / 100) + 1}/${Math.ceil(allSignatures.length / 100)}\r`);
    
    const transactions = await connection.getTransactions(txSigs, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    for (let j = 0; j < transactions.length; j++) {
      const tx = transactions[j];
      const signature = txSigs[j];
      
      if (!tx) continue;
      
      const parsed = parseSwapTransaction(tx, TOKEN_MINT, signature, bondingCurveAddress);
      if (parsed) swaps.push(parsed);
    }
  }
  
  console.log(`\n   ✅ Parsed ${swaps.length} swaps\n`);

  // Sort by timestamp
  swaps.sort((a, b) => a.timestamp - b.timestamp);

  // Find anomalies
  const anomalies = swaps.filter(s => s.price < PRICE_MIN || s.price > PRICE_MAX);
  
  console.log('='.repeat(80));
  console.log('📊 RESULTS:');
  console.log('='.repeat(80));
  console.log(`Total Swaps: ${swaps.length}`);
  console.log(`Anomalies Found: ${anomalies.length} (${(anomalies.length / swaps.length * 100).toFixed(2)}%)`);
  console.log(`Normal Swaps: ${swaps.length - anomalies.length}\n`);

  if (anomalies.length > 0) {
    console.log('🚨 ANOMALOUS TRANSACTIONS:\n');
    
    anomalies.forEach((swap, idx) => {
      const reason = swap.price > PRICE_MAX ? 'ABOVE ATH' : 'BELOW STARTING';
      const deviation = swap.price > PRICE_MAX 
        ? ((swap.price / PRICE_MAX - 1) * 100).toFixed(2) + '% above max'
        : ((1 - swap.price / PRICE_MIN) * 100).toFixed(2) + '% below min';
      
      console.log(`${idx + 1}. [${reason}] ${deviation}`);
      console.log(`   Signature: ${swap.signature}`);
      console.log(`   Time: ${new Date(swap.timestamp * 1000).toLocaleString()}`);
      console.log(`   Type: ${swap.type.toUpperCase()}`);
      console.log(`   Price: ${swap.price.toFixed(12)} (should be ${PRICE_MIN.toFixed(12)} - ${PRICE_MAX.toFixed(12)})`);
      console.log(`   Token Amount: ${swap.tokenAmount.toFixed(2)}`);
      console.log(`   SOL Amount: ${swap.solAmount.toFixed(6)}`);
      console.log(`   Bonding Curve Index: ${swap.bondingCurveIndex}`);
      console.log(`   Fee Payer Balance Change: ${(swap.feePayerBalance / 1e9).toFixed(6)} SOL`);
      console.log(`   Discriminator: ${swap.discriminator}`);
      console.log(`   Solscan: https://solscan.io/tx/${swap.signature}`);
      console.log();
    });

    // Show price distribution
    console.log('='.repeat(80));
    console.log('📊 PRICE DISTRIBUTION:\n');
    
    const normalSwaps = swaps.filter(s => s.price >= PRICE_MIN && s.price <= PRICE_MAX);
    const prices = normalSwaps.map(s => s.price).sort((a, b) => a - b);
    
    if (prices.length > 0) {
      console.log(`Normal Price Range:`);
      console.log(`   Min: ${prices[0].toFixed(12)}`);
      console.log(`   Max: ${prices[prices.length - 1].toFixed(12)}`);
      console.log(`   Median: ${prices[Math.floor(prices.length / 2)].toFixed(12)}`);
      console.log(`   P25: ${prices[Math.floor(prices.length * 0.25)].toFixed(12)}`);
      console.log(`   P75: ${prices[Math.floor(prices.length * 0.75)].toFixed(12)}`);
    }
  } else {
    console.log('✅ No price anomalies detected!');
  }
}

main().catch(console.error);
