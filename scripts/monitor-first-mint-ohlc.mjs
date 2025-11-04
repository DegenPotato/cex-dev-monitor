#!/usr/bin/env node

/**
 * Pumpfun OHLC Monitor
 * 
 * Monitors Pumpfun token launches via WebSocket, accurately extracts mint addresses,
 * tracks bonding curve state, calculates prices, and broadcasts OHLC data.
 * 
 * Mint extraction uses proven logic from derive-pumpfun-mint.mjs:
 *  1. Scan Program log lines for addresses ending in 'pump'
 *  2. Fall back to transaction postTokenBalances if needed
 */

import WebSocket, { WebSocketServer } from 'ws';
import { PublicKey } from '@solana/web3.js';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const METADATA_PROGRAM_ID = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
const TOKEN_PROGRAM_ID = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const ASSOCIATED_TOKEN_PROGRAM_ID = 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL';

const PUMPFUN_LOGS_WS = process.env.RPC_WS || 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03/whirligig';
const RPC_HTTP_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const OHLC_INTERVAL_MS = Number(process.env.OHLC_INTERVAL_MS || 5000);
const MAX_CANDLES = Number(process.env.MAX_CANDLES || 120);
const BROADCAST_PORT = Number(process.env.OHLC_WS_PORT || 4777);
const USE_RPC_ROTATOR = process.env.USE_RPC_ROTATOR === 'false';

const GLOBAL_RPC_HOST = 'api.mainnet-beta.solana.com';

// ---------------------------------------------------------------------------
// RPC Rotator (JS adaptation of backend RPCServerRotator)
// ---------------------------------------------------------------------------

class RPCServerRotator {
  constructor() {
    this.servers = [
      'https://tyo73.nodes.rpcpool.com',
      'https://tyo79.nodes.rpcpool.com',
      'https://tyo142.nodes.rpcpool.com',
      'https://tyo173.nodes.rpcpool.com',
      'https://tyo208.nodes.rpcpool.com',
      'https://sg110.nodes.rpcpool.com',
      'https://nyc71.nodes.rpcpool.com',
      'https://pit36.nodes.rpcpool.com',
      'https://pit37.nodes.rpcpool.com',
      'https://ash2.nodes.rpcpool.com',
      'https://ash24.nodes.rpcpool.com',
      'https://dal17.nodes.rpcpool.com',
      'https://fra113.nodes.rpcpool.com',
      'https://fra130.nodes.rpcpool.com',
      'https://fra155.nodes.rpcpool.com',
      'https://fra59.nodes.rpcpool.com',
      'https://fra60.nodes.rpcpool.com',
      'https://ams346.nodes.rpcpool.com',
      'https://fra119.nodes.rpcpool.com',
      'https://fra120.nodes.rpcpool.com'
    ];
    this.currentIndex = 0;
    this.enabled = false;
    this.hostHeader = GLOBAL_RPC_HOST;
    this.serverStats = new Map(this.servers.map(server => [server, { requests: 0, failures: 0 }]));
    this.serverRequestTimestamps = new Map();
    this.MAX_REQUESTS_PER_10S = 90;
  }

  enable() {
    this.enabled = true;
    console.log(`🔄 [RPC Rotator] Enabled (${this.servers.length} backends)`);
  }

  cleanOld(server) {
    const now = Date.now();
    const tenSecondsAgo = now - 10000;
    const timestamps = this.serverRequestTimestamps.get(server) || [];
    const filtered = timestamps.filter(ts => ts > tenSecondsAgo);
    this.serverRequestTimestamps.set(server, filtered);
  }

  async waitIfAtLimit(server) {
    this.cleanOld(server);
    const timestamps = this.serverRequestTimestamps.get(server) || [];
    if (timestamps.length >= this.MAX_REQUESTS_PER_10S) {
      const oldest = timestamps[0];
      const waitMs = Math.max(0, 10000 - (Date.now() - oldest)) + 100;
      const serverName = server.replace('https://', '').split('.')[0];
      console.log(`⚠️  [RPC Rotator] ${serverName} saturated (${timestamps.length}/${this.MAX_REQUESTS_PER_10S}), waiting ${waitMs}ms`);
      await new Promise(resolve => setTimeout(resolve, waitMs));
      this.cleanOld(server);
    }
  }

