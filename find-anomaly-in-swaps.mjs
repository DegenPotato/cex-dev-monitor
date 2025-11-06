/**
 * Find anomaly in parsed swap data by re-running the OHLCV builder
 * and looking for the price spike
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = 'Dd1H9Fh2vKHYdbLfTpzNGFy8KGDbrXCwJ3esK1sFpump';
const BONDING_CURVE = '6ZqiB7wEcpoMBTb1mKnuDAt69VdNwWJLUYBdC8JD9hn';
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

console.log('🔍 Searching for anomaly by fetching ALL recent transactions...\n');

const bondingCurvePubkey = new PublicKey(BONDING_CURVE);
const tokenMintPubkey = new PublicKey(TOKEN_MINT);

// Get last 200 signatures
const signatures = await connection.getSignaturesForAddress(bondingCurvePubkey, { limit: 200 });
console.log(`Fetching ${signatures.length} transactions...\n`);

const batchSize = 50;
let anomalies = [];

for (let i = 0; i < signatures.length; i += batchSize) {
  const batch = signatures.slice(i, i + batchSize);
  const txSigs = batch.map(s => s.signature);
  
  const transactions = await connection.getTransactions(txSigs, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  for (let txIdx = 0; txIdx < transactions.length; txIdx++) {
    const tx = transactions[txIdx];
    const sig = txSigs[txIdx];
    
    if (!tx || !tx.meta || tx.meta.err) continue;
    
    try {
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
          if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
        });
      }
      
      if (tx.meta.postTokenBalances) {
        tx.meta.postTokenBalances.forEach(b => {
          if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
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
      
      if (tokenAmount === 0 || (!isBuy && !isSell)) continue;
      
      let solAmount = 0;
      
      let bondingCurveIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i]?.equals(bondingCurvePubkey)) {
          bondingCurveIndex = i;
          break;
        }
      }
      
      if (bondingCurveIndex >= 0 && bondingCurveIndex < tx.meta.preBalances.length) {
        const curveChange = tx.meta.postBalances[bondingCurveIndex] - tx.meta.preBalances[bondingCurveIndex];
        solAmount = Math.abs(curveChange / 1e9);
      }
      
      if (solAmount === 0 && tx.meta.preBalances && tx.meta.postBalances) {
        const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
        solAmount = Math.abs(change / 1e9);
      }
      
      if (solAmount === 0) continue;
      
      const price = solAmount / tokenAmount;
      
      // Look for anomalies
      if (price > 0.001 || tokenAmount < 0.01) {
        anomalies.push({
          signature: sig,
          time: tx.blockTime,
          slot: tx.slot,
          type: isBuy ? 'buy' : 'sell',
          price,
          tokenAmount,
          solAmount,
          buyAmount,
          sellAmount
        });
      }
      
    } catch (error) {
      // Skip errors
    }
  }
  
  process.stdout.write(`Processed ${Math.min(i + batchSize, signatures.length)}/${signatures.length}...\r`);
}

console.log('\n\n🚨 Anomalies Found:\n');
console.log('='.repeat(100));

anomalies.sort((a, b) => b.price - a.price);

for (const anomaly of anomalies) {
  console.log(`\nSignature: ${anomaly.signature}`);
  console.log(`Time: ${new Date(anomaly.time * 1000).toLocaleString()}`);
  console.log(`Type: ${anomaly.type.toUpperCase()}`);
  console.log(`Price: ${anomaly.price.toFixed(12)} SOL per token ${anomaly.price > 1 ? '⚠️ EXTREME' : anomaly.price > 0.001 ? '⚠️' : ''}`);
  console.log(`Token Amount: ${anomaly.tokenAmount.toFixed(6)} (buy: ${anomaly.buyAmount}, sell: ${anomaly.sellAmount})`);
  console.log(`SOL Amount: ${anomaly.solAmount.toFixed(4)} SOL`);
  console.log('-'.repeat(100));
}

if (anomalies.length === 0) {
  console.log('No anomalies found!');
}

console.log('\n');
