import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');

async function analyzeMissingTransactions() {
  console.log('🔍 Analyzing Missing Transactions\n');
  console.log(`Token: ${TOKEN_MINT}`);
  console.log(`Bonding Curve: ${BONDING_CURVE.toBase58()}\n`);
  
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
    
    process.stdout.write(`   Batch ${batch}: ${sigs.length} signatures (total: ${allSignatures.length + sigs.length})\r`);
    
    allSignatures.push(...sigs);
    
    if (sigs.length < 1000) break;
    before = sigs[sigs.length - 1].signature;
  }
  
  console.log(`\n   ✅ Found ${allSignatures.length} total signatures\n`);
  
  // Filter out errors
  const successSigs = allSignatures.filter(s => !s.err);
  const errorSigs = allSignatures.filter(s => s.err);
  
  console.log(`Success: ${successSigs.length}`);
  console.log(`Errors: ${errorSigs.length}\n`);
  
  // Fetch and parse transactions
  console.log('📦 Analyzing transactions...\n');
  
  let stats = {
    total: 0,
    hasTokenBalances: 0,
    noTokenBalances: 0,
    hasOurToken: 0,
    bondingCurveVaultChanges: 0,
    userWalletChanges: 0,
    noBalanceChange: 0,
    buys: 0,
    sells: 0,
    bothDirections: 0
  };
  
  const batchSize = 100;
  for (let i = 0; i < successSigs.length; i += batchSize) {
    const batch = successSigs.slice(i, i + batchSize);
    const txs = await connection.getTransactions(batch.map(s => s.signature), {
      maxSupportedTransactionVersion: 0
    });
    
    for (let j = 0; j < txs.length; j++) {
      const tx = txs[j];
      if (!tx || !tx.meta) continue;
      
      stats.total++;
      
      // Check token balances
      if (!tx.meta.postTokenBalances || !tx.meta.preTokenBalances) {
        stats.noTokenBalances++;
        continue;
      }
      
      stats.hasTokenBalances++;
      
      // Check if our token is involved
      const ourTokenBalances = tx.meta.postTokenBalances.filter(b => b.mint === TOKEN_MINT);
      if (ourTokenBalances.length === 0) {
        continue;
      }
      
      stats.hasOurToken++;
      
      // Categorize balance changes
      let hasBondingCurveChange = false;
      let hasUserChange = false;
      let buyCount = 0;
      let sellCount = 0;
      
      for (const post of tx.meta.postTokenBalances) {
        if (post.mint !== TOKEN_MINT) continue;
        
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        if (change === 0n) continue;
        
        // Check if it's bonding curve vault
        if (post.owner === BONDING_CURVE.toBase58()) {
          hasBondingCurveChange = true;
          stats.bondingCurveVaultChanges++;
        } else {
          hasUserChange = true;
          stats.userWalletChanges++;
          
          if (change > 0n) buyCount++;
          if (change < 0n) sellCount++;
        }
      }
      
      if (!hasUserChange) {
        stats.noBalanceChange++;
        
        // Log first 5 examples
        if (stats.noBalanceChange <= 5) {
          console.log(`\n⚠️ Example #${stats.noBalanceChange}: No user change - ${batch[j].signature}`);
          console.log(`   Bonding curve vault change: ${hasBondingCurveChange}`);
          console.log(`   Token balances: ${tx.meta.postTokenBalances.filter(b => b.mint === TOKEN_MINT).length}`);
          
          // Show all token balance changes for our token
          for (const post of tx.meta.postTokenBalances) {
            if (post.mint !== TOKEN_MINT) continue;
            const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
            const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
            const postAmount = BigInt(post.uiTokenAmount.amount);
            const change = postAmount - preAmount;
            console.log(`   Account ${post.accountIndex}: Owner=${post.owner.slice(0,8)}..., Change=${change}`);
          }
        }
      }
      
      if (buyCount > 0) stats.buys++;
      if (sellCount > 0) stats.sells++;
      if (buyCount > 0 && sellCount > 0) stats.bothDirections++;
    }
    
    process.stdout.write(`   Processed ${Math.min(i + batchSize, successSigs.length)}/${successSigs.length}\r`);
  }
  
  console.log(`\n\n📊 Statistics:\n`);
  console.log(`Total successful transactions: ${stats.total}`);
  console.log(`Has token balances: ${stats.hasTokenBalances}`);
  console.log(`No token balances: ${stats.noTokenBalances}`);
  console.log(`Involves our token: ${stats.hasOurToken}`);
  console.log(`Bonding curve vault changes: ${stats.bondingCurveVaultChanges}`);
  console.log(`User wallet changes: ${stats.userWalletChanges}`);
  console.log(`No user balance change: ${stats.noBalanceChange}`);
  console.log(`\n🔢 Trade Counts:`);
  console.log(`Buys: ${stats.buys}`);
  console.log(`Sells: ${stats.sells}`);
  console.log(`Both directions (token-to-token): ${stats.bothDirections}`);
  console.log(`\n📈 Expected from chart:`);
  console.log(`Buys: 2170`);
  console.log(`Sells: 1080`);
  console.log(`\n❌ Missing:`);
  console.log(`Buys: ${2170 - stats.buys}`);
  console.log(`Sells: ${1080 - stats.sells}`);
}

analyzeMissingTransactions();
