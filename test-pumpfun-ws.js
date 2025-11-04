#!/usr/bin/env node

/**
 * Test WebSocket connection to Pumpfun program
 */

const WebSocket = require('ws');

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Test different endpoints
const endpoints = [
  'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig',
  'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03',
  'wss://api.mainnet-beta.solana.com'
];

async function testEndpoint(url) {
  console.log(`\n🔌 Testing endpoint: ${url}`);
  
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let subscriptionId = null;
    
    const timeout = setTimeout(() => {
      console.log(`⏱️ Timeout for ${url}`);
      ws.close();
      resolve(false);
    }, 30000); // 30 second timeout
    
    ws.on('open', () => {
      console.log(`✅ Connected to ${url}`);
      
      // Subscribe to Pumpfun logs
      const subscribeMessage = {
        jsonrpc: '2.0',
        id: 1,
        method: 'logsSubscribe',
        params: [
          {
            mentions: [PUMPFUN_PROGRAM_ID]
          },
          {
            commitment: 'confirmed'
          }
        ]
      };
      
      console.log(`📤 Sending subscription:`, JSON.stringify(subscribeMessage));
      ws.send(JSON.stringify(subscribeMessage));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        // Handle subscription response
        if (message.id === 1 && message.result) {
          subscriptionId = message.result;
          console.log(`✅ Subscription successful! ID: ${subscriptionId}`);
        }
        
        // Handle errors
        if (message.error) {
          console.error(`❌ Error:`, message.error);
          clearTimeout(timeout);
          ws.close();
          resolve(false);
        }
        
        // Handle log notifications
        if (message.method === 'logsNotification' && message.params) {
          console.log(`🎯 GOT PUMPFUN LOG!`);
          console.log(`📦 Signature: ${message.params.result.value.signature}`);
          console.log(`📝 Logs:`, message.params.result.value.logs);
          
          // Unsubscribe after first log
          if (subscriptionId) {
            const unsubscribeMessage = {
              jsonrpc: '2.0',
              id: 2,
              method: 'logsUnsubscribe',
              params: [subscriptionId]
            };
            ws.send(JSON.stringify(unsubscribeMessage));
          }
          
          clearTimeout(timeout);
          ws.close();
          resolve(true);
        }
      } catch (error) {
        console.error(`❌ Parse error:`, error);
      }
    });
    
    ws.on('error', (error) => {
      console.error(`❌ WebSocket error:`, error.message);
      clearTimeout(timeout);
      resolve(false);
    });
    
    ws.on('close', () => {
      console.log(`🔌 Connection closed`);
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

async function main() {
  console.log(`🎯 Testing Pumpfun WebSocket monitoring`);
  console.log(`📍 Program ID: ${PUMPFUN_PROGRAM_ID}`);
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) {
      console.log(`\n✅ SUCCESS: ${endpoint} is working!`);
      break;
    } else {
      console.log(`\n❌ FAILED: ${endpoint} did not receive logs`);
    }
  }
  
  console.log(`\n✨ Test complete!`);
  process.exit(0);
}

main().catch(console.error);
