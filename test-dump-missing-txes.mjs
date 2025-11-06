import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');

async function dumpMissingTransactions() {
  console.log('🔍 Dumping Missing Transactions\n');
  
  // Fetch all signatures
  console.log('📡 Fetching all signatures...');
  let allSignatures = [];
  let before = undefined;
  let batch = 0;
  
  while (true) {
    batch++;
    const sigs = await connection.getSignaturesForAddress(BONDING_CURVE, {
      before,
      limit: 1000
    });
    
    if (sigs.length === 0) break;
    allSignatures.push(...sigs);
    if (sigs.length < 1000) break;
    before = sigs[sigs.length - 1].signature;
  }
  
  const successSigs = allSignatures.filter(s => !s.err);
  console.log(`   ✅ Found ${successSigs.length} successful signatures\n`);
  
  // Analyze transactions
  console.log('📦 Analyzing transactions...\n');
  
  const missingTransactions = [];
  const includedTransactions = [];
  
  const batchSize = 100;
  for (let i = 0; i < successSigs.length; i += batchSize) {
    const batch = successSigs.slice(i, i + batchSize);
    const txs = await connection.getTransactions(batch.map(s => s.signature), {
      maxSupportedTransactionVersion: 0
    });
    
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      const sig = batch[j].signature;
      
      if (!tx || !tx.meta || !tx.meta.postTokenBalances || !tx.meta.preTokenBalances) {
        continue;
      }
      
      // Check if our token is involved
      const ourTokenBalances = tx.meta.postTokenBalances.filter(b => b.mint === TOKEN_MINT);
      if (ourTokenBalances.length === 0) {
        continue;
      }
      
      // Check for user wallet changes
      let hasUserChange = false;
      let buyChange = 0n;
      let sellChange = 0n;
      
      for (const post of tx.meta.postTokenBalances) {
        if (post.mint !== TOKEN_MINT) continue;
        
        // Skip bonding curve vault
        if (post.owner === BONDING_CURVE.toBase58()) continue;
        
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        if (change !== 0n) {
          hasUserChange = true;
          if (change > 0n) buyChange += change;
          if (change < 0n) sellChange += change;
        }
      }
      
      const txInfo = {
        signature: sig,
        timestamp: batch[j].blockTime,
        slot: batch[j].slot,
        hasUserChange,
        buyChange: buyChange.toString(),
        sellChange: sellChange.toString(),
        solscanLink: `https://solscan.io/tx/${sig}`
      };
      
      if (!hasUserChange) {
        missingTransactions.push(txInfo);
      } else {
        includedTransactions.push(txInfo);
      }
    }
    
    process.stdout.write(`   Processed ${Math.min(i + batchSize, successSigs.length)}/${successSigs.length}\r`);
  }
  
  console.log(`\n\n📊 Results:\n`);
  console.log(`Included transactions: ${includedTransactions.length}`);
  console.log(`Missing transactions: ${missingTransactions.length}\n`);
  
  // Write to files
  fs.writeFileSync('missing-transactions.json', JSON.stringify(missingTransactions, null, 2));
  fs.writeFileSync('included-transactions.json', JSON.stringify(includedTransactions, null, 2));
  
  console.log('✅ Written to files:');
  console.log('   - missing-transactions.json');
  console.log('   - included-transactions.json\n');
  
  // Show first 20 missing transactions
  console.log('📋 First 20 Missing Transactions:\n');
  missingTransactions.slice(0, 20).forEach((tx, i) => {
    const date = new Date(tx.timestamp * 1000).toLocaleString();
    console.log(`${i + 1}. ${date}`);
    console.log(`   ${tx.solscanLink}\n`);
  });
  
  console.log(`\n💡 Total missing: ${missingTransactions.length} transactions`);
  console.log(`   Check missing-transactions.json for full list`);
}

dumpMissingTransactions();
