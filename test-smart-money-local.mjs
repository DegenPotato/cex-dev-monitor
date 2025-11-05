/**
 * Local Smart Money Tracker Test
 * Catches ONE token and monitors it in real-time
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

// Known discriminators
const BUY_DISCRIMINATORS = ['0094d0da1f435eb0', 'e6345c8dd8b14540'];
const SELL_DISCRIMINATORS = ['33e685a4017f83ad'];

// Gas wallet blacklist
const GAS_WALLET_BLACKLIST = ['CgPfjJEeUHFcr1cXnpkZM9wWGB5RV9m2mjyrwYrhAJWK'];

// Minimum tokens threshold
const MIN_TOKEN_THRESHOLD = 5_000_000;

// Tracked positions (wallet-token pairs)
const positions = new Map();

// Token we're tracking
let trackedToken = null;
let monitoring = false;

/**
 * Fetch SOL price from Jupiter
 */
async function fetchSolPrice() {
  try {
    const response = await fetch('https://lite-api.jup.ag/price/v3?ids=So11111111111111111111111111111111111111112');
    const data = await response.json();
    const solData = data['So11111111111111111111111111111111111111112'];
    if (solData?.usdPrice) {
      return parseFloat(solData.usdPrice);
    }
  } catch (e) {
    console.error('❌ Could not fetch SOL price:', e.message);
  }
  return null;
}

/**
 * Fetch token USD price from Jupiter
 */
async function fetchTokenPrice(tokenMint, solPrice) {
  try {
    const response = await fetch(`https://lite-api.jup.ag/price/v3?ids=${tokenMint},So11111111111111111111111111111111111111112`);
    const data = await response.json();
    
    const tokenData = data[tokenMint];
    const solData = data['So11111111111111111111111111111111111111112'];
    
    if (tokenData?.usdPrice && solData?.usdPrice) {
      const tokenUsdPrice = parseFloat(tokenData.usdPrice);
      const solUsdPrice = parseFloat(solData.usdPrice);
      const priceInSol = tokenUsdPrice / solUsdPrice;
      
      return {
        priceInSol,
        priceInUsd: tokenUsdPrice,
        solPrice: solUsdPrice
      };
    }
  } catch (e) {}
  return null;
}

/**
 * Get token metadata from Metaplex
 */
async function getTokenMetadata(tokenMint) {
  try {
    const mintPubkey = new PublicKey(tokenMint);
    
    // Get mint info for total supply
    const mintInfo = await connection.getAccountInfo(mintPubkey);
    let totalSupply = 1_000_000_000; // Default for Pumpfun
    let decimals = 6;
    
    if (mintInfo && mintInfo.data.length >= 82) {
      const supply = mintInfo.data.readBigUInt64LE(36);
      decimals = mintInfo.data.readUInt8(44);
      totalSupply = Number(supply) / Math.pow(10, decimals);
    }
    
    // Get Metaplex metadata
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mintPubkey.toBuffer()],
      METADATA_PROGRAM_ID
    );
    
    const metadataAccount = await connection.getAccountInfo(metadataPDA);
    
    if (metadataAccount && metadataAccount.data.length > 0) {
      const data = metadataAccount.data;
      let offset = 1 + 32 + 32; // key + update authority + mint
      
      const nameLen = data.readUInt32LE(offset); offset += 4;
      const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim(); offset += nameLen;
      
      const symbolLen = data.readUInt32LE(offset); offset += 4;
      const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim(); offset += symbolLen;
      
      const uriLen = data.readUInt32LE(offset); offset += 4;
      const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '').trim();
      
      let logo = null;
      if (uri && uri.startsWith('http')) {
        try {
          const uriResponse = await fetch(uri);
          const uriData = await uriResponse.json();
          logo = uriData.image || uriData.logo;
        } catch {}
      }
      
      return { name, symbol, logo, totalSupply, decimals };
    }
    
    return { totalSupply, decimals };
  } catch (e) {
    console.error('❌ Error fetching metadata:', e.message);
    return { totalSupply: 1_000_000_000, decimals: 6 };
  }
}

