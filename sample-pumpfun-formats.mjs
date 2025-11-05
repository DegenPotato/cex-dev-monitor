/**
 * Sample 100+ Pumpfun transactions to determine all instruction formats
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Sample multiple tokens to get diverse transaction set
const sampleTokens = [
  'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump', // Our test token
  'ApFFNQkoE3GVCWF7je6YWY21UA4aAKMeWEJG7WN1pump', // Another token
  'BUgTQKN6QmStXrLEpxWAuVBg7pVsiMckbRxjb1XPxWVP', // Another token
];

async function analyzePumpfunTransaction(txSig) {
  try {
    const tx = await connection.getTransaction(txSig, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx?.meta?.innerInstructions) return null;
    
    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys;
    
    // Include loaded addresses
    if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
      const allKeys = [...accountKeys];
      if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
      accountKeys = allKeys;
    }
    
    // Find Pumpfun inner instructions
    const pumpfunInstructions = [];
    
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
        
        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
        
        const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
        const data = Buffer.from(innerIx.data, 'base64');
        const discriminator = data.slice(0, 8).toString('hex');
        
        pumpfunInstructions.push({
          accountCount: accounts.length,
          discriminator,
          dataLength: data.length
        });
      }
    }
    
    if (pumpfunInstructions.length === 0) return null;
    
    return {
      signature: txSig,
      blockTime: tx.blockTime,
      instructions: pumpfunInstructions
    };
    
  } catch (error) {
    return null;
  }
}

async function sampleToken(mintStr, limit = 50) {
  console.log(`\n📡 Sampling ${mintStr.slice(0, 20)}...`);
  
  try {
    const mint = new PublicKey(mintStr);
    const signatures = await connection.getSignaturesForAddress(mint, { limit });
    
    console.log(`   Found ${signatures.length} transactions`);
    
    const results = [];
    
    for (const sig of signatures) {
      const result = await analyzePumpfunTransaction(sig.signature);
      if (result) {
        results.push(result);
      }
    }
    
    return results;
  } catch (error) {
    console.log(`   ❌ Error: ${error.message}`);
    return [];
  }
}

async function main() {
  console.log('🔬 Sampling Pumpfun Transaction Formats\n');
  console.log(`${'='.repeat(80)}\n`);
  
  const allResults = [];
  
  // Sample from multiple tokens
  for (const token of sampleTokens) {
    const results = await sampleToken(token, 50);
    allResults.push(...results);
    
    // Add delay to avoid rate limits
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`\n\n📊 ANALYSIS OF ${allResults.length} PUMPFUN TRANSACTIONS`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Group by account count
  const byAccountCount = {};
  const byDiscriminator = {};
  
  allResults.forEach(tx => {
    tx.instructions.forEach(ix => {
      // Count by account count
      if (!byAccountCount[ix.accountCount]) {
        byAccountCount[ix.accountCount] = [];
      }
      byAccountCount[ix.accountCount].push({
        sig: tx.signature,
        time: tx.blockTime,
        discriminator: ix.discriminator
      });
      
      // Count by discriminator
      if (!byDiscriminator[ix.discriminator]) {
        byDiscriminator[ix.discriminator] = {
          count: 0,
          accountCounts: new Set()
        };
      }
      byDiscriminator[ix.discriminator].count++;
      byDiscriminator[ix.discriminator].accountCounts.add(ix.accountCount);
    });
  });
  
  // Print account count distribution
  console.log('📈 ACCOUNT COUNT DISTRIBUTION:\n');
  Object.entries(byAccountCount)
    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
    .forEach(([count, txs]) => {
      console.log(`   ${count.padStart(2)} accounts: ${txs.length.toString().padStart(3)} transactions`);
      
      // Show sample transactions for each format
      const sample = txs.slice(0, 3);
      sample.forEach(tx => {
        const date = new Date(tx.time * 1000).toISOString().split('T')[1].split('.')[0];
        console.log(`      - ${tx.sig.slice(0, 20)}... at ${date} (disc: ${tx.discriminator.slice(0, 16)})`);
      });
    });
  
  // Print discriminator distribution
  console.log('\n\n🔑 INSTRUCTION DISCRIMINATOR DISTRIBUTION:\n');
  Object.entries(byDiscriminator)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([disc, info]) => {
      const accountCountsStr = Array.from(info.accountCounts).sort((a, b) => a - b).join(', ');
      console.log(`   ${disc.padEnd(20)} ${info.count.toString().padStart(3)}x    Account counts: [${accountCountsStr}]`);
    });
  
  // Identify likely instruction types
  console.log('\n\n💡 LIKELY INSTRUCTION TYPES:\n');
  Object.entries(byDiscriminator).forEach(([disc, info]) => {
    const accountCounts = Array.from(info.accountCounts);
    let type = 'Unknown';
    
    if (accountCounts.includes(16) || accountCounts.includes(14)) {
      type = 'BUY (with/without creator fee)';
    } else if (accountCounts.includes(1)) {
      type = 'CREATE or INITIALIZE';
    } else if (accountCounts.length === 1 && accountCounts[0] < 10) {
      type = 'SELL or OTHER';
    }
    
    console.log(`   ${disc}: ${type}`);
    console.log(`      Count: ${info.count}, Account variations: ${accountCounts.join(', ')}`);
  });
  
  // Final summary
  console.log('\n\n✨ SUMMARY:\n');
  const formatCounts = Object.keys(byAccountCount).length;
  console.log(`   Total transactions analyzed: ${allResults.length}`);
  console.log(`   Different account count formats: ${formatCounts}`);
  console.log(`   Different instruction types: ${Object.keys(byDiscriminator).length}`);
  
  if (byAccountCount['16'] && byAccountCount['14']) {
    console.log(`\n   ⚠️  CONFIRMED: Pumpfun uses BOTH 14-account and 16-account formats!`);
    console.log(`      - 16-account format: ${byAccountCount['16'].length} transactions (WITH creator fee)`);
    console.log(`      - 14-account format: ${byAccountCount['14'].length} transactions (WITHOUT creator fee)`);
  } else if (byAccountCount['16']) {
    console.log(`\n   ✅ Only 16-account format found (all have creator fee)`);
  } else if (byAccountCount['14']) {
    console.log(`\n   ✅ Only 14-account format found (none have creator fee)`);
  }
}

main().catch(console.error);
