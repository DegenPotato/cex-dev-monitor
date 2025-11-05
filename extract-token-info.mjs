/**
 * Extract token metadata and analyze buy transactions
 * Uses database price oracle - no hardcoded prices
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Known Pumpfun discriminators
const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0', // 16-account buy (with creator fee)
  'e6345c8dd8b14540'  // 14-account buy (without creator fee)
];

const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad', // Sell discriminator
  // Add more if we discover them
];

let cachedSolPrice = null;

/**
 * Fetch SOL price from CoinGecko API
 */
async function fetchSolPrice() {
  try {
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    if (data.solana && data.solana.usd) {
      cachedSolPrice = data.solana.usd;
      return cachedSolPrice;
    }
  } catch (e) {
    console.warn('⚠️  Could not fetch SOL price from API');
  }
  return null;
}

/**
 * Get SOL price (cached from API)
 */
function getSolPrice() {
  return cachedSolPrice;
}

/**
 * Derive Metaplex metadata PDA
 */
function getMetadataPDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Get token metadata from on-chain account
 */
async function getTokenMetadata(tokenMint) {
  try {
    const metadataPDA = getMetadataPDA(tokenMint);
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    
    if (!accountInfo) return null;
    
    const data = accountInfo.data;
    let offset = 1 + 32 + 32; // Skip key, update authority, mint
    
    const nameLen = data.readUInt32LE(offset); offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, ''); offset += nameLen;
    
    const symbolLen = data.readUInt32LE(offset); offset += 4;
    const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, ''); offset += symbolLen;
    
    const uriLen = data.readUInt32LE(offset); offset += 4;
    const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '');
    
    let description = null, image = null;
    if (uri && uri.startsWith('http')) {
      try {
        const response = await fetch(uri);
        const json = await response.json();
        description = json.description || null;
        image = json.image || null;
      } catch (e) {}
    }
    
    return { 
      name: name.trim(), 
      symbol: symbol.trim(), 
      uri: uri.trim(), 
      description, 
      image 
    };
  } catch (error) {
    return null;
  }
}

/**
 * Analyze token and extract buy information
 */
