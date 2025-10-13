import { Connection, PublicKey } from '@solana/web3.js';
import { TokenMintProvider } from './dist/backend/providers/TokenMintProvider.js';

const EXPECTED_CREATOR = 'FM1YCKED2KaqB8Uat8aB1nsffR1vezr7s6FAEieXJgke';
const RPC_URL = 'https://api.mainnet-beta.solana.com';

async function verifyAndCleanup() {
  const connection = new Connection(RPC_URL, 'confirmed');
  
  console.log('🔍 Fetching all tokens from database...');
  const allTokens = await TokenMintProvider.findAll();
  console.log(`📊 Total tokens in DB: ${allTokens.length}`);
  
  const toDelete = [];
  let checked = 0;
  
  for (const token of allTokens) {
    try {
      checked++;
      const mintPubkey = new PublicKey(token.mint_address);
      const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
      
      if (!mintInfo.value) {
        console.log(`⚠️  [${checked}/${allTokens.length}] ${token.symbol} - Account not found`);
        continue;
      }
      
      const data = mintInfo.value.data;
      if (data && 'parsed' in data) {
        const mintAuthority = data.parsed.info.mintAuthority;
        
        if (mintAuthority !== EXPECTED_CREATOR) {
          console.log(`❌ [${checked}/${allTokens.length}] ${token.symbol || token.mint_address.slice(0, 8)} - WRONG CREATOR: ${mintAuthority?.slice(0, 8)}`);
          toDelete.push(token);
        } else {
          console.log(`✅ [${checked}/${allTokens.length}] ${token.symbol} - Valid`);
        }
      }
      
      // Rate limit
      await new Promise(resolve => setTimeout(resolve, 300));
      
    } catch (error) {
      console.error(`❌ Error checking ${token.mint_address.slice(0, 8)}:`, error.message);
    }
  }
  
  console.log('\n📋 SUMMARY:');
  console.log(`Total checked: ${checked}`);
  console.log(`Valid tokens: ${checked - toDelete.length}`);
  console.log(`Invalid tokens: ${toDelete.length}`);
  
  if (toDelete.length > 0) {
    console.log('\n🗑️  Deleting invalid tokens...');
    for (const token of toDelete) {
      await TokenMintProvider.delete(token.mint_address);
      console.log(`   Deleted: ${token.symbol || token.mint_address.slice(0, 8)}`);
    }
    console.log(`✅ Cleanup complete! Removed ${toDelete.length} invalid tokens.`);
  } else {
    console.log('✅ All tokens are valid!');
  }
  
  process.exit(0);
}

verifyAndCleanup().catch(console.error);
