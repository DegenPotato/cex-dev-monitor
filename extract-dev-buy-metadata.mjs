/**
 * Extract token metadata and dev's initial buy amount from creation transaction
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

/**
 * Derive Metaplex metadata PDA
 */
function getMetadataPDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('metadata'),
      METADATA_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    METADATA_PROGRAM_ID
  );
  return pda;
}

/**
 * Parse Metaplex metadata for token info
 */
async function getTokenMetadata(tokenMint) {
  try {
    const metadataPDA = getMetadataPDA(tokenMint);
    const accountInfo = await connection.getAccountInfo(metadataPDA);
    
    if (!accountInfo) {
      return null;
    }
    
    const data = accountInfo.data;
    
    // Parse metadata (simplified)
    let offset = 1; // Skip key byte
    offset += 32; // Update authority
    offset += 32; // Mint
    
    // Name (string with 4-byte length prefix)
    const nameLen = data.readUInt32LE(offset);
    offset += 4;
    const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '');
    offset += nameLen;
    
    // Symbol (string with 4-byte length prefix)
    const symbolLen = data.readUInt32LE(offset);
    offset += 4;
    const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '');
    offset += symbolLen;
    
    // URI (string with 4-byte length prefix)
    const uriLen = data.readUInt32LE(offset);
    offset += 4;
    const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '');
    
    // Fetch JSON metadata from URI if available
    let description = 'N/A';
    let image = 'N/A';
    
    if (uri && uri.startsWith('http')) {
      try {
        const response = await fetch(uri);
        const json = await response.json();
        description = json.description || 'N/A';
        image = json.image || 'N/A';
      } catch (e) {
        // Silent fail
      }
    }
    
    return {
      name: name.trim(),
      symbol: symbol.trim(),
      uri: uri.trim(),
      description,
      image
    };
  } catch (error) {
    console.warn(`⚠️  Could not fetch metadata: ${error.message}`);
    return null;
  }
}

/**
 * Extract dev's buy amount from creation transaction
 */
async function extractDevBuyFromCreationTx(tokenMint) {
  console.log(`🔍 Analyzing creation transaction for ${tokenMint.toBase58()}\n`);
  
  // Get all transactions for the mint
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 100 });
  if (signatures.length === 0) {
    console.log('❌ No transactions found');
    return null;
  }
  
  // Creation tx is the oldest one
  const createSig = signatures[signatures.length - 1].signature;
  console.log(`📝 Creation tx: ${createSig}`);
  console.log(`⏰ Block time: ${new Date(signatures[signatures.length - 1].blockTime * 1000).toISOString()}\n`);
  
  const tx = await connection.getTransaction(createSig, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.log('❌ Could not fetch transaction');
    return null;
  }
  
  const message = tx.transaction.message;
  let accountKeys = message.staticAccountKeys;
  
  // Include loaded addresses
  if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
    const allKeys = [...accountKeys];
    if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
    if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
    accountKeys = allKeys;
  }
  
  // Identify the dev (fee payer)
  const dev = tx.transaction.message.staticAccountKeys[0]; // Fee payer is always first
  console.log(`👤 Dev wallet: ${dev.toBase58()}\n`);
  
  // Find Pumpfun buy instruction in inner instructions
  let devBuyData = null;
  
  if (tx.meta?.innerInstructions) {
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
        
        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
        
        const accounts = innerIx.accounts || [];
        const data = Buffer.from(innerIx.data, 'base64');
        
        // Check if this is a buy instruction (at least 24 bytes)
        if (data.length >= 24 && accounts.length >= 10) {
          const discriminator = data.slice(0, 8).toString('hex');
          const solAmount = data.readBigUInt64LE(8);
          const maxSolCost = data.readBigUInt64LE(16);
          
          devBuyData = {
            discriminator,
            solAmountLamports: solAmount,
            solAmount: Number(solAmount) / 1e9,
            maxSolCost: Number(maxSolCost) / 1e9,
            accountCount: accounts.length
          };
          
          console.log(`💰 Dev's Initial Buy:`);
          console.log(`   Discriminator: ${discriminator}`);
          console.log(`   SOL Amount: ${devBuyData.solAmount} SOL (${solAmount.toString()} lamports)`);
          console.log(`   Max SOL Cost: ${devBuyData.maxSolCost} SOL`);
          console.log(`   Account Count: ${accounts.length}`);
          break;
        }
      }
      if (devBuyData) break;
    }
  }
  
  // Get token balance changes to determine tokens received
  if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
    console.log(`\n📊 Token Balance Changes:`);
    
    // Find dev's token account
    for (const post of tx.meta.postTokenBalances) {
      const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
      const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
      const postAmount = BigInt(post.uiTokenAmount.amount);
      const change = postAmount - preAmount;
      
      if (change > 0n && post.mint === tokenMint.toBase58()) {
        const owner = accountKeys[post.accountIndex];
        const tokensReceived = Number(change) / Math.pow(10, post.uiTokenAmount.decimals);
        
        console.log(`   Account: ${accountKeys[post.accountIndex]?.toBase58() || 'Unknown'}`);
        console.log(`   Tokens Received: ${tokensReceived.toLocaleString()} tokens`);
        console.log(`   Raw Amount: ${change.toString()}`);
        console.log(`   Decimals: ${post.uiTokenAmount.decimals}`);
        
        if (devBuyData) {
          devBuyData.tokensReceived = tokensReceived;
          devBuyData.tokensRaw = change.toString();
          devBuyData.decimals = post.uiTokenAmount.decimals;
        }
      }
    }
  }
  
  // Calculate price per token
  if (devBuyData && devBuyData.tokensReceived) {
    devBuyData.pricePerToken = devBuyData.solAmount / devBuyData.tokensReceived;
    console.log(`\n💵 Price Analysis:`);
    console.log(`   Price per token: ${devBuyData.pricePerToken.toExponential(4)} SOL`);
    console.log(`   Market cap (if 1B supply): $${((devBuyData.pricePerToken * 1e9) * 150).toFixed(2)} (at $150/SOL)`);
  }
  
  return {
    dev: dev.toBase58(),
    createTx: createSig,
    blockTime: signatures[signatures.length - 1].blockTime,
    buyData: devBuyData
  };
}

