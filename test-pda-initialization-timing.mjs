#!/usr/bin/env node

/**
 * Test: When is PDA Actually Initialized?
 * 
 * Detects Pumpfun launches and measures:
 * 1. When PDA exists (getAccountInfo returns data)
 * 2. When PDA is initialized (has proper curve data structure)
 * 3. When creation transaction is confirmed
 * 
 * This tells us the real delay needed to avoid 3012 errors
 */

import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';
import fetch from 'node-fetch';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

// Expected bonding curve account size (Pumpfun specific)
const EXPECTED_CURVE_SIZE = 120; // Approximate size of initialized curve

console.log('🧪 Testing PDA Initialization Timing\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\nListening for Pumpfun launches...\n');
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

// Check if PDA exists (any data)
async function checkPDAExists(pdaAddress, commitment = 'processed') {
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

// Check if PDA is initialized (has proper data)
async function checkPDAInitialized(pdaAddress, commitment = 'processed') {
  const accountInfo = await checkPDAExists(pdaAddress, commitment);
  
  if (!accountInfo) return false;
  
  // Check if account has data of expected size
  const dataLength = accountInfo.data?.[0]?.length || 0;
  
  // Decode base64 to get actual byte length
  if (accountInfo.data && accountInfo.data[0]) {
    const decoded = Buffer.from(accountInfo.data[0], 'base64');
    return decoded.length >= EXPECTED_CURVE_SIZE;
  }
  
  return false;
}

// Wait for transaction confirmation
async function waitForConfirmation(signature, commitment = 'confirmed') {
  const maxAttempts = 30; // 3 seconds
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const response = await fetch(RPC_HTTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [signature, { encoding: 'json', commitment, maxSupportedTransactionVersion: 0 }]
        })
      });

      const data = await response.json();
      if (data.result) return true;
    } catch (error) {
      // Ignore
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return false;
}

// Main test for a single launch
async function testPDAInitialization(signature, tokenMint) {
  console.log('\n' + '='.repeat(80));
  console.log(`🆕 NEW TOKEN: ${tokenMint}`);
  console.log(`📄 Signature: ${signature}`);
  console.log('='.repeat(80));
  
  const [pda] = deriveBondingCurvePDA(tokenMint);
  const pdaAddress = pda.toBase58();
  console.log(`🔑 PDA: ${pdaAddress}\n`);
  
  const testStartTime = Date.now();
  
  // Test 1: When does PDA exist (processed)?
  console.log('📋 TEST 1: When does PDA exist (processed commitment)?');
  let existsTime = null;
  for (let i = 0; i < 30; i++) {
    const exists = await checkPDAExists(pdaAddress, 'processed');
    if (exists) {
      existsTime = Date.now() - testStartTime;
      console.log(`   ✅ PDA exists after ${existsTime}ms (processed)`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (!existsTime) {
    console.log('   ❌ PDA never appeared');
    return;
  }
  
  // Test 2: When is PDA initialized (has data)?
  console.log('\n📋 TEST 2: When is PDA initialized (has proper data)?');
  let initializedTime = null;
  for (let i = 0; i < 30; i++) {
    const initialized = await checkPDAInitialized(pdaAddress, 'processed');
    if (initialized) {
      initializedTime = Date.now() - testStartTime;
      console.log(`   ✅ PDA initialized after ${initializedTime}ms (processed)`);
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  if (!initializedTime) {
    console.log('   ⚠️ PDA exists but no proper data detected');
  }
  
  // Test 3: When is transaction confirmed?
  console.log('\n📋 TEST 3: When is creation tx confirmed?');
  const confirmStartTime = Date.now();
  const confirmed = await waitForConfirmation(signature, 'confirmed');
  const confirmTime = Date.now() - testStartTime;
  
  if (confirmed) {
    console.log(`   ✅ Transaction confirmed after ${confirmTime}ms`);
  } else {
    console.log(`   ❌ Transaction not confirmed`);
  }
  
  // Test 4: Check PDA with confirmed commitment
  console.log('\n📋 TEST 4: PDA state with confirmed commitment');
  const confirmedPDA = await checkPDAExists(pdaAddress, 'confirmed');
  const confirmedInitialized = await checkPDAInitialized(pdaAddress, 'confirmed');
  const confirmedTime = Date.now() - testStartTime;
  
  console.log(`   ${confirmedPDA ? '✅' : '❌'} PDA exists (confirmed): ${confirmedTime}ms`);
  console.log(`   ${confirmedInitialized ? '✅' : '❌'} PDA initialized (confirmed): ${confirmedTime}ms`);
  
  // Summary
  console.log('\n' + '='.repeat(80));
  console.log('📊 TIMING SUMMARY:');
  console.log('='.repeat(80));
  if (existsTime) console.log(`   PDA exists (processed):      ${existsTime}ms`);
  if (initializedTime) console.log(`   PDA initialized (processed): ${initializedTime}ms`);
  console.log(`   Transaction confirmed:       ${confirmTime}ms`);
  console.log(`   PDA confirmed commitment:    ${confirmedTime}ms`);
  
  if (initializedTime && existsTime) {
    const initDelay = initializedTime - existsTime;
    console.log(`\n   ⚡ Gap between exists and initialized: ${initDelay}ms`);
    
    if (initDelay > 0) {
      console.log(`   💡 INSIGHT: Need to wait ${initDelay}ms after PDA exists for full init`);
    } else {
      console.log(`   💡 INSIGHT: PDA is initialized immediately when it exists`);
    }
  }
  
  if (confirmTime) {
    console.log(`\n   🎯 RECOMMENDATION: Wait for 'confirmed' tx (~${confirmTime}ms) to avoid 3012`);
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
      
      // Run initialization timing test
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
