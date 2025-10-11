import { Connection } from '@solana/web3.js';

// The pump.fun transaction we found
const TX_SIG = '2rRSMdGTkbvAWscBRqWxf1FArtu6oX8KnnR7oJP3d3uu1KMWnoUvtJfumQwv2ETTSuUrxYzcDCd2DSzVNVQ55PdG';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
const TEST_WALLET = '5Sa5XkAL9s1tj89jrU5MXE7pXncQh61wZr215ijvS639';

async function testTransaction() {
  console.log('🧪 Testing Pump.fun Transaction\n');
  console.log(`Signature: ${TX_SIG}\n`);

  const connection = new Connection(
    'https://mainnet.helius-rpc.com/?api-key=e589d712-ed13-493b-a523-1c4aa6e33e0b',
    'confirmed'
  );

  try {
    const tx = await connection.getParsedTransaction(TX_SIG, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta || tx.meta.err) {
      console.log('❌ Transaction not found or failed');
      return;
    }

    console.log('✅ Transaction fetched!\n');

    let mintsFound = 0;

    // Check INNER INSTRUCTIONS for mint
    if (tx.meta.innerInstructions) {
      console.log('🔍 Checking inner instructions...\n');
      for (const innerSet of tx.meta.innerInstructions) {
        for (const instruction of innerSet.instructions) {
          if ('parsed' in instruction && instruction.parsed) {
            const parsed = instruction.parsed;
            
            if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
              const mintAddress = parsed.info?.mint;
              
              if (mintAddress) {
                console.log(`🚀🚀🚀 MINT DETECTED! 🚀🚀🚀`);
                console.log(`   Mint Address: ${mintAddress}`);
                console.log(`   Type: ${parsed.type}`);
                console.log(`   Decimals: ${parsed.info?.decimals}\n`);
                mintsFound++;
              }
            }
          }
        }
      }
    }

    // Check token balances
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      console.log('🔍 Checking post token balances...\n');
      for (const balance of tx.meta.postTokenBalances) {
        if (balance.owner === TEST_WALLET) {
          console.log(`   Mint: ${balance.mint}`);
          console.log(`   Owner: ${balance.owner} (THIS WALLET)`);
          console.log(`   Amount: ${balance.uiTokenAmount.uiAmount?.toLocaleString() || '0'}`);
          
          if (balance.uiTokenAmount.uiAmount && balance.uiTokenAmount.uiAmount > 1000000) {
            console.log(`   ✅ High supply - confirms creator!\n`);
          }
        }
      }
    }

    console.log('='.repeat(80));
    if (mintsFound > 0) {
      console.log('\n✅ SUCCESS! Mint detected with fixed logic! 🎉\n');
    } else {
      console.log('\n⚠️  No mints found in this transaction\n');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

testTransaction();
