import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

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
const LOOKBACK_HOURS = process.argv[3] ? parseInt(process.argv[3]) : 24;

if (!TOKEN_MINT) {
  console.error('Usage: node test-full-pool-dump.mjs <TOKEN_MINT> [LOOKBACK_HOURS]');
  process.exit(1);
}

async function parseSwap(tx, tokenMint, signature) {
  if (!tx || !tx.meta || !tx.meta.innerInstructions) {
    return { type: 'unknown', signature, reason: 'no_inner_instructions' };
  }

  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || [];

  if (message.addressTableLookups && tx.meta.loadedAddresses) {
    if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
  }

  let isBuy = false;
  let isSell = false;
  let discriminator = null;

  for (const inner of tx.meta.innerInstructions) {
    for (const ix of inner.instructions) {
      const programId = accountKeys[ix.programIdIndex];
      
      if (programId && programId.toString() === PUMPFUN_PROGRAM_ID.toString()) {
        const data = Buffer.from(ix.data, 'base64');
        if (data.length < 8) continue;
        
        discriminator = data.slice(0, 8).toString('hex');
        isBuy = BUY_DISCRIMINATORS.includes(discriminator);
        isSell = SELL_DISCRIMINATORS.includes(discriminator);
        
        if (isBuy || isSell) break;
      }
    }
    if (isBuy || isSell) break;
  }

  if (!isBuy && !isSell) {
    return { type: 'unknown', signature, discriminator, reason: 'no_buy_sell_discriminator' };
  }

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

  if (tokenAmount === 0) {
    return { type: 'unknown', signature, discriminator, reason: 'zero_token_amount' };
  }

  let solAmount = 0;
  if (tx.meta.preBalances && tx.meta.postBalances) {
    const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
    solAmount = Math.abs(change / 1e9);
  }

  if (solAmount === 0) {
    return { type: 'unknown', signature, discriminator, reason: 'zero_sol_amount' };
  }

  const price = solAmount / tokenAmount;

  return {
    type: isBuy ? 'buy' : 'sell',
    signature,
    timestamp: tx.blockTime || 0,
    discriminator,
    tokenAmount,
    solAmount,
    price
  };
}

async function main() {
  console.log('🚀 Full Pool Transaction Dump\n');
  console.log(`Token: ${TOKEN_MINT}`);
  console.log(`Lookback: ${LOOKBACK_HOURS}h\n`);

  const tokenPubkey = new PublicKey(TOKEN_MINT);
  
  // Step 1: Extract bonding curve
  console.log('📡 Step 1: Extracting bonding curve...');
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
      } catch (e) {
        // Skip
      }
    }
    
    if (bondingCurveAddress) break;
  }
  
  if (!bondingCurveAddress) {
    console.error('❌ Could not find bonding curve');
    process.exit(1);
  }

  // Step 2: Fetch ALL signatures (paginate through all)
  console.log('📡 Step 2: Fetching ALL signatures from bonding curve...');
  const cutoffTime = Math.floor(Date.now() / 1000) - (LOOKBACK_HOURS * 3600);
  
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
    if (oldest.blockTime && oldest.blockTime < cutoffTime) {
      // Filter out old ones
      allSignatures = allSignatures.filter(s => !s.blockTime || s.blockTime >= cutoffTime);
      break;
    }
    
    if (sigs.length < 1000) break;
    
    before = oldest.signature;
  }
  
  console.log(`\n   ✅ Found ${allSignatures.length} total signatures\n`);

  // Step 3: Parse all transactions
  console.log('📦 Step 3: Parsing transactions...');
  const swaps = [];
  const unknown = [];
  
  for (let i = 0; i < allSignatures.length; i += 100) {
    const chunk = allSignatures.slice(i, i + 100);
    const txSigs = chunk.map(s => s.signature);
    
    process.stdout.write(`   Batch ${Math.floor(i / 100) + 1}/${Math.ceil(allSignatures.length / 100)} (${txSigs.length} txs)...\r`);
    
    const transactions = await connection.getTransactions(txSigs, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    for (let j = 0; j < transactions.length; j++) {
      const tx = transactions[j];
      const signature = txSigs[j];
      
      if (!tx) {
        unknown.push({ signature, reason: 'transaction_not_found' });
        continue;
      }
      
      const parsed = await parseSwap(tx, TOKEN_MINT, signature);
      
      if (parsed.type === 'unknown') {
        unknown.push(parsed);
      } else {
        swaps.push(parsed);
      }
    }
  }
  
  console.log('\n');
  
  // Step 4: Summary
  const buys = swaps.filter(s => s.type === 'buy').length;
  const sells = swaps.filter(s => s.type === 'sell').length;
  const totalVolume = swaps.reduce((sum, s) => sum + s.solAmount, 0);
  
  console.log('✅ RESULTS:\n');
  console.log(`📊 Total Signatures: ${allSignatures.length}`);
  console.log(`📈 Classified Swaps: ${swaps.length} (${buys} buys, ${sells} sells)`);
  console.log(`💰 Total Volume: ${totalVolume.toFixed(2)} SOL`);
  console.log(`❓ Unknown/Failed: ${unknown.length}\n`);
  
  // Group unknown by reason
  const unknownReasons = {};
  unknown.forEach(u => {
    const reason = u.reason || 'unknown';
    unknownReasons[reason] = (unknownReasons[reason] || 0) + 1;
  });
  
  if (Object.keys(unknownReasons).length > 0) {
    console.log('📋 Unknown Transaction Breakdown:');
    Object.entries(unknownReasons).forEach(([reason, count]) => {
      console.log(`   ${reason}: ${count}`);
    });
    console.log();
  }
  
  // Save to JSON
  const output = {
    tokenMint: TOKEN_MINT,
    bondingCurve: bondingCurveAddress.toBase58(),
    lookbackHours: LOOKBACK_HOURS,
    totalSignatures: allSignatures.length,
    classified: swaps.length,
    buys,
    sells,
    unknown: unknown.length,
    totalVolume,
    swaps: swaps.slice(0, 100), // First 100 for size
    unknownReasons
  };
  
  const filename = `pool-dump-${TOKEN_MINT.slice(0, 8)}.json`;
  fs.writeFileSync(filename, JSON.stringify(output, null, 2));
  console.log(`💾 Summary saved to ${filename}\n`);
}

main().catch(console.error);
