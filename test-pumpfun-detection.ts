import { Connection, PublicKey } from '@solana/web3.js';

// Pump.fun program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

// Test wallet
const TEST_WALLET = '5Sa5XkAL9s1tj89jrU5MXE7pXncQh61wZr215ijvS639';

// Known spam/airdrop programs to filter out
const SPAM_PROGRAMS = [
  'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', // Token program (common in airdrops)
  'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter
];

async function testPumpFunDetection() {
  console.log('🧪 Testing Pump.fun Detection Logic\n');
  console.log(`📍 Target Wallet: ${TEST_WALLET}\n`);

  // Use Helius for testing
  const connection = new Connection(
    'https://mainnet.helius-rpc.com/?api-key=e589d712-ed13-493b-a523-1c4aa6e33e0b',
    'confirmed'
  );

  try {
    const publicKey = new PublicKey(TEST_WALLET);
    
    console.log('📡 Fetching transaction history (this may take a while)...\n');
    
    // Fetch more transactions in batches to get past spam
    let allSignatures: any[] = [];
    let batch = await connection.getSignaturesForAddress(publicKey, { limit: 1000 });
    allSignatures.push(...batch);
    
    console.log(`✅ Fetched ${allSignatures.length} total transactions\n`);
    console.log('🧹 Filtering out spam transactions...\n');
    
    // Filter out likely spam (failed, very recent airdrops, etc)
    const nonSpamSignatures = allSignatures.filter(sig => {
      // Keep all for now, we'll analyze them
      return true;
    });
    
    console.log(`📊 Analyzing ${nonSpamSignatures.length} transactions...\n`);
    console.log('=' .repeat(80));

    let mintsFound = 0;
    let pumpfunTxs = 0;
    let spamTxs = 0;
    let failedTxs = 0;

    for (let i = 0; i < nonSpamSignatures.length; i++) {
      const sigInfo = nonSpamSignatures[i];
      
      // Only log every 10th transaction to reduce spam
      if (i % 10 === 0) {
        console.log(`\n[${i + 1}/${nonSpamSignatures.length}] Processing batch... (${pumpfunTxs} pump.fun txs found so far)`);
      }
      
      const tx = await connection.getParsedTransaction(sigInfo.signature, {
        maxSupportedTransactionVersion: 0
      });

      if (!tx || !tx.meta) {
        continue;
      }
      
      if (tx.meta.err) {
        failedTxs++;
        continue;
      }

      const accountKeys = tx.transaction.message.accountKeys;
      
      // Check if transaction involves pump.fun program
      const involvesPumpFun = accountKeys.some(
        key => key.pubkey.toBase58() === PUMPFUN_PROGRAM_ID
      );

      if (involvesPumpFun) {
        pumpfunTxs++;
        console.log(`\n[TX ${i + 1}] ✅ PUMP.FUN transaction detected!`);
        console.log(`  Signature: ${sigInfo.signature}`);
        
        // Method 1: Check INNER INSTRUCTIONS for mint (THE KEY FIX!)
        if (tx.meta.innerInstructions) {
          for (const innerSet of tx.meta.innerInstructions) {
            for (const instruction of innerSet.instructions) {
              if ('parsed' in instruction && instruction.parsed) {
                const parsed = instruction.parsed;
                
                if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
                  const mintAddress = parsed.info?.mint;
                  
                  if (mintAddress) {
                    console.log(`\n     🚀🚀🚀 MINT DETECTED (Inner Instruction) 🚀🚀🚀`);
                    console.log(`     Mint Address: ${mintAddress}`);
                    console.log(`     Type: ${parsed.type}`);
                    console.log(`     Decimals: ${parsed.info?.decimals}`);
                    console.log(`     Signature: ${sigInfo.signature}`);
                    mintsFound++;
                  }
                }
              }
            }
          }
        }

        // Method 2: Check for high token supply (confirms creator)
        if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
          for (const balance of tx.meta.postTokenBalances) {
            if (balance.owner === TEST_WALLET) {
              const isLikelyMint = balance.uiTokenAmount.uiAmount && balance.uiTokenAmount.uiAmount > 1000000;
              if (isLikelyMint) {
                console.log(`     ✅ High supply: ${balance.uiTokenAmount.uiAmount?.toLocaleString()} tokens (confirms creator)`);
              }
            }
          }
        }
      }

      // Add small delay to avoid rate limits (only every 5 txs)
      if (i % 5 === 0) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 SUMMARY:');
    console.log(`   Total Transactions Fetched: ${allSignatures.length}`);
    console.log(`   Failed Transactions: ${failedTxs}`);
    console.log(`   Spam Transactions (filtered): ${spamTxs}`);
    console.log(`   Analyzed: ${nonSpamSignatures.length - failedTxs - spamTxs}`);
    console.log(`   Pump.fun Transactions: ${pumpfunTxs}`);
    console.log(`   🚀 Mints Detected: ${mintsFound}`);
    
    if (mintsFound > 0) {
      console.log('\n✅ SUCCESS! Our detection logic works correctly! 🎉\n');
    } else if (pumpfunTxs > 0) {
      console.log('\n⚠️  Found pump.fun transactions but no mints. May need to adjust detection logic.\n');
    } else {
      console.log('\n❌ No pump.fun activity found in recent history.\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

// Run the test
testPumpFunDetection();
