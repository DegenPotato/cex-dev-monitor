#!/usr/bin/env node

/**
 * Detailed test to examine Pumpfun transaction structure
 */

import WebSocket from 'ws';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

async function analyzeTransactions() {
  const url = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig';
  console.log(`🔌 Connecting to ${url.split('/')[2]}...`);
  
  return new Promise((resolve) => {
    const ws = new WebSocket(url);
    let subscriptionId = null;
    let transactionCount = 0;
    
    const timeout = setTimeout(() => {
      console.log(`\n⏱️ Analysis complete - examined ${transactionCount} transactions`);
      ws.close();
      resolve();
    }, 60000); // 60 seconds
    
    ws.on('open', () => {
      console.log(`✅ Connected!`);
      
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
        
        if (message.id === 1 && message.result) {
          subscriptionId = message.result;
          console.log(`✅ Subscription ID: ${subscriptionId}`);
          console.log(`⏳ Analyzing Pumpfun transactions for 60 seconds...\n`);
        }
        
        if (message.method === 'logsNotification' && message.params) {
          transactionCount++;
          const logs = message.params.result.value;
          
          console.log(`\n${'='.repeat(80)}`);
          console.log(`📦 Transaction #${transactionCount}: ${logs.signature}`);
          console.log(`${'='.repeat(80)}`);
          
          // Analyze log patterns
          let hasCreate = false;
          let hasBondingCurve = false;
          let hasInitialize = false;
          let hasMint = false;
          let possibleTokenMint = null;
          
          console.log(`\n📝 All logs (${logs.logs.length} total):`);
          logs.logs.forEach((log, i) => {
            // Check for key patterns
            const lowerLog = log.toLowerCase();
            if (lowerLog.includes('create')) {
              hasCreate = true;
              console.log(`  [${i}] ✨ CREATE: ${log}`);
            } else if (lowerLog.includes('bonding') || lowerLog.includes('curve')) {
              hasBondingCurve = true;
              console.log(`  [${i}] 📈 CURVE: ${log}`);
            } else if (lowerLog.includes('initialize')) {
              hasInitialize = true;
              console.log(`  [${i}] 🚀 INIT: ${log}`);
            } else if (lowerLog.includes('mint')) {
              hasMint = true;
              console.log(`  [${i}] 🪙 MINT: ${log}`);
            } else if (log.includes('Program 6EF8')) {
              console.log(`  [${i}] 🎯 PUMPFUN: ${log}`);
            } else if (log.includes('Program data:')) {
              console.log(`  [${i}] 📊 DATA: ${log.substring(0, 100)}...`);
            } else {
              console.log(`  [${i}] ${log.substring(0, 100)}${log.length > 100 ? '...' : ''}`);
            }
            
            // Try to extract addresses
            const addressMatch = log.match(/[1-9A-HJ-NP-Za-km-z]{44}/g);
            if (addressMatch) {
              const addresses = addressMatch.filter(addr => 
                addr !== PUMPFUN_PROGRAM_ID &&
                addr !== '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' &&
                !addr.startsWith('ComputeBudget') &&
                !addr.startsWith('111111111')
              );
              
              if (addresses.length > 0 && !possibleTokenMint) {
                possibleTokenMint = addresses[0];
              }
            }
          });
          
          console.log(`\n📊 Analysis:`);
          console.log(`  - Has CREATE: ${hasCreate}`);
          console.log(`  - Has BONDING/CURVE: ${hasBondingCurve}`);
          console.log(`  - Has INITIALIZE: ${hasInitialize}`);
          console.log(`  - Has MINT: ${hasMint}`);
          console.log(`  - Possible Token: ${possibleTokenMint || 'Not found'}`);
          
          // Stop after 10 transactions for analysis
          if (transactionCount >= 10) {
            console.log(`\n✅ Analyzed ${transactionCount} transactions`);
            if (subscriptionId) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'logsUnsubscribe',
                params: [subscriptionId]
              }));
            }
            clearTimeout(timeout);
            setTimeout(() => ws.close(), 1000);
          }
        }
      } catch (error) {
        console.error(`❌ Error:`, error);
      }
    });
    
    ws.on('close', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  console.log(`🎯 Analyzing Pumpfun Transaction Structure`);
  console.log(`📍 Program ID: ${PUMPFUN_PROGRAM_ID}\n`);
  
  await analyzeTransactions();
  
  console.log(`\n✨ Analysis complete!`);
  process.exit(0);
}

main().catch(console.error);