  track(server) {
    const timestamps = this.serverRequestTimestamps.get(server) || [];
    timestamps.push(Date.now());
    this.serverRequestTimestamps.set(server, timestamps);
    const stat = this.serverStats.get(server);
    if (stat) {
      stat.requests += 1;
      if (stat.requests % 15 === 0) {
        const name = server.replace('https://', '').split('.')[0];
        console.log(`🔄 [RPC Rotator] Using ${name} (${stat.requests} requests)`);
      }
    }
  }

  async getNextServer() {
    if (!this.enabled) {
      return process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    }
    const server = this.servers[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.servers.length;
    await this.waitIfAtLimit(server);
    this.track(server);
    return server;
  }

  markFailure(server) {
    const stat = this.serverStats.get(server);
    if (stat) stat.failures += 1;
  }

  getHostHeader() {
    return this.enabled ? this.hostHeader : undefined;
  }
}

const rpcRotator = new RPCServerRotator();
if (USE_RPC_ROTATOR) {
  rpcRotator.enable();
} else {
  console.log('ℹ️  RPC rotator disabled (set USE_RPC_ROTATOR=true to enable)');
}

// ---------------------------------------------------------------------------
// Rotating RPC client using fetch
// ---------------------------------------------------------------------------

class RotatingRpcClient {
  constructor(rotator) {
    this.rotator = rotator;
  }

