import WebSocket from 'ws';
import fetch from 'node-fetch';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

console.log('🧪 Testing: Signature Status Progression\n');
console.log(`📡 RPC: ${RPC_HTTP}`);
console.log(`🔌 WebSocket: ${WS_URL}\n`);
console.log('⏳ Waiting for token creation...\n');

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
    
    return {
      confirmationStatus: status?.confirmationStatus || null,
      err: status?.err || null,
      slot: status?.slot || null
    };
  } catch (error) {
    return null;
  }
}

// Wait for confirmation
async function waitForConfirmation(signature) {
  const startTime = Date.now();
  const maxAttempts = 50; // 5 seconds max
  
  console.log('\n' + '='.repeat(80));
  console.log('⏱️  CONFIRMATION TIMELINE:');
  console.log('='.repeat(80));
  
  for (let i = 0; i < maxAttempts; i++) {
    const elapsed = Date.now() - startTime;
    const status = await checkSignatureStatus(signature);
    
    if (status && status.confirmationStatus) {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      console.log(`[${timestamp}] +${elapsed.toString().padStart(4)}ms | Status: ${status.confirmationStatus.padEnd(10)} | Slot: ${status.slot}`);
      
      if (status.confirmationStatus === 'confirmed' || status.confirmationStatus === 'finalized') {
        console.log('\n✅ Transaction CONFIRMED!');
        console.log(`   Total wait time: ${elapsed}ms`);
        console.log('='.repeat(80) + '\n');
        return { confirmed: true, elapsed, finalStatus: status.confirmationStatus };
      }
    } else {
      const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
      console.log(`[${timestamp}] +${elapsed.toString().padStart(4)}ms | Status: (not found)`);
    }
    
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n⚠️  Transaction NOT confirmed within timeout');
  console.log('='.repeat(80) + '\n');
  return { confirmed: false, elapsed: Date.now() - startTime };
}

// Test token creation
async function testTokenCreation(logs) {
  const testStartTime = Date.now();
  
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  
  const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
  console.log(`\n[${timestamp}] 📄 Signature: ${logs.signature}`);
  
  // Wait for confirmation
  const result = await waitForConfirmation(logs.signature);
  
  // Summary
  const totalElapsed = Date.now() - testStartTime;
  console.log('📊 SUMMARY:');
  console.log(`   Signature: ${logs.signature}`);
  console.log(`   Confirmed: ${result.confirmed ? '✅ YES' : '❌ NO'}`);
  if (result.confirmed) {
    console.log(`   Final status: ${result.finalStatus}`);
  }
  console.log(`   Time to confirmation: ${result.elapsed}ms`);
  console.log(`   Total test time: ${totalElapsed}ms`);
  console.log('='.repeat(80) + '\n');
  
  return true;
}

// WebSocket listener
const ws = new WebSocket(WS_URL);
let tokensProcessed = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\n');
  
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM] },
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
        tokensProcessed++;
        
        if (tokensProcessed >= 3) {
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
