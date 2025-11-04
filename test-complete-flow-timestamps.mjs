import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Complete Sniper Flow with Timestamps\\n');
console.log('⏳ Waiting for token creation...\\n');

function getTimestamp() {
  const now = new Date();
  return `[${now.toISOString().split('T')[1].slice(0, -1)}]`;
}

async function getFullTransaction(signature) {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [signature, { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }]
      })
    });
    return (await response.json()).result;
  } catch { return null; }
}

function extractMint(tx) {
  if (tx?.meta?.postTokenBalances) {
    for (const balance of tx.meta.postTokenBalances) {
      if (balance?.mint && balance.mint.endsWith('pump')) return balance.mint;
    }
  }
  return null;
}

function extractAccountAddresses(tx) {
  const accounts = new Set();
  if (tx?.transaction?.message?.accountKeys) {
    tx.transaction.message.accountKeys.forEach(key => {
      if (typeof key === 'string') accounts.add(key);
      else if (key?.pubkey) accounts.add(key.pubkey);
    });
  }
  return Array.from(accounts);
}

async function findBondingCurve(accounts) {
  for (const address of accounts) {
    try {
      const pubkey = new PublicKey(address);
      const info = await connection.getAccountInfo(pubkey);
      if (!info || info.owner.toBase58() !== PUMPFUN_PROGRAM.toBase58()) continue;
      if (info.data.length < 8) continue;
      const discriminator = info.data.slice(0, 8);
      if (discriminator.equals(BONDING_CURVE_DISCRIMINATOR) && info.data.length === 150) {
        return address;
      }
    } catch {}
  }
  return null;
}

async function pollForInitialization(bondingCurve) {
  const startTime = Date.now();
  const pubkey = new PublicKey(bondingCurve);
  for (let poll = 0; poll < 20; poll++) {
    try {
      const info = await connection.getAccountInfo(pubkey, { commitment: 'confirmed' });
      if (info && info.data && info.data.length === 150) {
        const dataAfterDiscriminator = info.data.slice(8);
        if (!dataAfterDiscriminator.every(b => b === 0)) {
          return { initialized: true, elapsed: Date.now() - startTime, attempts: poll + 1 };
        }
      }
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  return { initialized: false, elapsed: Date.now() - startTime, attempts: 20 };
}

async function testCompleteFlow(logs) {
  const detectionTime = Date.now();
  
  console.log('\\n' + '='.repeat(100));
  console.log(`${getTimestamp()} 🎉 TOKEN CREATION DETECTED!`);
  console.log('='.repeat(100));
  console.log(`${getTimestamp()} 📄 Signature: ${logs.signature}\\n`);
  
  console.log(`${getTimestamp()} 📋 STEP 1: Fetching creation transaction...`);
  const txStart = Date.now();
  const tx = await getFullTransaction(logs.signature);
  const txElapsed = Date.now() - txStart;
  if (!tx) return false;
  console.log(`${getTimestamp()} ✅ Transaction fetched in ${txElapsed}ms (total: ${Date.now() - detectionTime}ms)\\n`);
  
  console.log(`${getTimestamp()} 📋 STEP 2: Extracting token mint...`);
  const tokenMint = extractMint(tx);
  if (!tokenMint) return false;
  console.log(`${getTimestamp()} ✅ Mint: ${tokenMint.slice(0, 16)}... (total: ${Date.now() - detectionTime}ms)\\n`);
  
  console.log(`${getTimestamp()} 📋 STEP 3: Extracting bonding curve PDA...`);
  const extractStart = Date.now();
  const accounts = extractAccountAddresses(tx);
  const bondingCurve = await findBondingCurve(accounts);
  const extractElapsed = Date.now() - extractStart;
  if (!bondingCurve) return false;
  console.log(`${getTimestamp()} ✅ Bonding curve PDA: ${bondingCurve.slice(0, 16)}... in ${extractElapsed}ms (total: ${Date.now() - detectionTime}ms)\\n`);
  
  console.log(`${getTimestamp()} 📋 STEP 4: Polling for initialization (50ms intervals)...`);
  const initResult = await pollForInitialization(bondingCurve);
  if (!initResult.initialized) return false;
  console.log(`${getTimestamp()} ✅ Initialized in ${initResult.elapsed}ms (${initResult.attempts} attempts) (total: ${Date.now() - detectionTime}ms)\\n`);
  
  console.log(`${getTimestamp()} 📋 STEP 5: Deriving associated bonding curve...`);
  const deriveStart = Date.now();
  const associatedBondingCurve = await getAssociatedTokenAddress(
    new PublicKey(tokenMint),
    new PublicKey(bondingCurve),
    true
  );
  const deriveElapsed = Date.now() - deriveStart;
  console.log(`${getTimestamp()} ✅ Derived: ${associatedBondingCurve.toBase58().slice(0, 16)}... in ${deriveElapsed}ms (total: ${Date.now() - detectionTime}ms)\\n`);
  
  const totalElapsed = Date.now() - detectionTime;
  console.log('='.repeat(100));
  console.log(`${getTimestamp()} 📊 COMPLETE TIMELINE:`);
  console.log('='.repeat(100));
  console.log(`   Step 1 - Fetch tx:         ${txElapsed}ms`);
  console.log(`   Step 2 - Extract mint:     <1ms`);
  console.log(`   Step 3 - Extract PDA:      ${extractElapsed}ms`);
  console.log(`   Step 4 - Poll init:        ${initResult.elapsed}ms (${initResult.attempts} attempts)`);
  console.log(`   Step 5 - Derive ATA:       ${deriveElapsed}ms`);
  console.log(`   ────────────────────────────────`);
  console.log(`   TOTAL TIME:                ${totalElapsed}ms`);
  console.log();
  
  if (totalElapsed <= 600) {
    console.log(`   🚀 EXCELLENT: Block 0-1 entry!`);
  } else if (totalElapsed <= 1000) {
    console.log(`   ⚡ GREAT: Block 1-2 entry!`);
  } else {
    console.log(`   ✅ GOOD: Block 2 entry`);
  }
  
  console.log(`   ✅ READY TO BUY WITH CORRECT ADDRESSES!`);
  console.log('='.repeat(100) + '\\n');
  return true;
}

const ws = new WebSocket(WS_URL);
let tokensTested = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\\n');
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [{ mentions: [PUMPFUN_PROGRAM.toBase58()] }, { commitment: 'processed' }]
  }));
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data.toString());
    if (message.method === 'logsNotification') {
      const logs = message.params.result.value;
      const isTokenCreation = logs.logs && Array.isArray(logs.logs) && 
        logs.logs.some(log => log.includes('Program log: Instruction: Create')) &&
        logs.logs.some(log => log.includes('Instruction: MintTo'));
      
      if (!isTokenCreation) return;
      
      if (await testCompleteFlow(logs)) {
        tokensTested++;
        if (tokensTested >= 3) {
          console.log('\\n✅ Tested 3 tokens, exiting...\\n');
          ws.close();
        }
      }
    }
  } catch {}
});

ws.on('error', (error) => console.error('❌ WebSocket error:', error.message));
ws.on('close', () => {
  console.log('🔌 WebSocket disconnected\\n');
  process.exit(0);
});
