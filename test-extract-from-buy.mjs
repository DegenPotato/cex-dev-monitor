/**
 * Test extracting creator vault accounts from successful buy transaction
 * This will be the basis for our caching system
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Known good buy transaction
const buyTxSig = '4VmUUrUtaRWE57TNhhfnParCScTYgLzDExr2k45fQuK6DsHWuf6vL9BmyYRZ7U7CYDScsMdNsPeTV34FDyqagxKH';

// Expected results (to verify our extraction)
const expectedVaultAuth = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const expectedVaultPda = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function extractCreatorVaultFromBuyTx(txSig) {
  console.log(`🔍 Extracting creator vault accounts from buy tx: ${txSig}\n`);
  
  const tx = await connection.getTransaction(txSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Transaction not found');
    return null;
  }
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys;
  
  // Include loaded addresses
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  console.log(`📦 Total accounts: ${accountKeys.length}`);
  
  // Find Pumpfun inner instruction
  if (!tx.meta?.innerInstructions || tx.meta.innerInstructions.length === 0) {
    console.log('❌ No inner instructions found');
    return null;
  }
  
  console.log(`📦 Found ${tx.meta.innerInstructions.length} inner instruction groups\n`);
  
  for (const innerGroup of tx.meta.innerInstructions) {
    for (const innerIx of innerGroup.instructions) {
      const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
      if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
      
      const programId = accountKeys[programIdIndex];
      
      if (programId.equals(PUMPFUN_PROGRAM_ID)) {
        console.log(`🎯 Found Pumpfun inner instruction!\n`);
        
        const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
        console.log(`   Accounts in this instruction: ${accounts.length}`);
        
        if (accounts.length < 14) {
          console.log(`   ⚠️  Not enough accounts (need at least 14, have ${accounts.length})`);
          continue;
        }
        
        // Extract accounts 12 & 13 (0-indexed)
        const vaultAuthIdx = accounts[12];
        const vaultPdaIdx = accounts[13];
        
        if (vaultAuthIdx >= accountKeys.length || vaultPdaIdx >= accountKeys.length) {
          console.log(`   ❌ Invalid account indices`);
          continue;
        }
        
        const vaultAuthority = accountKeys[vaultAuthIdx];
        const vaultPda = accountKeys[vaultPdaIdx];
        
        console.log(`   Account 12 (Vault Authority): ${vaultAuthority.toBase58()}`);
        console.log(`   Account 13 (Vault PDA):       ${vaultPda.toBase58()}\n`);
        
        // Verify against expected
        console.log(`✅ Verification:`);
        console.log(`   Vault Authority matches: ${vaultAuthority.equals(expectedVaultAuth) ? '✅ YES' : '❌ NO'}`);
        console.log(`   Vault PDA matches:       ${vaultPda.equals(expectedVaultPda) ? '✅ YES' : '❌ NO'}`);
        
        return {
          vaultAuthority,
          vaultPda,
          extractedFromTx: txSig
        };
      }
    }
  }
  
  console.log('❌ No Pumpfun instruction found in inner instructions');
  return null;
}

async function testExtractionFromToken(tokenMint) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Testing extraction from token: ${tokenMint}`);
  console.log(`${'='.repeat(80)}\n`);
  
  const mintPk = new PublicKey(tokenMint);
  
  // Get recent transactions
  console.log(`📡 Fetching transactions for token...`);
  const signatures = await connection.getSignaturesForAddress(mintPk, { limit: 50 });
  console.log(`   Found ${signatures.length} transactions\n`);
  
  if (signatures.length === 0) {
    console.log('❌ No transactions found');
    return null;
  }
  
  // Try to find a buy transaction (skip creation tx which is last)
  console.log(`🔎 Searching for buy transactions...`);
  for (let i = 0; i < Math.min(signatures.length - 1, 10); i++) {
    const sig = signatures[i].signature;
    console.log(`\n   Trying tx ${i + 1}: ${sig.slice(0, 20)}...`);
    
    const result = await extractCreatorVaultFromBuyTx(sig);
    if (result) {
      console.log(`\n✨ SUCCESS! Extracted creator vault accounts:`);
      console.log(`   Vault Authority: ${result.vaultAuthority.toBase58()}`);
      console.log(`   Vault PDA:       ${result.vaultPda.toBase58()}`);
      console.log(`   From tx:         ${result.extractedFromTx}`);
      return result;
    }
  }
  
  console.log('\n❌ Could not find valid buy transaction with creator vault accounts');
  return null;
}

// Test with known transaction first
console.log('🧪 TEST 1: Extract from known buy transaction');
console.log(`${'='.repeat(80)}\n`);

extractCreatorVaultFromBuyTx(buyTxSig)
  .then(result => {
    if (result) {
      console.log(`\n\n🧪 TEST 2: Extract from token mint (simulating real-world usage)`);
      return testExtractionFromToken('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
    }
  })
  .catch(console.error);
