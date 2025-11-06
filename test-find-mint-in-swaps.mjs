import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const BONDING_CURVE = new PublicKey('EUSUwQLLf1vVZXyvbPS5X6ZWKdCvMdZbLp6D6ACvKAbE');
const MINT_SIG = '4SycDT1xjsq9EyHMB3VETEu5S9EmLLmmcCytKAg47FB6wGwqHWZea1RzEEZpACHrV6cxNjvwppTK3JAyJ1YMN1H6';

async function findMintInSwaps() {
  console.log('🔍 Searching for Mint Transaction in Signatures\n');
  
  // Fetch all signatures
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
  
  console.log(`Total signatures: ${allSignatures.length}\n`);
  
  // Find the mint transaction
  const mintSigInfo = allSignatures.find(s => s.signature === MINT_SIG);
  
  if (!mintSigInfo) {
    console.log('❌ Mint transaction NOT found in signatures!');
    console.log('This should not happen if we\'re querying the right bonding curve.');
    return;
  }
  
  console.log('✅ Mint transaction FOUND in signatures:');
  console.log(`   Position: ${allSignatures.indexOf(mintSigInfo) + 1} of ${allSignatures.length}`);
  console.log(`   Time: ${new Date(mintSigInfo.blockTime * 1000).toLocaleString()}`);
  console.log(`   Has error: ${!!mintSigInfo.err}\n`);
  
  if (mintSigInfo.err) {
    console.log('❌ Transaction has an error - would be filtered out!');
    console.log(`   Error: ${JSON.stringify(mintSigInfo.err)}`);
  } else {
    console.log('✅ Transaction is successful - should be processed!');
  }
  
  // Check how many times it appears
  const count = allSignatures.filter(s => s.signature === MINT_SIG).length;
  console.log(`\nAppears ${count} time(s) in signatures`);
  
  if (count > 1) {
    console.log('⚠️ Duplicate! Might be filtered as duplicate.');
  }
}

findMintInSwaps();
