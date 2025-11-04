import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Bonding Curve PDA Polling Strategy\n');
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
        
        for (const balance of balances) {
          const mint = balance?.mint;
          if (mint && mint !== 'So11111111111111111111111111111111111111112' && mint.endsWith('pump')) {
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
  
  return null;
}

// Poll for bonding curve readiness with detailed timing
async function pollForBondingCurve(tokenMint) {
  const startTime = Date.now();
  const [bondingCurvePDA] = deriveBondingCurvePDA(new PublicKey(tokenMint));
  
  console.log(`📍 Bonding curve PDA: ${bondingCurvePDA.toBase58()}`);
  console.log('⏱️  Starting polling (250ms intervals, max 20 attempts)...\n');
  
  const maxAttempts = 20; // 5 seconds max
  const pollInterval = 250; // 250ms between checks
  
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const checkTime = Date.now();
    
    try {
      const accountInfo = await connection.getAccountInfo(bondingCurvePDA, { commitment: 'confirmed' });
      
      if (accountInfo && accountInfo.data && accountInfo.data.length > 0) {
        const elapsed = Date.now() - startTime;
        const discriminator = accountInfo.data.slice(0, 8);
        
        console.log(`✅ [${elapsed}ms] FOUND! ${accountInfo.data.length} bytes`);
        console.log(`   Owner: ${accountInfo.owner.toBase58()}`);
        console.log(`   Discriminator: ${discriminator.toString('hex')}`);
        
        // Check if it's the expected bonding curve discriminator
        if (discriminator.toString('hex') === '17b7f83760d8ac60') {
          console.log(`   ✅ CORRECT bonding curve discriminator!`);
        } else {
          console.log(`   ⚠️  Unexpected discriminator (might be different PDA type)`);
        }
        
        return { 
          found: true, 
          elapsed, 
          dataLength: accountInfo.data.length,
          attempts: attempt + 1
        };
      } else {
        const elapsed = Date.now() - startTime;
        console.log(`   [${elapsed}ms] Attempt ${attempt + 1}: Not found yet...`);
      }
    } catch (error) {
      const elapsed = Date.now() - startTime;
      console.log(`   [${elapsed}ms] Attempt ${attempt + 1}: Error - ${error.message}`);
    }
    
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`❌ Bonding curve NOT FOUND after ${elapsed}ms (${maxAttempts} attempts)`);
  return { found: false, elapsed, attempts: maxAttempts };
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
  
  // 2. Poll for bonding curve
  console.log('📋 Polling for Bonding Curve PDA...');
  console.log('─'.repeat(80));
  const result = await pollForBondingCurve(tokenMint);
  console.log();
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('='.repeat(80));
  console.log('📊 SUMMARY:');
  console.log('='.repeat(80));
  console.log(`   Token: ${tokenMint}`);
  console.log(`   Signature: ${logs.signature.slice(0, 40)}...`);
  console.log();
  
  if (result.found) {
    console.log(`   ✅ Bonding curve FOUND after ${result.elapsed}ms`);
    console.log(`   📊 Attempts needed: ${result.attempts}`);
    console.log(`   💾 Data size: ${result.dataLength} bytes`);
    console.log(`   📊 Total test time: ${totalElapsed}ms`);
    
    if (result.elapsed <= 500) {
      console.log(`   🚀 EXCELLENT: Block 0-1 entry possible!`);
    } else if (result.elapsed <= 1000) {
      console.log(`   ⚡ GOOD: Block 1-2 entry!`);
    } else if (result.elapsed <= 1500) {
      console.log(`   ✅ OK: Block 2 entry`);
    } else {
      console.log(`   ⚠️  SLOW: Block 2-3 entry`);
    }
  } else {
    console.log(`   ❌ Bonding curve NOT FOUND`);
    console.log(`   📊 Attempts: ${result.attempts}`);
    console.log(`   ⏱️  Time waited: ${result.elapsed}ms`);
    console.log(`   📊 Total test time: ${totalElapsed}ms`);
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
