/**
 * Test Script: Smart Money Tracker - See detections in real-time before production
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BUY_DISCRIMINATORS = ['0094d0da1f435eb0', 'e6345c8dd8b14540'];
const SELL_DISCRIMINATORS = ['33e685a4017f83ad'];

const MIN_TOKENS_THRESHOLD = 5_000_000; // 5M tokens

let detectionCount = 0;
let lastProcessedSlot = 0;

console.log('🎯 Smart Money Tracker - Test Mode');
console.log('=====================================');
console.log(`Minimum tokens: ${MIN_TOKENS_THRESHOLD.toLocaleString()}`);
console.log(`Monitoring Pumpfun buys/sells...`);
console.log(`Press Ctrl+C to stop\n`);

/**
 * Poll for new transactions
 */
async function pollTransactions() {
  try {
    const currentSlot = await connection.getSlot('confirmed');
    
    if (currentSlot <= lastProcessedSlot) {
      return;
    }

    // Get recent Pumpfun signatures
    const signatures = await connection.getSignaturesForAddress(
      PUMPFUN_PROGRAM_ID,
      { limit: 50 },
      'confirmed'
    );

    for (const sig of signatures) {
      if (sig.slot && sig.slot <= lastProcessedSlot) {
        continue;
      }

      await analyzeTransaction(sig.signature);
    }

    lastProcessedSlot = currentSlot;
  } catch (error) {
    console.error('❌ Error polling:', error.message);
  }
}

/**
 * Analyze a single transaction
 */
async function analyzeTransaction(signature) {
  try {
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta?.innerInstructions) return;

    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys;

    if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
      const allKeys = [...accountKeys];
      if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
      accountKeys = allKeys;
    }

    const walletAddress = accountKeys[0].toBase58();

    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;

        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;

        const data = Buffer.from(innerIx.data, 'base64');
        if (data.length < 24) continue;

        const discriminator = data.slice(0, 8).toString('hex');
        const isBuy = BUY_DISCRIMINATORS.includes(discriminator);
        const isSell = SELL_DISCRIMINATORS.includes(discriminator);

        if (!isBuy && !isSell) continue;

        const accounts = innerIx.accounts || [];
        if (accounts.length < 3) continue;

        const tokenMint = accountKeys[accounts[2]].toBase58();

        // Analyze token balance changes
        if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
          for (const post of tx.meta.postTokenBalances) {
            if (post.mint === tokenMint) {
              const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
              const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
              const postAmount = BigInt(post.uiTokenAmount.amount);
              const change = postAmount - preAmount;
              const absChange = change < 0n ? -change : change;

              if (absChange > 0n) {
                const decimals = post.uiTokenAmount.decimals;
                const tokenAmount = Number(absChange) / Math.pow(10, decimals);
                
                // Determine actual buy/sell from balance direction
                const actualType = change > 0n ? 'BUY' : 'SELL';

                // Only show if meets threshold (for buys)
                if (actualType === 'BUY' && tokenAmount < MIN_TOKENS_THRESHOLD) {
                  continue;
                }

                // Calculate SOL amount
                let solAmount = 0;
                if (tx.meta?.preBalances && tx.meta?.postBalances) {
                  const solChange = tx.meta.preBalances[0] - tx.meta.postBalances[0];
                  solAmount = Math.abs(solChange) / 1e9;
                }

                // Calculate entry price
                const pricePerToken = solAmount / tokenAmount;

                detectionCount++;

                const icon = actualType === 'BUY' ? '🟢' : '🔴';
                const time = new Date(tx.blockTime * 1000).toISOString();
                
                console.log(`\n${icon} Detection #${detectionCount} - ${actualType}`);
                console.log(`─────────────────────────────────────────────────────────────`);
                console.log(`Time:   ${time}`);
                console.log(`Wallet: ${walletAddress.slice(0, 8)}...${walletAddress.slice(-8)}`);
                console.log(`Token:  ${tokenMint.slice(0, 8)}...${tokenMint.slice(-8)}`);
                console.log(`Tokens: ${tokenAmount.toLocaleString()} tokens`);
                console.log(`SOL:    ${solAmount.toFixed(6)} SOL`);
                console.log(`Price:  ${pricePerToken.toExponential(6)} SOL/token`);
                console.log(`Tx:     ${signature.slice(0, 16)}...`);
                console.log(`Format: ${accounts.length}-account (${accounts.length === 16 ? 'WITH' : 'WITHOUT'} creator fee)`);
                console.log(`Disc:   ${discriminator}`);

                if (actualType === 'BUY') {
                  console.log(`\n✨ This position would be tracked!`);
                }
              }
            }
          }
        }
      }
    }
  } catch (error) {
    // Silent - too many to log
  }
}

/**
 * Start monitoring
 */
async function start() {
  lastProcessedSlot = await connection.getSlot('confirmed');
  console.log(`✅ Started monitoring from slot ${lastProcessedSlot}\n`);

  // Poll every 5 seconds
  setInterval(() => {
    pollTransactions().catch(console.error);
  }, 5000);

  // Initial poll
  pollTransactions().catch(console.error);
}

start().catch(console.error);
