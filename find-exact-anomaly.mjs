import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TOKEN_MINT = 'Dd1H9Fh2vKHYdbLfTpzNGFy8KGDbrXCwJ3esK1sFpump';
const BONDING_CURVE = '6ZqiB7wEcpoMBTb1mKnuDAt69VdNwWJLUYBdC8JD9hn';

console.log('🔍 Using EXACT parseSwapTransaction logic...\n');

const bondingCurveAddress = new PublicKey(BONDING_CURVE);
const tokenMint = TOKEN_MINT; // String, not PublicKey

// Fetch recent signatures
const sigs = await connection.getSignaturesForAddress(bondingCurveAddress, { limit: 200 });
console.log(`Fetching ${sigs.length} transactions...\n`);

const batchSize = 50;
const anomalies = [];

for (let i = 0; i < sigs.length; i += batchSize) {
  const batch = sigs.slice(i, i + batchSize).map(s => s.signature);
  
  const txs = await connection.getTransactions(batch, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0
  });
  
  for (let txIdx = 0; txIdx < txs.length; txIdx++) {
    const tx = txs[txIdx];
    const signature = batch[txIdx];
    
    if (!tx || !tx.meta) continue;
    
    const swap = parseSwapTransaction(tx, tokenMint, signature, bondingCurveAddress);
    
    if (swap && swap.price > 1.0) {
      anomalies.push(swap);
    }
  }
  
  process.stdout.write(`Processed ${Math.min(i + batchSize, sigs.length)}/${sigs.length}...\r`);
}

console.log('\n\n🚨 Anomalies Found:\n');

for (const swap of anomalies.sort((a, b) => b.price - a.price)) {
  console.log('='.repeat(100));
  console.log(`Signature: ${swap.signature}`);
  console.log(`Time: ${new Date(swap.timestamp * 1000).toLocaleString()}`);
  console.log(`Type: ${swap.type.toUpperCase()}`);
  console.log(`Price: ${swap.price.toFixed(12)} SOL per token ⚠️⚠️⚠️`);
  console.log(`Token Amount: ${swap.tokenAmount.toFixed(10)} tokens`);
  console.log(`SOL Amount: ${swap.solAmount.toFixed(9)} SOL`);
  console.log(`Volume Bot: ${swap.isVolumeBot}`);
  console.log(`Is Mint: ${swap.isMint}`);
  console.log('='.repeat(100));
  console.log('\nRun: node inspect-tx.mjs ' + swap.signature);
  console.log('\n');
}

if (anomalies.length === 0) {
  console.log('No anomalies found');
}

