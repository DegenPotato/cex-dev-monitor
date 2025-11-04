#!/usr/bin/env node

/**
 * Live Pumpfun Monitor - Simple real-time transaction logger
 * Purpose: Understand the structure of new token creation vs regular trades
 */

import WebSocket from 'ws';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_ENDPOINT = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig';

let transactionCount = 0;

console.log('🎯 Starting Live Pumpfun Monitor');
console.log(`📍 Monitoring: ${PUMPFUN_PROGRAM_ID}`);
console.log(`🔌 Endpoint: ${RPC_ENDPOINT.split('/')[2]}`);
console.log('⏰ Waiting for transactions...\n');

const ws = new WebSocket(RPC_ENDPOINT);

ws.on('open', () => {
  console.log('✅ Connected to RPC\n');
  
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
  
  ws.send(JSON.stringify(subscribeMessage));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    // Subscription confirmation
    if (message.id === 1 && message.result) {
      console.log(`✅ Subscribed with ID: ${message.result}\n`);
      console.log('=' .repeat(100));
      console.log('Monitoring for transactions... (Ctrl+C to stop)');
      console.log('=' .repeat(100));
      return;
    }
    
    // Log notification
    if (message.method === 'logsNotification' && message.params) {
      const logs = message.params.result.value;
      transactionCount++;
      
      console.log('\n' + '='.repeat(100));
      console.log(`📦 Transaction #${transactionCount}`);
      console.log('='.repeat(100));
      console.log(`Signature: ${logs.signature}`);
      console.log(`Error: ${logs.err || 'None'}`);
      console.log(`Log Count: ${logs.logs.length}`);
      
      // Classify transaction type
      const hasBuy = logs.logs.some(log => log.includes('Instruction: Buy'));
      const hasSell = logs.logs.some(log => log.includes('Instruction: Sell'));
      const hasCreate = logs.logs.some(log => 
        log.toLowerCase().includes('create') && !log.includes('AToken')
      );
      const hasInitialize = logs.logs.some(log => 
        log.toLowerCase().includes('initialize') && !log.includes('AToken')
      );
      
      let txType = '❓ UNKNOWN';
      if (hasBuy) txType = '💰 BUY';
      if (hasSell) txType = '💸 SELL';
      if (hasCreate || hasInitialize) txType = '🆕 POSSIBLE NEW TOKEN';
      
      console.log(`Type: ${txType}`);
      
      // Extract potential token addresses
      const addresses = new Set();
      logs.logs.forEach(log => {
        const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{44}/g);
        if (matches) {
          matches.forEach(addr => {
            if (addr !== PUMPFUN_PROGRAM_ID && 
                addr !== '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' &&
                !addr.includes('1111111111111111') &&
                !addr.includes('ComputeBudget') &&
                !addr.includes('AToken') &&
                !addr.includes('Token')) {
              addresses.add(addr);
            }
          });
        }
      });
      
      if (addresses.size > 0) {
        console.log(`\nPotential Token Addresses:`);
        addresses.forEach(addr => console.log(`  - ${addr}`));
      }
      
      console.log(`\nFull Logs (${logs.logs.length} entries):`);
      console.log('-'.repeat(100));
      
      logs.logs.forEach((log, index) => {
        const isKeyLog = 
          log.toLowerCase().includes('create') ||
          log.toLowerCase().includes('initialize') ||
          log.toLowerCase().includes('instruction:') ||
          log.includes('Program data:') ||
          log.includes(PUMPFUN_PROGRAM_ID);
        
        const prefix = isKeyLog ? '⭐' : '  ';
        const logText = log.length > 120 ? log.substring(0, 120) + '...' : log;
        console.log(`${prefix} [${index.toString().padStart(2)}] ${logText}`);
      });
      
      // If it looks like a new token, highlight it more
      if (txType === '🆕 POSSIBLE NEW TOKEN') {
        console.log('\n' + '🔥'.repeat(50));
        console.log('🚨 THIS MIGHT BE A NEW TOKEN LAUNCH! 🚨');
        console.log('🔥'.repeat(50));
        console.log(`\nView on Solscan: https://solscan.io/tx/${logs.signature}`);
      }
      
      console.log('\n' + '='.repeat(100));
      
      // Summary stats
      if (transactionCount % 10 === 0) {
        console.log(`\n📊 Stats: Monitored ${transactionCount} transactions so far...`);
      }
    }
    
  } catch (error) {
    console.error('❌ Error processing message:', error);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('\n\n🔌 Connection closed');
  console.log(`📊 Total transactions monitored: ${transactionCount}`);
  console.log('✅ Monitor stopped\n');
  process.exit(0);
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

// Handle Ctrl+C gracefully
let isClosing = false;

process.on('SIGINT', () => {
  if (isClosing) {
    console.log('\n\n⚠️  Force closing...');
    process.exit(1);
  }
  
  isClosing = true;
  console.log('\n\n⏹️  Stopping monitor...');
  console.log(`📊 Total transactions monitored: ${transactionCount}`);
  console.log('⏳ Closing WebSocket connection...');
  
  if (ws && ws.readyState === ws.OPEN) {
    ws.close();
  } else {
    console.log('✅ Monitor stopped\n');
    process.exit(0);
  }
  
  // Force exit after 2 seconds if WebSocket doesn't close
  setTimeout(() => {
    console.log('\n⚠️  Timeout - forcing exit');
    process.exit(0);
  }, 2000);
});

// Handle other termination signals
process.on('SIGTERM', () => {
  console.log('\n\n⏹️  Received SIGTERM - stopping monitor...');
  if (ws && ws.readyState === ws.OPEN) {
    ws.close();
  }
  process.exit(0);
});
