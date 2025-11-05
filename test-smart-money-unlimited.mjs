import { Connection } from '@solana/web3.js';
import { config } from 'dotenv';

config();

// Your private Triton endpoint - UNLIMITED mode
const RPC_URL = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

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

// Track positions (wallet-token -> position data)
const positions = new Map();
let buyCount = 0;
let sellCount = 0;
let metadataCount = 0;

console.log('🎯 Smart Money Tracker - UNLIMITED MODE');
console.log(`📡 RPC: ${RPC_URL.slice(0, 50)}...`);
console.log(`🚀 No rate limits, pure WebSocket monitoring`);
console.log(`⚡ Threshold: ${THRESHOLD.toLocaleString()} tokens`);
console.log('Waiting for transactions...\n');

// Single persistent WebSocket connection
const connection = new Connection(RPC_URL, {
  commitment: 'confirmed',
  wsEndpoint: RPC_URL.replace('https://', 'wss://').replace('http://', 'ws://')
});

// Extract token info from instruction data
function extractTokenFromInstruction(data) {
  try {
    if (data.length < 40) return null;
    
    // Skip discriminator (8 bytes)
    const tokenBytes = data.slice(8, 40);
    return tokenBytes.toString('base64');
  } catch {
    return null;
  }
}

// Extract token amount from instruction
function extractTokenAmount(data) {
  try {
    if (data.length < 48) return 0;
    // Amount is usually at offset 40 (8-byte u64)
    return Number(data.readBigUInt64LE(40));
  } catch {
    return 0;
  }
}

// Extract metadata from Metaplex account (async)
async function fetchMetadata(tokenMint) {
  try {
    const { PublicKey } = await import('@solana/web3.js');
    const mintPubkey = new PublicKey(tokenMint);
    const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
    
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        METADATA_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer()
      ],
      METADATA_PROGRAM_ID
    );

    const accountInfo = await connection.getAccountInfo(metadataPDA);
    if (!accountInfo) return null;

    const data = accountInfo.data;
    let offset = 1 + 32 + 32; // key + update authority + mint

    // Read name
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim();
    offset += nameLen;

    // Read symbol
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim();

    return { name, symbol };
  } catch (error) {
    return null;
  }
}

// Monitor via WebSocket
connection.onLogs(
  { mentions: [PUMPFUN_PROGRAM_ID] },
  async ({ logs, err, signature }) => {
    if (err) return;

    try {
      const logStr = logs.join('|');
      const isBuy = BUY_DISCRIMINATORS.some(d => logStr.includes(d));
      const isSell = SELL_DISCRIMINATORS.some(d => logStr.includes(d));

      if (!isBuy && !isSell) return;

      // Fetch full transaction (NO RATE LIMITING)
      const tx = await connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

      if (!tx) return;

      const walletAddress = tx.transaction.message.staticAccountKeys[0]?.toBase58();
      if (!walletAddress) return;

      // Find Pumpfun instruction
      const pumpfunIx = tx.transaction.message.compiledInstructions.find(ix => {
        const programId = tx.transaction.message.staticAccountKeys[ix.programIdIndex];
        return programId?.toBase58() === PUMPFUN_PROGRAM_ID;
      });

      if (!pumpfunIx) return;

      const tokenMint = tx.transaction.message.staticAccountKeys[pumpfunIx.accountKeyIndexes[2]]?.toBase58();
      if (!tokenMint) return;

      const positionId = `${walletAddress}-${tokenMint}`;

      if (isBuy) {
        const data = Buffer.from(pumpfunIx.data);
        const tokens = extractTokenAmount(data);

        if (tokens <= 0) return;

        // Check threshold only for NEW positions
        if (!positions.has(positionId)) {
          if (tokens < THRESHOLD) {
            return; // Skip, doesn't meet threshold
          }

          // Create new position
          positions.set(positionId, {
            wallet: walletAddress,
            token: tokenMint,
            buyCount: 0,
            sellCount: 0,
            totalTokens: 0,
            firstBuy: Date.now(),
            symbol: null
          });

          console.log(`🆕 NEW POSITION | Wallet: ${walletAddress.slice(0, 8)} | Token: ${tokenMint.slice(0, 8)}`);

          // Fetch metadata async
          fetchMetadata(tokenMint).then(metadata => {
            if (metadata) {
              const pos = positions.get(positionId);
              if (pos) {
                pos.symbol = metadata.symbol;
                metadataCount++;
                console.log(`   ✅ Metadata: ${metadata.symbol} (${metadata.name})`);
              }
            }
          });
        }

        const position = positions.get(positionId);
        position.buyCount++;
        position.totalTokens += tokens;
        buyCount++;

        console.log(`💰 BUY #${buyCount} | ${position.symbol || tokenMint.slice(0, 8)} | Wallet: ${walletAddress.slice(0, 8)} | Tokens: ${tokens.toLocaleString()} | Position buys: ${position.buyCount}`);

      } else if (isSell) {
        const position = positions.get(positionId);
        
        if (!position) {
          console.log(`⚠️  SELL IGNORED | No position | Wallet: ${walletAddress.slice(0, 8)} | Token: ${tokenMint.slice(0, 8)}`);
          return;
        }

        position.sellCount++;
        sellCount++;

        console.log(`🔴 SELL #${sellCount} | ${position.symbol || tokenMint.slice(0, 8)} | Wallet: ${walletAddress.slice(0, 8)} | Position sells: ${position.sellCount} | Total buys: ${position.buyCount}`);
      }

    } catch (error) {
      console.error(`❌ Error processing ${signature}: ${error.message}`);
    }
  },
  'confirmed'
);

// Stats every 30 seconds
setInterval(() => {
  console.log(`\n📊 STATS | Positions: ${positions.size} | Buys: ${buyCount} | Sells: ${sellCount} | Metadata: ${metadataCount}\n`);
}, 30000);

console.log('✅ WebSocket listener active...\n');
