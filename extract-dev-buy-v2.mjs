/**
 * Extract dev's buy from FIRST buy transaction (not creation)
 */

import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');

function getMetadataPDA(mint) {
  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from('metadata'), METADATA_PROGRAM_ID.toBuffer(), mint.toBuffer()],
    METADATA_PROGRAM_ID
  );
  return pda;
}

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
    
    let description = 'N/A', image = 'N/A';
    if (uri && uri.startsWith('http')) {
      try {
        const response = await fetch(uri);
        const json = await response.json();
        description = json.description || 'N/A';
        image = json.image || 'N/A';
      } catch (e) {}
    }
    
    return { name: name.trim(), symbol: symbol.trim(), uri: uri.trim(), description, image };
  } catch (error) {
    return null;
  }
}

async function analyzeToken(mintAddress) {
  const tokenMint = new PublicKey(mintAddress);
  
  console.log(`${'='.repeat(90)}`);
  console.log(`🔬 TOKEN ANALYSIS: ${tokenMint.toBase58()}`);
  console.log(`${'='.repeat(90)}\n`);
  
  // 1. Get metadata
  const metadata = await getTokenMetadata(tokenMint);
  if (metadata) {
    console.log(`📋 Token: ${metadata.symbol} - ${metadata.name}`);
    console.log(`📝 Description: ${metadata.description}`);
    console.log(`🖼️  Image: ${metadata.image}\n`);
  }
  
  // 2. Get all transactions
  const signatures = await connection.getSignaturesForAddress(tokenMint, { limit: 100 });
  console.log(`📊 Found ${signatures.length} transactions\n`);
  
  // 3. Analyze each buy transaction
  console.log(`${'─'.repeat(90)}`);
  console.log(`💰 BUY TRANSACTIONS ANALYSIS`);
  console.log(`${'─'.repeat(90)}\n`);
  
  let buyCount = 0;
  
  for (let i = signatures.length - 1; i >= 0 && buyCount < 5; i--) {
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
    
    const buyer = accountKeys[0]; // Fee payer
    
    // Find Pumpfun buy instruction
    for (const innerGroup of tx.meta.innerInstructions) {
      for (const innerIx of innerGroup.instructions) {
        const programIdIndex = innerIx.programIdIndex;
        if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;
        
        const programId = accountKeys[programIdIndex];
        if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;
        
        const accounts = innerIx.accounts || [];
        const data = Buffer.from(innerIx.data, 'base64');
        
        // Buy instruction detection
        if (data.length >= 24 && accounts.length >= 10) {
          const discriminator = data.slice(0, 8).toString('hex');
          const solAmountLamports = data.readBigUInt64LE(8);
          const solAmount = Number(solAmountLamports) / 1e9;
          
          buyCount++;
          
          console.log(`Buy #${buyCount}:`);
          console.log(`   Tx: ${sig.signature}`);
          console.log(`   Time: ${new Date(sig.blockTime * 1000).toISOString()}`);
          console.log(`   Buyer: ${buyer.toBase58()}`);
          console.log(`   SOL Spent: ${solAmount.toFixed(4)} SOL (${solAmountLamports.toString()} lamports)`);
          console.log(`   Format: ${accounts.length}-account (${accounts.length === 16 ? 'WITH' : 'WITHOUT'} creator fee)`);
          console.log(`   Discriminator: ${discriminator}`);
          
          // Calculate tokens received
          if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
            for (const post of tx.meta.postTokenBalances) {
              if (post.mint === tokenMint.toBase58()) {
                const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === post.accountIndex);
                const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
                const postAmount = BigInt(post.uiTokenAmount.amount);
                const change = postAmount - preAmount;
                
                if (change > 0n) {
                  const tokensReceived = Number(change) / Math.pow(10, post.uiTokenAmount.decimals);
                  const pricePerToken = solAmount / tokensReceived;
                  const marketCap = (pricePerToken * 1e9) * 150; // Assuming 1B supply and $150/SOL
                  
                  console.log(`   Tokens Received: ${tokensReceived.toLocaleString()} tokens`);
                  console.log(`   Price/Token: ${pricePerToken.toExponential(4)} SOL`);
                  console.log(`   Implied MC: $${marketCap.toLocaleString(undefined, { maximumFractionDigits: 0 })} (at $150/SOL, 1B supply)`);
                }
              }
            }
          }
          
          console.log();
          break;
        }
      }
    }
  }
  
  if (buyCount === 0) {
    console.log(`❌ No buy transactions found\n`);
  } else {
    console.log(`${'─'.repeat(90)}`);
    console.log(`✅ Analyzed ${buyCount} buy transaction(s)\n`);
  }
}

const testMint = process.argv[2] || 'HxfgDiEopxw5E8WsgSufy2pGB7U8AWbGXaRn3d5Gpump';
analyzeToken(testMint).catch(console.error);
