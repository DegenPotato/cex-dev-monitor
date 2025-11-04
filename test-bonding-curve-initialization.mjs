import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Bonding Curve Initialization Polling\n');
console.log('⏳ Waiting for token creation...\n');

// Get full transaction
async function getFullTransaction(signature) {
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
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
        ]
      })
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    return null;
  }
}

// Extract all account addresses
function extractAccountAddresses(tx) {
  const accounts = new Set();
  
  if (tx?.transaction?.message?.accountKeys) {
    tx.transaction.message.accountKeys.forEach(key => {
      if (typeof key === 'string') {
        accounts.add(key);
      } else if (key?.pubkey) {
        accounts.add(key.pubkey);
      }
    });
  }
  
  return Array.from(accounts);
}

// Find bonding curve in transaction
async function findBondingCurve(accounts) {
  for (const address of accounts) {
    try {
      const pubkey = new PublicKey(address);
      const info = await connection.getAccountInfo(pubkey);
      
      if (!info) continue;
      
      // Check if owned by Pumpfun
      if (info.owner.toBase58() !== PUMPFUN_PROGRAM.toBase58()) continue;
      
      // Check discriminator
      if (info.data.length < 8) continue;
      const discriminator = info.data.slice(0, 8);
      
      if (discriminator.equals(BONDING_CURVE_DISCRIMINATOR) && info.data.length === 150) {
        return address;
      }
    } catch (error) {
      // Skip
    }
  }
  
  return null;
}

// Poll until bonding curve is FULLY initialized
async function pollForInitialization(bondingCurve) {
  console.log(`📍 Bonding curve PDA: ${bondingCurve}`);
  console.log('⏱️  Polling for initialization (50ms intervals, max 20 attempts)...\n');
  
  const startTime = Date.now();
  const pubkey = new PublicKey(bondingCurve);
  const maxPolls = 20; // 1 second max
  
  for (let poll = 0; poll < maxPolls; poll++) {
    try {
      const info = await connection.getAccountInfo(pubkey, { commitment: 'confirmed' });
      
      if (info && info.data && info.data.length === 150) {
        const elapsed = Date.now() - startTime;
        
        // Check if data after discriminator has nonzero values
        const discriminator = info.data.slice(0, 8);
        const dataAfterDiscriminator = info.data.slice(8);
        const hasInitializedData = !dataAfterDiscriminator.every(b => b === 0);
        
        // Show first few bytes for debugging
        const sampleData = info.data.slice(8, 20);
        const sampleHex = Buffer.from(sampleData).toString('hex');
        
        if (hasInitializedData) {
          console.log(`✅ [${elapsed}ms] INITIALIZED! Data sample: ${sampleHex}`);
          console.log(`   Discriminator: ${discriminator.toString('hex')}`);
          console.log(`   Total size: ${info.data.length} bytes`);
          
          return { initialized: true, elapsed, attempts: poll + 1 };
        } else {
          console.log(`   [${elapsed}ms] Attempt ${poll + 1}: Account exists but data is zeros (${sampleHex})`);
        }
      } else {
        const elapsed = Date.now() - startTime;
        console.log(`   [${elapsed}ms] Attempt ${poll + 1}: Account not found or wrong size`);
      }
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`   [${elapsed}ms] Attempt ${poll + 1}: Error - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`❌ Bonding curve not initialized after ${elapsed}ms`);
  return { initialized: false, elapsed, attempts: maxPolls };
}

// Test token creation
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  console.log(`📄 Signature: ${logs.signature}\n`);
  
  // 1. Get transaction
  console.log('📋 Step 1: Fetching transaction...');
  const tx = await getFullTransaction(logs.signature);
  
  if (!tx) {
    console.error('❌ Could not fetch transaction');
    return false;
  }
  
  const txFetchTime = Date.now() - testStartTime;
  console.log(`✅ Transaction fetched in ${txFetchTime}ms\n`);
  
  // 2. Extract bonding curve
  console.log('📋 Step 2: Extracting bonding curve...');
  const accounts = extractAccountAddresses(tx);
  const bondingCurve = await findBondingCurve(accounts);
  
  if (!bondingCurve) {
    console.error('❌ Bonding curve not found');
    return false;
  }
  
  const extractTime = Date.now() - testStartTime;
  console.log(`✅ Bonding curve found in ${extractTime}ms\n`);
  
  // 3. Poll for initialization
  console.log('📋 Step 3: Polling for Initialization...');
  console.log('─'.repeat(80));
  const initResult = await pollForInitialization(bondingCurve);
  console.log();
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(80));
  console.log(`   Signature: ${logs.signature.slice(0, 40)}...`);
  console.log();
  console.log(`   ⏱️  Tx fetch:        ${txFetchTime}ms`);
  console.log(`   🔍 Curve extract:   ${extractTime}ms`);
  console.log(`   ⏳ Init polling:    ${initResult.elapsed}ms (${initResult.attempts} attempts)`);
  console.log(`   📊 Total time:      ${totalElapsed}ms`);
  
  if (initResult.initialized) {
    console.log();
    console.log(`   ✅ READY TO BUY!`);
    
    if (totalElapsed <= 500) {
      console.log(`   🚀 EXCELLENT: Block 0-1 entry possible!`);
    } else if (totalElapsed <= 800) {
      console.log(`   ⚡ GREAT: Block 1-2 entry!`);
    } else if (totalElapsed <= 1200) {
      console.log(`   ✅ GOOD: Block 2 entry`);
    } else {
      console.log(`   ⚠️  OK: Block 2-3 entry`);
    }
  } else {
    console.log();
    console.log(`   ❌ FAILED: Bonding curve never initialized`);
  }
  
  console.log('='.repeat(80) + '\n');
  return true;
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
      { mentions: [PUMPFUN_PROGRAM.toBase58()] },
      { commitment: 'processed' }
    ]
  }));
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.method === 'logsNotification') {
      const logs = message.params.result.value;
      
      // Check if it's a token creation
      const isTokenCreation = logs.logs && Array.isArray(logs.logs) && 
        logs.logs.some(log => log.includes('Program log: Instruction: Create')) &&
        logs.logs.some(log => log.includes('Instruction: MintTo')) &&
        logs.logs.some(log => log.includes('Instruction: Buy'));
      
      if (!isTokenCreation) return;
      
      // Test and count
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
  console.log('🔌 WebSocket disconnected\n');
  process.exit(0);
});