// EXACT copy of parseSwapTransaction from test-ohlcv-manual.mjs
function parseSwapTransaction(tx, tokenMint, signature, bondingCurveAddress) {
  try {
    if (!tx || !tx.meta) return null;

    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys || [];

    // Add loaded addresses for versioned transactions
    if (message.addressTableLookups && tx.meta.loadedAddresses) {
      if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
    }

    // Extract token balance changes
    let buyAmount = 0;
    let sellAmount = 0;
    let decimals = 6;
    
    // Method: Check all token accounts for balance changes
    {
      const allAccountIndices = new Set();
      
      if (tx.meta.preTokenBalances) {
        tx.meta.preTokenBalances.forEach(b => {
          if (b.mint === tokenMint) allAccountIndices.add(b.accountIndex);
        });
      }
      
      if (tx.meta.postTokenBalances) {
        tx.meta.postTokenBalances.forEach(b => {
          if (b.mint === tokenMint) allAccountIndices.add(b.accountIndex);
        });
      }
      
      for (const accountIndex of allAccountIndices) {
        const pre = tx.meta.preTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === tokenMint);
        const post = tx.meta.postTokenBalances.find(p => p.accountIndex === accountIndex && p.mint === tokenMint);
        
        // Skip bonding curve vault
        const owner = post?.owner || pre?.owner;
        if (owner === bondingCurveAddress.toBase58()) continue;
        
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = post ? BigInt(post.uiTokenAmount.amount) : 0n;
        const change = postAmount - preAmount;
        
        if (change === 0n) continue;
        
        const tokenDecimals = post?.uiTokenAmount.decimals || pre?.uiTokenAmount.decimals || 6;
        decimals = tokenDecimals;

        if (change > 0n) {
          // Accumulate all buys
          buyAmount += Number(change) / Math.pow(10, tokenDecimals);
        } else if (change < 0n) {
          // Accumulate all sells
          sellAmount += Math.abs(Number(change)) / Math.pow(10, tokenDecimals);
        }
      }
    }
    
    // If no user balance changes, check bonding curve vault change as fallback
    // This catches volume bots that buy+sell in same tx (net user change = 0)
    if (buyAmount === 0 && sellAmount === 0) {
      const vaultPre = tx.meta.preTokenBalances?.find(b => 
        b.mint === tokenMint && b.owner === bondingCurveAddress.toBase58()
      );
      const vaultPost = tx.meta.postTokenBalances?.find(b => 
        b.mint === tokenMint && b.owner === bondingCurveAddress.toBase58()
      );
      
      if (vaultPre && vaultPost) {
        const vaultChange = BigInt(vaultPost.uiTokenAmount.amount) - BigInt(vaultPre.uiTokenAmount.amount);
        if (vaultChange !== 0n) {
          decimals = vaultPost.uiTokenAmount.decimals;
          // Vault increased = user sold, vault decreased = user bought
          if (vaultChange > 0n) {
            sellAmount = Number(vaultChange) / Math.pow(10, decimals);
          } else {
            buyAmount = Math.abs(Number(vaultChange)) / Math.pow(10, decimals);
          }
        }
      }
    }
    
    if (buyAmount === 0 && sellAmount === 0) return null;
    
    // For single-direction swaps, use that amount
    // For volume bots (buy+sell), use the larger amount
    const tokenAmount = Math.max(buyAmount, sellAmount);
    const isBuy = buyAmount > sellAmount;
    const isSell = sellAmount > buyAmount;
    
    // If amounts are equal (perfect volume bot), default to buy
    if (buyAmount === sellAmount && buyAmount > 0) {
      return null; // Skip perfect volume bots for now
    }

    // Calculate SOL amount by finding the bonding curve's SOL balance change
    // This is THE most accurate method - works for all swaps including Jupiter-routed
    let solAmount = 0;
    
    if (tx.meta.postBalances && tx.meta.preBalances && bondingCurveAddress) {
      // Find the bonding curve account index
      let bondingCurveIndex = -1;
      
      for (let i = 0; i < accountKeys.length; i++) {
        if (accountKeys[i]?.equals(bondingCurveAddress)) {
          bondingCurveIndex = i;
          break;
        }
      }
      
      if (bondingCurveIndex >= 0 && bondingCurveIndex < tx.meta.preBalances.length) {
        // For buys: curve's SOL goes UP, for sells: curve's SOL goes DOWN
        const curveChange = tx.meta.postBalances[bondingCurveIndex] - tx.meta.preBalances[bondingCurveIndex];
        solAmount = Math.abs(curveChange / 1e9);
      }
    }
    
    // Fallback: use fee payer balance (index 0) - may be inaccurate for Jupiter swaps
    if (solAmount === 0 && tx.meta.preBalances && tx.meta.postBalances) {
      const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      solAmount = Math.abs(change / 1e9);
    }

    if (solAmount === 0) return null;

    const price = solAmount / tokenAmount;
    
    // Flag volume bots for later tagging
    const isVolumeBot = buyAmount > 0 && sellAmount > 0;
    
    // Detect mint transaction: has token in POST but NOT in PRE
    const hasPreTokenBalance = tx.meta.preTokenBalances?.some(b => b.mint === tokenMint) || false;
    const hasPostTokenBalance = tx.meta.postTokenBalances?.some(b => b.mint === tokenMint) || false;
    const isMint = hasPostTokenBalance && !hasPreTokenBalance;

    return {
      signature,
      timestamp: tx.blockTime,
      slot: tx.slot,
      type: isBuy ? 'buy' : 'sell',
      price,
      tokenAmount,
      solAmount,
      isVolumeBot,
      isMint
    };
  } catch (err) {
    return null;
  }
}
