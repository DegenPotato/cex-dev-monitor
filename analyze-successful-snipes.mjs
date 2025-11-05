/**
 * Analyze Successful Snipe Transactions
 * Reverse-engineer the exact account structure from working buys
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Successful snipe signatures
const signatures = [
  '4VmUUrUtaRWE57TNhhfnParCScTYgLzDExr2k45fQuK6DsHWuf6vL9BmyYRZ7U7CYDScsMdNsPeTV34FDyqagxKH',
  '5i8t1Km5L5jGkjBVqwHd3c9XNcLv3w48qCK5zMUF8hPQdsc2zfDkyJjAkMTxyYyq8ibyrU5yRWq9HpQ3YxZTMrKA',
  '3AHDyXx6qFnBq3TtMZiyNsxNedi1btab1vwaimcxUyYH25CQxmwRKVUdvU9UqqbLSXh6UkL4gaDUWdStW8VCj6dg'
];

async function analyzePumpfunBuy(signature) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`Analyzing: ${signature}`);
  console.log(`${'='.repeat(80)}\n`);

  const tx = await connection.getTransaction(signature, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });

  if (!tx) {
    console.log('❌ Transaction not found');
    return null;
  }

  console.log(`✅ Transaction found`);
  console.log(`Block time: ${new Date(tx.blockTime * 1000).toISOString()}`);
  console.log(`Slot: ${tx.slot}`);

  // Find the Pumpfun buy instruction
  const message = tx.transaction.message;
  const accountKeys = message.staticAccountKeys || message.accountKeys;
  
  console.log(`\n📋 Total accounts: ${accountKeys.length}`);
  
  // Find ALL instructions
  const instructions = message.compiledInstructions || tx.transaction.message.instructions;
  
  console.log(`\n📝 All Instructions (${instructions.length} total):`);
  instructions.forEach((ix, i) => {
    const programId = accountKeys[ix.programIdIndex];
    console.log(`  ${i + 1}. Program: ${programId.toBase58()}`);
    console.log(`     Accounts: ${ix.accountKeyIndexes.length}`);
    console.log(`     Data: ${Buffer.from(ix.data).toString('hex').slice(0, 40)}...`);
  });
  
  // Find Pumpfun instruction
  const pumpfunIx = instructions.find(ix => {
    const programId = accountKeys[ix.programIdIndex];
    return programId.equals(PUMPFUN_PROGRAM_ID);
  });

  if (!pumpfunIx) {
    console.log('\n⚠️  No direct Pumpfun instruction - this is a wrapped/CPI transaction');
    console.log('🔍 Analyzing the actual instruction used instead...\n');
    
    // Analyze the main instruction (usually the last one)
    const mainIx = instructions[instructions.length - 1];
    const programId = accountKeys[mainIx.programIdIndex];
    
    console.log(`Main Program: ${programId.toBase58()}`);
    console.log(`Account Indices: [${mainIx.accountKeyIndexes.join(', ')}]`);
    console.log(`Data: ${Buffer.from(mainIx.data).toString('hex')}`);
    
    return null;
  }

  console.log(`\n🎯 Pumpfun Instruction Found`);
  console.log(`Program Index: ${pumpfunIx.programIdIndex}`);
  console.log(`Account Indices: [${pumpfunIx.accountKeyIndexes.join(', ')}]`);
  console.log(`Data (hex): ${Buffer.from(pumpfunIx.data).toString('hex')}`);
  console.log(`Data length: ${pumpfunIx.data.length} bytes`);

  // Decode instruction data
  const data = Buffer.from(pumpfunIx.data);
  const discriminator = data.slice(0, 8).toString('hex');
  console.log(`\nDiscriminator: ${discriminator}`);
  
  if (data.length >= 24) {
    const amount = data.readBigUInt64LE(8);
    const maxSolCost = data.readBigUInt64LE(16);
    console.log(`Amount: ${amount.toString()} lamports (${Number(amount) / 1e9} SOL)`);
    console.log(`Max SOL Cost: ${maxSolCost.toString()} lamports (${Number(maxSolCost) / 1e9} SOL)`);
  }

  // Map accounts with labels
  console.log(`\n📊 Account Structure (${pumpfunIx.accountKeyIndexes.length} accounts):`);
  console.log(`${'─'.repeat(80)}`);
  
  const accountLabels = [
    'global',
    'feeRecipient', 
    'mint',
    'bondingCurve',
    'associatedBondingCurve',
    'associatedUser',
    'user',
    'systemProgram',
    'tokenProgram',
    'rent',
    'eventAuthority',
    'program',
    'creatorVaultAuthority', // NEW - 0.05% fee account
    'creatorVaultAta'         // NEW - 0.05% fee account
  ];

  pumpfunIx.accountKeyIndexes.forEach((accountIndex, i) => {
    const pubkey = accountKeys[accountIndex];
    const label = accountLabels[i] || `unknown_${i}`;
    const isWritable = message.isAccountWritable ? message.isAccountWritable(accountIndex) : '?';
    const isSigner = message.isAccountSigner ? message.isAccountSigner(accountIndex) : '?';
    
    console.log(`${i.toString().padStart(2)}. ${label.padEnd(25)} ${pubkey.toBase58()} (W:${isWritable}, S:${isSigner})`);
  });

  // Check compute budget instructions
  const computeIxs = instructions.filter(ix => {
    const programId = accountKeys[ix.programIdIndex];
    return programId.toBase58() === 'ComputeBudget111111111111111111111111111111';
  });

  if (computeIxs.length > 0) {
    console.log(`\n⚙️  Compute Budget Instructions: ${computeIxs.length}`);
    computeIxs.forEach((ix, i) => {
      const data = Buffer.from(ix.data);
      console.log(`  ${i + 1}. Type: ${data[0]} | Data: ${data.toString('hex')}`);
      
      if (data[0] === 2) { // SetComputeUnitLimit
        const units = data.readUInt32LE(1);
        console.log(`     → Compute Unit Limit: ${units}`);
      } else if (data[0] === 3) { // SetComputeUnitPrice
        const microLamports = data.readBigUInt64LE(1);
        console.log(`     → Compute Unit Price: ${microLamports} microLamports`);
      }
    });
  }

  return {
    signature,
    accountCount: pumpfunIx.accountKeyIndexes.length,
    accounts: pumpfunIx.accountKeyIndexes.map((idx, i) => ({
      index: i,
      pubkey: accountKeys[idx].toBase58(),
      label: accountLabels[i] || `unknown_${i}`
    })),
    instructionData: data.toString('hex'),
    discriminator
  };
}

async function main() {
  console.log('🔍 Analyzing Successful Pumpfun Snipe Transactions\n');

  const results = [];
  
  for (const sig of signatures) {
    try {
      const result = await analyzePumpfunBuy(sig);
      if (result) {
        results.push(result);
      }
      await new Promise(r => setTimeout(r, 500)); // Rate limit
    } catch (error) {
      console.error(`❌ Error analyzing ${sig}:`, error.message);
    }
  }

  // Compare results
  if (results.length > 1) {
    console.log(`\n\n${'='.repeat(80)}`);
    console.log(`📊 COMPARISON SUMMARY`);
    console.log(`${'='.repeat(80)}\n`);
    
    console.log(`Total analyzed: ${results.length}`);
    console.log(`Account counts: ${results.map(r => r.accountCount).join(', ')}`);
    
    // Check if discriminators match
    const discriminators = [...new Set(results.map(r => r.discriminator))];
    console.log(`Unique discriminators: ${discriminators.length}`);
    if (discriminators.length === 1) {
      console.log(`✅ All use same discriminator: ${discriminators[0]}`);
    }

    // Common account structure
    console.log(`\n🎯 Template Account Structure (from first tx):`);
    console.log(JSON.stringify(results[0].accounts, null, 2));
  }
}

main().catch(console.error);
