/**
 * Test the account extraction from creation transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');
const expectedVaultAuth = new PublicKey('Hq2wp8uJ9jCPsYgNHex8RtqdvMPfVGoYwjvF1ATiwn2Y');
const expectedVaultPda = new PublicKey('23PQgErAGVhMobPZnA46i9feyxjEKXb7TuqCFN9TRLRu');

async function testExtraction() {
  console.log('🧪 Testing account extraction...\n');
  
  // Get creation transaction
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  const createSig = signatures[signatures.length - 1];
  
  const tx = await connection.getTransaction(createSig.signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys;
  
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  // Find Pumpfun-owned accounts
  const pumpfunAccounts = [];
  
  for (let i = 0; i < accountKeys.length; i++) {
    const acc = accountKeys[i];
    const accInfo = await connection.getAccountInfo(acc, 'confirmed');
    
    if (accInfo && accInfo.owner.equals(PUMPFUN_PROGRAM_ID)) {
      pumpfunAccounts.push({
        index: i,
        pubkey: acc,
        dataLength: accInfo.data.length
      });
    }
  }
  
  console.log(`Found ${pumpfunAccounts.length} Pumpfun accounts:\n`);
  pumpfunAccounts.forEach(a => {
    console.log(`  ${a.index}: ${a.pubkey.toBase58()} (${a.dataLength} bytes)`);
  });
  
  // Identify by data length
  const vaultAuth = pumpfunAccounts.find(a => a.dataLength === 600);
  const vaultPda = pumpfunAccounts.find(a => a.dataLength === 137);
  
  console.log(`\n✨ Extracted:`);
  if (vaultAuth) {
    console.log(`  Vault Authority: ${vaultAuth.pubkey.toBase58()}`);
    console.log(`  Expected:        ${expectedVaultAuth.toBase58()}`);
    console.log(`  Match: ${vaultAuth.pubkey.equals(expectedVaultAuth) ? '✅' : '❌'}`);
  }
  
  if (vaultPda) {
    console.log(`\n  Vault PDA:       ${vaultPda.pubkey.toBase58()}`);
    console.log(`  Expected:        ${expectedVaultPda.toBase58()}`);
    console.log(`  Match: ${vaultPda.pubkey.equals(expectedVaultPda) ? '✅' : '❌'}`);
  }
}

testExtraction().catch(console.error);
