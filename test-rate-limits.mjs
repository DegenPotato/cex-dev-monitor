import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';

config();

const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const BUY_DISCRIMINATORS = ['0094d0da1f435eb0', 'e6345c8dd8b14540', '48feac982b20e013', '00b08712a8402815'];
const SELL_DISCRIMINATORS = ['33e685a4017f83ad', 'db0d98c38ed07cfd'];
const THRESHOLD = 5_000_000;

// Track positions
const positions = new Map();
let txCount = 0;
let buyCount = 0;
let sellCount = 0;
let metadataCount = 0;
let rpcErrors = 0;
let rateLimitErrors = 0;

console.log('🎯 Smart Money Tracker - Rate Limit Test');
console.log(`📡 RPC: ${RPC_URL.slice(0, 60)}...`);
console.log(`⚡ Threshold: ${THRESHOLD.toLocaleString()} tokens\n`);

// Direct connection (same as SmartMoneyTracker)
const connection = new Connection(RPC_URL, 'confirmed');

// Extract metadata from Metaplex
async function extractMetadata(tokenMint) {
  try {
    const mintPubkey = new PublicKey(tokenMint);
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      METADATA_PROGRAM_ID
    );

    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    let offset = 1 + 32 + 32;
    
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim();
    offset += nameLen;
    
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim();
    
    return { name, symbol };
  } catch (error) {
    if (error.message?.includes('429')) {
      rateLimitErrors++;
      console.error(`❌ RATE LIMIT on metadata fetch: ${error.message}`);
    }
    return null;
  }
}

// Process transaction (exact SmartMoneyTracker logic)
async function processTransaction(signature) {
  try {
    txCount++;
    console.log(`🔍 [TX ${txCount}] Fetching: ${signature.slice(0, 12)}...`);
    
    const tx = await connection.getTransaction(signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });

    if (!tx) {
      console.log(`   ⚠️  Transaction not found or null`);
      return;
    }
    
    if (!tx.meta?.innerInstructions) {
      console.log(`   ⚠️  No inner instructions`);
      return;
    }

    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys;

    if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
      const allKeys = [...accountKeys];
      if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
      accountKeys = allKeys;
    }

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

        if (!isBuy && !isSell) {
          console.log(`   ⚠️  Unknown discriminator: ${discriminator}`);
          continue;
        }
        
        console.log(`   ✅ Pumpfun IX detected | Type: ${isBuy ? 'BUY' : 'SELL'} | Discriminator: ${discriminator}`);

        const accounts = innerIx.accounts || [];
        if (accounts.length < 3) continue;

        const tokenMint = accountKeys[accounts[2]].toBase58();
        const walletAddress = accountKeys[0].toBase58();

        if (isBuy) {
          await handleBuy(signature, tokenMint, walletAddress, data);
        } else if (isSell) {
          await handleSell(signature, tokenMint, walletAddress);
        }
      }
    }
  } catch (error) {
    rpcErrors++;
    if (error.message?.includes('429')) {
      rateLimitErrors++;
      console.error(`❌ RATE LIMIT ERROR: ${error.message}`);
    } else {
      console.error(`❌ RPC Error: ${error.message}`);
    }
  }
}