  async request(method, params, attempt = 1) {
    const server = await this.rotator.getNextServer();
    const body = JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}-${Math.random()}`, method, params });
    const headers = {
      'content-type': 'application/json',
      accept: 'application/json'
    };
    const hostHeader = this.rotator.getHostHeader();
    if (hostHeader) headers['Host'] = hostHeader;

    try {
      const res = await fetch(server, { method: 'POST', headers, body });
      if (res.status === 429) {
        this.rotator.markFailure(server);
        const backoff = Math.min(500 * Math.pow(2, attempt - 1), 4000);
        console.warn(`⚠️  RPC 429 from ${server}. Retrying in ${backoff}ms (attempt ${attempt})`);
        await new Promise(resolve => setTimeout(resolve, backoff));
        if (attempt >= 6) throw new Error('RPC 429 retries exhausted');
        return this.request(method, params, attempt + 1);
      }
      if (!res.ok) {
        this.rotator.markFailure(server);
        const text = await res.text();
        throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
      }
      const data = await res.json();
      if (data.error) {
        throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
      }
      return data.result;
    } catch (error) {
      if (attempt >= 6) {
        throw error;
      }
      const wait = Math.min(250 * Math.pow(2, attempt - 1), 3000);
      await new Promise(resolve => setTimeout(resolve, wait));
      return this.request(method, params, attempt + 1);
    }
  }

  get hostHeader() {
    return this.rotator.getHostHeader();
  }
}

const rpcClient = new RotatingRpcClient(rpcRotator);

// ---------------------------------------------------------------------------
// Direct RPC helper (bypasses rotator when running locally)
// ---------------------------------------------------------------------------

async function directRpcRequest(method, params, attempt = 1) {
  const body = JSON.stringify({ jsonrpc: '2.0', id: `${method}-${Date.now()}-${Math.random()}`, method, params });

  try {
    const res = await fetch(RPC_HTTP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json'
      },
      body
    });

    if (res.status === 429 || res.status === 403) {
      if (attempt >= 5) {
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
      }
      const backoff = Math.min(400 * Math.pow(2, attempt - 1), 3000);
      await new Promise(resolve => setTimeout(resolve, backoff));
      return directRpcRequest(method, params, attempt + 1);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`HTTP ${res.status} ${res.statusText}: ${text}`);
    }

    const data = await res.json();
    if (data.error) {
      throw new Error(`RPC ${method} error: ${JSON.stringify(data.error)}`);
    }

    return data.result;
  } catch (error) {
    if (attempt >= 5) {
      throw error;
    }
    const wait = Math.min(250 * Math.pow(2, attempt - 1), 2000);
    await new Promise(resolve => setTimeout(resolve, wait));
    return directRpcRequest(method, params, attempt + 1);
  }
}

async function deriveMintFromTransaction(signature) {
  if (!signature) return null;

  try {
    const tx = await directRpcRequest('getTransaction', [signature, {
      commitment: 'confirmed',
      encoding: 'json',
      maxSupportedTransactionVersion: 0
    }]);

    if (!tx) return null;

    const balances = tx?.meta?.postTokenBalances || [];
    
    // Prioritize mints ending in 'pump'
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        if (mint.endsWith('pump') && mint.length >= 32 && mint.length <= 44) {
          return mint;
        }
      }
    }

    // Fallback: return first valid mint
    for (const balance of balances) {
      const mint = balance?.mint;
      if (mint && mint !== 'So11111111111111111111111111111111111111112') {
        if (mint.length >= 32 && mint.length <= 44) {
          return mint;
        }
      }
    }
  } catch (error) {
    console.warn('⚠️  Transaction lookup failed:', error.message || error);
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helpers for bonding curve parsing
// ---------------------------------------------------------------------------

async function fetchAccountInfoBase64(pubkey, commitment = 'processed') {
  try {
    const result = await rpcClient.request('getAccountInfo', [pubkey, { commitment, encoding: 'base64' }]);
    return result?.value || null;
  } catch (error) {
    console.warn(`⚠️  Unable to fetch account ${pubkey}:`, error.message || error);
    return null;
  }
}

async function deriveMintFromLogs(logs, signature) {
  // Strategy 1: Scan Program log lines for addresses ending in 'pump'
  for (const log of logs) {
    if (!log.includes('Program log:')) continue;
    const matches = log.match(/[1-9A-HJ-NP-Za-km-z]{32,44}/g);
    if (!matches) continue;
    
    for (const candidate of matches) {
      if (candidate === 'So11111111111111111111111111111111111111112') continue;
      if (candidate.endsWith('pump') && candidate.length >= 32 && candidate.length <= 44) {
        return candidate;
      }
    }
  }

  // Strategy 2: Fetch transaction and extract from postTokenBalances (most reliable)
  if (signature) {
    const mintFromTransaction = await deriveMintFromTransaction(signature);
    if (mintFromTransaction) {
      return mintFromTransaction;
    }
  }

  return null;
}

async function resolveMintFromLogs(logs, signature) {
  try {
    return await deriveMintFromLogs(logs, signature);
  } catch (error) {
    console.warn('⚠️  deriveMintFromLogs failed:', error.message || error);
    return null;
  }
}

function isNewPumpfunLaunch(logs) {
  const hasCreate = logs.some(log => log.includes('Program log: Instruction: Create') && !log.includes('Metadata'));
  const hasMintTo = logs.some(log => log.includes('Instruction: MintTo'));
  const hasBuy = logs.some(log => log.includes('Instruction: Buy'));
  return hasCreate && hasMintTo && hasBuy;
}

function parseBondingCurveSnapshotFromLog(log) {
  if (!log.includes('Program data:')) return null;
  try {
    const base64 = log.substring(log.indexOf('Program data:') + 13).trim();
    const buf = Buffer.from(base64, 'base64');
    if (buf.length < 56) return null;
    let offset = 8;
    const readU64 = () => {
      const v = buf.readBigUInt64LE(offset);
      offset += 8;
      return v;
    };
    return {
      virtualTokenReserves: readU64(),
      virtualSolReserves: readU64(),
      realTokenReserves: readU64(),
      realSolReserves: readU64(),
      tokenTotalSupply: readU64()
    };
  } catch (error) {
    console.warn('⚠️  Snapshot decode failed:', error.message || error);
    return null;
  }
}

function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync([
    Buffer.from('bonding_curve'),
    new PublicKey(tokenMint).toBuffer()
  ], new PublicKey(PUMPFUN_PROGRAM_ID));
}

async function waitForBondingCurveAccount(bondingCurve) {
  const pubkey = bondingCurve.toBase58();
  const start = Date.now();
  for (let attempt = 1; attempt <= 40; attempt++) {
    const account = await fetchAccountInfoBase64(pubkey, 'processed');
    if (account) {
      const elapsed = Date.now() - start;
      console.log(`✅ Bonding curve PDA live after ${elapsed}ms (attempt ${attempt})`);
      return account;
    }
    const delay = Math.min(150 + attempt * 75, 600);
    await new Promise(resolve => setTimeout(resolve, delay));
  }
  console.warn('⚠️ Bonding curve PDA did not appear within timeout');
  return null;
}

function parseBondingCurveAccount(accountValue) {
  if (!accountValue?.data?.[0]) return null;
  const buf = Buffer.from(accountValue.data[0], 'base64');
  if (buf.length < 56) return null;
  
  // Pump.fun bonding curve account layout:
  // Discriminator: 8 bytes
  // virtualTokenReserves: u64 (8 bytes)
  // virtualSolReserves: u64 (8 bytes)  
  // realTokenReserves: u64 (8 bytes)
  // realSolReserves: u64 (8 bytes)
  // tokenTotalSupply: u64 (8 bytes)
  // complete: bool (1 byte)
  
  let offset = 8; // Skip discriminator
  const readU64 = () => {
    const v = buf.readBigUInt64LE(offset);
    offset += 8;
    return v;
  };
  
  const parsed = {
    virtualTokenReserves: readU64(),
    virtualSolReserves: readU64(),
    realTokenReserves: readU64(),
    realSolReserves: readU64(),
    tokenTotalSupply: readU64(),
    complete: buf[offset] === 1
  };
  
  // Debug log to verify we're reading correctly
  console.log(`📊 Bonding curve state:
    virtualTokenReserves: ${parsed.virtualTokenReserves}
    virtualSolReserves: ${parsed.virtualSolReserves}
    k = ${Number(parsed.virtualTokenReserves) * Number(parsed.virtualSolReserves) / 1e15}`);
  
  return parsed;
}

function calculatePrice(snapshot) {
  // Pump.fun constant product AMM: k = x * y where:
  // x = virtualSolReserves (in lamports)
  // y = virtualTokenReserves (in smallest token units)
  // Spot price = x / y (converting units appropriately)
  
  const solRaw = snapshot.virtualSolReserves;
  const tokenRaw = snapshot.virtualTokenReserves;
  if (solRaw === undefined || tokenRaw === undefined) return null;

  const solLamports = Number(solRaw);
  const tokenAmount = Number(tokenRaw);
  if (!Number.isFinite(solLamports) || !Number.isFinite(tokenAmount) || tokenAmount === 0) {
    return null;
  }

  // Price = (solLamports / 1e9) / (tokenAmount / 10^decimals)
  // Simplifies to: (solLamports * 10^decimals) / (tokenAmount * 1e9)
  const decimals = trackingDecimals ?? 6;
  const decimalsFactor = Math.pow(10, decimals);
  const price = (solLamports * decimalsFactor) / (tokenAmount * 1e9);
  
  if (!Number.isFinite(price)) return null;
  
  // Debug logging
  const solDisplay = (solLamports / 1e9).toFixed(4);
  const tokensDisplay = (tokenAmount / decimalsFactor).toExponential(2);
  console.log(`💰 ${solDisplay} SOL / ${tokensDisplay} tokens = ${price.toFixed(12)} SOL/token`);
  
  return price;
}

// ---------------------------------------------------------------------------
// OHLC candle builders & broadcast
// ---------------------------------------------------------------------------

const candles = [];
let currentCandle = null;

const broadcastServer = new WebSocketServer({ port: BROADCAST_PORT });
const broadcastClients = new Set();

broadcastServer.on('connection', socket => {
  broadcastClients.add(socket);
  socket.on('close', () => broadcastClients.delete(socket));
  socket.send(JSON.stringify({ type: 'hello', message: 'connected to pumpfun ohlc stream' }));
  // send existing candles for context
  candles.slice(-MAX_CANDLES).forEach(candle => {
    socket.send(JSON.stringify({ type: 'candle', event: 'snapshot', ...candle }));
  });
});

function broadcast(payload) {
  const data = JSON.stringify(payload);
  broadcastClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function updateOhlc(price, timestamp) {
  if (!Number.isFinite(price)) return;
  const now = timestamp;

  if (!currentCandle) {
    currentCandle = {
      type: 'candle',
      event: 'open',
      openTime: now,
      closeTime: now,
      open: price,
      high: price,
      low: price,
      close: price,
      intervalMs: OHLC_INTERVAL_MS
    };
    console.log(JSON.stringify(currentCandle));
    broadcast(currentCandle);
    return;
  }

  if (now - currentCandle.openTime >= OHLC_INTERVAL_MS) {
    currentCandle.closeTime = currentCandle.openTime + OHLC_INTERVAL_MS;
    const closedCandle = { ...currentCandle, event: 'close' };
    console.log(JSON.stringify(closedCandle));
    broadcast(closedCandle);
    candles.push(closedCandle);
    if (candles.length > MAX_CANDLES) candles.shift();

    currentCandle = {
      type: 'candle',
      event: 'open',
      openTime: now,
      closeTime: now,
      open: price,
      high: price,
      low: price,
      close: price,
      intervalMs: OHLC_INTERVAL_MS
    };
    console.log(JSON.stringify(currentCandle));
    broadcast(currentCandle);
    return;
  }

  currentCandle.high = Math.max(currentCandle.high, price);
  currentCandle.low = Math.min(currentCandle.low, price);
  currentCandle.close = price;
  currentCandle.closeTime = now;
  const updatePayload = { ...currentCandle, event: 'update' };
  console.log(JSON.stringify(updatePayload));
  broadcast(updatePayload);
}

function announcePrice(snapshot, price) {
  const payload = {
    type: 'tick',
    timestamp: Date.now(),
    price,
    decimals: trackingDecimals,
    mint: trackingMint,
    signature: trackingSignature,
    virtualTokenReserves: snapshot.virtualTokenReserves.toString(),
    virtualSolReserves: snapshot.virtualSolReserves.toString(),
    realTokenReserves: snapshot.realTokenReserves.toString(),
    realSolReserves: snapshot.realSolReserves.toString(),
    tokenTotalSupply: snapshot.tokenTotalSupply.toString(),
    complete: snapshot.complete ?? false
  };
  console.log(JSON.stringify(payload));
  broadcast(payload);
}

// ---------------------------------------------------------------------------
// Pumpfun log monitoring & bonding-curve subscription
// ---------------------------------------------------------------------------

let pumpfunWs;
let pumpfunSubscriptionId = null;
let trackingMint = null;
let trackingSignature = null;
let trackingDecimals = 6;
let trackingBondingCurve = null;
let accountWs = null;
let accountSubscriptionId = null;
let hasLockedTarget = false;

async function subscribeBondingCurveAccount(bondingCurve) {
  const initialValue = await waitForBondingCurveAccount(bondingCurve);
  if (!initialValue) {
    console.error('❌ Unable to observe bonding curve account. Exiting.');
    process.exit(2);
  }

  const initialSnapshot = parseBondingCurveAccount(initialValue);
  if (initialSnapshot) {
    const price = calculatePrice(initialSnapshot);
    if (price !== null) {
      announcePrice(initialSnapshot, price);
      updateOhlc(price, Date.now());
    }
  }

  const server = await rpcRotator.getNextServer();
  const wsEndpoint = server.replace('https://', 'wss://');
  const headers = rpcRotator.getHostHeader() ? { Host: rpcRotator.getHostHeader() } : undefined;

  accountWs = new WebSocket(wsEndpoint, { headers, perMessageDeflate: false });

  accountWs.on('open', () => {
    accountWs.send(JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'accountSubscribe',
      params: [bondingCurve.toBase58(), { commitment: 'processed', encoding: 'base64' }]
    }));
  });

  accountWs.on('message', raw => {
    try {
      const message = JSON.parse(raw.toString());
      if (message.id === 1 && message.result) {
        accountSubscriptionId = message.result;
        console.log(`📈 Subscribed to bonding curve updates via ${wsEndpoint}`);
        return;
      }
      if (message.method === 'accountNotification') {
        const accountValue = message.params?.result?.value;
        const snapshot = parseBondingCurveAccount(accountValue);
        if (!snapshot) return;
        const price = calculatePrice(snapshot);
        if (price === null) return;
        announcePrice(snapshot, price);
        updateOhlc(price, Date.now());
      }
    } catch (error) {
      console.error('❌ Account WS parse error:', error.message || error);
    }
  });

  accountWs.on('error', err => {
    console.error('❌ Account WS error:', err.message || err);
  });

  accountWs.on('close', () => {
    console.warn('⚠️ Account WS closed. No further updates will be received.');
  });
}

async function handleLogsNotification(message) {
  const { value } = message.params.result;

  if (!trackingMint) {
    if (!isNewPumpfunLaunch(value.logs)) return;

    console.log(`🚨 New Pumpfun launch detected! signature=${value.signature}`);

    const curveSnapshot = value.logs.map(parseBondingCurveSnapshotFromLog).find(Boolean);
    const mint = await resolveMintFromLogs(value.logs, value.signature);
    if (!mint) {
      console.warn('⚠️ Unable to resolve mint from logs – waiting for next launch');
      return;
    }

    trackingMint = mint;
    trackingSignature = value.signature;
    trackingDecimals = 6;
    const [bondingCurve] = deriveBondingCurvePDA(mint);
    trackingBondingCurve = bondingCurve;
    hasLockedTarget = true;

    console.log(`🎯 Tracking mint: ${mint}`);
    console.log(`📝 Mint transaction: ${value.signature}`);
    console.log(`🧮 Bonding curve PDA: ${bondingCurve.toBase58()}`);

    // Subscribe to bonding curve account updates for real-time price tracking
    subscribeBondingCurveAccount(bondingCurve);

    if (curveSnapshot) {
      const price = calculatePrice({ ...curveSnapshot, complete: false });
      if (price !== null) {
        announcePrice({ ...curveSnapshot, complete: false }, price);
        updateOhlc(price, Date.now());
      }
    }
    return;
  }

  if (!value.logs.some(log => log.includes(trackingMint))) {
    return;
  }

  const snapshot = value.logs.map(parseBondingCurveSnapshotFromLog).find(Boolean);
  if (!snapshot) return;
  const price = calculatePrice({ ...snapshot, complete: false });
  if (price === null) return;
  announcePrice({ ...snapshot, complete: false }, price);
  updateOhlc(price, Date.now());
}

function startPumpfunWebSocket() {
  pumpfunWs = new WebSocket(PUMPFUN_LOGS_WS, { perMessageDeflate: false });

  pumpfunWs.on('open', () => {
    console.log('✅ Connected to Pumpfun WebSocket');
    const payload = {
      jsonrpc: '2.0',
      id: 1,
      method: 'logsSubscribe',
      params: [
        { mentions: [PUMPFUN_PROGRAM_ID] },
        { commitment: 'processed' }
      ]
    };
    pumpfunWs.send(JSON.stringify(payload));
  });

  pumpfunWs.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.id === 1 && msg.result) {
        pumpfunSubscriptionId = msg.result;
        console.log(`📡 Subscribed to Pumpfun logs (subscriptionId=${pumpfunSubscriptionId})`);
        return;
      }
      if (msg.method === 'logsNotification') {
        handleLogsNotification(msg).catch(error => {
          console.error('❌ Pumpfun log handling error:', error.message || error);
        });
      }
    } catch (error) {
      console.error('❌ Pumpfun WS parse error:', error.message || error);
    }
  });

  pumpfunWs.on('close', () => {
    if (!hasLockedTarget) {
      console.warn('⚠️ Pumpfun WS closed before tracking any mint. Reconnecting...');
      setTimeout(startPumpfunWebSocket, 1000);
    }
  });

  pumpfunWs.on('error', err => {
    console.error('❌ Pumpfun WS error:', err.message || err);
  });
}

function stopAll() {
  if (pumpfunWs && pumpfunWs.readyState === WebSocket.OPEN && pumpfunSubscriptionId !== null) {
    pumpfunWs.send(JSON.stringify({ jsonrpc: '2.0', id: 99, method: 'logsUnsubscribe', params: [pumpfunSubscriptionId] }));
  }
  try {
    pumpfunWs?.close();
  } catch (_) {}

  if (accountWs && accountWs.readyState === WebSocket.OPEN && accountSubscriptionId !== null) {
    accountWs.send(JSON.stringify({ jsonrpc: '2.0', id: 199, method: 'accountUnsubscribe', params: [accountSubscriptionId] }));
  }
  try {
    accountWs?.close();
  } catch (_) {}

  broadcastServer.close();
  console.log('👋 Exiting monitor.');
  process.exit(0);
}

process.on('SIGINT', () => {
  console.log('\n⏹️  SIGINT received. Cleaning up...');
  stopAll();
});

console.log('🧪 Waiting for the first Pumpfun launch to build OHLC candles...');
console.log(`📡 Pumpfun WS endpoint: ${PUMPFUN_LOGS_WS}`);
console.log(`🌐 OHLC broadcast WebSocket: ws://localhost:${BROADCAST_PORT}`);
startPumpfunWebSocket();
