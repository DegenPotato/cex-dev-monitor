import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');
const MINT_TX = '4SycDT1xjsq9EyHMB3VETEu5S9EmLLmmcCytKAg47FB6wGwqHWZea1RzEEZpACHrV6cxNjvwppTK3JAyJ1YMN1H6';

async function debugMintParsing() {
  console.log('🔍 Debugging Mint Transaction Parsing\n');
  
  const tx = await connection.getTransaction(MINT_TX, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx || !tx.meta) {
    console.log('❌ Transaction not found');
    return;
  }
  
  console.log('Step 1: Check if tx.meta.postTokenBalances exists');
  console.log(`postTokenBalances exists: ${!!tx.meta.postTokenBalances}`);
  console.log(`preTokenBalances exists: ${!!tx.meta.preTokenBalances}\n`);
  
  // Our current logic
  console.log('Step 2: Current logic check - (postTokenBalances || preTokenBalances)');
  console.log(`Result: ${!!(tx.meta.postTokenBalances || tx.meta.preTokenBalances)}\n`);
  
  if (tx.meta.postTokenBalances || tx.meta.preTokenBalances) {
    console.log('Step 3: Build account indices set');
    
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
    
    console.log(`Account indices with our token: ${Array.from(allAccountIndices).join(', ')}\n`);
    
    console.log('Step 4: Process each account');
    
    let buyAmount = 0;
    let sellAmount = 0;
    
    for (const accountIndex of allAccountIndices) {
      const pre = tx.meta.preTokenBalances?.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
      const post = tx.meta.postTokenBalances?.find(p => p.accountIndex === accountIndex && p.mint === TOKEN_MINT);
      
      const owner = post?.owner || pre?.owner;
      const isBondingCurve = owner === BONDING_CURVE.toBase58();
      
      console.log(`Account ${accountIndex}:`);
      console.log(`  Owner: ${owner?.slice(0, 8)}...`);
      console.log(`  Is Bonding Curve: ${isBondingCurve}`);
      
      if (isBondingCurve) {
        console.log(`  ❌ SKIPPED (bonding curve vault)\n`);
        continue;
      }
      
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
      const change = postAmount - preAmount;
      
      console.log(`  Pre: ${preAmount}, Post: ${postAmount}`);
      console.log(`  Change: ${change}`);
      
      if (change === 0n) {
        console.log(`  ⚠️ SKIPPED (no change)\n`);
        continue;
      }
      
      const tokenDecimals = post?.uiTokenAmount.decimals || pre?.uiTokenAmount.decimals || 6;
      
      if (change > 0n) {
        buyAmount += Number(change) / Math.pow(10, tokenDecimals);
        console.log(`  ✅ BUY: ${Number(change) / Math.pow(10, tokenDecimals)} tokens\n`);
      } else {
        sellAmount += Math.abs(Number(change)) / Math.pow(10, tokenDecimals);
        console.log(`  ✅ SELL: ${Math.abs(Number(change)) / Math.pow(10, tokenDecimals)} tokens\n`);
      }
    }
    
    console.log('Step 5: Final amounts');
    console.log(`Buy amount: ${buyAmount}`);
    console.log(`Sell amount: ${sellAmount}`);
    console.log(`Max: ${Math.max(buyAmount, sellAmount)}\n`);
    
    if (buyAmount === 0 && sellAmount === 0) {
      console.log('❌ NO AMOUNTS - Would return null!\n');
      
      console.log('Step 6: Checking vault fallback');
      const vaultPre = tx.meta.preTokenBalances?.find(b => 
        b.mint === TOKEN_MINT && b.owner === BONDING_CURVE.toBase58()
      );
      const vaultPost = tx.meta.postTokenBalances?.find(b => 
        b.mint === TOKEN_MINT && b.owner === BONDING_CURVE.toBase58()
      );
      
      console.log(`Vault pre exists: ${!!vaultPre}`);
      console.log(`Vault post exists: ${!!vaultPost}`);
      
      if (vaultPre && vaultPost) {
        const vaultChange = BigInt(vaultPost.uiTokenAmount.amount) - BigInt(vaultPre.uiTokenAmount.amount);
        console.log(`Vault change: ${vaultChange}`);
      } else if (!vaultPre && vaultPost) {
        console.log(`Vault initialized with: ${vaultPost.uiTokenAmount.amount}`);
        console.log('⚠️ No PRE vault, so vault fallback won\'t work!');
      }
    } else {
      console.log('✅ Amounts detected!\n');
      
      // Now check SOL amount calculation
      console.log('Step 7: Checking SOL amount calculation');
      
      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];
      
      let bondingCurveIndex = -1;
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i].toBase58() === BONDING_CURVE.toBase58()) {
          bondingCurveIndex = i;
          break;
        }
      }
      
      console.log(`Bonding curve account index: ${bondingCurveIndex}`);
      
      if (bondingCurveIndex >= 0) {
        const preSol = tx.meta.preBalances[bondingCurveIndex] / 1e9;
        const postSol = tx.meta.postBalances[bondingCurveIndex] / 1e9;
        const solChange = Math.abs(postSol - preSol);
        
        console.log(`SOL change: ${preSol} → ${postSol} = ${solChange} SOL`);
        
        if (solChange > 0) {
          console.log('✅ Transaction would be INCLUDED!');
        } else {
          console.log('❌ Transaction would be FILTERED (solAmount = 0)!');
        }
      } else {
        console.log('❌ Bonding curve not found in accounts!');
      }
    }
  }
}

debugMintParsing();
