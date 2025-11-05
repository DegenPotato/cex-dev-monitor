/**
 * Search for transactions with 16-account Pumpfun instructions
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');

async function analyzeTx(txSig) {
  const tx = await connection.getTransaction(txSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx?.meta?.innerInstructions) return null;
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys;
  
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  for (const innerGroup of tx.meta.innerInstructions) {
    for (const innerIx of innerGroup.instructions) {
      const programIdIndex = innerIx.programIdIndex || innerIx.programIndex;
      if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
      
      const programId = accountKeys[programIdIndex];
      if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
      
      const accounts = innerIx.accounts || innerIx.accountKeyIndexes || [];
      
      return {
        sig: txSig,
        blockTime: tx.blockTime,
        accountCount: accounts.length,
        accounts: accounts.map((idx, i) => ({
          position: i,
          pubkey: accountKeys[idx]?.toBase58() || 'INVALID'
        }))
      };
    }
  }
  
  return null;
}

async function main() {
  console.log('🔍 Searching for transaction format changes...\n');
  
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  console.log(`Found ${signatures.length} transactions\n`);
  
  const results = [];
  
  for (const sig of signatures) {
    const result = await analyzeTx(sig.signature);
    if (result) {
      results.push(result);
    }
  }
  
  console.log(`Analyzed ${results.length} Pumpfun transactions:\n`);
  
  // Group by account count
  const byCount = {};
  results.forEach(r => {
    if (!byCount[r.accountCount]) byCount[r.accountCount] = [];
    byCount[r.accountCount].push(r);
  });
  
  Object.entries(byCount).forEach(([count, txs]) => {
    console.log(`\n📊 ${count}-account transactions: ${txs.length}`);
    txs.slice(0, 3).forEach(tx => {
      const date = new Date(tx.blockTime * 1000).toISOString();
      console.log(`   ${tx.sig.slice(0, 20)}... at ${date}`);
      if (tx.accountCount === 16) {
        console.log(`      Account 12: ${tx.accounts[12]?.pubkey}`);
        console.log(`      Account 13: ${tx.accounts[13]?.pubkey}`);
      }
    });
  });
}

main().catch(console.error);