async function analyzeToken(mintAddress) {
  const tokenMint = new PublicKey(mintAddress);
  
  console.log(`${'='.repeat(90)}`);
  console.log(`🔬 TOKEN ANALYSIS: ${tokenMint.toBase58()}`);
  console.log(`${'='.repeat(90)}\n`);
  
  // Get SOL price from oracle
  const solPrice = getSolPrice();
  if (solPrice) {
    console.log(`💵 SOL Price (from oracle): $${solPrice.toFixed(2)}\n`);
  } else {
    console.log(`⚠️  SOL price not available from oracle\n`);
  }
  
  // 1. Get metadata
  const metadata = await getTokenMetadata(tokenMint);
  if (metadata) {
    console.log(`📋 Token: ${metadata.symbol} - ${metadata.name}`);
    if (metadata.description) console.log(`📝 Description: ${metadata.description}`);
    if (metadata.image) console.log(`🖼️  Image: ${metadata.image}`);
    console.log();
  }
  
  // 2. Get all transactions
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 100 });
  console.log(`📊 Found ${signatures.length} transactions\n`);
  
  // 3. Analyze buy and sell transactions
  console.log(`${'─'.repeat(90)}`);
  console.log(`💰 TRANSACTIONS`);
  console.log(`${'─'.repeat(90)}\n`);
  
  let buyCount = 0;
  let sellCount = 0;
  const buys = [];
  const sells = [];
  
  for (let i = signatures.length - 1; i >= 0 && (buyCount + sellCount) < 10; i--) {
    const sig = signatures[i];
    
    const tx = await connection.getTransaction(sig.signature, {
      commitment: 'confirmed',
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.meta?.innerInstructions) continue;
    
    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys;
    
    if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
      const allKeys = [...accountKeys];
      if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
      accountKeys = allKeys;
    }
    
    const buyer = accountKeys[0];
    
    // Find Pumpfun buy instruction
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
        
        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
        
        const accounts = innerIx.accounts || [];
        const data = Buffer.from(innerIx.data, 'base64');
        
        // Detect buy or sell instruction
        if (data.length >= 24 && accounts.length >= 10) {
          const discriminator = data.slice(0, 8).toString('hex');
          
          const txInfo = {
            tx: sig.signature,
            time: new Date(sig.blockTime * 1000).toISOString(),
            trader: buyer.toBase58(),
            format: `${accounts.length}-account`,
            hasCreatorFee: accounts.length === 16,
            discriminator
          };
          
          // Determine buy/sell from token balance changes (GROUND TRUTH)
          let isBuy = false;
          let isSell = false;
          
          if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
            for (const post of tx.meta.postTokenBalances) {
              if (post.mint === tokenMint.toBase58()) {
                const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
                const postAmount = BigInt(post.uiTokenAmount.amount);
                const change = postAmount - preAmount;
                
                // Positive change = tokens increased = BUY
                // Negative change = tokens decreased = SELL
                if (change > 0n) {
                  isBuy = true;
                } else if (change < 0n) {
                  isSell = true;
                }
                break;
              }
            }
          }
          
          // Skip if we can't determine type
          if (!isBuy && !isSell) {
            continue;
          }
          
          // Increment counters
          if (isBuy) buyCount++;
          if (isSell) sellCount++;
          
          // Add type and number to txInfo
          txInfo.type = isBuy ? 'BUY' : 'SELL';
          txInfo.number = isBuy ? buyCount : sellCount;
          
          // Calculate actual SOL spent/received from balance changes
          if (tx.meta?.preBalances && tx.meta?.postBalances) {
            const traderIndex = 0; // Fee payer
            const solChange = tx.meta.preBalances[traderIndex] - tx.meta.postBalances[traderIndex];
            const solAmount = Math.abs(solChange) / 1e9;
            
            if (isBuy) {
              txInfo.solSpent = solAmount;
            } else {
              txInfo.solReceived = solAmount;
            }
          }
          
          // Calculate tokens bought/sold from token balance changes
          if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
            for (const post of tx.meta.postTokenBalances) {
              if (post.mint === tokenMint.toBase58()) {
                const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
                const postAmount = BigInt(post.uiTokenAmount.amount);
                const change = postAmount - preAmount;
                const absChange = change < 0n ? -change : change;
                
                if (absChange > 0n) {
                  const decimals = post.uiTokenAmount.decimals;
                  const tokenAmount = Number(absChange) / Math.pow(10, decimals);
                  
                  if (isBuy) {
                    txInfo.tokensReceived = tokenAmount;
                  } else {
                    txInfo.tokensSold = tokenAmount;
                  }
                  txInfo.decimals = decimals;
                  
                  // Calculate price per token
                  const solValue = isBuy ? txInfo.solSpent : txInfo.solReceived;
                  if (solValue) {
                    txInfo.pricePerToken = solValue / tokenAmount;
                    
                    // Calculate market cap if we have SOL price
                    if (solPrice) {
                      const tokenSupply = 1_000_000_000;
                      const marketCapUsd = (txInfo.pricePerToken * tokenSupply) * solPrice;
                      txInfo.marketCap = marketCapUsd;
                    }
                  }
                  break;
                }
              }
            }
          }
          
          // Add to appropriate array
          if (isBuy) {
            buys.push(txInfo);
          } else {
            sells.push(txInfo);
          }
          
          // Display transaction info
          const icon = isBuy ? '🟢' : '🔴';
          console.log(`${icon} ${txInfo.type} #${txInfo.number}:`);
          console.log(`   Time: ${txInfo.time}`);
          console.log(`   Trader: ${txInfo.trader}`);
          console.log(`   Tx: ${txInfo.tx}`);
          
          if (isBuy && txInfo.solSpent !== undefined) {
            console.log(`   SOL Spent: ${txInfo.solSpent.toFixed(6)} SOL`);
          } else if (isSell && txInfo.solReceived !== undefined) {
            console.log(`   SOL Received: ${txInfo.solReceived.toFixed(6)} SOL`);
          }
          
          if (txInfo.tokensReceived !== undefined) {
            console.log(`   Tokens Bought: ${txInfo.tokensReceived.toLocaleString()} tokens`);
          } else if (txInfo.tokensSold !== undefined) {
            console.log(`   Tokens Sold: ${txInfo.tokensSold.toLocaleString()} tokens`);
          }
          
          if (txInfo.pricePerToken !== undefined) {
            console.log(`   Price/Token: ${txInfo.pricePerToken.toExponential(6)} SOL`);
          }
          
          if (txInfo.marketCap !== undefined) {
            console.log(`   Market Cap: $${txInfo.marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
          }
          
          console.log(`   Format: ${txInfo.format} (${txInfo.hasCreatorFee ? 'WITH' : 'WITHOUT'} creator fee)`);
          console.log(`   Discriminator: ${txInfo.discriminator}`);
          console.log();
          
          break;
        }
      }
    }
  }
  
  if (buyCount === 0 && sellCount === 0) {
    console.log(`❌ No buy or sell transactions found\n`);
  } else {
    console.log(`${'─'.repeat(90)}`);
    console.log(`✅ Found ${buyCount} buy(s) and ${sellCount} sell(s)`);
    
    // Summary statistics
    const allTxs = [...buys, ...sells];
    if (allTxs.length > 0) {
      const withFee = allTxs.filter(t => t.hasCreatorFee).length;
      const withoutFee = allTxs.filter(t => !t.hasCreatorFee).length;
      
      console.log(`\n📊 Format Distribution:`);
      console.log(`   16-account (WITH fee): ${withFee} (${(withFee/allTxs.length*100).toFixed(1)}%)`);
      console.log(`   14-account (WITHOUT fee): ${withoutFee} (${(withoutFee/allTxs.length*100).toFixed(1)}%)`);
      
      // Buy volume
      if (buys.length > 0) {
        const totalBuyVol = buys.reduce((sum, b) => sum + (b.solSpent || 0), 0);
        console.log(`\n💰 Buy Volume:`);
        console.log(`   Total: ${totalBuyVol.toFixed(4)} SOL`);
        if (solPrice) {
          console.log(`   In USD: $${(totalBuyVol * solPrice).toLocaleString()}`);
        }
      }
      
      // Sell volume
      if (sells.length > 0) {
        const totalSellVol = sells.reduce((sum, s) => sum + (s.solReceived || 0), 0);
        console.log(`\n💸 Sell Volume:`);
        console.log(`   Total: ${totalSellVol.toFixed(4)} SOL`);
        if (solPrice) {
          console.log(`   In USD: $${(totalSellVol * solPrice).toLocaleString()}`);
        }
      }
    }
    
    console.log();
  }
  
  console.log(`${'='.repeat(90)}\n`);
  
  return { metadata, buys, sells };
}

// Run analysis
const testMint = process.argv[2] || 'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump';

(async () => {
  console.log('🔄 Fetching SOL price...\n');
  await fetchSolPrice();
  await analyzeToken(testMint);
})().catch(console.error);