/**
 * Display position summary
 */
function displayPositions() {
  console.clear();
  console.log('\n' + '='.repeat(100));
  console.log(`📊 SMART MONEY TRACKER - ${trackedToken.symbol || trackedToken.mint.slice(0, 8)}`);
  console.log('='.repeat(100));
  
  if (trackedToken.name) console.log(`📋 Token: ${trackedToken.symbol} - ${trackedToken.name}`);
  if (trackedToken.logo) console.log(`🖼️  Logo: ${trackedToken.logo}`);
  console.log(`🪙 Total Supply: ${trackedToken.totalSupply.toLocaleString()} tokens`);
  
  if (trackedToken.currentPrice) {
    console.log(`\n💵 Current Price: ${(trackedToken.currentPrice * 1e9).toFixed(6)} SOL/B`);
    if (trackedToken.currentPriceUsd) {
      console.log(`💰 Current Price USD: $${trackedToken.currentPriceUsd.toFixed(8)}`);
    }
    if (trackedToken.marketCapUsd) {
      console.log(`📈 Market Cap: $${(trackedToken.marketCapUsd / 1000).toFixed(2)}K (${trackedToken.marketCapSol.toFixed(2)} SOL)`);
    }
  }
  
  console.log('\n' + '─'.repeat(100));
  console.log(`👥 POSITIONS (${positions.size} wallets tracking)`);
  console.log('─'.repeat(100));
  
  const sortedPositions = Array.from(positions.values()).sort((a, b) => b.totalPnl - a.totalPnl);
  
  for (const pos of sortedPositions.slice(0, 10)) {
    const pnlColor = pos.totalPnl >= 0 ? '\x1b[32m' : '\x1b[31m';
    const reset = '\x1b[0m';
    
    console.log(`\n🔹 Wallet: ${pos.walletAddress.slice(0, 8)}...${pos.walletAddress.slice(-4)}`);
    console.log(`   Buys: ${pos.buyCount} | Sells: ${pos.sellCount} | Holding: ${pos.currentHolding.toLocaleString()} tokens`);
    console.log(`   Entry: ${(pos.avgBuyPrice * 1e9).toFixed(6)} SOL/B | Cost: ${pos.totalSolSpent.toFixed(4)} SOL`);
    
    if (pos.isActive && pos.currentHolding > 0) {
      console.log(`   ${pnlColor}Unrealized P&L: ${pos.unrealizedPnl >= 0 ? '+' : ''}${pos.unrealizedPnl.toFixed(4)} SOL (${pos.unrealizedPnlPercent.toFixed(2)}%)${reset}`);
    }
    
    if (pos.realizedPnl !== 0) {
      console.log(`   Realized P&L: ${pos.realizedPnl >= 0 ? '+' : ''}${pos.realizedPnl.toFixed(4)} SOL (${pos.realizedPnlPercent.toFixed(2)}%)`);
    }
    
    console.log(`   ${pnlColor}Total P&L: ${pos.totalPnl >= 0 ? '+' : ''}${pos.totalPnl.toFixed(4)} SOL (${pos.totalPnlPercent.toFixed(2)}%)${reset}`);
  }
  
  console.log('\n' + '='.repeat(100));
  console.log(`⏰ Last Update: ${new Date().toLocaleTimeString()}`);
  console.log('='.repeat(100) + '\n');
}

/**
 * Handle a buy transaction
 */
