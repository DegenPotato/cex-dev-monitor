/**
 * Analyze unknown transaction to determine what operation it is
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

// Transaction with discriminator e5986f6e9dcba52c (appeared 1 time - 0.8%)
// Find a tx with this disc from the unknown list
const SIGNATURE = '3dwFHVy2rvzFX4Ny8yMVPSJjxdRwM7E8KxHzp1BXZnN7';

console.log('🔍 Analyzing unknown transaction...');
console.log(`Signature: ${SIGNATURE}\n`);

const tx = await connection.getTransaction(SIGNATURE, {
  commitment: 'confirmed',
  maxSupportedTransactionVersion: 0
});

if (!tx) {
  console.log('❌ Transaction not found');
  process.exit(1);
}

console.log('📊 TRANSACTION DETAILS:');
console.log('='.repeat(80));

// Account keys
const message = tx.transaction.message;
let accountKeys = message.staticAccountKeys || [];

if (message.addressTableLookups && tx.meta?.loadedAddresses) {
  if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
  if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
}

console.log(`\n📋 Account Count: ${accountKeys.length}`);
console.log(`⏰ Block Time: ${new Date(tx.blockTime * 1000).toLocaleString()}`);
console.log(`✅ Success: ${tx.meta?.err === null ? 'Yes' : 'No'}`);

// Token balances
console.log('\n💰 TOKEN BALANCE CHANGES:');
console.log('-'.repeat(80));

if (tx.meta?.preTokenBalances && tx.meta?.postTokenBalances) {
  for (const post of tx.meta.postTokenBalances) {
    const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
    const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
    const postAmount = BigInt(post.uiTokenAmount.amount);
    const change = postAmount - preAmount;
    
    if (change !== 0n) {
      const decimals = post.uiTokenAmount.decimals;
      const changeTokens = Number(change) / Math.pow(10, decimals);
      const direction = change > 0n ? '📈 INCREASE' : '📉 DECREASE';
      const owner = post.owner;
      const mint = post.mint;
      
      console.log(`${direction}`);
      console.log(`  Owner: ${owner}`);
      console.log(`  Mint: ${mint}`);
      console.log(`  Change: ${changeTokens > 0 ? '+' : ''}${changeTokens.toLocaleString()} tokens`);
      console.log(`  Before: ${Number(preAmount) / Math.pow(10, decimals)}`);
      console.log(`  After: ${Number(postAmount) / Math.pow(10, decimals)}`);
      console.log();
    }
  }
}

// SOL balance changes
console.log('💎 SOL BALANCE CHANGES:');
console.log('-'.repeat(80));

if (tx.meta?.preBalances && tx.meta?.postBalances) {
  for (let i = 0; i < tx.meta.preBalances.length; i++) {
    const change = tx.meta.postBalances[i] - tx.meta.preBalances[i];
    if (change !== 0 && Math.abs(change) > 1000) { // > 0.000001 SOL
      const changeSol = change / 1e9;
      const direction = change > 0 ? '📈 INCREASE' : '📉 DECREASE';
      const account = accountKeys[i]?.toString() || `Account ${i}`;
      
      console.log(`${direction}`);
      console.log(`  Account: ${account}`);
      console.log(`  Change: ${changeSol > 0 ? '+' : ''}${changeSol.toFixed(6)} SOL`);
      console.log(`  Before: ${(tx.meta.preBalances[i] / 1e9).toFixed(6)} SOL`);
      console.log(`  After: ${(tx.meta.postBalances[i] / 1e9).toFixed(6)} SOL`);
      console.log();
    }
  }
}

// Inner instructions
console.log('📦 INNER INSTRUCTIONS:');
console.log('-'.repeat(80));

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

if (tx.meta?.innerInstructions) {
  for (const inner of tx.meta.innerInstructions) {
    console.log(`\nInstruction Index: ${inner.index}`);
    console.log(`Inner Instructions: ${inner.instructions.length}`);
    
    for (let i = 0; i < inner.instructions.length; i++) {
      const ix = inner.instructions[i];
      const programId = accountKeys[ix.programIdIndex];
      const data = Buffer.from(ix.data, 'base64');
      const discriminator = data.length >= 8 ? data.slice(0, 8).toString('hex') : 'none';
      
      console.log(`\n  [${i}] Program: ${programId?.toString().slice(0, 8) || 'unknown'}`);
      console.log(`      Discriminator: ${discriminator}`);
      console.log(`      Data length: ${data.length} bytes`);
      
      if (programId?.toString() === PUMPFUN_PROGRAM_ID.toString()) {
        console.log(`      🎯 PUMPFUN INSTRUCTION DETECTED!`);
        console.log(`      Full discriminator: ${discriminator}`);
      }
    }
  }
}

// Log message
console.log('\n📝 LOG MESSAGES:');
console.log('-'.repeat(80));
if (tx.meta?.logMessages) {
  for (const log of tx.meta.logMessages) {
    if (log.includes('Program 6EF8r') || log.includes('invoke')) {
      console.log(log);
    }
  }
}

console.log('\n' + '='.repeat(80));
console.log('🔗 View on Solscan: https://solscan.io/tx/' + SIGNATURE);
console.log('='.repeat(80));
