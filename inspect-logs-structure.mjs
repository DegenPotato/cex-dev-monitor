#!/usr/bin/env node

/**
 * Inspect actual Pumpfun logs structure
 * 
 * This script connects to the WebSocket and prints out the EXACT structure
 * of the logs object we receive, so we can see what properties are available
 */

import WebSocket from 'ws';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_HTTP = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = RPC_HTTP.replace('https://', 'wss://');

console.log('🔍 Inspecting Pumpfun Logs Structure\n');
console.log('📡 RPC:', RPC_HTTP);
console.log('🔌 WebSocket:', WS_URL);
console.log('\nListening for Pumpfun program logs...\n');
console.log('='.repeat(80));

let logsReceived = 0;

const ws = new WebSocket(WS_URL);

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\n');
  
  // Subscribe to Pumpfun program logs
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID] },
      { commitment: 'processed' }
    ]
  }));
  
  console.log('📡 Subscribed to Pumpfun program logs\n');
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data);
    
    // Skip subscription confirmation
    if (message.result) {
      console.log(`✅ Subscription ID: ${message.result}\n`);
      return;
    }
    
    if (message.method === 'logsNotification') {
      logsReceived++;
      const logs = message.params.result.value;
      
      // ONLY process if it's a token creation
      const isTokenCreation = logs.logs && Array.isArray(logs.logs) && 
        logs.logs.some(log => log.includes('Program log: Instruction: Create')) &&
        logs.logs.some(log => log.includes('Instruction: MintTo')) &&
        logs.logs.some(log => log.includes('Instruction: Buy'));
      
      if (!isTokenCreation) {
        // Skip non-token-creation logs
        return;
      }
      
      console.log('\n' + '='.repeat(80));
      console.log(`🎉 TOKEN CREATION DETECTED! (Log #${logsReceived})`);
      console.log('='.repeat(80));
      
      // Print the ENTIRE logs object structure
      console.log('\n📋 FULL LOGS OBJECT:');
      console.log(JSON.stringify(logs, null, 2));
      
      // Print specific properties
      console.log('\n📊 PROPERTY BREAKDOWN:');
      console.log('─'.repeat(80));
      
      Object.keys(logs).forEach(key => {
        const value = logs[key];
        const type = typeof value;
        const isArray = Array.isArray(value);
        
        console.log(`\n🔑 logs.${key}:`);
        console.log(`   Type: ${isArray ? 'Array' : type}`);
        
        if (isArray) {
          console.log(`   Length: ${value.length}`);
          if (value.length > 0) {
            console.log(`   First item type: ${typeof value[0]}`);
            if (value.length <= 5) {
              console.log(`   Items:`, value);
            } else {
              console.log(`   First 3 items:`, value.slice(0, 3));
              console.log(`   Last 1 item:`, value.slice(-1));
            }
          }
        } else if (type === 'object' && value !== null) {
          console.log(`   Keys: ${Object.keys(value).join(', ')}`);
          console.log(`   Value:`, value);
        } else {
          console.log(`   Value: ${value}`);
        }
      });
      
      // Check for signature specifically
      console.log('\n🎯 SIGNATURE CHECK:');
      console.log('─'.repeat(80));
      if ('signature' in logs) {
        console.log(`✅ logs.signature EXISTS: ${logs.signature}`);
      } else {
        console.log(`❌ logs.signature DOES NOT EXIST`);
        console.log(`   Available properties: ${Object.keys(logs).join(', ')}`);
      }
      
      // Check for token creation pattern
      console.log('\n🪙 TOKEN CREATION DETECTION:');
      console.log('─'.repeat(80));
      
      if (logs.logs && Array.isArray(logs.logs)) {
        const hasCreate = logs.logs.some(log => 
          log.includes('Program log: Instruction: Create')
        );
        const hasMintTo = logs.logs.some(log => 
          log.includes('Instruction: MintTo')
        );
        const hasBuy = logs.logs.some(log => 
          log.includes('Instruction: Buy')
        );
        
        console.log(`   Has "Instruction: Create": ${hasCreate ? '✅' : '❌'}`);
        console.log(`   Has "Instruction: MintTo": ${hasMintTo ? '✅' : '❌'}`);
        console.log(`   Has "Instruction: Buy": ${hasBuy ? '✅' : '❌'}`);
        
        if (hasCreate && hasMintTo && hasBuy) {
          console.log(`\n   🎉 THIS IS A TOKEN CREATION!`);
        }
      }
      
      console.log('\n' + '='.repeat(80));
      console.log(`Total logs received: ${logsReceived}`);
      console.log('='.repeat(80) + '\n');
    }
  } catch (error) {
    console.error('❌ Error parsing message:', error.message);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n🔌 WebSocket disconnected');
  console.log(`📊 Total logs received: ${logsReceived}`);
  process.exit(0);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\n👋 Stopping inspection...');
  ws.close();
  process.exit(0);
});
