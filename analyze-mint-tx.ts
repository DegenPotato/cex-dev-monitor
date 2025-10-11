import { Connection } from '@solana/web3.js';

const MINT_TX_SIGNATURE = '4W1Z8tyxRR9QoiZ8Kj6s4BEdv9Mkx9bgPN44RhGtQBTL8SJug29T4tVH6LQE4WwE8mxfoJnfhLUCzMe4FBvA8zSN';
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

async function analyzeMintTransaction() {
  console.log('🔍 Analyzing Pump.fun Mint Transaction\n');
  console.log(`Signature: ${MINT_TX_SIGNATURE}\n`);
  console.log('='.repeat(80) + '\n');

  const connection = new Connection(
    'https://mainnet.helius-rpc.com/?api-key=e589d712-ed13-493b-a523-1c4aa6e33e0b',
    'confirmed'
  );

  try {
    const tx = await connection.getParsedTransaction(MINT_TX_SIGNATURE, {
      maxSupportedTransactionVersion: 0
    });

    if (!tx || !tx.meta) {
      console.log('❌ Transaction not found or has no metadata');
      return;
    }

    console.log('✅ Transaction fetched successfully!\n');

    // 1. Check account keys
    console.log('📝 ACCOUNT KEYS:');
    const accountKeys = tx.transaction.message.accountKeys;
    accountKeys.forEach((key, idx) => {
      const addr = key.pubkey.toBase58();
      const isPumpFun = addr === PUMPFUN_PROGRAM_ID;
      const isSigner = key.signer || false;
      const isWritable = key.writable || false;
      console.log(`  [${idx}] ${addr}`);
      console.log(`       Signer: ${isSigner}, Writable: ${isWritable}`);
      if (isPumpFun) console.log(`       ⭐ THIS IS PUMP.FUN PROGRAM`);
    });

    // 2. Check instructions
    console.log('\n📋 INSTRUCTIONS:');
    const instructions = tx.transaction.message.instructions;
    instructions.forEach((instruction, idx) => {
      console.log(`\n  Instruction ${idx + 1}:`);
      
      if ('parsed' in instruction && instruction.parsed) {
        console.log(`    Type: ${instruction.parsed.type} (PARSED)`);
        console.log(`    Program: ${instruction.program}`);
        console.log(`    Info:`, JSON.stringify(instruction.parsed.info, null, 6));
      } else if ('programId' in instruction && 'accounts' in instruction && 'data' in instruction) {
        const programId = instruction.programId.toBase58();
        console.log(`    Program ID: ${programId}`);
        if (programId === PUMPFUN_PROGRAM_ID) {
          console.log(`    ⭐ THIS IS PUMP.FUN INSTRUCTION`);
          console.log(`    Accounts involved: ${instruction.accounts?.length || 0}`);
          console.log(`    Data (base58): ${instruction.data}`);
        }
      }
    });

    // 3. Check pre/post token balances
    console.log('\n💰 TOKEN BALANCES:');
    
    console.log('\n  Pre Token Balances:');
    if (tx.meta.preTokenBalances && tx.meta.preTokenBalances.length > 0) {
      tx.meta.preTokenBalances.forEach((balance, idx) => {
        console.log(`    [${idx}] Mint: ${balance.mint}`);
        console.log(`         Owner: ${balance.owner}`);
        console.log(`         Amount: ${balance.uiTokenAmount.uiAmount}`);
      });
    } else {
      console.log('    (none)');
    }

    console.log('\n  Post Token Balances:');
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      tx.meta.postTokenBalances.forEach((balance, idx) => {
        console.log(`    [${idx}] Mint: ${balance.mint}`);
        console.log(`         Owner: ${balance.owner}`);
        console.log(`         Amount: ${balance.uiTokenAmount.uiAmount}`);
        console.log(`         Decimals: ${balance.uiTokenAmount.decimals}`);
      });
    } else {
      console.log('    (none)');
    }

    // 4. Check inner instructions
    console.log('\n🔄 INNER INSTRUCTIONS:');
    if (tx.meta.innerInstructions && tx.meta.innerInstructions.length > 0) {
      tx.meta.innerInstructions.forEach((inner, idx) => {
        console.log(`\n  Inner Instruction Set ${idx + 1} (index ${inner.index}):`);
        inner.instructions.forEach((inst, instIdx) => {
          console.log(`    [${instIdx}]`);
          if ('parsed' in inst && inst.parsed) {
            console.log(`      Type: ${inst.parsed.type}`);
            console.log(`      Program: ${inst.program}`);
            if (inst.parsed.type === 'initializeMint' || inst.parsed.type === 'initializeMint2') {
              console.log(`      🚀 MINT INITIALIZATION DETECTED!`);
              console.log(`      Mint Address: ${inst.parsed.info?.mint}`);
              console.log(`      Decimals: ${inst.parsed.info?.decimals}`);
              console.log(`      Mint Authority: ${inst.parsed.info?.mintAuthority}`);
            }
          } else if ('programId' in inst) {
            console.log(`      Program ID: ${inst.programId.toBase58()}`);
          }
        });
      });
    } else {
      console.log('  (none)');
    }

    // 5. Check logs
    console.log('\n📜 TRANSACTION LOGS:');
    if (tx.meta.logMessages) {
      tx.meta.logMessages.forEach((log, idx) => {
        if (log.includes('Program 6EF8') || log.includes('invoke') || log.includes('success')) {
          console.log(`  ${log}`);
        }
      });
    }

    // Summary
    console.log('\n' + '='.repeat(80));
    console.log('\n📊 DETECTION STRATEGY RECOMMENDATIONS:\n');
    
    const hasPumpFunProgram = accountKeys.some(k => k.pubkey.toBase58() === PUMPFUN_PROGRAM_ID);
    const hasInitMint = tx.meta.innerInstructions?.some(inner => 
      inner.instructions.some(inst => 
        'parsed' in inst && (inst.parsed.type === 'initializeMint' || inst.parsed.type === 'initializeMint2')
      )
    );
    
    console.log(`  ✅ Involves Pump.fun Program: ${hasPumpFunProgram}`);
    console.log(`  ✅ Has InitializeMint: ${hasInitMint}`);
    console.log(`  ✅ Has Post Token Balances: ${tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0}`);
    
    console.log('\n  Best Detection Method:');
    if (hasInitMint) {
      console.log('  → Look for initializeMint/initializeMint2 in INNER INSTRUCTIONS (not just top-level)');
    }
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      console.log('  → Check postTokenBalances for new mints with high supply');
    }

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

analyzeMintTransaction();
