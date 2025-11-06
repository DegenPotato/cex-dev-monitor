import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');

async function analyzeRemainingMissing() {
  console.log('🔍 Analyzing Remaining Missing Transactions\n');
  
  // Fetch all signatures
  console.log('📡 Fetching all signatures...');
  let allSignatures = [];
  let before = undefined;
  
  while (true) {
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
  
  // Analyze with UPDATED logic
  console.log('📦 Analyzing with UPDATED logic (checking pre OR post)...\n');
  
  const stillMissing = [];
  const nowIncluded = [];
  
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
      const hasTokenPre = tx.meta.preTokenBalances.some(b => b.mint === TOKEN_MINT);
      const hasTokenPost = tx.meta.postTokenBalances.some(b => b.mint === TOKEN_MINT);
      
      if (!hasTokenPre && !hasTokenPost) continue;
      
      // UPDATED LOGIC: Check ALL accounts in pre OR post
      const allAccountIndices = new Set();
      
      tx.meta.preTokenBalances.forEach(b => {
        if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
      });
      
      tx.meta.postTokenBalances.forEach(b => {
        if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
      });
      
      let hasUserChange = false;
      let buyChange = 0n;
      let sellChange = 0n;
      let details = [];
      
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
        const post = tx.meta.postTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
        
        const owner = post?.owner || pre?.owner;
        if (owner === BONDING_CURVE.toBase58()) continue; // Skip bonding curve vault
        
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
        const change = postAmount - preAmount;
        
        if (change !== 0n) {
          hasUserChange = true;
          if (change > 0n) buyChange += change;
          if (change < 0n) sellChange += change;
          
          details.push({
            accountIndex,
            owner: owner?.slice(0, 8) + '...',
            preAmount: preAmount.toString(),
            postAmount: postAmount.toString(),
            change: change.toString(),
            type: change > 0n ? 'BUY' : 'SELL'
          });
        }
      }
      
      const txInfo = {
        signature: sig,
        timestamp: batch[j].blockTime,
        slot: batch[j].slot,
        hasUserChange,
        buyChange: buyChange.toString(),
        sellChange: sellChange.toString(),
        details,
        solscanLink: `https://solscan.io/tx/${sig}`
      };
      
      if (!hasUserChange) {
        stillMissing.push(txInfo);
      } else {
        nowIncluded.push(txInfo);
      }
    }
    
    process.stdout.write(`   Processed ${Math.min(i + batchSize, successSigs.length)}/${successSigs.length}\r`);
  }
  
  console.log(`\n\n📊 Results with UPDATED logic:\n`);
  console.log(`Now Included: ${nowIncluded.length}`);
  console.log(`Still Missing: ${stillMissing.length}\n`);
  
  // Count buy/sell breakdown
  let buyCount = 0;
  let sellCount = 0;
  let bothCount = 0;
  
  nowIncluded.forEach(tx => {
    const hasBuy = BigInt(tx.buyChange) > 0n;
    const hasSell = BigInt(tx.sellChange) < 0n;
    if (hasBuy) buyCount++;
    if (hasSell) sellCount++;
    if (hasBuy && hasSell) bothCount++;
  });
  
  console.log(`📈 Trade Counts (from ${nowIncluded.length} included):`);
  console.log(`Buys: ${buyCount}`);
  console.log(`Sells: ${sellCount}`);
  console.log(`Both (token-to-token): ${bothCount}\n`);
  
  // Write still missing to file
  fs.writeFileSync('still-missing-transactions.json', JSON.stringify(stillMissing, null, 2));
  
  console.log('✅ Written to: still-missing-transactions.json\n');
  
  // Show examples of still missing
  console.log('📋 Examples of STILL Missing Transactions:\n');
  stillMissing.slice(0, 10).forEach((tx, i) => {
    const date = new Date(tx.timestamp * 1000).toLocaleString();
    console.log(`${i + 1}. ${date}`);
    console.log(`   ${tx.solscanLink}`);
    console.log(`   Details count: ${tx.details.length}`);
    if (tx.details.length > 0) {
      tx.details.forEach(d => {
        console.log(`     - Account ${d.accountIndex}: ${d.type}, Owner=${d.owner}, Change=${d.change}`);
      });
    }
    console.log();
  });
  
  console.log(`\n💡 Still missing ${stillMissing.length} transactions after fix`);
  console.log(`\n🎯 Expected from chart: 2170 buys, 1080 sells = 3250 total`);
  console.log(`📊 We have: ${buyCount} buys, ${sellCount} sells = ${nowIncluded.length} total`);
  console.log(`❌ Missing: ${2170 - buyCount} buys, ${1080 - sellCount} sells`);
}

analyzeRemainingMissing();
