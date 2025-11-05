/**
 * Get the token creator (deployer) from the create transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// From successful transaction
const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function main() {
  console.log('🔍 Finding token creator (deployer)...\n');
  console.log(`Token Mint: ${tokenMint.toBase58()}`);
  
  // Get signatures for the mint account (limit to first few, creation should be early)
  console.log('\nFetching transaction signatures...');
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  
  console.log(`Found ${signatures.length} transactions\n`);
  
  // The LAST signature (oldest) should be the creation transaction
  const createSig = signatures[signatures.length - 1];
  console.log(`Create transaction: ${createSig.signature}`);
  console.log(`Block time: ${new Date(createSig.blockTime * 1000).toISOString()}\n`);
  
  // Fetch the full transaction
  const tx = await connection.getTransaction(createSig.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Could not fetch create transaction');
    return;
  }
  
  // The fee payer (first signer) is typically the creator
  const feePayer = tx.transaction.message.staticAccountKeys[0];
  console.log(`Fee Payer / Deployer: ${feePayer.toBase58()}`);
  
  // Try deriving vault authority with this as coinCreator
  console.log(`\n🧮 Deriving vault authority with deployer as coinCreator...`);
  const creatorVaultSeed = Buffer.from('creator_vault');
  const [vaultAuthority] = PublicKey.findProgramAddressSync(
    [creatorVaultSeed, feePayer.toBuffer()],
    PUMPFUN_PROGRAM_ID
  );
  
  console.log(`Derived vault authority: ${vaultAuthority.toBase58()}`);
  console.log(`Expected: ${actualVaultAuthority.toBase58()}`);
  console.log(`Match: ${vaultAuthority.equals(actualVaultAuthority) ? '✅ YES!' : '❌ NO'}`);
  
  if (vaultAuthority.equals(actualVaultAuthority)) {
    // Verify ATA
    const vaultAta = getAssociatedTokenAddressSync(
      WSOL_MINT,
      vaultAuthority,
      true, // allowOwnerOffCurve for PDA
      TOKEN_PROGRAM_ID
    );
    
    console.log(`\nDerived vault ATA: ${vaultAta.toBase58()}`);
    console.log(`Expected: ${actualVaultAta.toBase58()}`);
    console.log(`Match: ${vaultAta.equals(actualVaultAta) ? '✅ YES!' : '❌ NO'}`);
    
    console.log(`\n✨ SOLUTION:`);
    console.log(`${'='.repeat(80)}`);
    console.log(`1. Get token mint create transaction (oldest tx for the mint)`);
    console.log(`2. Extract fee payer (signer) = coinCreator`);
    console.log(`3. Derive vault authority: PDA(['creator_vault', coinCreator], PUMPFUN_PROGRAM)`);
    console.log(`4. Derive vault ATA: getAssociatedTokenAddress(WSOL, vaultAuthority, true)`);
  }
}

main().catch(console.error);
