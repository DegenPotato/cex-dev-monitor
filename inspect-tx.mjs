import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

// Get signature from command line
const signature = process.argv[2];

if (!signature) {
  console.log('Usage: node inspect-tx.mjs <SIGNATURE>');
  console.log('Example: node inspect-tx.mjs 2KdCyBBs...');
  process.exit(1);
}

console.log(`\n🔍 Inspecting Transaction: ${signature}\n`);

try {
  const tx = await connection.getTransaction(signature, {
    maxSupportedTransactionVersion: 0,
    commitment: 'confirmed'
  });

  if (!tx) {
    console.log('❌ Transaction not found');
    process.exit(1);
  }

  console.log('📊 Transaction Details:');
  console.log('='.repeat(80));
  console.log(`Slot: ${tx.slot}`);
  console.log(`Block Time: ${new Date(tx.blockTime * 1000).toLocaleString()}`);
  console.log(`Fee: ${tx.meta.fee / 1e9} SOL`);
  console.log(`Status: ${tx.meta.err ? 'FAILED' : 'SUCCESS'}`);
  
  console.log('\n💰 SOL Balance Changes (ALL ACCOUNTS):');
  console.log('='.repeat(80));
  
  // Get all account keys including loaded addresses
  const message = tx.transaction.message;
  let allAccountKeys = message.staticAccountKeys || [];
  
  if (message.addressTableLookups && tx.meta.loadedAddresses) {
    if (tx.meta.loadedAddresses.writable) allAccountKeys = [...allAccountKeys, ...tx.meta.loadedAddresses.writable];
    if (tx.meta.loadedAddresses.readonly) allAccountKeys = [...allAccountKeys, ...tx.meta.loadedAddresses.readonly];
  }
  
  // SOL balance changes with RAW lamports
  if (tx.meta.preBalances && tx.meta.postBalances) {
    for (let i = 0; i < tx.meta.preBalances.length; i++) {
      const changeLamports = tx.meta.postBalances[i] - tx.meta.preBalances[i];
      const changeSol = changeLamports / 1e9;
      
      if (changeLamports !== 0) {
        const account = allAccountKeys[i]?.toBase58() || `Account ${i}`;
        console.log(`\nAccount ${i}: ${account.slice(0, 44)}`);
        console.log(`  Pre:  ${tx.meta.preBalances[i].toLocaleString()} lamports`);
        console.log(`  Post: ${tx.meta.postBalances[i].toLocaleString()} lamports`);
        console.log(`  Change: ${changeLamports > 0 ? '+' : ''}${changeLamports.toLocaleString()} lamports`);
        console.log(`  Change: ${changeSol > 0 ? '+' : ''}${changeSol.toFixed(9)} SOL`);
      }
    }
  }
  
  console.log('\n🪙 Token Balance Changes:');
  console.log('='.repeat(80));
  
  if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
    const allIndices = new Set();
    
    tx.meta.preTokenBalances.forEach(b => allIndices.add(b.accountIndex));
    tx.meta.postTokenBalances.forEach(b => allIndices.add(b.accountIndex));
    
    for (const accountIndex of allIndices) {
      const pre = tx.meta.preTokenBalances.find(b => b.accountIndex === accountIndex);
      const post = tx.meta.postTokenBalances.find(b => b.accountIndex === accountIndex);
      
      if (!post && !pre) continue;
      
      const mint = (post || pre).mint;
      const decimals = (post || pre).uiTokenAmount.decimals;
      
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
      const change = postAmount - preAmount;
      
      const changeFloat = Number(change) / Math.pow(10, decimals);
      
      if (change !== 0n) {
        const owner = (post || pre).owner;
        console.log(`\nAccount: ${owner}`);
        console.log(`  Mint: ${mint.slice(0, 44)}`);
        console.log(`  Pre:  ${pre ? pre.uiTokenAmount.uiAmountString : '0'}`);
        console.log(`  Post: ${post ? post.uiTokenAmount.uiAmountString : '0'}`);
        console.log(`  Change: ${change > 0 ? '+' : ''}${changeFloat.toFixed(decimals)} tokens`);
        console.log(`  Raw Change: ${change.toString()}`);
      }
    }
  }
  
  console.log('\n📝 Instructions:');
  console.log('='.repeat(80));
  
  if (message.compiledInstructions) {
    message.compiledInstructions.forEach((ix, idx) => {
      const programId = message.staticAccountKeys?.[ix.programIdIndex];
      console.log(`${idx + 1}. Program: ${programId?.toBase58().slice(0, 44)}`);
    });
  }
  
  console.log('\n🔢 Raw Data Summary:');
  console.log('='.repeat(80));
  console.log(`Pre Balances: ${tx.meta.preBalances?.length || 0} accounts`);
  console.log(`Post Balances: ${tx.meta.postBalances?.length || 0} accounts`);
  console.log(`Pre Token Balances: ${tx.meta.preTokenBalances?.length || 0}`);
  console.log(`Post Token Balances: ${tx.meta.postTokenBalances?.length || 0}`);
  console.log(`Inner Instructions: ${tx.meta.innerInstructions?.length || 0}`);
  
  // Calculate actual price if possible
  console.log('\n💵 Price Calculation:');
  console.log('='.repeat(80));
  
  // Find bonding curve SOL change
  let bondingCurveChange = 0;
  for (let i = 0; i < tx.meta.preBalances.length; i++) {
    const change = (tx.meta.postBalances[i] - tx.meta.preBalances[i]) / 1e9;
    if (Math.abs(change) > 0 && i > 0) { // Skip fee payer
      bondingCurveChange = Math.abs(change);
      console.log(`Bonding Curve SOL Change: ${bondingCurveChange} SOL`);
      break;
    }
  }
  
  // Find token change
  if (tx.meta.preTokenBalances && tx.meta.postTokenBalances) {
    for (const accountIndex of [...new Set([...tx.meta.preTokenBalances.map(b => b.accountIndex), ...tx.meta.postTokenBalances.map(b => b.accountIndex)])]) {
      const pre = tx.meta.preTokenBalances.find(b => b.accountIndex === accountIndex);
      const post = tx.meta.postTokenBalances.find(b => b.accountIndex === accountIndex);
      
      if (!pre && !post) continue;
      
      const decimals = (post || pre).uiTokenAmount.decimals;
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
      const change = postAmount - preAmount;
      const changeFloat = Number(change) / Math.pow(10, decimals);
      
      if (Math.abs(changeFloat) > 0) {
        console.log(`Token Change: ${changeFloat} tokens`);
        
        if (bondingCurveChange > 0 && changeFloat !== 0) {
          const price = bondingCurveChange / Math.abs(changeFloat);
          console.log(`\n🎯 Calculated Price: ${price} SOL per token`);
          console.log(`   ${price.toExponential(4)} SOL per token (scientific)`);
        }
      }
    }
  }
  
  console.log('\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
}
