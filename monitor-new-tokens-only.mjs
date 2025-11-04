#!/usr/bin/env node

/**
 * Simple New Token Monitor - ONLY shows new Pumpfun token launches
 * Press Ctrl+C once to stop
 */

import WebSocket from 'ws';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const RPC_ENDPOINT = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig';

let newTokenCount = 0;
let totalTxCount = 0;

console.log('🎯 Monitoring for NEW Pumpfun Token Launches');
console.log(`🔌 Endpoint: ${RPC_ENDPOINT.split('/')[2]}`);
console.log('Press Ctrl+C to stop\n');

const ws = new WebSocket(RPC_ENDPOINT);
let isClosing = false;

ws.on('open', () => {
  console.log('✅ Connected - monitoring started...\n');
  
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID] },
      { commitment: 'confirmed' }
    ]
  }));
});

ws.on('message', (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.id === 1 && message.result) {
      console.log(`📡 Subscribed (ID: ${message.result})`);
      console.log('=' .repeat(80));
      console.log('Waiting for new token launches...');
      console.log('=' .repeat(80) + '\n');
      return;
    }
    
    if (message.method === 'logsNotification' && message.params) {
      const logs = message.params.result.value;
      totalTxCount++;
      
      // Check if this is a NEW TOKEN LAUNCH using EXACT pattern from analysis
      // Key indicators from real token launch:
      // 1. Pumpfun "Instruction: Create" (not AToken create)
      // 2. "Instruction: MintTo" (actually minting tokens)
      // 3. "Instruction: Buy" (first buy after creation)
      
      const hasPumpfunCreate = logs.logs.some(log => 
        log.includes('Program log: Instruction: Create') &&
        !log.includes('Metadata') // Exclude metadata create
      );
      
      const hasMintTo = logs.logs.some(log => 
        log.includes('Instruction: MintTo')
      );
      
      const hasBuy = logs.logs.some(log => 
        log.includes('Instruction: Buy')
      );
      
      // NEW TOKEN = Pumpfun Create + MintTo + Buy (first buy on new token)
      const isNewToken = hasPumpfunCreate && hasMintTo && hasBuy;
      
      if (isNewToken) {
        newTokenCount++;
        
        // Extract token mint from Program data
        let tokenMint = 'Unknown';
        for (const log of logs.logs) {
          if (log.includes('Program data:')) {
            const dataSection = log.substring(log.indexOf('Program data:') + 13);
            const addressMatch = dataSection.match(/[1-9A-HJ-NP-Za-km-z]{44}/g);
            if (addressMatch && addressMatch.length > 0) {
              tokenMint = addressMatch[0];
              break;
            }
          }
        }
        
        console.log(`\n${'🚨'.repeat(40)}`);
        console.log(`🆕 NEW TOKEN LAUNCH #${newTokenCount}`);
        console.log(`${'🚨'.repeat(40)}`);
        console.log(`\n📍 Token: ${tokenMint}`);
        console.log(`🔗 TX: https://solscan.io/tx/${logs.signature}`);
        console.log(`⏰ Time: ${new Date().toLocaleTimeString()}`);
        console.log(`📊 Total monitored: ${totalTxCount} transactions\n`);
      }
      
      // Show activity indicator every 100 transactions
      if (totalTxCount % 100 === 0) {
        console.log(`⏳ Monitored ${totalTxCount} transactions... (${newTokenCount} new tokens found)`);
      }
    }
    
  } catch (error) {
    console.error('Error:', error.message);
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  if (!isClosing) {
    console.log('\n❌ Connection closed unexpectedly');
  }
  console.log('\n📊 Final Stats:');
  console.log(`   Total transactions: ${totalTxCount}`);
  console.log(`   New tokens found: ${newTokenCount}`);
  console.log('\n✅ Monitor stopped\n');
  process.exit(0);
});

// Handle Ctrl+C - SINGLE PRESS ONLY
process.on('SIGINT', () => {
  if (isClosing) return;
  
  isClosing = true;
  console.log('\n\n⏹️  Stopping monitor...');
  
  try {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    } else {
      process.exit(0);
    }
  } catch (e) {
    process.exit(0);
  }
  
  // Force exit after 1 second
  setTimeout(() => {
    console.log('\n📊 Final Stats:');
    console.log(`   Total transactions: ${totalTxCount}`);
    console.log(`   New tokens found: ${newTokenCount}`);
    console.log('\n✅ Monitor stopped\n');
    process.exit(0);
  }, 1000);
});

process.on('SIGTERM', () => {
  isClosing = true;
  ws.close();
  process.exit(0);
});
