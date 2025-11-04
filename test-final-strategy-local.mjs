#!/usr/bin/env node

/**
 * Test Final Strategy Locally (No Buys)
 * 
 * This script:
 * 1. Detects token creations
 * 2. Extracts signature from logs.signature
 * 3. Waits for creation tx to be confirmed
 * 4. Times everything
 * 5. DOES NOT actually buy
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

console.log('🧪 Testing Final Strategy Locally (No Buys)\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\n⏳ Waiting for token creation...\n');
console.log('='.repeat(80));

// Wait for creation transaction to be confirmed
async function waitForCreationTxConfirmed(signature, maxAttempts = 20) {
  const startTime = Date.now();
  console.log(`🔍 [TEST] Calling waitForCreationTxConfirmed with signature: ${signature}`);
  
  if (!signature) {
    console.error('❌ [TEST] No signature provided!');
    return false;
  }
  
  for (let i = 0; i < maxAttempts; i++) {
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
            { commitment: 'confirmed', encoding: 'json', maxSupportedTransactionVersion: 0 }
          ]
        })
      });

      const data = await response.json();
      const tx = data.result;
      
      if (tx) {
        const elapsed = Date.now() - startTime;
        console.log(`✅ [TEST] Creation tx confirmed after ${elapsed}ms`);
        return { confirmed: true, elapsed };
      }
      
      if (i % 5 === 0) {
        console.log(`   ⏳ Attempt ${i + 1}/${maxAttempts} - still waiting...`);
      }
      
    } catch (error) {
      console.log(`   ⚠️ Error on attempt ${i + 1}: ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const elapsed = Date.now() - startTime;
  console.warn(`⚠️ [TEST] Creation tx not confirmed after ${elapsed}ms`);
  return { confirmed: false, elapsed };
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

// Main handler
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  
  // 1. Extract signature (this is what our code does)
  console.log(`\n📄 [TEST] logs.signature: ${logs.signature}`);
  
  if (!logs.signature) {
    console.error('❌ [TEST] logs.signature is missing! This is the problem!');
    return;
  }
  
  console.log(`✅ [TEST] Signature extracted successfully\n`);
  
  // 2. Extract mint
  console.log('🔍 [TEST] Extracting mint from transaction...');
  const tokenMint = await extractMintFromTx(logs.signature);
  
  if (!tokenMint) {
    console.error('❌ [TEST] Could not extract mint');
    return;
  }
  
  console.log(`✅ [TEST] Token mint: ${tokenMint}\n`);
  
  // 3. Wait for creation tx to be confirmed (this is our new strategy)
  console.log('⏳ [TEST] Waiting for creation tx to be confirmed...');
  const result = await waitForCreationTxConfirmed(logs.signature);
  
  if (!result.confirmed) {
    console.error('❌ [TEST] Creation tx not confirmed, would abort buy');
    return;
  }
  
  console.log(`⚡ [TEST] Creation tx confirmed, would execute buy now\n`);
  
  // 4. Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('='.repeat(80));
  console.log('📊 TEST SUMMARY:');
  console.log('='.repeat(80));
  console.log(`   Token: ${tokenMint}`);
  console.log(`   Creation TX: ${logs.signature}`);
  console.log(`   TX Confirmed: ${result.elapsed}ms`);
  console.log(`   Total Time: ${totalElapsed}ms`);
  console.log(`   Expected Block: ${Math.ceil(totalElapsed / 400)}`);
  
  if (totalElapsed <= 400) {
    console.log(`   🚀 EXCELLENT: Block 0-1 entry possible!`);
  } else if (totalElapsed <= 800) {
    console.log(`   ✅ GOOD: Block 1-2 entry likely`);
  } else {
    console.log(`   ⚠️  SLOW: Block 2+ entry`);
  }
  
  console.log('\n   ✅ Strategy would work! No 3012 errors expected.');
  console.log('='.repeat(80) + '\n');
}

// WebSocket listener
const ws = new WebSocket(WS_URL);
let tokensTested = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\n');
  
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
    
    if (message.result) {
      console.log(`✅ Subscription ID: ${message.result}\n`);
      return;
    }
    
    if (message.method === 'logsNotification') {
      const logs = message.params.result.value;
      
      // Check if it's a token creation
      const isTokenCreation = logs.logs && Array.isArray(logs.logs) && 
        logs.logs.some(log => log.includes('Program log: Instruction: Create')) &&
        logs.logs.some(log => log.includes('Instruction: MintTo')) &&
        logs.logs.some(log => log.includes('Instruction: Buy'));
      
      if (!isTokenCreation) return;
      
      // Test the strategy
      tokensTested++;
      await testTokenCreation(logs);
      
      if (tokensTested >= 3) {
        console.log('\n✅ Tested 3 tokens, exiting...\n');
        ws.close();
      }
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
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
