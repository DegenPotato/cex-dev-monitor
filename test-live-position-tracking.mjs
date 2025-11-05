/**
 * Live Position Tracking Test
 * Monitor real Pumpfun transactions and track buy->sell flow
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0',
  'e6345c8dd8b14540',
  '48feac982b20e013',
  '00b08712a8402815'
];

const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad',
  'db0d98c38ed07cfd'
];

const THRESHOLD = 5_000_000;

// Track positions (wallet-token -> {buys: [], sells: [], buyCount, sellCount})
const positions = new Map();
let txCount = 0;

console.log('🎯 Live Position Tracking - Monitoring Buys & Sells');
console.log(`Threshold: ${THRESHOLD.toLocaleString()} tokens`);
console.log('Waiting for transactions...\n');

connection.onLogs(
  PUMPFUN_PROGRAM_ID,
  async ({ logs, err, signature }) => {
    if (err) return;
    
    txCount++;
    
    try {
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx?.meta?.innerInstructions) return;
      
      // Detect buy/sell
      let type = null;
      let discriminator = null;
      
      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys || [];
      if (message.addressTableLookups && tx.meta?.loadedAddresses) {
        if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
      }
      
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = accountKeys[ix.programIdIndex];
          if (programId?.toString() === PUMPFUN_PROGRAM_ID.toString()) {
            const data = Buffer.from(ix.data, 'base64');
            if (data.length >= 8) {
              discriminator = data.slice(0, 8).toString('hex');
              if (BUY_DISCRIMINATORS.includes(discriminator)) {
                type = 'BUY';
              } else if (SELL_DISCRIMINATORS.includes(discriminator)) {
                type = 'SELL';
              }
              break;
            }
          }
        }
        if (type) break;
      }
      
      if (!type) return;
      
      // Extract wallet and token
      if (!tx.meta.postTokenBalances?.length) return;
      
      let wallet = null;
      let token = null;
      let amount = 0;
      
      for (const post of tx.meta.postTokenBalances) {
        const pre = tx.meta.preTokenBalances?.find(p => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        if ((type === 'BUY' && change > 0n) || (type === 'SELL' && change < 0n)) {
          wallet = post.owner;
          token = post.mint;
          amount = Math.abs(Number(change) / Math.pow(10, post.uiTokenAmount.decimals));
          break;
        }
      }
      
      if (!wallet || !token) return;
      
      const positionKey = `${wallet}-${token}`;
      
      if (type === 'BUY') {
        // Check threshold for NEW positions only
        if (!positions.has(positionKey) && amount < THRESHOLD) {
          console.log(`❌ [${txCount}] BUY REJECTED (below threshold) | Wallet: ${wallet.slice(0,8)} | Token: ${token.slice(0,8)} | Amount: ${amount.toLocaleString()}`);
          return;
        }
        
        // Create or update position
        if (!positions.has(positionKey)) {
          positions.set(positionKey, { buys: [], sells: [], buyCount: 0, sellCount: 0 });
          console.log(`✅ [${txCount}] NEW POSITION | Wallet: ${wallet.slice(0,8)} | Token: ${token.slice(0,8)} | Amount: ${amount.toLocaleString()}`);
        } else {
          console.log(`💰 [${txCount}] ADDITIONAL BUY | Wallet: ${wallet.slice(0,8)} | Token: ${token.slice(0,8)} | Amount: ${amount.toLocaleString()}`);
        }
        
        const position = positions.get(positionKey);
        position.buys.push(signature);
        position.buyCount++;
        
        console.log(`   📊 Position: ${position.buyCount} buys, ${position.sellCount} sells`);
        console.log(`   🔗 https://solscan.io/tx/${signature}`);
        
      } else if (type === 'SELL') {
        const position = positions.get(positionKey);
        
        if (!position) {
          console.log(`⚠️  [${txCount}] SELL (no position) | Wallet: ${wallet.slice(0,8)} | Token: ${token.slice(0,8)} | Amount: ${amount.toLocaleString()}`);
          console.log(`   💡 This wallet bought BEFORE monitoring started`);
          return;
        }
        
        // SELL DETECTED FOR TRACKED POSITION!
        position.sells.push(signature);
        position.sellCount++;
        
        console.log(`🚨 [${txCount}] SELL DETECTED FOR TRACKED WALLET! | Wallet: ${wallet.slice(0,8)} | Token: ${token.slice(0,8)} | Amount: ${amount.toLocaleString()}`);
        console.log(`   📊 Position: ${position.buyCount} buys → ${position.sellCount} sells`);
        console.log(`   🔗 https://solscan.io/tx/${signature}`);
        console.log(`   ✅ THIS IS EXACTLY WHAT YOU WANTED - BUY IN, SELL OUT TRACKED!`);
      }
      
    } catch (error) {
      // Silent
    }
  },
  'confirmed'
);

// Status updates
setInterval(() => {
  console.log(`\n💡 Status: ${txCount} txs processed | ${positions.size} positions tracked`);
  
  let withSells = 0;
  for (const [key, pos] of positions.entries()) {
    if (pos.sellCount > 0) {
      withSells++;
      const [wallet, token] = key.split('-');
      console.log(`   🎯 ${wallet.slice(0,8)} / ${token.slice(0,8)}: ${pos.buyCount} buys → ${pos.sellCount} sells`);
    }
  }
  
  if (withSells === 0) {
    console.log(`   ⏳ Waiting for a tracked wallet to sell...`);
  }
  
  console.log('');
}, 30000);
