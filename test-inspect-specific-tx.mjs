import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');
const TX_SIG = 'uPANQUom7Ljd5BVXXkmNsWgxpG6Qz1FSHaG3FAgQcg6KqBuQN1UKkoeCLy6ekMkGPGEivKHwoNRzewkTEaXh2Sv';

async function inspectTransaction() {
  console.log('🔍 Inspecting Transaction\n');
  console.log(`Signature: ${TX_SIG}\n`);
  
  const tx = await connection.getTransaction(TX_SIG, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx || !tx.meta) {
    console.log('❌ Transaction not found');
    return;
  }
  
  console.log('📊 Token Balance Changes:\n');
  
  // Show PRE token balances
  console.log('PRE Token Balances:');
  if (tx.meta.preTokenBalances) {
    tx.meta.preTokenBalances
      .filter(b => b.mint === TOKEN_MINT)
      .forEach(b => {
        console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString} (Owner: ${b.owner})`);
      });
  } else {
    console.log('  None');
  }
  
  // Show POST token balances
  console.log('\nPOST Token Balances:');
  if (tx.meta.postTokenBalances) {
    tx.meta.postTokenBalances
      .filter(b => b.mint === TOKEN_MINT)
      .forEach(b => {
        console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString} (Owner: ${b.owner})`);
      });
  } else {
    console.log('  None');
  }
  
  console.log('\n📈 Detected Changes:\n');
  
  // Current logic - only check POST balances
  console.log('CURRENT LOGIC (checking only POST):');
  if (tx.meta.postTokenBalances) {
    for (const post of tx.meta.postTokenBalances) {
      if (post.mint !== TOKEN_MINT) continue;
      
      const pre = tx.meta.preTokenBalances?.find(p => p.accountIndex === post.accountIndex);
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      
      const isBondingCurve = post.owner === BONDING_CURVE.toBase58();
      
      console.log(`  Account ${post.accountIndex}:`);
      console.log(`    Owner: ${post.owner.slice(0, 8)}...`);
      console.log(`    Is Bonding Curve: ${isBondingCurve}`);
      console.log(`    Change: ${change} (${change > 0n ? 'BUY' : change < 0n ? 'SELL' : 'NONE'})`);
      console.log(`    ${isBondingCurve ? '❌ SKIPPED' : '✅ COUNTED'}`);
    }
  }
  
  // NEW logic - check BOTH pre and post
  console.log('\nNEW LOGIC (checking BOTH pre and post):');
  
  const allAccountIndices = new Set();
  tx.meta.preTokenBalances?.forEach(b => {
    if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
  });
  tx.meta.postTokenBalances?.forEach(b => {
    if (b.mint === TOKEN_MINT) allAccountIndices.add(b.accountIndex);
  });
  
  for (const accountIndex of allAccountIndices) {
    const pre = tx.meta.preTokenBalances?.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
    const post = tx.meta.postTokenBalances?.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
    
    const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
    const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
    const change = postAmount - preAmount;
    
    // Use owner from whichever exists (pre or post)
    const owner = post?.owner || pre?.owner || 'UNKNOWN';
    const isBondingCurve = owner === BONDING_CURVE.toBase58();
    
    console.log(`  Account ${accountIndex}:`);
    console.log(`    Owner: ${owner.slice(0, 8)}...`);
    console.log(`    Is Bonding Curve: ${isBondingCurve}`);
    console.log(`    Pre: ${preAmount}, Post: ${postAmount}`);
    console.log(`    Change: ${change} (${change > 0n ? 'BUY' : change < 0n ? 'SELL' : 'NONE'})`);
    console.log(`    ${isBondingCurve ? '❌ SKIPPED' : '✅ COUNTED'}`);
  }
  
  console.log('\n🔧 ISSUE IDENTIFIED:');
  console.log('Current logic only loops through POST balances.');
  console.log('If a token account is CLOSED (removed) during the transaction,');
  console.log('it appears in PRE but NOT in POST, so we miss it!');
  console.log('\nSOLUTION: Check ALL accounts that appear in EITHER pre OR post balances.');
}

inspectTransaction();