async function handleBuy(signature, tokenMint, tx) {
  if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return;
  
  let tokensBought = 0;
  let decimals = 6;
  let walletAddress = null;
  
  for (const post of tx.meta.postTokenBalances) {
    if (post.mint === tokenMint) {
      const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      
      if (change > 0n) {
        decimals = post.uiTokenAmount.decimals;
        tokensBought = Number(change) / Math.pow(10, decimals);
        walletAddress = post.owner;
        break;
      }
    }
  }
  
  if (!walletAddress || GAS_WALLET_BLACKLIST.includes(walletAddress)) return;
  if (tokensBought < MIN_TOKEN_THRESHOLD) return;
  
  // Calculate SOL spent
  const solChange = tx.meta.preBalances[0] - tx.meta.postBalances[0];
  const solSpent = solChange / 1e9;
  const buyPrice = solSpent / tokensBought;
  
  // Find or create position
  const positionId = `${walletAddress}-${tokenMint}`;
  let position = positions.get(positionId);
  
  if (!position) {
    position = {
      id: positionId,
      walletAddress,
      tokenMint,
      trades: [],
      buyCount: 0,
      sellCount: 0,
      totalTokensBought: 0,
      totalTokensSold: 0,
      totalSolSpent: 0,
      totalSolReceived: 0,
      avgBuyPrice: 0,
      avgSellPrice: 0,
      currentHolding: 0,
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      realizedPnl: 0,
      realizedPnlPercent: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      isActive: true
    };
    positions.set(positionId, position);
  }
  
  // Add trade
  position.trades.push({
    tx: signature,
    time: tx.blockTime * 1000,
    type: 'buy',
    tokens: tokensBought,
    sol: solSpent,
    price: buyPrice
  });
  
  // Update stats
  position.buyCount++;
  position.totalTokensBought += tokensBought;
  position.totalSolSpent += solSpent;
  position.currentHolding += tokensBought;
  position.avgBuyPrice = position.totalSolSpent / position.totalTokensBought;
  position.isActive = position.currentHolding > 0.01;
  
  console.log(`🟢 BUY - ${walletAddress.slice(0, 8)} bought ${tokensBought.toLocaleString()} tokens for ${solSpent.toFixed(4)} SOL`);
  
  displayPositions();
}

/**
 * Handle a sell transaction
 */
async function handleSell(signature, tokenMint, tx) {
  if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return;
  
  let tokensSold = 0;
  let decimals = 6;
  let walletAddress = null;
  
  for (const post of tx.meta.postTokenBalances) {
    if (post.mint === tokenMint) {
      const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const change = preAmount - postAmount;
      
      if (change > 0n) {
        decimals = post.uiTokenAmount.decimals;
        tokensSold = Number(change) / Math.pow(10, decimals);
        walletAddress = post.owner;
        break;
      }
    }
  }
  
  if (!walletAddress || GAS_WALLET_BLACKLIST.includes(walletAddress)) return;
  if (tokensSold <= 0) return;
  
  // Find position
  const positionId = `${walletAddress}-${tokenMint}`;
  const position = positions.get(positionId);
  
  if (!position) {
    console.log(`⚠️ Sell detected but no position found for ${walletAddress.slice(0, 8)}`);
    return;
  }
  
  // Calculate SOL received
  const solChange = tx.meta.postBalances[0] - tx.meta.preBalances[0];
  const solReceived = solChange / 1e9;
  const sellPrice = solReceived / tokensSold;
  
  // Add trade
  position.trades.push({
    tx: signature,
    time: tx.blockTime * 1000,
    type: 'sell',
    tokens: tokensSold,
    sol: solReceived,
    price: sellPrice
  });
  
  // Update stats
  position.sellCount++;
  position.totalTokensSold += tokensSold;
  position.totalSolReceived += solReceived;
  position.currentHolding -= tokensSold;
  position.avgSellPrice = position.totalSolReceived / position.totalTokensSold;
  
  // Calculate realized P&L
  position.realizedPnl = position.totalSolReceived - (position.avgBuyPrice * position.totalTokensSold);
  position.realizedPnlPercent = position.totalSolSpent > 0 ? (position.realizedPnl / position.totalSolSpent) * 100 : 0;
  
  // Update active status
  position.isActive = position.currentHolding > 0.01;
  
  console.log(`🔴 SELL - ${walletAddress.slice(0, 8)} sold ${tokensSold.toLocaleString()} tokens for ${solReceived.toFixed(4)} SOL`);
  
  displayPositions();
}

/**
 * Update prices for all positions
 */
