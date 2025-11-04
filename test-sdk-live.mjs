/**
 * Test Pump SDK with LIVE token launches
 * Monitors WebSocket for new tokens and tests SDK buyInstructions
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { PumpSdk } from '@pump-fun/pump-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';
import WebSocket from 'ws';

const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

console.log('🎯 Pump SDK Live Test');
console.log('=====================\n');

// Setup SDK
const dummyKeypair = Keypair.generate();
const connection = new Connection(RPC_URL, 'confirmed');
const wallet = new Wallet(dummyKeypair);
const provider = new AnchorProvider(connection, wallet, { commitment: 'confirmed' });
const sdk = new PumpSdk(provider);

console.log('✅ SDK initialized');
console.log(`📡 RPC: ${RPC_URL}`);
console.log(`👛 Test wallet: ${dummyKeypair.publicKey.toBase58()}`);
console.log('\n🔍 Monitoring for new token launches...\n');

let testing = false;

async function testBuyInstructions(tokenMint) {
  if (testing) return;
  testing = true;
  
  console.log(`\n🎯 NEW TOKEN DETECTED: ${tokenMint}`);
  console.log('⏳ Waiting 2 seconds for bonding curve to initialize...\n');
  await new Promise(r => setTimeout(r, 2000));
  
  try {
    const mint = new PublicKey(tokenMint);
    const buyAmountSol = 0.0001;
    const slippageBps = 500;
    
    console.log('🔨 Building buy instructions with official SDK...');
    console.log(`   Amount: ${buyAmountSol} SOL`);
    console.log(`   Slippage: ${slippageBps / 100}%\n`);
    
    const instructions = await sdk.buyInstructions(
      mint,
      BigInt(Math.floor(buyAmountSol * 1e9)),
      slippageBps,
      BigInt(Math.floor(buyAmountSol * 1e9)) // max sol cost
    );
    
    console.log('✅ Buy instructions generated successfully!');
    console.log(`   Instructions count: ${instructions.length}\n`);
    
    // Log all accounts
    instructions.forEach((ix, idx) => {
      console.log(`📋 Instruction ${idx + 1}:`);
      console.log(`   Program: ${ix.programId.toBase58()}`);
      console.log(`   Accounts: ${ix.keys.length}`);
      
      ix.keys.forEach((key, accIdx) => {
        const flags = [];
        if (key.isSigner) flags.push('signer');
        if (key.isWritable) flags.push('writable');
        console.log(`      ${accIdx}: ${key.pubkey.toBase58()} [${flags.join(', ') || 'read-only'}]`);
      });
      console.log('');
    });
    
    // Check account count
    const buyIx = instructions[instructions.length - 1];
    const accountCount = buyIx.keys.length;
    
    console.log(`\n📊 Account count: ${accountCount}`);
    
    if (accountCount >= 14) {
      console.log('✅ PASS: Has creator fee accounts (14+ accounts)');
    } else if (accountCount === 12) {
      console.log('❌ FAIL: Missing creator fee accounts (only 12 accounts)');
    } else {
      console.log(`⚠️  Unexpected account count: ${accountCount}`);
    }
    
    console.log('\n🎉 Test complete! Exiting...');
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) console.error(error.stack);
    testing = false;
  }
}

// Extract mint from transaction
async function extractMint(signature) {
  try {
    let tx = null;
    for (let attempt = 0; attempt < 10; attempt++) {
      tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });
      if (tx) break;
      await new Promise(r => setTimeout(r, 50));
    }
    
    if (!tx?.meta?.postTokenBalances) return null;
    
    for (const balance of tx.meta.postTokenBalances) {
      const mint = balance.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112' && mint.endsWith('pump')) {
        return mint;
      }
    }
    return null;
  } catch (error) {
    return null;
  }
}

// Start monitoring
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('🔌 WebSocket connected');
  
  // Subscribe to Pumpfun program logs
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID.toBase58()] },
      { commitment: 'confirmed' }
    ]
  }));
});

ws.on('message', async (data) => {
  try {
    const msg = JSON.parse(data.toString());
    
    if (msg.method === 'logsNotification') {
      const logs = msg.params.result.value.logs;
      const signature = msg.params.result.value.signature;
      
      // Check for new token pattern
      const hasCreate = logs.some(log => log.includes('Instruction: Create'));
      const hasMintTo = logs.some(log => log.includes('Instruction: MintTo'));
      const hasBuy = logs.some(log => log.includes('Instruction: Buy'));
      
      if (hasCreate && hasMintTo && hasBuy) {
        console.log('🆕 NEW TOKEN LAUNCH DETECTED!');
        const tokenMint = await extractMint(signature);
        
        if (tokenMint) {
          await testBuyInstructions(tokenMint);
        }
      }
    }
  } catch (error) {
    // Ignore parsing errors
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket disconnected');
  if (!testing) {
    process.exit(1);
  }
});

// Timeout after 5 minutes
setTimeout(() => {
  console.log('\n⏱️  Timeout: No new tokens in 5 minutes');
  process.exit(1);
}, 5 * 60 * 1000);
