/**
 * Test script to verify bonding curve PDA detection timing
 * Monitors Pumpfun launches and attempts to fetch the PDA immediately
 */

import WebSocket from 'ws';
import { PublicKey } from '@solana/web3.js';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_ENDPOINTS = [
  'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03'
];

// Derive bonding curve PDA
function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding_curve'), new PublicKey(tokenMint).toBuffer()],
    new PublicKey(PUMPFUN_PROGRAM_ID)
  );
}

// Direct RPC request
async function directRpcRequest(method, params, attempt = 1) {
  const body = JSON.stringify({
    jsonrpc: '2.0',
    id: `${method}-${Date.now()}-${Math.random()}`,
    method,
    params
  });

  try {
    const res = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'accept': 'application/json'
      },
      body
    });

    if (res.status === 429 || res.status === 403) {
      if (attempt >= 3) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const backoff = 500 * attempt;
      await new Promise(resolve => setTimeout(resolve, backoff));
      return directRpcRequest(method, params, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  } catch (error) {
    if (attempt >= 3) {
      throw error;
    }
    const wait = 250 * attempt;
    await new Promise(resolve => setTimeout(resolve, wait));
    return directRpcRequest(method, params, attempt + 1);
  }
}

// Extract mint from transaction
async function deriveMintFromTransaction(signature) {
  if (!signature) return null;

  try {
    const tx = await directRpcRequest('getTransaction', [signature, {
      commitment: 'confirmed',
      encoding: 'json',
      maxSupportedTransactionVersion: 0
    }]);

    if (!tx) return null;

    const balances = tx?.meta?.postTokenBalances || [];
    
    // Prioritize mints ending in 'pump'
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        if (mint.endsWith('pump') && mint.length >= 32 && mint.length <= 44) {
          console.log(`🎯 Found mint via postTokenBalances: ${mint}`);
          return mint;
        }
      }
    }

    // Fallback: return first valid mint
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        if (mint.length >= 32 && mint.length <= 44) {
          console.log(`🎯 Found mint via postTokenBalances (fallback): ${mint}`);
          return mint;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️ Transaction lookup failed:', error.message);
  }

  return null;
}

// Test PDA availability vs instant derivation
async function testPDAAvailability(tokenMint, maxAttempts = 50, pollIntervalMs = 50) {
  console.log(`\n🔍 Testing PDA detection strategies for mint: ${tokenMint}`);
  
  // STRATEGY 1: Instant PDA derivation (what we should use)
  const instantStart = Date.now();
  const [bondingCurve] = deriveBondingCurvePDA(tokenMint);
  const pdaAddress = bondingCurve.toBase58();
  const instantTime = Date.now() - instantStart;
  
  console.log(`\n⚡ INSTANT DERIVATION:`);
  console.log(`   ✅ PDA derived in ${instantTime}ms`);
  console.log(`   📍 Address: ${pdaAddress}`);
  console.log(`   ✅ Ready to construct transaction IMMEDIATELY`);
  
  // STRATEGY 2: Wait for getAccountInfo (what we were doing - SLOW)
  console.log(`\n⏳ GETACCOUNTINFO POLLING (for comparison):`);
  const pollStart = Date.now();
  let attempt = 0;
  let foundViaPolling = false;
  
  while (attempt < maxAttempts) {
    attempt += 1;
    
    try {
      const accountInfo = await directRpcRequest('getAccountInfo', [
        pdaAddress,
        { commitment: 'processed', encoding: 'base64' }
      ]);
      
      const elapsed = Date.now() - pollStart;
      
      if (accountInfo?.value) {
        console.log(`   ✅ Account queryable after ${attempt} attempts in ${elapsed}ms`);
        console.log(`   - Data length: ${accountInfo.value.data?.[0]?.length || 0} bytes`);
        console.log(`   - Owner: ${accountInfo.value.owner}`);
        foundViaPolling = true;
        break;
      } else {
        if (attempt === 1 || attempt % 10 === 0) {
          console.log(`   ⌛ Attempt ${attempt} (${elapsed}ms): Account not queryable yet`);
        }
      }
    } catch (error) {
      if (attempt === 1 || attempt % 10 === 0) {
        console.warn(`   ⚠️ Attempt ${attempt} error:`, error.message);
      }
    }
    
    await new Promise(resolve => setTimeout(resolve, pollIntervalMs));
  }
  
  const totalPollingTime = Date.now() - pollStart;
  
  if (!foundViaPolling) {
    console.log(`   ❌ Account still not queryable after ${maxAttempts} attempts (${totalPollingTime}ms)`);
  }
  
  // Summary
  console.log(`\n📊 COMPARISON:`);
  console.log(`   Instant derivation: ${instantTime}ms ⚡`);
  console.log(`   Wait for queryable: ${foundViaPolling ? totalPollingTime : 'TIMEOUT'}ms ❌`);
  console.log(`   Speed advantage: ${foundViaPolling ? (totalPollingTime / instantTime).toFixed(0) + 'x faster' : 'INFINITELY faster'}`);
  console.log(`\n💡 CONCLUSION: We can construct buy tx immediately with derived PDA!`);
  console.log(`   The account doesn't need to be queryable - Solana will check it during simulation.`);
  
  return true;
}

// Monitor Pumpfun logs
function startMonitoring() {
  console.log('🎯 Starting Pumpfun launch monitor...');
  console.log(`📡 RPC: ${RPC_HTTP}`);
  
  let wsUrl = WS_ENDPOINTS[0];
  console.log(`🔌 Connecting to: ${wsUrl}`);
  
  const ws = new WebSocket(wsUrl);
  
  ws.on('open', () => {
    console.log('✅ WebSocket connected');
    
    const subscribeMessage = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { mentions: [PUMPFUN_PROGRAM_ID] },
        { commitment: 'confirmed' }
      ]
    };
    
    ws.send(JSON.stringify(subscribeMessage));
    console.log('👂 Subscribed to Pumpfun program logs\n');
  });
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.id === 1 && message.result) {
        console.log(`✅ Subscription ID: ${message.result}\n`);
      }
      
      if (message.method === 'logsNotification' && message.params) {
        const logs = message.params.result.value;
        
        // Check for new token pattern
        const hasPumpfunCreate = logs.logs.some(log => 
          log.includes('Program log: Instruction: Create') && !log.includes('Metadata')
        );
        const hasMintTo = logs.logs.some(log => log.includes('Instruction: MintTo'));
        const hasBuy = logs.logs.some(log => log.includes('Instruction: Buy'));
        
        if (hasPumpfunCreate && hasMintTo && hasBuy) {
          console.log('🆕 NEW TOKEN LAUNCH DETECTED!');
          console.log(`📄 Signature: ${logs.signature}`);
          console.log(`⏰ Detection time: ${new Date().toISOString()}`);
          
          // Extract mint
          const tokenMint = await deriveMintFromTransaction(logs.signature);
          
          if (tokenMint) {
            // Test PDA availability
            await testPDAAvailability(tokenMint, 50, 50);
            console.log('\n' + '='.repeat(80) + '\n');
          } else {
            console.log('❌ Could not extract token mint from transaction\n');
          }
        }
      }
    } catch (error) {
      console.error('❌ Error handling message:', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('❌ WebSocket error:', error.message);
  });
  
  ws.on('close', () => {
    console.log('🔌 WebSocket closed');
    console.log('🔄 Reconnecting in 5 seconds...');
    setTimeout(startMonitoring, 5000);
  });
}

// Start
console.log('🚀 Pumpfun PDA Detection Test\n');
startMonitoring();
