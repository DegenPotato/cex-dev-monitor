import { Connection } from '@solana/web3.js';

const MINT_TX_SIGNATURE = '4W1Z8tyxRR9QoiZ8Kj6s4BEdv9Mkx9bgPN44RhGtQBTL8SJug29T4tVH6LQE4WwE8mxfoJnfhLUCzMe4FBvA8zSN';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TEST_WALLET = '5Sa5XkAL9s1tj89jrU5MXE7pXncQh61wZr215ijvS639';

async function testFixedDetection() {
  console.log('🧪 Testing FIXED Pump.fun Detection Logic\n');
  console.log(`Target Transaction: ${MINT_TX_SIGNATURE}\n`);
  console.log('='.repeat(80) + '\n');

  const connection = new Connection(
    'https://mainnet.helius-rpc.com/?api-key=e589d712-ed13-493b-a523-1c4aa6e33e0b',
    'confirmed'
  );

  try {
    const tx = await connection.getParsedTransaction(MINT_TX_SIGNATURE, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta || tx.meta.err) {
      console.log('❌ Transaction not found');
      return;
    }

    const accountKeys = tx.transaction.message.accountKeys;
    const involvesPumpFun = accountKeys.some(k => k.pubkey.toBase58() === PUMPFUN_PROGRAM_ID);

    console.log(`✅ Involves Pump.fun: ${involvesPumpFun}\n`);

    let mintsDetected = 0;

    // Method 1: Check INNER INSTRUCTIONS (NEW!)
    console.log('🔍 Checking INNER INSTRUCTIONS for mint...');
    if (tx.meta.innerInstructions) {
      for (const innerSet of tx.meta.innerInstructions) {
        for (const instruction of innerSet.instructions) {
          if ('parsed' in instruction && instruction.parsed) {
            const parsed = instruction.parsed;
            
            if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
              const mintAddress = parsed.info?.mint;
              
              if (mintAddress) {
                mintsDetected++;
                console.log(`\n   🚀🚀🚀 MINT DETECTED! 🚀🚀🚀`);
                console.log(`   Method: Inner Instruction (${parsed.type})`);
                console.log(`   Mint Address: ${mintAddress}`);
                console.log(`   Decimals: ${parsed.info?.decimals}`);
              }
            }
          }
        }
      }
    }

    if (mintsDetected === 0) {
      console.log('   ❌ No mints found in inner instructions\n');
    }

    // Method 2: Check TOP-LEVEL INSTRUCTIONS
    console.log('🔍 Checking TOP-LEVEL INSTRUCTIONS for mint...');
    const instructions = tx.transaction.message.instructions;
    let topLevelMints = 0;
    
    for (const instruction of instructions) {
      if ('parsed' in instruction && instruction.parsed) {
        const parsed = instruction.parsed;
        
        if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
          topLevelMints++;
          console.log(`   🚀 Found in top-level: ${parsed.info?.mint}`);
        }
      }
    }

    if (topLevelMints === 0) {
      console.log('   ❌ No mints found in top-level instructions\n');
    }

    // Method 3: Check POST TOKEN BALANCES
    console.log('🔍 Checking POST TOKEN BALANCES for high supply...');
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      for (const balance of tx.meta.postTokenBalances) {
        if (balance.owner === TEST_WALLET) {
          console.log(`   Token: ${balance.mint.slice(0, 16)}...`);
          console.log(`   Amount: ${balance.uiTokenAmount.uiAmount?.toLocaleString() || '0'}`);
          
          if (balance.uiTokenAmount.uiAmount && balance.uiTokenAmount.uiAmount > 1000000) {
            console.log(`   ✅ High supply detected (likely creator)`);
          }
        }
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log('\n📊 RESULTS:');
    console.log(`   Mints Detected: ${mintsDetected}`);
    
    if (mintsDetected > 0) {
      console.log('\n✅ SUCCESS! Detection logic is working correctly! 🎉');
      console.log('\n💡 Key Insight: Pump.fun mints are in INNER INSTRUCTIONS, not top-level!');
    } else {
      console.log('\n❌ FAILED: No mints detected');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testFixedDetection();
