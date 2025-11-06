import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = 'Dd1H9Fh2vKHYdbLfTpzNGFy8KGDbrXCwJ3esK1sFpump';
const BONDING_CURVE = '6ZqiB7wEcpoMBTb1mKnuDAt69VdNwWJLUYBdC8JD9hn';

console.log('🔍 Searching for anomaly transaction...\n');
console.log(`Token: ${TOKEN_MINT}`);
console.log(`Bonding Curve: ${BONDING_CURVE}\n`);

const bondingCurvePubkey = new PublicKey(BONDING_CURVE);

// Get recent signatures
console.log('Fetching recent signatures...');
const signatures = await connection.getSignaturesForAddress(bondingCurvePubkey, { limit: 100 });
console.log(`Found ${signatures.length} recent transactions\n`);

let anomalyFound = false;

for (const sig of signatures) {
  const tx = await connection.getTransaction(sig.signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });
  
  if (!tx || !tx.meta || tx.meta.err) continue;
  
  // Calculate price
  let solAmount = 0;
  let tokenAmount = 0;
  
  // Get bonding curve SOL change
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || [];
  
  if (message.addressTableLookups && tx.meta.loadedAddresses) {
    if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
  }
  
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
  
  // Get token change
  if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
    for (const accountIndex of new Set([...tx.meta.preTokenBalances.map(b => b.accountIndex), ...tx.meta.postTokenBalances.map(b => b.accountIndex)])) {
      const pre = tx.meta.preTokenBalances.find(b => b.accountIndex === accountIndex);
      const post = tx.meta.postTokenBalances.find(b => b.accountIndex === accountIndex);
      
      if (!post || post.mint !== TOKEN_MINT) continue;
      
      const decimals = post.uiTokenAmount.decimals;
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      
      tokenAmount = Math.abs(Number(change) / Math.pow(10, decimals));
    }
  }
  
  if (solAmount > 0 && tokenAmount > 0) {
    const price = solAmount / tokenAmount;
    
    // Look for anomaly (price > 1 SOL is definitely wrong for a pump.fun token)
    if (price > 1.0) {
      anomalyFound = true;
      console.log('🚨 ANOMALY FOUND!\n');
      console.log('='.repeat(80));
      console.log(`Signature: ${sig.signature}`);
      console.log(`Time: ${new Date(tx.blockTime * 1000).toLocaleString()}`);
      console.log(`Slot: ${tx.slot}`);
      console.log(`\n💰 Amounts:`);
      console.log(`   SOL: ${solAmount} SOL`);
      console.log(`   Tokens: ${tokenAmount} tokens`);
      console.log(`   Price: ${price} SOL per token ⚠️`);
      console.log(`   Price (scientific): ${price.toExponential(4)}`);
      console.log('='.repeat(80));
      
      console.log('\n📊 Detailed Analysis:\n');
      
      // SOL balance changes
      console.log('SOL Balance Changes:');
      for (let i = 0; i < tx.meta.preBalances.length; i++) {
        const change = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9;
        if (Math.abs(change) > 0) {
          const account = accountKeys[i]?.toBase58() || `Account ${i}`;
          console.log(`  ${account.slice(0, 44)}: ${change > 0 ? '+' : ''}${change.toFixed(9)} SOL`);
        }
      }
      
      // Token balance changes
      console.log('\nToken Balance Changes:');
      if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
        for (const accountIndex of new Set([...tx.meta.preTokenBalances.map(b => b.accountIndex), ...tx.meta.postTokenBalances.map(b => b.accountIndex)])) {
          const pre = tx.meta.preTokenBalances.find(b => b.accountIndex === accountIndex);
          const post = tx.meta.postTokenBalances.find(b => b.accountIndex === accountIndex);
          
          if (!pre && !post) continue;
          
          const mint = (post || pre).mint;
          const decimals = (post || pre).uiTokenAmount.decimals;
          const owner = (post || pre).owner;
          
          const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
          const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
          const change = postAmount - preAmount;
          
          console.log(`\n  Account: ${owner}`);
          console.log(`    Mint: ${mint.slice(0, 44)}`);
          console.log(`    Pre:  ${pre ? pre.uiTokenAmount.uiAmountString : '0'}`);
          console.log(`    Post: ${post ? post.uiTokenAmount.uiAmountString : '0'}`);
          console.log(`    Change: ${change > 0 ? '+' : ''}${(Number(change) / Math.pow(10, decimals)).toFixed(decimals)}`);
          console.log(`    Raw: ${change.toString()}`);
        }
      }
      
      console.log('\n🔍 Conclusion:');
      console.log('='.repeat(80));
      if (tokenAmount < 0.001) {
        console.log('⚠️  DUST TRADE: Token amount is extremely small (< 0.001 tokens)');
        console.log('   This causes price calculation to explode.');
        console.log('   Likely a rounding error or failed transaction remnant.');
      } else if (solAmount < 0.0001) {
        console.log('⚠️  MICRO TRADE: SOL amount is tiny');
      } else {
        console.log('⚠️  UNUSUAL: Both amounts seem normal but price is anomalous');
      }
      console.log('='.repeat(80));
      
      break;
    }
  }
}

if (!anomalyFound) {
  console.log('❌ No anomaly found in recent 100 transactions');
}

console.log('\n');
