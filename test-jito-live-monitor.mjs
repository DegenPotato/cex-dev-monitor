import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import WebSocket from 'ws';
import dotenv from 'dotenv';

dotenv.config();

const WS_URL = process.env.SOLANA_WS_TRITON || 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const RPC_URL = process.env.SOLANA_RPC_TRITON || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'processed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

/**
 * Check if bonding curve is fully initialized
 */
function isCurveInitialized(accountData) {
  if (!accountData || accountData.length < 120) return false;
  
  // Check discriminator
  const discriminator = accountData.slice(0, 8).toString('hex');
  if (discriminator !== '17b7f83760d8ac60') return false;
  
  // Check that key fields are non-zero (proper initialization check)
  const virtualTokenReserves = accountData.readBigUInt64LE(8);
  if (virtualTokenReserves === 0n) return false;
  
  const virtualSolReserves = accountData.readBigUInt64LE(16);
  if (virtualSolReserves === 0n) return false;
  
  const realTokenReserves = accountData.readBigUInt64LE(24);
  if (realTokenReserves === 0n) return false;
  
  return true;
}

/**
 * Extract bonding curve AND token mint from transaction (uses working derive-pumpfun-mint.mjs logic)
 */
async function extractBondingCurveAndMintFromTx(signature) {
  let tx = null;
  let attempts = 0;
  
  while (!tx && attempts < 10) {
    attempts++;
    tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) {
      await new Promise(r => setTimeout(r, 50));
    }
  }
  
  if (!tx) return null;
  
  // Extract mint using EXACT logic from derive-pumpfun-mint.mjs
  function isPossibleMint(address) {
    return typeof address === 'string' && address.length >= 32 && address.length <= 44 && /[1-9A-HJ-NP-Za-km-z]{32,44}/.test(address);
  }
  
  function extractMintFromLogs(logs = []) {
    for (const log of logs) {
      if (!log.includes('Program log:')) continue;
      const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
      if (!matches) continue;
      for (const candidate of matches) {
        if (candidate === 'So11111111111111111111111111111111111111112') continue;
        if (candidate.endsWith('pump') && isPossibleMint(candidate)) {
          return candidate;
        }
      }
    }
    return null;
  }
  
  function extractMintFromBalances(balances = []) {
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112' && isPossibleMint(mint)) {
        if (mint.endsWith('pump')) return mint;
      }
    }
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112' && isPossibleMint(mint)) {
        return mint;
      }
    }
    return null;
  }
  
  const logMint = extractMintFromLogs(tx.meta?.logMessages);
  const balanceMint = extractMintFromBalances(tx.meta?.postTokenBalances);
  const tokenMint = logMint || balanceMint;
  
  if (!tokenMint) return null;
  
  // Find bonding curve
  const accountKeys = tx.transaction.message.staticAccountKeys || tx.transaction.message.accountKeys;
  for (const accKey of accountKeys) {
    try {
      const info = await connection.getAccountInfo(accKey, 'processed');
      if (info && info.owner.equals(PUMPFUN_PROGRAM_ID) && info.data.length >= 120) {
        const discriminator = info.data.slice(0, 8).toString('hex');
        if (discriminator === '17b7f83760d8ac60') {
          return { bondingCurve: accKey, tokenMint: new PublicKey(tokenMint) };
        }
      }
    } catch (e) {
      // Skip
    }
  }
  
  return null;
}

/**
 * Poll for bonding curve initialization with timing
 */
async function pollForInitialization(bondingCurveAddr, maxTimeMs = 900) {
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < maxTimeMs) {
    attempts++;
    const info = await connection.getAccountInfo(bondingCurveAddr, 'processed');
    
    if (info && isCurveInitialized(info.data)) {
      const elapsed = Date.now() - startTime;
      return { success: true, elapsed, attempts };
    }
    
    await new Promise(r => setTimeout(r, 25)); // 25ms polling
  }
  
  const elapsed = Date.now() - startTime;
  return { success: false, elapsed, attempts };
}

/**
 * Handle detected launch
 */
