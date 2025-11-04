#!/usr/bin/env node

/**
 * Test: Wait for MintTo Instruction
 * 
 * Tests detecting when "Instruction: MintTo" appears in the logs
 * This happens BEFORE the full transaction is confirmed
 * and might be a faster signal that the PDA is ready
 */

import WebSocket from 'ws';
import fetch from 'node-fetch';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

console.log('🧪 Testing: Wait for MintTo Instruction\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\n⏳ Waiting for token creation...\n');
console.log('='.repeat(80));

// Wait for MintTo instruction to appear
async function waitForMintToInstruction(signature, maxAttempts = 30) {
  const startTime = Date.now();
  console.log(`🔍 [TEST] Waiting for MintTo instruction in tx: ${signature.slice(0, 20)}...`);
  
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
            { commitment: 'processed', encoding: 'json', maxSupportedTransactionVersion: 0 }
          ]
        })
      });

      const data = await response.json();
      const tx = data.result;
      
      if (tx && tx.meta && tx.meta.logMessages) {
        // Check if MintTo instruction appears
        const hasMintTo = tx.meta.logMessages.some(log => 
          log.includes('Instruction: MintTo')
        );
        
        if (hasMintTo) {
          const elapsed = Date.now() - startTime;
          console.log(`✅ [TEST] MintTo instruction found after ${elapsed}ms`);
          return { found: true, elapsed };
        }
      }
      
      if (i % 5 === 0 && i > 0) {
        console.log(`   ⏳ Attempt ${i}/${maxAttempts} - still waiting...`);
      }
      
    } catch (error) {
      // Ignore errors and retry
    }
    
    await new Promise(resolve => setTimeout(resolve, 20)); // Poll every 20ms for speed
  }
  
  const elapsed = Date.now() - startTime;
  console.warn(`⚠️ [TEST] MintTo not found after ${elapsed}ms`);
  return { found: false, elapsed };
}

// Wait for full tx confirmation (our current approach)
async function waitForTxConfirmed(signature, maxAttempts = 30) {
  const startTime = Date.now();
  
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
      
      if (data.result) {
        const elapsed = Date.now() - startTime;
        return { confirmed: true, elapsed };
      }
      
    } catch (error) {
      // Ignore
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  return { confirmed: false, elapsed: Date.now() - startTime };
}

// Extract mint from transaction (FAST - uses processed commitment)
async function extractMintFromTx(signature) {
  const startTime = Date.now();
  
  try {
    // Use processed commitment for speed (1-10ms typically)
    for (let attempt = 0; attempt < 10; attempt++) {
      const response = await fetch(RPC_HTTP, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getTransaction',
          params: [
            signature,
            { encoding: 'json', commitment: 'processed', maxSupportedTransactionVersion: 0 }
          ]
        })
      });

      const data = await response.json();
      
      if (data.result) {
        const balances = data.result?.meta?.postTokenBalances || [];
        
        // Prioritize mints ending in 'pump'
        for (const balance of balances) {
          const mint = balance?.mint;
          if (mint && mint !== 'So11111111111111111111111111111111111111112') {
            if (mint.endsWith('pump')) {
              const elapsed = Date.now() - startTime;
              console.log(`✅ [TEST] Mint extracted in ${elapsed}ms: ${mint}`);
              return mint;
            }
          }
        }
        
        // Fallback: any non-SOL mint
        for (const balance of balances) {
          const mint = balance?.mint;
          if (mint && mint !== 'So11111111111111111111111111111111111111112') {
            const elapsed = Date.now() - startTime;
            console.log(`✅ [TEST] Mint extracted in ${elapsed}ms: ${mint}`);
            return mint;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } catch (error) {
    console.error(`   ❌ Extraction error: ${error.message}`);
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`⚠️ [TEST] Failed to extract mint after ${elapsed}ms`);
  return null;
}

// Main test
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  
  console.log(`\n📄 [TEST] Signature: ${logs.signature}`);
  
  // Extract mint
  const tokenMint = await extractMintFromTx(logs.signature);
  
  if (!tokenMint) {
    console.error('❌ [TEST] Could not extract mint\n');
    return false;
  }
  
  console.log();
  
  // Test 1: Wait for MintTo instruction (NEW APPROACH)
  console.log('📋 APPROACH 1: Wait for MintTo Instruction');
  console.log('─'.repeat(80));
  const mintToResult = await waitForMintToInstruction(logs.signature);
  
  // Test 2: Wait for confirmed tx (CURRENT APPROACH)
  console.log('\n📋 APPROACH 2: Wait for Confirmed Transaction');
  console.log('─'.repeat(80));
  console.log(`🔍 [TEST] Waiting for confirmed transaction...`);
  const confirmedResult = await waitForTxConfirmed(logs.signature);
  
  if (confirmedResult.confirmed) {
    console.log(`✅ [TEST] Transaction confirmed after ${confirmedResult.elapsed}ms`);
  }
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('\n' + '='.repeat(80));
  console.log('📊 COMPARISON:');
  console.log('='.repeat(80));
  console.log(`   Token: ${tokenMint}`);
  console.log(`   Signature: ${logs.signature.slice(0, 40)}...`);
  console.log();
  console.log(`   ⚡ MintTo detected:     ${mintToResult.elapsed}ms`);
  console.log(`   ⏱️  Confirmed tx:        ${confirmedResult.elapsed}ms`);
  console.log(`   📊 Time difference:     ${confirmedResult.elapsed - mintToResult.elapsed}ms`);
  console.log(`   🎯 Total test time:     ${totalElapsed}ms`);
  console.log();
  
  if (mintToResult.found && mintToResult.elapsed < confirmedResult.elapsed) {
    const timeSaved = confirmedResult.elapsed - mintToResult.elapsed;
    console.log(`   🚀 MintTo is ${timeSaved}ms FASTER!`);
    
    if (mintToResult.elapsed <= 100) {
      console.log(`   ✅ EXCELLENT: Block 0 entry possible with MintTo!`);
    } else if (mintToResult.elapsed <= 200) {
      console.log(`   ✅ GREAT: Block 0-1 entry with MintTo!`);
    } else {
      console.log(`   ✅ GOOD: Block 1 entry with MintTo`);
    }
  } else if (!mintToResult.found) {
    console.log(`   ⚠️  MintTo detection failed - stick with confirmed tx approach`);
  }
  
  console.log('='.repeat(80) + '\n');
  return true; // Test completed successfully
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
      
      // Test and only count if successful
      const success = await testTokenCreation(logs);
      if (success) {
        tokensTested++;
        
        if (tokensTested >= 3) {
          console.log('\n✅ Tested 3 tokens, exiting...\n');
          ws.close();
        }
      }
    }
  } catch (error) {
    // Ignore
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket disconnected');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping test...');
  ws.close();
  process.exit(0);
});
