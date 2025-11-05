/**
 * Analyze the vault authority account and try different seed variations
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');
const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const bondingCurve = new PublicKey('3eqn8SxHhJrpHV3ZjztY3XJ6hA4J3VJvXmhQHnLwHE3P');
const creator = new PublicKey('4Y63XUFoFs4g2Aw88UGTG9paDYmHFbZe7qtPqEfGvrQK');

async function main() {
  console.log('🔍 Trying different seed variations...\n');
  console.log(`Target: ${actualVaultAuthority.toBase58()}\n`);
  
  // Seed string variations
  const seedStrings = [
    'creator_vault',
    'coin_creator_vault',
    'token_creator_vault',
    'creator_fee_vault',
    'creator_fee',
    'fee_vault',
    'vault',
    'creator',
    'coin_vault',
    'token_vault',
    'mint_vault',
    'creator-vault',
    'creatorvault',
    'CREATOR_VAULT'
  ];
  
  // Pubkey inputs
  const pubkeys = [
    { label: 'creator', pk: creator },
    { label: 'mint', pk: tokenMint },
    { label: 'bondingCurve', pk: bondingCurve },
    { label: 'PUMPFUN_PROGRAM', pk: PUMPFUN_PROGRAM_ID },
    { label: 'WSOL', pk: WSOL_MINT }
  ];
  
  // Try seed string only
  console.log('Testing single seed strings:');
  for (const seed of seedStrings) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(
        [Buffer.from(seed)],
        PUMPFUN_PROGRAM_ID
      );
      if (pda.equals(actualVaultAuthority)) {
        console.log(`✅ MATCH: ['${seed}']`);
        return;
      }
    } catch (e) {}
  }
  
  // Try seed string + pubkey
  console.log('Testing seed + pubkey combinations:');
  for (const seed of seedStrings) {
    for (const { label, pk } of pubkeys) {
      try {
        const [pda] = PublicKey.findProgramAddressSync(
          [Buffer.from(seed), pk.toBuffer()],
          PUMPFUN_PROGRAM_ID
        );
        if (pda.equals(actualVaultAuthority)) {
          console.log(`\n🎯 MATCH FOUND!`);
          console.log(`Seeds: ['${seed}', ${label}]`);
          console.log(`Derived: ${pda.toBase58()}`);
          
          const ata = getAssociatedTokenAddressSync(WSOL_MINT, pda, true, TOKEN_PROGRAM_ID);
          console.log(`ATA: ${ata.toBase58()}`);
          console.log(`ATA Match: ${ata.equals(actualVaultAta) ? '✅' : '❌'}`);
          return;
        }
      } catch (e) {}
    }
  }
  
  // Try pubkey only
  console.log('\nTesting single pubkey:');
  for (const { label, pk } of pubkeys) {
    try {
      const [pda] = PublicKey.findProgramAddressSync(
        [pk.toBuffer()],
        PUMPFUN_PROGRAM_ID
      );
      if (pda.equals(actualVaultAuthority)) {
        console.log(`✅ MATCH: [${label}]`);
        return;
      }
    } catch (e) {}
  }
  
  // Try two pubkeys
  console.log('\nTesting two pubkeys:');
  for (let i = 0; i < pubkeys.length; i++) {
    for (let j = 0; j < pubkeys.length; j++) {
      if (i === j) continue;
      try {
        const [pda] = PublicKey.findProgramAddressSync(
          [pubkeys[i].pk.toBuffer(), pubkeys[j].pk.toBuffer()],
          PUMPFUN_PROGRAM_ID
        );
        if (pda.equals(actualVaultAuthority)) {
          console.log(`✅ MATCH: [${pubkeys[i].label}, ${pubkeys[j].label}]`);
          return;
        }
      } catch (e) {}
    }
  }
  
  console.log('\n❌ No match found with common seed patterns');
  console.log('\n💡 The vault authority might be:');
  console.log('   - Using a different seed string we haven\'t tried');
  console.log('   - Using a numeric bump or additional parameters');
  console.log('   - Hardcoded (not a PDA)');
  console.log('   - Derived from a different program');
}

main().catch(console.error);
