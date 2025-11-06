import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

const TOKEN_MINT = process.argv[2];
if (!TOKEN_MINT) {
  console.error('Usage: node test-bonding-curve-check.mjs <TOKEN_MINT>');
  process.exit(1);
}

async function checkBondingCurve() {
  const tokenPubkey = new PublicKey(TOKEN_MINT);
  
  console.log('🔍 Testing Bonding Curve Derivation\n');
  console.log(`Token: ${TOKEN_MINT}\n`);
  
  // Method 1: Derive PDA
  console.log('📊 Method 1: Derive PDA');
  const [derivedPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_curve'), tokenPubkey.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  console.log(`   Derived PDA: ${derivedPDA.toBase58()}`);
  
  // Check if account exists
  const pdaInfo = await connection.getAccountInfo(derivedPDA);
  console.log(`   Account exists: ${!!pdaInfo}`);
  
  if (pdaInfo) {
    console.log(`   Owner: ${pdaInfo.owner.toBase58()}`);
    console.log(`   Data length: ${pdaInfo.data.length}`);
    if (pdaInfo.data.length >= 8) {
      const disc = pdaInfo.data.slice(0, 8).toString('hex');
      console.log(`   Discriminator: ${disc}`);
      console.log(`   Valid bonding curve: ${disc === '17b7f83760d8ac60'}`);
    }
    
    // Try to get signatures
    console.log('\n   Fetching signatures...');
    const sigs = await connection.getSignaturesForAddress(derivedPDA, { limit: 10 });
    console.log(`   Recent signatures: ${sigs.length}`);
  }
  
  console.log();
  
  // Method 2: Extract from transaction
  console.log('📊 Method 2: Extract from Transaction');
  const sampleSigs = await connection.getSignaturesForAddress(tokenPubkey, { limit: 5 });
  console.log(`   Sample transactions: ${sampleSigs.length}`);
  
  if (sampleSigs.length > 0) {
    for (const sig of sampleSigs.slice(0, 2)) {
      const tx = await connection.getTransaction(sig.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx) continue;
      
      const accountKeys = tx.transaction.message.staticAccountKeys || [];
      
      for (const accountKey of accountKeys) {
        try {
          const info = await connection.getAccountInfo(accountKey);
          if (!info) continue;
          
          if (info.owner.equals(PUMPFUN_PROGRAM_ID) && 
              info.data.length >= 8 &&
              info.data.slice(0, 8).equals(BONDING_CURVE_DISCRIMINATOR)) {
            console.log(`   ✅ Found in tx: ${accountKey.toBase58()}`);
            console.log(`   Matches derived: ${accountKey.equals(derivedPDA)}`);
            
            // Get signatures from this address
            const extractedSigs = await connection.getSignaturesForAddress(accountKey, { limit: 10 });
            console.log(`   Recent signatures: ${extractedSigs.length}`);
            return;
          }
        } catch (e) {
          // Skip
        }
      }
    }
  }
  
  console.log('\n📊 CONCLUSION:');
  if (!pdaInfo) {
    console.log('   ⚠️  Derived PDA does not exist - token may have graduated to Raydium');
  } else if (sampleSigs.length === 0) {
    console.log('   ⚠️  No transactions found for token mint - might be inactive');
  }
}

checkBondingCurve().catch(console.error);
