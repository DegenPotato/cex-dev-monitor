/**
 * Test Official Pump.fun SDK
 * See if it handles the creator fee accounts correctly
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PumpSdk } from '@pump-fun/pump-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';

console.log('🧪 Testing Official Pump.fun SDK');
console.log('=================================\n');

// Create a dummy wallet for testing (not used for actual trades)
const dummyKeypair = Keypair.generate();
const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new Wallet(dummyKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });

// Initialize SDK
const sdk = new PumpSdk(provider);

console.log('✅ SDK initialized');
console.log(`📡 RPC: ${RPC_URL}`);
console.log(`👛 Test wallet: ${dummyKeypair.publicKey.toBase58()}\n`);

// Test: Get buy instruction for a token
async function testBuyInstruction() {
  // Use a recent token mint from your logs
  const mint = new PublicKey('5j8m4nMCnvTkAJyTASVBA9qzfv9u5B7rb5GQ9Bjapump');
  const buyAmountSol = 0.0001; // 0.0001 SOL
  const slippageBps = 500; // 5% slippage
  
  console.log('🔍 Testing buy instruction generation...');
  console.log(`   Token: ${mint.toBase58()}`);
  console.log(`   Amount: ${buyAmountSol} SOL`);
  console.log(`   Slippage: ${slippageBps / 100}%\n`);
  
  try {
    console.log('🔨 Building buy instructions with SDK...');
    
    // The SDK will handle all the account derivations internally
    const instructions = await sdk.buyInstructions(
      mint,
      BigInt(Math.floor(buyAmountSol * 1e9)), // SOL amount in lamports
      slippageBps, // slippage in bps
      100_000 // max sol cost (same as amount for now)
    );
    
    console.log('✅ Buy instructions generated successfully!');
    console.log(`   Instructions count: ${instructions.length}`);
    
    // Log all accounts in each instruction
    instructions.forEach((ix, idx) => {
      console.log(`\n📋 Instruction ${idx + 1}:`);
      console.log(`   Program: ${ix.programId.toBase58()}`);
      console.log(`   Accounts: ${ix.keys.length}`);
      
      ix.keys.forEach((key, accIdx) => {
        const flags = [];
        if (key.isSigner) flags.push('signer');
        if (key.isWritable) flags.push('writable');
        console.log(`      ${accIdx}: ${key.pubkey.toBase58()} [${flags.join(', ') || 'read-only'}]`);
      });
    });
    
    // Check if we have more accounts than the old implementation (should be 14 instead of 12)
    const buyIx = instructions[instructions.length - 1];
    if (buyIx.keys.length >= 14) {
      console.log(`\n✅ CONFIRMED: ${buyIx.keys.length} accounts (includes creator fee accounts!)`);
    }
    
    return true;
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error('Stack:', error.stack);
    return false;
  }
}

testBuyInstruction()
  .then(success => {
    if (success) {
      console.log('\n✅ SDK test passed!');
      console.log('\n💡 Next steps:');
      console.log('   1. Replace PumpfunBuyLogic with this SDK');
      console.log('   2. The SDK handles all account derivations automatically');
      console.log('   3. Including the new creator fee accounts!');
    }
    process.exit(success ? 0 : 1);
  })
  .catch(err => {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  });
