#!/usr/bin/env node

import WebSocket from 'ws';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID } from '@solana/spl-token';

const RPC_HTTP = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const RPC_WS = process.env.RPC_WS || 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

const MAX_ATTEMPTS = parseInt(process.env.BONDING_CURVE_ATTEMPTS || '20', 10);
const BASE_DELAY_MS = parseInt(process.env.BONDING_CURVE_DELAY_MS || '200', 10);

const connection = new Connection(RPC_HTTP, { commitment: 'confirmed' });

const ws = new WebSocket(RPC_WS);
let subscriptionId = null;

const isFilteredAddress = (addr) => (
  addr === PUMPFUN_PROGRAM_ID ||
  addr === 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s' ||
  addr.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') ||
  addr.startsWith('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') ||
  addr.startsWith('11111111111111111111111111111111') ||
  addr.startsWith('ComputeBudget111111111111111111111111111111')
);

const isValidMint = (candidate) => {
  if (!candidate) return false;
  if (candidate.length < 32 || candidate.length > 44) return false;
  return /^[1-9A-HJ-NP-Za-km-z]+$/.test(candidate);
};

async function isUsableMintAddress(mint) {
  try {
    const info = await connection.getAccountInfo(new PublicKey(mint), 'processed');
    return info !== null && info.owner.equals(TOKEN_PROGRAM_ID) && info.data.length === 82;
  } catch {
    return false;
  }
}

function deriveBondingCurvePDA(mint) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('bonding_curve'),
    new PublicKey(mint).toBuffer()
  ], new PublicKey(PUMPFUN_PROGRAM_ID));
}

async function fetchBondingCurveAccount(bondingCurve) {
  const commitments = ['processed', 'processed', 'confirmed', 'confirmed', 'finalized'];
  for (const commitment of commitments) {
    const info = await connection.getAccountInfo(bondingCurve, commitment);
    if (info) {
      return info;
    }
  }
  return null;
}

async function measureBondingCurveAvailability(mint, signature) {
  const [bondingCurve] = deriveBondingCurvePDA(mint);
  const start = Date.now();

  console.log(`\n🧪 Measuring bonding-curve readiness for mint ${mint}`);
  console.log(`   ↳ PDA: ${bondingCurve.toBase58()}`);
  console.log(`   ↳ TX:  https://solscan.io/tx/${signature}`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const account = await fetchBondingCurveAccount(bondingCurve);
    if (account) {
      const duration = Date.now() - start;
      console.log(`✅ Ready on attempt ${attempt} (≈${(duration / 1000).toFixed(2)}s). Data len: ${account.data.length}`);
      return;
    }

    console.log(`⏳ Attempt ${attempt} → not ready yet`);
    await new Promise(resolve => setTimeout(resolve, BASE_DELAY_MS * attempt));
  }

  const total = Date.now() - start;
  console.warn(`❌ PDA still unavailable after ${MAX_ATTEMPTS} attempts (~${(total / 1000).toFixed(2)}s)`);
}

async function deriveMintFromLogs(logs, signature) {
  let mint = null;
  const seen = new Set();

  const trySet = async (candidate) => {
    if (!candidate || seen.has(candidate)) return false;
    seen.add(candidate);
    if (isFilteredAddress(candidate) || !isValidMint(candidate)) return false;
    if (await isUsableMintAddress(candidate)) {
      mint = candidate;
      return true;
    }
    return false;
  };

  for (const log of logs) {
    const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
    if (!matches) continue;
    for (const candidate of matches) {
      if (await trySet(candidate)) {
        return mint;
      }
    }
  }

  // Fallback: decode transaction
  try {
    const tx = await connection.getTransaction(signature, {
      maxSupportedTransactionVersion: 0,
      commitment: 'confirmed'
    });

    const balances = tx?.meta?.postTokenBalances || [];
    const fromBalances = balances.map(b => b.mint).find(m => m && !isFilteredAddress(m));
    if (fromBalances && await isUsableMintAddress(fromBalances)) {
      return fromBalances;
    }

    const keys = (() => {
      const message = tx?.transaction?.message;
      if (!message) return [];
      if (typeof message.getAccountKeys === 'function') {
        const res = message.getAccountKeys();
        return [...res.staticAccountKeys, ...(res.accountKeys || [])].map(k => (typeof k === 'string' ? k : k.toBase58()));
      }
      return message?.accountKeys?.map(k => k.toBase58()) || [];
    })();

    for (const candidate of keys) {
      if (!isFilteredAddress(candidate) && await isUsableMintAddress(candidate)) {
        return candidate;
      }
    }
  } catch (error) {
    console.error('   ⚠️ Fallback decode failed:', error.message || error);
  }

  return null;
}

