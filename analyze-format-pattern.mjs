/**
 * Analyze WHEN each format is used - is it per-token or per-transaction?
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Our test token that has BOTH formats
const tokenMint = new PublicKey('HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump');

async function analyzeFormatTransition() {
  console.log('🔍 Analyzing format transition patterns\n');
  console.log(`Token: ${tokenMint.toBase58()}\n`);
  
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 50 });
  console.log(`Found ${signatures.length} transactions\n`);
  
  const buyTxs = [];
  
  for (const sig of signatures) {
    try {
      const tx = await connection.getTransaction(sig.signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      
      if (!tx?.meta?.innerInstructions) continue;
      
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
          const data = Buffer.from(innerIx.data, 'base64');
          const discriminator = data.slice(0, 8).toString('hex');
          
          // Only track buy transactions (14 or 16 accounts)
          if (accounts.length === 14 || accounts.length === 16) {
            buyTxs.push({
              signature: sig.signature,
              blockTime: tx.blockTime,
              slot: sig.slot,
              accountCount: accounts.length,
              discriminator,
              format: accounts.length === 16 ? 'WITH_CREATOR_FEE' : 'NO_CREATOR_FEE'
            });
          }
        }
      }
    } catch (e) {
      // Skip
    }
  }
  
  // Sort by block time (oldest first)
  buyTxs.sort((a, b) => a.blockTime - b.blockTime);
  
  console.log(`📊 Found ${buyTxs.length} buy transactions:\n`);
  console.log(`${'='.repeat(100)}\n`);
  console.log(`${'Time'.padEnd(12)} ${'Slot'.padEnd(12)} ${'Format'.padEnd(20)} ${'Discriminator'.padEnd(20)} Signature`);
  console.log(`${'='.repeat(100)}`);
  
  buyTxs.forEach((tx, i) => {
    const time = new Date(tx.blockTime * 1000).toISOString().split('T')[1].split('.')[0];
    const format = tx.format.padEnd(20);
    const disc = tx.discriminator.slice(0, 16).padEnd(20);
    console.log(`${time} ${tx.slot.toString().padEnd(12)} ${format} ${disc} ${tx.signature.slice(0, 20)}...`);
  });
  
  console.log(`\n\n📈 PATTERN ANALYSIS:\n`);
  
  // Check if there's a time-based transition
  const with16 = buyTxs.filter(tx => tx.accountCount === 16);
  const with14 = buyTxs.filter(tx => tx.accountCount === 14);
  
  if (with16.length > 0 && with14.length > 0) {
    const earliest16 = with16[0].blockTime;
    const latest16 = with16[with16.length - 1].blockTime;
    const earliest14 = with14[0].blockTime;
    const latest14 = with14[with14.length - 1].blockTime;
    
    console.log(`   16-account format:`);
    console.log(`      First:  ${new Date(earliest16 * 1000).toISOString()}`);
    console.log(`      Last:   ${new Date(latest16 * 1000).toISOString()}`);
    console.log(`      Total:  ${with16.length} transactions\n`);
    
    console.log(`   14-account format:`);
    console.log(`      First:  ${new Date(earliest14 * 1000).toISOString()}`);
    console.log(`      Last:   ${new Date(latest14 * 1000).toISOString()}`);
    console.log(`      Total:  ${with14.length} transactions\n`);
    
    if (latest16 < earliest14) {
      console.log(`   ✨ PATTERN: 16-account format was REPLACED by 14-account format`);
      console.log(`      Transition happened between:`);
      console.log(`      ${new Date(latest16 * 1000).toISOString()} and ${new Date(earliest14 * 1000).toISOString()}`);
    } else if (latest14 < earliest16) {
      console.log(`   ✨ PATTERN: 14-account format was REPLACED by 16-account format`);
      console.log(`      Transition happened between:`);
      console.log(`      ${new Date(latest14 * 1000).toISOString()} and ${new Date(earliest16 * 1000).toISOString()}`);
    } else {
      console.log(`   ⚠️  PATTERN: Both formats are MIXED - no clear transition point`);
      console.log(`      This suggests the format might depend on:`);
      console.log(`      - Wallet/user preference`);
      console.log(`      - Transaction flags`);
      console.log(`      - Random variation`);
    }
  }
}

analyzeFormatTransition().catch(console.error);
