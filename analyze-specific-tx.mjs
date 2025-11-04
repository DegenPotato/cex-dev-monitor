#!/usr/bin/env node

/**
 * Analyze a specific transaction to understand the pattern
 */

import WebSocket from 'ws';

const TX_SIGNATURE = '2PGtgC4dbHKMQibrLXJVRoq1YgdmFboZYuDaLi4Fp61QUZrvDWbSMA6MXPGKLVBYAXEiK7w5spUZPmv2YZuRW6B8';
const RPC_ENDPOINT = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';

console.log('🔍 Analyzing transaction:', TX_SIGNATURE);
console.log('');

async function analyzeTransaction() {
  try {
    const response = await fetch(RPC_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          TX_SIGNATURE,
          {
            encoding: 'json',
            commitment: 'confirmed',
            maxSupportedTransactionVersion: 0
          }
        ]
      })
    });

    const data = await response.json();
    
    if (data.error) {
      console.error('❌ Error:', data.error);
      return;
    }

    const tx = data.result;
    if (!tx) {
      console.log('❌ Transaction not found');
      return;
    }

    const logs = tx.meta.logMessages;
    
    console.log('📊 Transaction Analysis:');
    console.log('='.repeat(80));
    console.log(`Total logs: ${logs.length}`);
    console.log('');
    
    // Check patterns
    const hasAToken = logs.some(log => log.includes('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL'));
    const hasCreate = logs.some(log => log.toLowerCase().includes('create'));
    const hasInitialize = logs.some(log => log.toLowerCase().includes('initialize'));
    const hasBuy = logs.some(log => log.includes('Instruction: Buy'));
    const hasSell = logs.some(log => log.includes('Instruction: Sell'));
    const hasPumpfun = logs.some(log => log.includes('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P'));
    
    console.log('🔍 Pattern Detection:');
    console.log(`   AToken Program: ${hasAToken ? '✅' : '❌'}`);
    console.log(`   Create keyword: ${hasCreate ? '✅' : '❌'}`);
    console.log(`   Initialize keyword: ${hasInitialize ? '✅' : '❌'}`);
    console.log(`   Buy instruction: ${hasBuy ? '✅' : '❌'}`);
    console.log(`   Sell instruction: ${hasSell ? '✅' : '❌'}`);
    console.log(`   Pumpfun Program: ${hasPumpfun ? '✅' : '❌'}`);
    console.log('');
    
    console.log('📝 Full Logs:');
    console.log('='.repeat(80));
    logs.forEach((log, i) => {
      const isKeyword = 
        log.includes('6EF8') ||
        log.includes('AToken') ||
        log.toLowerCase().includes('create') ||
        log.toLowerCase().includes('initialize') ||
        log.includes('Instruction:') ||
        log.includes('Program data:');
      
      const prefix = isKeyword ? '⭐' : '  ';
      console.log(`${prefix} [${i.toString().padStart(2, '0')}] ${log}`);
    });
    
    console.log('');
    console.log('='.repeat(80));
    
    // Extract token mint
    console.log('\n🎯 Extracting Token Mint:');
    for (const log of logs) {
      if (log.includes('Program data:')) {
        const dataSection = log.substring(log.indexOf('Program data:') + 13);
        const addressMatch = dataSection.match(/[1-9A-HJ-NP-Za-km-z]{44}/g);
        if (addressMatch) {
          console.log(`   Found in data: ${addressMatch[0]}`);
        }
      }
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

analyzeTransaction();
