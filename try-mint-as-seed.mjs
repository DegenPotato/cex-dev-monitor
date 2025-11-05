/**
 * Try using the MINT as the seed for creator vault (not the creator wallet)
 */

import { PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const bondingCurve = new PublicKey('3eqn8SxHhJrpHV3ZjztY3XJ6hA4J3VJvXmhQHnLwHE3P');
const coinCreator = new PublicKey('4Y63XUFoFs4g2Aw88UGTG9paDYmHFbZe7qtPqEfGvrQK');

const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

console.log('🧪 Testing different seed combinations...\n');

const combinations = [
  { label: 'creator_vault + mint', seeds: [Buffer.from('creator_vault'), tokenMint.toBuffer()] },
  { label: 'creator_vault + bonding_curve', seeds: [Buffer.from('creator_vault'), bondingCurve.toBuffer()] },
  { label: 'coin_creator_vault + mint', seeds: [Buffer.from('coin_creator_vault'), tokenMint.toBuffer()] },
  { label: 'coin_creator_vault + creator', seeds: [Buffer.from('coin_creator_vault'), coinCreator.toBuffer()] },
  { label: 'creator_fee + mint', seeds: [Buffer.from('creator_fee'), tokenMint.toBuffer()] },
  { label: 'creator_fee + creator', seeds: [Buffer.from('creator_fee'), coinCreator.toBuffer()] },
  { label: 'vault + mint', seeds: [Buffer.from('vault'), tokenMint.toBuffer()] },
  { label: 'vault + creator', seeds: [Buffer.from('vault'), coinCreator.toBuffer()] },
  { label: 'fee + mint', seeds: [Buffer.from('fee'), tokenMint.toBuffer()] },
  { label: 'fee + creator', seeds: [Buffer.from('fee'), coinCreator.toBuffer()] },
];

for (const combo of combinations) {
  try {
    const [vaultAuthority] = PublicKey.findProgramAddressSync(combo.seeds, PUMPFUN_PROGRAM_ID);
    
    if (vaultAuthority.equals(actualVaultAuthority)) {
      console.log(`\n🎯 MATCH FOUND!`);
      console.log(`${'='.repeat(80)}`);
      console.log(`Combination: ${combo.label}`);
      console.log(`Vault Authority: ${vaultAuthority.toBase58()}`);
      
      const vaultAta = getAssociatedTokenAddressSync(
        WSOL_MINT,
        vaultAuthority,
        true,
        TOKEN_PROGRAM_ID
      );
      
      console.log(`Vault ATA: ${vaultAta.toBase58()}`);
      console.log(`ATA Match: ${vaultAta.equals(actualVaultAta) ? '✅ YES' : '❌ NO'}`);
      break;
    }
  } catch (e) {
    console.log(`❌ ${combo.label}: Error deriving PDA`);
  }
}