// Handle buy (exact SmartMoneyTracker logic)
async function handleBuy(signature, tokenMint, walletAddress, data) {
  try {
    const tokenAmount = data.length >= 48 ? Number(data.readBigUInt64LE(40)) : 0;
    
    console.log(`      💰 Processing BUY | Wallet: ${walletAddress.slice(0, 8)} | Token: ${tokenMint.slice(0, 8)} | Tokens: ${tokenAmount.toLocaleString()}`);
    
    if (tokenAmount <= 0) {
      console.log(`         ⚠️  Invalid token amount: ${tokenAmount}`);
      return;
    }

    const positionId = `${walletAddress}-${tokenMint}`;
    let position = positions.get(positionId);

    if (!position) {
      if (tokenAmount < THRESHOLD) {
        console.log(`         ⚠️  Below threshold (${THRESHOLD.toLocaleString()}), skipping`);
        return;
      }

      position = {
        wallet: walletAddress,
        token: tokenMint,
        buyCount: 0,
        sellCount: 0,
        totalTokens: 0,
        symbol: null,
        created: Date.now()
      };
      positions.set(positionId, position);

      console.log(`         🆕 NEW POSITION CREATED | ID: ${positionId.slice(0, 20)}...`);
      console.log(`         🔍 Fetching metadata for ${tokenMint.slice(0, 8)}...`);

      // Fetch metadata async
      extractMetadata(tokenMint).then(metadata => {
        if (metadata) {
          position.symbol = metadata.symbol;
          metadataCount++;
          console.log(`         ✅ Metadata extracted: ${metadata.symbol} (${metadata.name})`);
        } else {
          console.log(`         ❌ No metadata found for ${tokenMint.slice(0, 8)}`);
        }
      }).catch(err => {
        console.error(`         ❌ Metadata fetch failed: ${err.message}`);
      });
    }

    position.buyCount++;
    position.totalTokens += tokenAmount;
    buyCount++;

    console.log(`         ✅ BUY RECORDED | Total: ${buyCount} | Position: ${position.buyCount} buys | Total tokens: ${position.totalTokens.toLocaleString()}`);
  } catch (error) {
    console.error(`Error in handleBuy: ${error.message}`);
  }
}

// Handle sell (exact SmartMoneyTracker logic)
async function handleSell(signature, tokenMint, walletAddress) {
  try {
    console.log(`      🔴 Processing SELL | Wallet: ${walletAddress.slice(0, 8)} | Token: ${tokenMint.slice(0, 8)}`);
    
    const positionId = `${walletAddress}-${tokenMint}`;
    const position = positions.get(positionId);

    if (!position) {
      console.log(`         ⚠️  SELL IGNORED - No position found`);
      console.log(`         Wallet: ${walletAddress}`);
      console.log(`         Token: ${tokenMint}`);
      console.log(`         Expected Position ID: ${positionId}`);
      console.log(`         Tracked positions: ${positions.size}`);
      
      // Debug: Show similar positions
      const similarPositions = Array.from(positions.values()).filter(p => 
        p.wallet === walletAddress || p.token === tokenMint
      );
      if (similarPositions.length > 0) {
        console.log(`         📋 Similar positions found (${similarPositions.length}):`);
        similarPositions.slice(0, 3).forEach(p => {
          console.log(`            ${p.wallet.slice(0, 8)}-${p.token.slice(0, 8)} (wallet match: ${p.wallet === walletAddress}, token match: ${p.token === tokenMint})`);
        });
      }
      return;
    }

    position.sellCount++;
    sellCount++;

    console.log(`         ✅ SELL RECORDED | Total: ${sellCount} | Position: ${position.sellCount} sells | ${position.buyCount} buys | Symbol: ${position.symbol || 'unknown'}`);
  } catch (error) {
    console.error(`Error in handleSell: ${error.message}`);
  }
}

// Start WebSocket monitoring (exact SmartMoneyTracker approach)
console.log('📡 Starting WebSocket subscription...');

const subscriptionId = connection.onLogs(
  PUMPFUN_PROGRAM_ID,
  async (logs) => {
    const signature = logs.signature;
    await processTransaction(signature);
  },
  'confirmed'
);

console.log(`✅ WebSocket subscribed (ID: ${subscriptionId})\n`);

// Stats every 30 seconds
setInterval(() => {
  console.log(`\n📊 STATS | TXs: ${txCount} | Positions: ${positions.size} | Buys: ${buyCount} | Sells: ${sellCount} | Metadata: ${metadataCount}`);
  console.log(`⚠️  ERRORS | RPC: ${rpcErrors} | Rate Limits: ${rateLimitErrors}\n`);
}, 30000);
