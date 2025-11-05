/**
 * Live test: Monitor Pumpfun program and track wallets
 * Demonstrates how tracked wallet detection would work in real-time
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

const THRESHOLD = 5_000_000;

// Track wallets we've seen
const trackedWallets = new Map(); // wallet -> array of {token, time, amount}
let txCount = 0;

console.log('🔴 LIVE Pumpfun Monitor - Testing Wallet Tracking Logic');
console.log(`Threshold: ${THRESHOLD.toLocaleString()} tokens\n`);

connection.onLogs(
  PUMPFUN_PROGRAM_ID,
  async ({ logs, err, signature }) => {
    if (err) return;
    
    txCount++;
    
    try {
      // Fetch transaction
      const tx = await connection.getTransaction(signature, {
        maxSupportedTransactionVersion: 0,
        commitment: 'confirmed'
      });
      
      if (!tx?.meta?.innerInstructions) return;
      
      // Find buy discriminator
      let isBuy = false;
      for (const inner of tx.meta.innerInstructions) {
        for (const ix of inner.instructions) {
          const programId = tx.transaction.message.staticAccountKeys[ix.programIdIndex].toBase58();
          if (programId !== PUMPFUN_PROGRAM_ID.toBase58()) continue;
          
          const data = Buffer.from(ix.data, 'base64');
          const discriminator = data.slice(0, 8).toString('hex');
          
          if (BUY_DISCRIMINATORS.includes(discriminator)) {
            isBuy = true;
            break;
          }
        }
        if (isBuy) break;
      }
      
      if (!isBuy) return;
      
      // Extract wallet and token
      if (!tx.meta.postTokenBalances?.length) return;
      
      let walletAddress = null;
      let tokenMint = null;
      let tokensBought = 0;
      
      for (const post of tx.meta.postTokenBalances) {
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;
        
        if (change > 0n) {
          walletAddress = post.owner;
          tokenMint = post.mint;
          tokensBought = Number(change) / Math.pow(10, post.uiTokenAmount.decimals);
          break;
        }
      }
      
      if (!walletAddress || !tokenMint) return;
      
      // CHECK: Is this a tracked wallet?
      const isTracked = trackedWallets.has(walletAddress);
      
      // OLD LOGIC
      const wouldRecordOld = tokensBought >= THRESHOLD;
      
      // NEW LOGIC
      const wouldRecordNew = isTracked || tokensBought >= THRESHOLD;
      
      // Display result
      const emoji = isTracked ? '🎯' : '🆕';
      const status = wouldRecordNew ? '✅ RECORD' : '❌ SKIP';
      
      console.log(`${emoji} [${txCount}] ${status} | Wallet: ${walletAddress.slice(0,8)} | Token: ${tokenMint.slice(0,8)} | Amount: ${tokensBought.toLocaleString()} | Tracked: ${isTracked ? 'YES' : 'NO'}`);
      
      if (wouldRecordOld !== wouldRecordNew) {
        console.log(`   🔥 DIFFERENCE! Old logic: ${wouldRecordOld ? 'RECORD' : 'SKIP'} | New logic: ${wouldRecordNew ? 'RECORD' : 'SKIP'}`);
      }
      
      // Add to tracked wallets if above threshold
      if (wouldRecordNew) {
        if (!trackedWallets.has(walletAddress)) {
          trackedWallets.set(walletAddress, []);
          console.log(`   ➕ Added ${walletAddress.slice(0,8)} to tracked wallets`);
        }
        trackedWallets.get(walletAddress).push({
          token: tokenMint.slice(0,8),
          amount: tokensBought,
          time: new Date().toLocaleTimeString()
        });
        
        console.log(`   📊 Total tracked wallets: ${trackedWallets.size}`);
      }
      
    } catch (error) {
      // Silent errors to keep output clean
    }
  },
  'confirmed'
);

console.log('⏳ Listening for Pumpfun buys... (Ctrl+C to stop)\n');

// Keep alive
setInterval(() => {
  console.log(`\n💡 Status: ${txCount} txs processed | ${trackedWallets.size} wallets tracked`);
}, 30000);
