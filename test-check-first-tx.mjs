import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';
const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');

async function checkFirstTransaction() {
  console.log('🔍 Checking First Transaction (Mint/Create)\n');
  
  // Fetch signatures in reverse (oldest first)
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
  
  // Get the LAST one (oldest)
  const firstSig = allSignatures[allSignatures.length - 1];
  
  console.log(`First Transaction (Token Creation):`);
  console.log(`Signature: ${firstSig.signature}`);
  console.log(`Time: ${new Date(firstSig.blockTime * 1000).toLocaleString()}`);
  console.log(`Solscan: https://solscan.io/tx/${firstSig.signature}\n`);
  
  // Fetch full transaction
  const tx = await connection.getTransaction(firstSig.signature, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx || !tx.meta) {
    console.log('❌ Could not fetch transaction');
    return;
  }
  
  console.log('📊 Token Balances:\n');
  
  console.log('PRE Token Balances:');
  if (tx.meta.preTokenBalances && tx.meta.preTokenBalances.length > 0) {
    tx.meta.preTokenBalances
      .filter(b => b.mint === TOKEN_MINT)
      .forEach(b => {
        console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString}`);
        console.log(`    Owner: ${b.owner}`);
      });
  } else {
    console.log('  None (token not yet created)');
  }
  
  console.log('\nPOST Token Balances:');
  if (tx.meta.postTokenBalances) {
    tx.meta.postTokenBalances
      .filter(b => b.mint === TOKEN_MINT)
      .forEach(b => {
        console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString}`);
        console.log(`    Owner: ${b.owner}`);
        console.log(`    Is Bonding Curve: ${b.owner === BONDING_CURVE.toBase58()}`);
      });
  }
  
  console.log('\n🔧 SOL Balances:\n');
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || [];
  
  // Find bonding curve account
  let bcIndex = -1;
  for (let i = 0; i < accountKeys.length; i++) {
    if (accountKeys[i].toBase58() === BONDING_CURVE.toBase58()) {
      bcIndex = i;
      break;
    }
  }
  
  if (bcIndex >= 0) {
    const preSol = tx.meta.preBalances[bcIndex] / 1e9;
    const postSol = tx.meta.postBalances[bcIndex] / 1e9;
    const solChange = postSol - preSol;
    
    console.log(`Bonding Curve SOL:`);
    console.log(`  Before: ${preSol} SOL`);
    console.log(`  After: ${postSol} SOL`);
    console.log(`  Change: ${solChange > 0 ? '+' : ''}${solChange} SOL`);
  }
  
  console.log('\n💡 ANALYSIS:\n');
  
  // Check if our logic would capture this
  const userTokenAccounts = tx.meta.postTokenBalances?.filter(b => 
    b.mint === TOKEN_MINT && b.owner !== BONDING_CURVE.toBase58()
  ) || [];
  
  if (userTokenAccounts.length > 0) {
    console.log('✅ Has user token accounts in POST balances');
    userTokenAccounts.forEach(acc => {
      console.log(`   - ${acc.uiTokenAmount.uiAmountString} tokens to ${acc.owner.slice(0, 8)}...`);
    });
  } else {
    console.log('❌ NO user token accounts (only bonding curve vault)');
  }
  
  // Check pre balances
  const preBondingCurveToken = tx.meta.preTokenBalances?.find(b => 
    b.mint === TOKEN_MINT && b.owner === BONDING_CURVE.toBase58()
  );
  
  const postBondingCurveToken = tx.meta.postTokenBalances?.find(b => 
    b.mint === TOKEN_MINT && b.owner === BONDING_CURVE.toBase58()
  );
  
  if (!preBondingCurveToken && postBondingCurveToken) {
    console.log('\n🎯 This is the MINT transaction:');
    console.log(`   Bonding curve vault initialized with ${postBondingCurveToken.uiTokenAmount.uiAmountString} tokens`);
  }
  
  console.log('\n🔧 ISSUE:');
  console.log('Our logic checks PRE token balances (which don\'t exist for mint tx)');
  console.log('We need to handle the case where PRE balances are empty/missing!');
}

checkFirstTransaction();
