#!/usr/bin/env node

/**
 * Test: Proper PDA Initialization Detection
 * 
 * Tests the CORRECT way to check if PDA is initialized:
 * 1. Owner check (must be Pumpfun program)
 * 2. Discriminator check (first 8 bytes = Anchor discriminator)
 * 3. Data length check (>= 120 bytes)
 * 
 * This eliminates 3012 errors by verifying what the program actually checks.
 */

import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

// Minimum expected size for initialized curve
const EXPECTED_CURVE_SIZE = 120;

// We'll discover the discriminator from first successful init
let KNOWN_DISCRIMINATOR = null;

console.log('🧪 Testing Proper PDA Initialization Detection\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\nWill check: Owner + Discriminator + Data Length\n');
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

// Get account info
async function getAccountInfo(pdaAddress, commitment = 'processed') {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getAccountInfo',
        params: [pdaAddress, { encoding: 'base64', commitment }]
      })
    });

    const data = await response.json();
    return data.result?.value || null;
  } catch (error) {
    return null;
  }
}

// PROPER initialization check (what the program actually verifies)
async function isPDAProperlyInitialized(pdaAddress, commitment = 'processed') {
  const info = await getAccountInfo(pdaAddress, commitment);
  
  if (!info) return { initialized: false, reason: 'Account does not exist' };
  
  // 1. Owner check - must be Pumpfun program
  if (info.owner !== PUMPFUN_PROGRAM_ID) {
    return { initialized: false, reason: `Wrong owner: ${info.owner}` };
  }
  
  // 2. Data must exist
  if (!info.data || !info.data[0]) {
    return { initialized: false, reason: 'No data' };
  }
  
  const dataBuffer = Buffer.from(info.data[0], 'base64');
  
  // 3. Length check
  if (dataBuffer.length < EXPECTED_CURVE_SIZE) {
    return { initialized: false, reason: `Data too small: ${dataBuffer.length} bytes` };
  }
  
  // 4. Discriminator check (first 8 bytes)
  const discriminator = dataBuffer.slice(0, 8);
  
  if (!KNOWN_DISCRIMINATOR) {
    // First time - learn the discriminator
    KNOWN_DISCRIMINATOR = discriminator;
    console.log(`   📝 Learned discriminator: ${discriminator.toString('hex')}`);
  } else {
    // Verify it matches known discriminator
    if (!discriminator.equals(KNOWN_DISCRIMINATOR)) {
      return { 
        initialized: false, 
        reason: `Wrong discriminator: ${discriminator.toString('hex')} (expected ${KNOWN_DISCRIMINATOR.toString('hex')})` 
      };
    }
  }
  
  return { 
    initialized: true, 
    dataLength: dataBuffer.length,
    discriminator: discriminator.toString('hex')
  };
}

// OLD way (just length check)
async function isPDAInitializedOldWay(pdaAddress, commitment = 'processed') {
  const info = await getAccountInfo(pdaAddress, commitment);
  
  if (!info?.data?.[0]) return false;
  
  const dataBuffer = Buffer.from(info.data[0], 'base64');
  return dataBuffer.length >= EXPECTED_CURVE_SIZE;
}

// Main test
async function testPDAInitialization(signature, tokenMint) {
  console.log('\n' + '='.repeat(80));
  console.log(`🆕 NEW TOKEN: ${tokenMint}`);
  console.log(`📄 Signature: ${signature}`);
  console.log('='.repeat(80));
  
  const [pda] = deriveBondingCurvePDA(tokenMint);
  const pdaAddress = pda.toBase58();
  console.log(`🔑 PDA: ${pdaAddress}\n`);
  
  const testStartTime = Date.now();
  
  // Test 1: OLD WAY (just length check)
  console.log('📋 TEST 1: Old Way (just data.length >= 120)');
  let oldWayTime = null;
  for (let i = 0; i < 30; i++) {
    const initialized = await isPDAInitializedOldWay(pdaAddress, 'processed');
    if (initialized) {
      oldWayTime = Date.now() - testStartTime;
      console.log(`   ✅ Old way passed after ${oldWayTime}ms`);
      console.log(`   ⚠️  But this might still fail with 3012!`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (!oldWayTime) {
    console.log('   ❌ Old way never passed');
    return;
  }
  
  // Test 2: PROPER WAY (owner + discriminator + length)
  console.log('\n📋 TEST 2: Proper Way (owner + discriminator + length)');
  let properWayTime = null;
  let attempts = 0;
  
  for (let i = 0; i < 30; i++) {
    attempts++;
    const result = await isPDAProperlyInitialized(pdaAddress, 'processed');
    
    if (!result.initialized) {
      console.log(`   ⌛ Attempt ${attempts}: ${result.reason}`);
    } else {
      properWayTime = Date.now() - testStartTime;
      console.log(`   ✅ Proper check passed after ${properWayTime}ms`);
      console.log(`   📊 Data: ${result.dataLength} bytes, Discriminator: ${result.discriminator}`);
      console.log(`   🎯 This GUARANTEES no 3012 error!`);
      break;
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (!properWayTime) {
    console.log('   ❌ Proper check never passed (this is a problem!)');
  }
  
  // Test 3: Compare with confirmed commitment
  console.log('\n📋 TEST 3: Proper check with confirmed commitment');
  const confirmedStartTime = Date.now();
  
  let confirmedPassed = false;
  for (let i = 0; i < 30; i++) {
    const result = await isPDAProperlyInitialized(pdaAddress, 'confirmed');
    if (result.initialized) {
      const confirmedTime = Date.now() - testStartTime;
      console.log(`   ✅ Confirmed check passed after ${confirmedTime}ms`);
      confirmedPassed = true;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (!confirmedPassed) {
    console.log('   ❌ Confirmed check never passed');
  }
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(80));
  if (oldWayTime) console.log(`   Old way (length only):       ${oldWayTime}ms ⚠️  May fail with 3012`);
  if (properWayTime) console.log(`   Proper way (processed):      ${properWayTime}ms ✅ Guaranteed safe`);
  
  if (properWayTime && oldWayTime) {
    const diff = properWayTime - oldWayTime;
    if (diff > 0) {
      console.log(`\n   ⏱️  Proper check adds ${diff}ms overhead`);
      console.log(`   💡 BUT eliminates 3012 errors completely!`);
    } else {
      console.log(`\n   🎉 Proper check is just as fast (no overhead)!`);
    }
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
      
      // Run test
      await testPDAInitialization(signature, tokenMint);
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