/**
 * Complete analysis of a token
 */
async function analyzeToken(mintAddress) {
  const tokenMint = new PublicKey(mintAddress);
  
  console.log(`${'='.repeat(80)}`);
  console.log(`🔬 COMPLETE TOKEN ANALYSIS`);
  console.log(`${'='.repeat(80)}\n`);
  console.log(`Token Mint: ${tokenMint.toBase58()}\n`);
  
  // 1. Get metadata
  console.log(`📋 METADATA`);
  console.log(`${'─'.repeat(80)}`);
  const metadata = await getTokenMetadata(tokenMint);
  
  if (metadata) {
    console.log(`Name: ${metadata.name}`);
    console.log(`Symbol: ${metadata.symbol}`);
    console.log(`Description: ${metadata.description}`);
    console.log(`Image: ${metadata.image}`);
    console.log(`URI: ${metadata.uri}`);
  } else {
    console.log(`⚠️  Could not fetch metadata`);
  }
  
  // 2. Extract dev buy
  console.log(`\n\n💰 DEV'S INITIAL BUY`);
  console.log(`${'─'.repeat(80)}`);
  const devBuy = await extractDevBuyFromCreationTx(tokenMint);
  
  // 3. Summary
  console.log(`\n\n✨ SUMMARY`);
  console.log(`${'='.repeat(80)}`);
  
  if (metadata && devBuy && devBuy.buyData) {
    console.log(`\nToken: ${metadata.symbol} (${metadata.name})`);
    console.log(`Dev: ${devBuy.dev}`);
    console.log(`Initial Buy: ${devBuy.buyData.solAmount} SOL → ${devBuy.buyData.tokensReceived?.toLocaleString() || 'N/A'} tokens`);
    console.log(`Initial Price: ${devBuy.buyData.pricePerToken?.toExponential(4) || 'N/A'} SOL/token`);
    console.log(`Format: ${devBuy.buyData.accountCount}-account (${devBuy.buyData.accountCount === 16 ? 'WITH' : 'WITHOUT'} creator fee)`);
    console.log(`\nCreated: ${new Date(devBuy.blockTime * 1000).toISOString()}`);
    console.log(`Tx: ${devBuy.createTx}`);
  }
  
  console.log(`\n${'='.repeat(80)}\n`);
  
  return {
    metadata,
    devBuy
  };
}

// Test with your token or provide as argument
const testMint = process.argv[2] || 'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump';

analyzeToken(testMint).catch(console.error);
