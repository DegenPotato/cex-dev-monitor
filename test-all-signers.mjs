/**
 * Test all signers from the successful transaction to find which one is the coinCreator
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const WSOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Successful transaction
const signature = '4VmUUrUtaRWE57TNhhfnParCScTYgLzDExr2k45fQuK6DsHWuf6vL9BmyYRZ7U7CYDScsMdNsPeTV34FDyqagxKH';

const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function main() {
  console.log('🔍 Testing all signers/accounts from successful transaction...\n');
  console.log(`Transaction: ${signature}\n`);
  
  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Transaction not found');
    return;
  }
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys || message.accountKeys;
  
  // Include loaded addresses
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) {
      allKeys.push(...tx.meta.loadedAddresses.writable);
    }
    if (tx.meta.loadedAddresses.readonly) {
      allKeys.push(...tx.meta.loadedAddresses.readonly);
    }
    accountKeys = allKeys;
  }
  
  console.log(`Total accounts: ${accountKeys.length}\n`);
  console.log(`Target vault authority: ${actualVaultAuthority.toBase58()}`);
  console.log(`Target vault ATA: ${actualVaultAta.toBase58()}\n`);
  console.log(`${'='.repeat(80)}\n`);
  
  // Test each account as potential coinCreator
  for (let i = 0; i < accountKeys.length; i++) {
    const account = accountKeys[i];
    
    try {
      // Try deriving with this account as coinCreator
      const [vaultAuthority] = PublicKey.findProgramAddressSync(
        [Buffer.from('creator_vault'), account.toBuffer()],
        PUMPFUN_PROGRAM_ID
      );
      
      if (vaultAuthority.equals(actualVaultAuthority)) {
        console.log(`\n🎯 MATCH FOUND!`);
        console.log(`${'='.repeat(80)}`);
        console.log(`Account Index: ${i}`);
        console.log(`coinCreator: ${account.toBase58()}`);
        console.log(`Derived Vault Authority: ${vaultAuthority.toBase58()}`);
        
        // Verify ATA
        const vaultAta = getAssociatedTokenAddressSync(
          WSOL_MINT,
          vaultAuthority,
          true,
          TOKEN_PROGRAM_ID
        );
        
        console.log(`Derived Vault ATA: ${vaultAta.toBase58()}`);
        console.log(`ATA Match: ${vaultAta.equals(actualVaultAta) ? '✅ YES!' : '❌ NO'}`);
        
        // Check if this account was a signer
        const isSigner = i < message.header.numRequiredSignatures;
        console.log(`\nIs Signer: ${isSigner ? 'YES' : 'NO'}`);
        
        console.log(`\n✨ SOLUTION:`);
        console.log(`${'='.repeat(80)}`);
        console.log(`The coinCreator is at account index ${i} in the transaction`);
        console.log(`Pubkey: ${account.toBase58()}`);
        console.log(`\nTo derive creator fee accounts:`);
        console.log(`1. Get coinCreator from transaction account ${i}`);
        console.log(`2. Vault Authority = PDA(['creator_vault', coinCreator], PUMPFUN_PROGRAM)`);
        console.log(`3. Vault ATA = getAssociatedTokenAddress(WSOL, vaultAuthority, true)`);
        
        return;
      }
    } catch (e) {
      // Skip invalid PDAs
    }
  }
  
  console.log('\n❌ No matching account found among transaction accounts');
  console.log('\nTrying all accounts from the INNER INSTRUCTION...');
}

main().catch(console.error);
