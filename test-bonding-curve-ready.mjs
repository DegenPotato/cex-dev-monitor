import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Bonding Curve PDA Readiness Check\n');
console.log(`📡 RPC: ${RPC_HTTP}`);
console.log(`🔌 WebSocket: ${WS_URL}\n`);
console.log('⏳ Waiting for token creation...\n');

// Derive bonding curve PDA
function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('bonding_curve'),
      tokenMint.toBuffer()
    ],
    PUMPFUN_PROGRAM
  );
}

// Extract mint from transaction
async function extractMintFromTx(signature) {
  const startTime = Date.now();
  
  try {
    // Use processed commitment for speed
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
              console.log(`✅ Mint extracted in ${elapsed}ms: ${mint}`);
              return mint;
            }
          }
        }
        
        // Fallback: any non-SOL mint
        for (const balance of balances) {
          const mint = balance?.mint;
          if (mint && mint !== 'So11111111111111111111111111111111111111112') {
            const elapsed = Date.now() - startTime;
            console.log(`✅ Mint extracted in ${elapsed}ms: ${mint}`);
            return mint;
          }
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 10));
    }
  } catch (error) {
    console.error(`❌ Extraction error: ${error.message}`);
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`⚠️ Failed to extract mint after ${elapsed}ms`);
  return null;
}

// Check signature status
async function checkSignatureStatus(signature) {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getSignatureStatuses',
        params: [
          [signature],
          { searchTransactionHistory: true }
        ]
      })
    });

    const data = await response.json();
    const status = data.result?.value?.[0];
    
    return status?.confirmationStatus || null;
  } catch (error) {
    return null;
  }
}

// Wait for transaction confirmation
async function waitForTxConfirmation(signature) {
  const startTime = Date.now();
  const maxAttempts = 20;
  
  for (let i = 0; i < maxAttempts; i++) {
    const status = await checkSignatureStatus(signature);
    
    if (status === 'confirmed' || status === 'finalized') {
      const elapsed = Date.now() - startTime;
      console.log(`✅ Tx ${status} after ${elapsed}ms`);
      return { confirmed: true, elapsed };
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`⚠️ Tx not confirmed after ${elapsed}ms`);
  return { confirmed: false, elapsed };
}

// Wait for bonding curve readiness
async function waitForBondingCurveReady(tokenMint) {
  const startTime = Date.now();
  const maxAttempts = 30; // 3 seconds max
  
  // Derive bonding curve PDA
  const [bondingCurvePDA] = deriveBondingCurvePDA(new PublicKey(tokenMint));
  console.log(`📍 Bonding curve PDA: ${bondingCurvePDA.toBase58()}`);
  
  for (let i = 0; i < maxAttempts; i++) {
    try {
      const accountInfo = await connection.getAccountInfo(bondingCurvePDA, { commitment: 'confirmed' });
      
      if (accountInfo) {
        const elapsed = Date.now() - startTime;
        console.log(`   [${elapsed}ms] Account exists: ${accountInfo.data.length} bytes, owner: ${accountInfo.owner.toBase58().slice(0, 8)}...`);
        
        // Check if it has expected data (Pumpfun bonding curves are ~384 bytes)
        if (accountInfo.data.length >= 300) {
          console.log(`✅ Bonding curve ready after ${elapsed}ms (${accountInfo.data.length} bytes)`);
          
          // Check discriminator
          const discriminator = accountInfo.data.slice(0, 8);
          console.log(`   Discriminator: ${discriminator.toString('hex')}`);
          
          return { ready: true, elapsed, dataLength: accountInfo.data.length };
        }
      } else {
        const elapsed = Date.now() - startTime;
        if (i % 5 === 0) { // Log every 500ms
          console.log(`   [${elapsed}ms] Account not found yet...`);
        }
      }
    } catch (error) {
      // Account not ready yet
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`❌ Bonding curve not ready after ${elapsed}ms`);
  return { ready: false, elapsed };
}

// Test token creation
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  console.log(`📄 Signature: ${logs.signature}\n`);
  
  // 1. Extract mint
  const tokenMint = await extractMintFromTx(logs.signature);
  if (!tokenMint) {
    console.error('❌ Could not extract mint\n');
    return false;
  }
  console.log();
  
  // 2. Wait for tx confirmation
  console.log('📋 Step 1: Wait for Transaction Confirmation');
  console.log('─'.repeat(80));
  const confirmResult = await waitForTxConfirmation(logs.signature);
  console.log();
  
  // 3. Wait for bonding curve readiness
  console.log('📋 Step 2: Wait for Bonding Curve PDA Readiness');
  console.log('─'.repeat(80));
  const bondingResult = await waitForBondingCurveReady(tokenMint);
  console.log();
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(80));
  console.log(`   Token: ${tokenMint}`);
  console.log(`   Signature: ${logs.signature.slice(0, 40)}...`);
  console.log();
  console.log(`   ⏱️  Tx confirmation:     ${confirmResult.elapsed}ms`);
  console.log(`   🎯 Bonding curve ready: ${bondingResult.elapsed}ms`);
  console.log(`   📊 Total time:          ${totalElapsed}ms`);
  
  if (bondingResult.ready) {
    console.log(`   ✅ READY TO BUY! Total wait: ${confirmResult.elapsed + bondingResult.elapsed}ms`);
    
    const totalWait = confirmResult.elapsed + bondingResult.elapsed;
    if (totalWait <= 200) {
      console.log(`   🚀 EXCELLENT: Block 0 entry possible!`);
    } else if (totalWait <= 400) {
      console.log(`   ⚡ GREAT: Block 0-1 entry!`);
    } else if (totalWait <= 600) {
      console.log(`   ✅ GOOD: Block 1 entry`);
    } else {
      console.log(`   ⚠️  OK: Block 1-2 entry`);
    }
  } else {
    console.log(`   ❌ FAILED: Bonding curve never became ready`);
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