async function handleLaunch(signature, logs) {
  console.log('\n' + '='.repeat(80));
  console.log(`🚀 NEW LAUNCH DETECTED!`);
  console.log(`   Signature: ${signature}`);
  console.log('='.repeat(80));
  
  const overallStart = Date.now();
  
  try {
    // Step 1: Extract bonding curve AND mint from transaction
    console.log('\n1️⃣  Extracting bonding curve and mint from transaction...');
    const step1Start = Date.now();
    
    const result = await extractBondingCurveAndMintFromTx(signature);
    if (!result) {
      console.log('❌ Could not extract bonding curve and mint');
      return;
    }
    
    const { bondingCurve, tokenMint } = result;
    const step1Time = Date.now() - step1Start;
    console.log(`✅ Found bonding curve: ${bondingCurve.toBase58()}`);
    console.log(`✅ Found token mint: ${tokenMint.toBase58()}`);
    console.log(`   Time: ${step1Time}ms`);
    
    // Step 2: Poll for initialization
    console.log('\n2️⃣  Polling for bonding curve initialization...');
    const pollResult = await pollForInitialization(bondingCurve, 900);
    
    if (pollResult.success) {
      console.log(`✅ INITIALIZED after ${pollResult.elapsed}ms (${pollResult.attempts} attempts)`);
    } else {
      console.log(`❌ NOT INITIALIZED after ${pollResult.elapsed}ms (${pollResult.attempts} attempts)`);
      return;
    }
    
    // Step 3: Calculate total timing
    const totalTime = Date.now() - overallStart;
    
    console.log('\n' + '='.repeat(80));
    console.log('📊 TIMING SUMMARY:');
    console.log(`   Extract bonding curve + mint: ${step1Time}ms`);
    console.log(`   Wait for initialization: ${pollResult.elapsed}ms`);
    console.log(`   TOTAL: ${totalTime}ms`);
    console.log('='.repeat(80));
    
    console.log('\n✅ Ready to buy! This is where Jito bundle would be submitted.');
    console.log(`   Token: ${tokenMint.toBase58()}`);
    console.log(`   Bonding curve: ${bondingCurve.toBase58()}`);
    console.log(`   Solscan: https://solscan.io/tx/${signature}`);
    
    // Show if this would be competitive
    if (totalTime < 200) {
      console.log(`\n🔥 EXCELLENT! ${totalTime}ms = Block 0 entry GUARANTEED`);
    } else if (totalTime < 500) {
      console.log(`\n✅ GOOD! ${totalTime}ms = Block 0-1 entry likely`);
    } else if (totalTime < 1000) {
      console.log(`\n⚠️  OK. ${totalTime}ms = Block 1-2 entry`);
    } else {
      console.log(`\n❌ SLOW. ${totalTime}ms = Block 2+ entry (too slow)`);
    }
    
  } catch (error) {
    console.error('❌ Error handling launch:', error.message);
  }
}

/**
 * Monitor Pumpfun logs for new launches
 */
async function monitorLaunches() {
  console.log('🔍 Monitoring Pumpfun for new launches...');
  console.log(`   Program: ${PUMPFUN_PROGRAM_ID.toBase58()}`);
  console.log(`   WebSocket: ${WS_URL}`);
  console.log('\nWaiting for new token launches...\n');
  
  const ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
    // Subscribe to Pumpfun program logs
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { mentions: [PUMPFUN_PROGRAM_ID.toBase58()] },
        { commitment: 'processed' }
      ]
    }));
    
    console.log('✅ Connected to WebSocket');
    console.log('⏳ Listening for launches...\n');
  });
  
  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.method === 'logsNotification') {
        const logs = message.params.result.value;
        const signature = logs.signature;
        
        // Check if this is a token creation
        const hasCreate = logs.logs.some(log => 
          log.includes('Instruction: Create') && !log.includes('Metadata')
        );
        const hasMintTo = logs.logs.some(log => log.includes('Instruction: MintTo'));
        const hasBuy = logs.logs.some(log => log.includes('Instruction: Buy'));
        
        if (hasCreate && hasMintTo && hasBuy) {
          // This is a new token launch!
          await handleLaunch(signature, logs);
        }
      }
    } catch (error) {
      console.error('Error processing message:', error.message);
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error.message);
  });
  
  ws.on('close', () => {
    console.log('WebSocket closed. Reconnecting in 5s...');
    setTimeout(monitorLaunches, 5000);
  });
}

// Start monitoring
console.log('🧪 Live Jito Snipe Monitor Test\n');
console.log('This will:');
console.log('  1. Detect new Pumpfun launches in real-time');
console.log('  2. Extract bonding curve from transaction');
console.log('  3. Poll for initialization');
console.log('  4. Show exact timing (does NOT buy)\n');

monitorLaunches().catch(console.error);
