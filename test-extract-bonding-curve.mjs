import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Extract Bonding Curve from Transaction\n');
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

// Extract all account addresses from transaction
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

// Find bonding curve account from transaction
async function findBondingCurveAccount(accounts) {
  console.log(`🔍 Checking ${accounts.length} accounts for bonding curve...`);
  
  for (const address of accounts) {
    try {
      const pubkey = new PublicKey(address);
      const info = await connection.getAccountInfo(pubkey);
      
      if (!info) continue;
      
      // Check if owned by Pumpfun
      if (info.owner.toBase58() !== PUMPFUN_PROGRAM.toBase58()) continue;
      
      // Check if has discriminator
      if (info.data.length < 8) continue;
      
      const discriminator = info.data.slice(0, 8);
      
      if (discriminator.equals(BONDING_CURVE_DISCRIMINATOR)) {
        console.log(`✅ FOUND BONDING CURVE!`);
        console.log(`   Address: ${address}`);
        console.log(`   Data size: ${info.data.length} bytes`);
        console.log(`   Discriminator: ${discriminator.toString('hex')}`);
        return address;
      }
    } catch (error) {
      // Invalid pubkey or other error
    }
  }
  
  console.log(`❌ Bonding curve not found in transaction accounts`);
  return null;
}

// Test token creation
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  console.log(`📄 Signature: ${logs.signature}\n`);
  
  // Get full transaction
  console.log('📋 Fetching transaction...');
  const tx = await getFullTransaction(logs.signature);
  
  if (!tx) {
    console.error('❌ Could not fetch transaction');
    return false;
  }
  
  const txFetchTime = Date.now() - testStartTime;
  console.log(`✅ Transaction fetched in ${txFetchTime}ms\n`);
  
  // Extract accounts
  const accounts = extractAccountAddresses(tx);
  console.log(`📊 Found ${accounts.length} accounts in transaction\n`);
  
  // Find bonding curve
  console.log('📋 Searching for bonding curve account...');
  const searchStart = Date.now();
  const bondingCurve = await findBondingCurveAccount(accounts);
  const searchTime = Date.now() - searchStart;
  
  console.log();
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(80));
  console.log(`   Signature: ${logs.signature.slice(0, 40)}...`);
  console.log();
  console.log(`   ⏱️  Tx fetch time:    ${txFetchTime}ms`);
  console.log(`   🔍 Search time:      ${searchTime}ms`);
  console.log(`   📊 Total time:       ${totalElapsed}ms`);
  
  if (bondingCurve) {
    console.log();
    console.log(`   ✅ Bonding curve: ${bondingCurve}`);
    
    if (totalElapsed <= 200) {
      console.log(`   🚀 EXCELLENT: Block 0 entry possible!`);
    } else if (totalElapsed <= 400) {
      console.log(`   ⚡ GREAT: Block 0-1 entry!`);
    } else if (totalElapsed <= 600) {
      console.log(`   ✅ GOOD: Block 1 entry`);
    } else {
      console.log(`   ⚠️  OK: Block 1-2 entry`);
    }
  } else {
    console.log();
    console.log(`   ❌ Bonding curve NOT FOUND in transaction`);
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
