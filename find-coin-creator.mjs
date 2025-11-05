/**
 * Brute-force all possible PublicKey offsets in bonding curve data
 * to find which one generates the correct creator vault authority
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Known values from successful transaction
const bondingCurve = new PublicKey('3eqn8SxHhJrpHV3ZjztY3XJ6hA4J3VJvXmhQHnLwHE3P');
const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function main() {
  console.log('🔍 Finding coinCreator offset in bonding curve data...\n');
  
  const info = await connection.getAccountInfo(bondingCurve, 'confirmed');
  if (!info) {
    console.log('❌ Bonding curve account not found');
    return;
  }

  const data = info.data;
  console.log(`Data length: ${data.length} bytes`);
  console.log(`Target vault authority: ${actualVaultAuthority.toBase58()}\n`);

  // Try every possible 32-byte slice as a pubkey
  for (let offset = 0; offset <= data.length - 32; offset++) {
    try {
      const pubkeyBytes = data.slice(offset, offset + 32);
      const coinCreator = new PublicKey(pubkeyBytes);
      
      // Derive vault authority using this as coinCreator
      const creatorVaultSeed = Buffer.from('creator_vault');
      const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [creatorVaultSeed, coinCreator.toBuffer()],
        PUMPFUN_PROGRAM_ID
      );
      
      if (vaultAuthority.equals(actualVaultAuthority)) {
        console.log(`\n🎯 MATCH FOUND!`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Offset: ${offset}`);
        console.log(`coinCreator: ${coinCreator.toBase58()}`);
        console.log(`Derived vault authority: ${vaultAuthority.toBase58()}`);
        
        // Verify ATA also matches
        const vaultAta = getAssociatedTokenAddressSync(
          WSOL_MINT,
          vaultAuthority,
          true, // allowOwnerOffCurve for PDA
          TOKEN_PROGRAM_ID
        );
        console.log(`Derived vault ATA: ${vaultAta.toBase58()}`);
        console.log(`ATA matches: ${vaultAta.equals(actualVaultAta) ? '✅ YES' : '❌ NO'}`);
        
        // Show surrounding data for context
        console.log(`\nContext (offset ${Math.max(0, offset - 16)} to ${Math.min(data.length, offset + 48)}):`);
        const contextStart = Math.max(0, offset - 16);
        const contextEnd = Math.min(data.length, offset + 48);
        const context = data.slice(contextStart, contextEnd);
        console.log(context.toString('hex'));
        
        return;
      }
    } catch (e) {
      // Invalid pubkey, skip
    }
  }

  console.log('❌ No matching offset found');
}

main().catch(console.error);
