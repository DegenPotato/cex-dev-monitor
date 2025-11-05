/**
 * Extract creator vault authority from creation transaction (it's at index 8!)
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Token mint
const tokenMint = process.argv[2] || 'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump';

async function extractCreatorVault(mint) {
  console.log(`\n🔍 Extracting creator vault for: ${mint}\n`);
  
  const mintPk = new PublicKey(mint);
  
  // 1. Get creation transaction (oldest)
  const signatures = await connection.getSignaturesForAddress(mintPk, { limit: 50 });
  if (signatures.length === 0) {
    console.log('❌ No transactions found');
    return null;
  }
  
  const createSig = signatures[signatures.length - 1];
  console.log(`📝 Creation tx: ${createSig.signature}`);
  
  const tx = await connection.getTransaction(createSig.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Transaction not found');
    return null;
  }
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || message.accountKeys;
  
  // Include loaded addresses
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  console.log(`📦 Total accounts: ${accountKeys.length}`);
  
  // 2. Based on our finding, vault authority should be at index 8
  // But let's search to be sure
  console.log(`\n🔎 Searching for Pumpfun-owned PDAs...\n`);
  
  for (let i = 0; i < accountKeys.length; i++) {
    const acc = accountKeys[i];
    const accInfo = await connection.getAccountInfo(acc, 'confirmed');
    
    if (accInfo && accInfo.owner.equals(PUMPFUN_PROGRAM_ID)) {
      // Check if it's a vault authority (small account, likely PDA)
      if (accInfo.data.length < 1000) { // Vault authorities are small
        console.log(`${i}. ${acc.toBase58()}`);
        console.log(`   Owner: Pumpfun`);
        console.log(`   Data length: ${accInfo.data.length} bytes`);
        console.log(`   Lamports: ${accInfo.lamports}`);
        
        // Try to derive ATA from this
        const ata = getAssociatedTokenAddressSync(WSOL_MINT, acc, true, TOKEN_PROGRAM_ID);
        console.log(`   Derived ATA: ${ata.toBase58()}`);
        
        // Check if this account is used in inner instructions
        if (tx.meta?.innerInstructions) {
          for (const innerGroup of tx.meta.innerInstructions) {
            for (const innerIx of innerGroup.instructions) {
              const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
              if (accounts.includes(i)) {
                const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
                if (programIdIndex !== undefined && programIdIndex < accountKeys.length) {
                  const programId = accountKeys[programIdIndex];
                  console.log(`   ✅ Used in inner instruction (program: ${programId.toBase58().slice(0, 8)}...)`);
                }
              }
            }
          }
        }
        
        console.log();
      }
    }
  }
  
  // Return account at index 8 as the vault authority (based on our finding)
  if (accountKeys.length > 8) {
    const vaultAuthority = accountKeys[8];
    const vaultAta = getAssociatedTokenAddressSync(WSOL_MINT, vaultAuthority, true, TOKEN_PROGRAM_ID);
    
    console.log(`\n✨ RESULT:`);
    console.log(`${'='.repeat(80)}`);
    console.log(`Creator Vault Authority: ${vaultAuthority.toBase58()}`);
    console.log(`Creator Vault ATA: ${vaultAta.toBase58()}`);
    
    return { vaultAuthority, vaultAta };
  }
  
  return null;
}

extractCreatorVault(tokenMint).catch(console.error);