async function updatePrices() {
  if (!trackedToken) return;
  
  const prices = await fetchTokenPrice(trackedToken.mint, trackedToken.solPrice);
  if (!prices) return;
  
  trackedToken.currentPrice = prices.priceInSol;
  trackedToken.currentPriceUsd = prices.priceInUsd;
  trackedToken.solPrice = prices.solPrice;
  
  if (trackedToken.totalSupply) {
    trackedToken.marketCapUsd = trackedToken.totalSupply * prices.priceInUsd;
    trackedToken.marketCapSol = trackedToken.totalSupply * prices.priceInSol;
  }
  
  // Update all position P&Ls
  for (const position of positions.values()) {
    if (!position.isActive || position.currentHolding <= 0) continue;
    
    const currentValue = position.currentHolding * prices.priceInSol;
    const costBasis = position.currentHolding * position.avgBuyPrice;
    position.unrealizedPnl = currentValue - costBasis;
    position.unrealizedPnlPercent = costBasis > 0 ? (position.unrealizedPnl / costBasis) * 100 : 0;
    
    position.totalPnl = position.realizedPnl + position.unrealizedPnl;
    position.totalPnlPercent = position.totalSolSpent > 0 ? (position.totalPnl / position.totalSolSpent) * 100 : 0;
  }
  
  displayPositions();
}

/**
 * Process a transaction
 */
async function processTransaction(signature) {
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
    
    // Find Pumpfun instructions
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
        
        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
        
        const data = Buffer.from(innerIx.data, 'base64');
        if (data.length < 24) continue;
        
        const discriminator = data.slice(0, 8).toString('hex');
        
        // Find token mint (look for .pump ending)
        let tokenMint = null;
        for (const account of innerIx.accounts || []) {
          if (account >= accountKeys.length) continue;
          const addr = accountKeys[account].toBase58();
          if (addr.endsWith('pump')) {
            tokenMint = addr;
            break;
          }
        }
        
        if (!tokenMint) continue;
        
        // If we're not tracking yet, start tracking this token
        if (!trackedToken) {
          console.log(`\n🎯 Found new token: ${tokenMint}`);
          console.log(`📥 Fetching metadata...\n`);
          
          const metadata = await getTokenMetadata(tokenMint);
          const solPrice = await fetchSolPrice();
          
          trackedToken = {
            mint: tokenMint,
            ...metadata,
            solPrice,
            currentPrice: null,
            currentPriceUsd: null,
            marketCapUsd: null,
            marketCapSol: null
          };
          
          console.log(`✅ Now tracking: ${trackedToken.symbol || tokenMint.slice(0, 8)}`);
          console.log(`🔄 Monitoring transactions...\n`);
          
          // Start price updates
          setInterval(updatePrices, 3000);
          
          monitoring = true;
        }
        
        // Only process transactions for our tracked token
        if (tokenMint !== trackedToken.mint) continue;
        
        // Determine buy or sell
        const isBuy = BUY_DISCRIMINATORS.includes(discriminator);
        const isSell = SELL_DISCRIMINATORS.includes(discriminator);
        
        if (isBuy) {
          await handleBuy(signature, tokenMint, tx);
        } else if (isSell) {
          await handleSell(signature, tokenMint, tx);
        }
      }
    }
  } catch (e) {
    console.error('❌ Error processing transaction:', e.message);
  }
}

/**
 * Main monitoring loop
 */
async function main() {
  console.log('🚀 Smart Money Tracker - Local Test');
  console.log('📡 Monitoring Pumpfun for new tokens...\n');
  
  let lastSignature = null;
  
  while (true) {
    try {
      const signatures = await connection.getSignaturesForAddress(
        PUMPFUN_PROGRAM_ID,
        { limit: 10, before: lastSignature }
      );
      
      if (signatures.length > 0) {
        lastSignature = signatures[0].signature;
        
        for (const sig of signatures.reverse()) {
          await processTransaction(sig.signature);
          
          // Stop looking for new tokens after we found one
          if (trackedToken && !monitoring) break;
        }
      }
      
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (e) {
      console.error('❌ Error in main loop:', e.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

main().catch(console.error);