function parseBondingCurveFromLogs(logs) {
  for (const log of logs) {
    if (!log.includes('Program data:')) continue;
    const base64 = log.substring(log.indexOf('Program data:') + 13).trim();
    try {
      const buf = Buffer.from(base64, 'base64');
      if (buf.length < 56) continue;
      let offset = 8; // skip discriminator
      const readU64 = () => {
        const value = buf.readBigUInt64LE(offset);
        offset += 8;
        return value;
      };

      const virtualTokenReserves = readU64();
      const virtualSolReserves = readU64();
      const realTokenReserves = readU64();
      const realSolReserves = readU64();
      const tokenTotalSupply = readU64();
      const completeFlag = buf[offset] ?? 0;

      return {
        virtualTokenReserves,
        virtualSolReserves,
        realTokenReserves,
        realSolReserves,
        tokenTotalSupply,
        complete: completeFlag
      };
    } catch (error) {
      console.warn('   ⚠️ Failed to decode Program data payload:', error.message || error);
    }
  }

  return null;
}

function isNewPumpfunLaunch(logs) {
  const hasCreate = logs.some(log => log.includes('Program log: Instruction: Create') && !log.includes('Metadata'));
  const hasMintTo = logs.some(log => log.includes('Instruction: MintTo'));
  const hasBuy = logs.some(log => log.includes('Instruction: Buy'));
  return hasCreate && hasMintTo && hasBuy;
}

ws.on('open', () => {
  console.log('✅ Connected to Pumpfun WebSocket');
  const payload = {
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM_ID] },
      { commitment: 'confirmed' }
    ]
  };
  ws.send(JSON.stringify(payload));
});

ws.on('message', async (raw) => {
  try {
    const message = JSON.parse(raw.toString());
    if (message.id === 1 && message.result) {
      subscriptionId = message.result;
      console.log(`📡 Subscribed (ID ${subscriptionId}) – waiting for launches...`);
      return;
    }

    if (message.method !== 'logsNotification') return;

    const { value } = message.params.result;
    if (!isNewPumpfunLaunch(value.logs)) return;

    console.log(`\n🚨 New Pumpfun launch detected! signature=${value.signature}`);

    const mint = await deriveMintFromLogs(value.logs, value.signature);
    if (!mint) {
      console.warn('   ⚠️ Unable to resolve mint from logs/transaction');
      return;
    }

    console.log(`   🎯 Mint resolved: ${mint}`);

    const curveSnapshot = parseBondingCurveFromLogs(value.logs);
    if (curveSnapshot) {
      console.log('   📊 Bonding curve snapshot from logs:');
      console.log(`      • virtualTokenReserves = ${curveSnapshot.virtualTokenReserves.toString()}`);
      console.log(`      • virtualSolReserves   = ${curveSnapshot.virtualSolReserves.toString()}`);
      console.log(`      • realTokenReserves    = ${curveSnapshot.realTokenReserves.toString()}`);
      console.log(`      • realSolReserves      = ${curveSnapshot.realSolReserves.toString()}`);
      console.log(`      • tokenTotalSupply     = ${curveSnapshot.tokenTotalSupply.toString()}`);
      console.log(`      • completeFlag         = ${curveSnapshot.complete}`);
    } else {
      console.log('   ⚠️ No Program data snapshot found in logs');
    }

    await measureBondingCurveAvailability(mint, value.signature);
  } catch (error) {
    console.error('❌ WebSocket handler error:', error.message || error);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message || err);
});

ws.on('close', () => {
  console.log('🔌 WebSocket closed');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n⏹️  Stopping monitor...');
  if (subscriptionId && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'logsUnsubscribe', params: [subscriptionId] }));
  }
  ws.close();
});
