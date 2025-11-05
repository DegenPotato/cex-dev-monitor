/**
 * Analyze inner instructions from the CREATION transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Creation transaction signature
const createSig = '3ybPksgke48ExtScVigrBtCtLUnNqtpuSEdQy7TH1C2UkSRUkVxv6jLvHKUkxDwwqGSYjZdyVmYPqR7Lco1zWNkx';

// Known values
const actualVaultAuthority = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const actualVaultAta = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function main() {
  console.log('🔍 Analyzing CREATION transaction inner instructions...\n');
  console.log(`Signature: ${createSig}\n`);
  
  const tx = await connection.getTransaction(createSig, {
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
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  console.log(`Total accounts: ${accountKeys.length}\n`);
  
  // Check if our target accounts are in the transaction
  let vaultAuthIdx = -1;
  let vaultAtaIdx = -1;
  
  accountKeys.forEach((acc, idx) => {
    if (acc.equals(actualVaultAuthority)) {
      vaultAuthIdx = idx;
      console.log(`✅ Vault Authority found at index ${idx}: ${acc.toBase58()}`);
    }
    if (acc.equals(actualVaultAta)) {
      vaultAtaIdx = idx;
      console.log(`✅ Vault ATA found at index ${idx}: ${acc.toBase58()}`);
    }
  });
  
  if (vaultAuthIdx === -1 || vaultAtaIdx === -1) {
    console.log('\n❌ Creator vault accounts NOT in creation transaction!');
    console.log('This means they were added in a later update.');
    return;
  }
  
  console.log(`\n📦 Analyzing inner instructions...`);
  
  if (!tx.meta?.innerInstructions || tx.meta.innerInstructions.length === 0) {
    console.log('❌ No inner instructions found');
    return;
  }
  
  console.log(`Found ${tx.meta.innerInstructions.length} inner instruction group(s)\n`);
  
  // Find Pumpfun inner instruction
  for (const innerGroup of tx.meta.innerInstructions) {
    console.log(`\n📦 Inner Instruction Group ${innerGroup.index}:`);
    
    for (const innerIx of innerGroup.instructions) {
      const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
      if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
      
      const programId = accountKeys[programIdIndex];
      
      if (programId.equals(PUMPFUN_PROGRAM_ID)) {
        console.log(`\n  🎯 PUMPFUN INSTRUCTION FOUND!`);
        
        const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
        console.log(`  Accounts: ${accounts.length}`);
        
        // Check if our vault accounts are in this instruction
        const vaultAuthInIx = accounts.indexOf(vaultAuthIdx);
        const vaultAtaInIx = accounts.indexOf(vaultAtaIdx);
        
        if (vaultAuthInIx !== -1) {
          console.log(`  ✅ Vault Authority is at position ${vaultAuthInIx} in this instruction`);
        }
        if (vaultAtaInIx !== -1) {
          console.log(`  ✅ Vault ATA is at position ${vaultAtaInIx} in this instruction`);
        }
        
        if (vaultAuthInIx !== -1 && vaultAtaInIx !== -1) {
          console.log(`\n  🎯 BOTH creator vault accounts are in the CREATE instruction!`);
          console.log(`  This means they're REQUIRED from the start, not added later.`);
          console.log(`\n  The coinCreator MUST be derivable from data in this transaction.`);
          
          // Show all accounts in this instruction
          console.log(`\n  All accounts in this Pumpfun instruction:`);
          accounts.forEach((accIdx, i) => {
            if (accIdx >= accountKeys.length) {
              console.log(`    ${i}: INVALID INDEX ${accIdx}`);
              return;
            }
            const pk = accountKeys[accIdx];
            let label = `account_${i}`;
            if (i === vaultAuthInIx) label = 'VAULT_AUTHORITY';
            if (i === vaultAtaInIx) label = 'VAULT_ATA';
            console.log(`    ${i.toString().padStart(2)}: ${label.padEnd(20)} ${pk.toBase58()}`);
          });
          
          // Decode instruction data
          const data = Buffer.from(innerIx.data, 'base64');
          console.log(`\n  Instruction data: ${data.toString('hex')}`);
        }
      }
    }
  }
}

main().catch(console.error);
