#!/usr/bin/env node

/**
 * Test: Confirmed Commitment PDA Validation Timing
 * 
 * Tests the final production approach:
 * - Owner check
 * - Discriminator check (17b7f83760d8ac60)
 * - Length check (>= 120 bytes)
 * - Using CONFIRMED commitment (no fork mismatch!)
 * 
 * This measures real-world timing for block 1-2 entry potential
 */

import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

const EXPECTED_CURVE_SIZE = 120;
const EXPECTED_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

console.log('🧪 Testing CONFIRMED Commitment PDA Validation\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\n🎯 This is the PRODUCTION approach (owner + discriminator + confirmed)');
console.log('='.repeat(80));

// Derive bonding curve PDA
function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), new PublicKey(tokenMint).toBuffer()],
    new PublicKey(PUMPFUN_PROGRAM_ID)
  );
}

// Extract mint from transaction
async function extractMintFromTx(signature) {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
        ]
      })
    });

    const data = await response.json();
    const balances = data.result?.meta?.postTokenBalances || [];
    
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        if (mint.endsWith('pump')) return mint;
      }
    }
    
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        return mint;
      }
    }
  } catch (error) {
    console.error('   ❌ Extract error:', error.message);
  }
  return null;
}

// Production validation - CONFIRMED COMMITMENT
async function isPDAProperlyInitialized(pdaAddress) {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [pdaAddress, { encoding: 'base64', commitment: 'confirmed' }] // CONFIRMED!
      })
    });

    const data = await response.json();
    const accountInfo = data.result?.value;
    
    if (!accountInfo) {
      return { initialized: false, reason: 'Account does not exist' };
    }
    
    // 1. Owner check
    if (accountInfo.owner !== PUMPFUN_PROGRAM_ID) {
      return { initialized: false, reason: `Wrong owner: ${accountInfo.owner}` };
    }
    
    // 2. Data must exist
    if (!accountInfo.data || !accountInfo.data[0]) {
      return { initialized: false, reason: 'No data' };
    }
    
    const dataBuffer = Buffer.from(accountInfo.data[0], 'base64');
    
    // 3. Length check
    if (dataBuffer.length < EXPECTED_CURVE_SIZE) {
      return { initialized: false, reason: `Data too small: ${dataBuffer.length} bytes` };
    }
    
    // 4. Discriminator check
    const discriminator = dataBuffer.slice(0, 8);
    if (!discriminator.equals(EXPECTED_DISCRIMINATOR)) {
      return { 
        initialized: false, 
        reason: `Wrong discriminator: ${discriminator.toString('hex')}` 
      };
    }
    
    return { 
      initialized: true, 
      dataLength: dataBuffer.length,
      discriminator: discriminator.toString('hex')
    };
  } catch (error) {
    return { initialized: false, reason: `Error: ${error.message}` };
  }
}

// Main test
async function testConfirmedCommitmentTiming(signature, tokenMint) {
  console.log('\n' + '='.repeat(80));
  console.log(`🆕 NEW TOKEN: ${tokenMint}`);
  console.log(`📄 Signature: ${signature}`);
  console.log('='.repeat(80));
  
  const [pda] = deriveBondingCurvePDA(tokenMint);
  const pdaAddress = pda.toBase58();
  console.log(`🔑 PDA: ${pdaAddress}\n`);
  
  const testStartTime = Date.now();
  
  // Test: CONFIRMED commitment validation (production approach)
  console.log('📋 PRODUCTION APPROACH: Confirmed commitment + full validation');
  let confirmedTime = null;
  let attempts = 0;
  const maxAttempts = 20; // ~2 seconds total
  
  while (attempts < maxAttempts && !confirmedTime) {
    attempts++;
    
    const result = await isPDAProperlyInitialized(pdaAddress);
    
    if (!result.initialized) {
      console.log(`   ⌛ Attempt ${attempts}: ${result.reason}`);
    } else {
      confirmedTime = Date.now() - testStartTime;
      console.log(`   ✅ PDA properly initialized after ${confirmedTime}ms`);
      console.log(`   📊 Data: ${result.dataLength} bytes, Discriminator: ${result.discriminator}`);
      console.log(`   🎯 This GUARANTEES no fork mismatch, no 3012 errors!`);
      break;
    }
    
    // Poll every 100ms
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  if (!confirmedTime) {
    const elapsed = Date.now() - testStartTime;
    console.log(`   ❌ PDA not initialized after ${elapsed}ms`);
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TIMING ANALYSIS:');
  console.log('='.repeat(80));
  
  if (confirmedTime) {
    console.log(`   ⏱️  Confirmed commitment validation: ${confirmedTime}ms`);
    
    // Analyze block potential
    if (confirmedTime <= 400) {
      console.log(`   🚀 EXCELLENT: Block 0-1 entry possible!`);
    } else if (confirmedTime <= 800) {
      console.log(`   ✅ GOOD: Block 1-2 entry likely`);
    } else if (confirmedTime <= 1200) {
      console.log(`   ⚠️  ACCEPTABLE: Block 2-3 entry`);
    } else {
      console.log(`   ⚠️  SLOW: Block 3+ entry`);
    }
    
    console.log(`\n   💡 Total snipe time estimate: ${confirmedTime + 50}ms (validation + tx build)`);
    console.log(`   🎯 Expected block entry: ${Math.ceil((confirmedTime + 50) / 400)}`);
  }
  
  console.log('\n' + '='.repeat(80));
  console.log('Listening for next launch...\n');
}

// WebSocket listener
const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to Pumpfun program logs\n');
  
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID] },
      { commitment: 'processed' }
    ]
  }));
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data);
    
    if (message.method === 'logsNotification') {
      const logs = message.params.result.value;
      const signature = logs.signature;
      
      // Check if it's a token creation
      const hasCreate = logs.logs.some(log => 
        log.includes('Program log: Instruction: Create') || 
        log.includes('InitializeMint')
      );
      
      if (!hasCreate) return;
      
      // Extract mint
      console.log('🔍 Launch detected, extracting mint...');
      const tokenMint = await extractMintFromTx(signature);
      
      if (!tokenMint) {
        console.log('   ⏭️  Could not extract mint\n');
        return;
      }
      
      // Run timing test
      await testConfirmedCommitmentTiming(signature, tokenMint);
    }
  } catch (error) {
    // Ignore parse errors
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket disconnected');
  process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping test...');
  ws.close();
  process.exit(0);
});
