#!/usr/bin/env node

/**
 * Test WebSocket connection to Pumpfun program
 */

import WebSocket from 'ws';

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
    let messageCount = 0;
    
    const timeout = setTimeout(() => {
      console.log(`⏱️ Timeout waiting for Pumpfun logs (received ${messageCount} messages)`);
      ws.close();
      resolve(false);
    }, 30000); // 30 second timeout
    
    ws.on('open', () => {
      console.log(`✅ Connected to ${url.split('/')[2]}`);
      
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
      
      console.log(`📤 Subscribing to Pumpfun logs...`);
      ws.send(JSON.stringify(subscribeMessage));
    });
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        messageCount++;
        
        // Handle subscription response
        if (message.id === 1 && message.result) {
          subscriptionId = message.result;
          console.log(`✅ Subscription successful! ID: ${subscriptionId}`);
          console.log(`⏳ Waiting for Pumpfun transactions...`);
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
          const logs = message.params.result.value;
          console.log(`\n🎯 GOT PUMPFUN TRANSACTION!`);
          console.log(`📦 Signature: ${logs.signature}`);
          console.log(`📝 Number of logs: ${logs.logs.length}`);
          
          // Check for create/mint logs
          const hasCreate = logs.logs.some(log => log.toLowerCase().includes('create'));
          const hasMint = logs.logs.some(log => log.toLowerCase().includes('mint'));
          const hasInvoke = logs.logs.some(log => log.includes('Program 6EF8'));
          
          console.log(`  - Has 'create': ${hasCreate}`);
          console.log(`  - Has 'mint': ${hasMint}`);
          console.log(`  - Has Pumpfun invoke: ${hasInvoke}`);
          
          // Show first few logs
          console.log(`📃 First 5 logs:`);
          logs.logs.slice(0, 5).forEach((log, i) => {
            console.log(`  ${i}: ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
          });
          
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
          setTimeout(() => ws.close(), 1000);
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
    });
  });
}

async function main() {
  console.log(`🎯 Testing Pumpfun WebSocket monitoring`);
  console.log(`📍 Program ID: ${PUMPFUN_PROGRAM_ID}`);
  console.log(`⏰ Will wait up to 30 seconds for Pumpfun activity...`);
  
  for (const endpoint of endpoints) {
    const success = await testEndpoint(endpoint);
    if (success) {
      console.log(`\n✅ SUCCESS: ${endpoint.split('/')[2]} is working and receiving Pumpfun logs!`);
      break;
    } else {
      console.log(`\n⚠️ No Pumpfun logs received from ${endpoint.split('/')[2]}`);
    }
  }
  
  console.log(`\n✨ Test complete!`);
  process.exit(0);
}

main().catch(console.error);
