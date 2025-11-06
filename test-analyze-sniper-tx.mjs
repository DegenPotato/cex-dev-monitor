import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const SNIPER_TX = '5GSqwtspFdVkLEsFWhNuk8JhLkDGdBBEaQ9pHSLsD63JEoFn5eK6R3QQiqtpbeW8asUEzXp2QfSiydYnDkxvfwPT';
const PUMPFUN_PROGRAM = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

async function analyzeSniperTx() {
  console.log('🔍 Analyzing Sniper Transaction\n');
  console.log(`TX: ${SNIPER_TX}`);
  console.log(`Solscan: https://solscan.io/tx/${SNIPER_TX}\n`);
  
  const tx = await connection.getTransaction(SNIPER_TX, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx || !tx.meta) {
    console.log('❌ Transaction not found');
    return;
  }
  
  console.log('📊 Transaction Details:\n');
  console.log(`Block Time: ${new Date(tx.blockTime * 1000).toLocaleString()}`);
  console.log(`Slot: ${tx.slot}`);
  console.log(`Success: ${!tx.meta.err}`);
  console.log(`Compute Units Used: ${tx.meta.computeUnitsConsumed || 'N/A'}`);
  console.log(`Fee: ${tx.meta.fee / 1e9} SOL\n`);
  
  // Check for priority fees
  const message = tx.transaction.message;
  const instructions = message.compiledInstructions || message.instructions;
  
  console.log('💰 Priority Fee Analysis:\n');
  
  // Check for compute budget instructions
  const COMPUTE_BUDGET_PROGRAM = 'ComputeBudget111111111111111111111111111111';
  let hasPriorityFee = false;
  let computeUnitLimit = null;
  let computeUnitPrice = null;
  
  for (const ix of instructions) {
    const programId = message.staticAccountKeys?.[ix.programIdIndex]?.toBase58() || 
                      message.accountKeys?.[ix.programIdIndex]?.toBase58();
    
    if (programId === COMPUTE_BUDGET_PROGRAM) {
      hasPriorityFee = true;
      const data = Buffer.from(ix.data, 'base64');
      
      // Instruction 2: SetComputeUnitLimit
      if (data[0] === 2) {
        computeUnitLimit = data.readUInt32LE(1);
        console.log(`✅ Compute Unit Limit: ${computeUnitLimit.toLocaleString()}`);
      }
      
      // Instruction 3: SetComputeUnitPrice
      if (data[0] === 3) {
        computeUnitPrice = Number(data.readBigUInt64LE(1));
        const priorityFee = (computeUnitPrice * (computeUnitLimit || tx.meta.computeUnitsConsumed)) / 1e9;
        console.log(`✅ Compute Unit Price: ${computeUnitPrice.toLocaleString()} microlamports`);
        console.log(`✅ Total Priority Fee: ${priorityFee.toFixed(6)} SOL ($${(priorityFee * 162).toFixed(2)})`);
      }
    }
  }
  
  if (!hasPriorityFee) {
    console.log('❌ No priority fee set');
  }
  
  // Check if using Jito
  console.log('\n🚀 Jito Bundle Check:\n');
  if (tx.meta.fee > 5000 * 2) { // Base fee is 5000 lamports, Jito adds more
    console.log('⚠️ Possibly using Jito (high fee detected)');
  } else {
    console.log('Standard RPC transaction (not Jito bundle)');
  }
  
  // Analyze transaction structure
  console.log('\n📝 Transaction Structure:\n');
  console.log(`Total Instructions: ${instructions.length}`);
  console.log(`Accounts Used: ${message.staticAccountKeys?.length || message.accountKeys?.length}`);
  
  let pumpfunInstructions = 0;
  for (const ix of instructions) {
    const programId = message.staticAccountKeys?.[ix.programIdIndex]?.toBase58() || 
                      message.accountKeys?.[ix.programIdIndex]?.toBase58();
    if (programId === PUMPFUN_PROGRAM) {
      pumpfunInstructions++;
      
      const data = Buffer.from(ix.data, 'base64');
      const discriminator = data.slice(0, 8).toString('hex');
      
      console.log(`\n🎯 Pumpfun Instruction:`);
      console.log(`   Discriminator: ${discriminator}`);
      console.log(`   Accounts: ${ix.accountKeyIndexes?.length || ix.accounts?.length}`);
      console.log(`   Data Length: ${data.length} bytes`);
      
      // Try to parse amount and slippage
      if (data.length >= 24) {
        try {
          const amount = data.readBigUInt64LE(8);
          const maxSolCost = data.readBigUInt64LE(16);
          console.log(`   Token Amount: ${amount}`);
          console.log(`   Max SOL Cost: ${Number(maxSolCost) / 1e9} SOL`);
        } catch (e) {
          console.log(`   Could not parse amounts`);
        }
      }
    }
  }
  
  console.log(`\nPumpfun Instructions: ${pumpfunInstructions}`);
  
  // Check timing
  console.log('\n⏱️ Timing Analysis:\n');
  console.log(`Block: ${tx.slot}`);
  console.log(`Timestamp: ${new Date(tx.blockTime * 1000).toISOString()}`);
  
  // Check token balances to see what they bought
  console.log('\n💎 Token Purchase:\n');
  if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
    for (const balance of tx.meta.postTokenBalances) {
      if (balance.uiTokenAmount.uiAmount > 0) {
        console.log(`Token: ${balance.mint.slice(0, 8)}...`);
        console.log(`Amount: ${balance.uiTokenAmount.uiAmountString}`);
        console.log(`Owner: ${balance.owner.slice(0, 8)}...`);
      }
    }
  }
  
  // Check SOL spent
  console.log('\n💰 SOL Spent:\n');
  const solChange = (tx.meta.preBalances[0] - tx.meta.postBalances[0]) / 1e9;
  console.log(`Total SOL Change: ${solChange.toFixed(4)} SOL`);
  console.log(`Includes fees: ${tx.meta.fee / 1e9} SOL`);
  console.log(`Actual buy amount: ~${(solChange - tx.meta.fee / 1e9).toFixed(4)} SOL`);
  
  console.log('\n🔑 Key Differences to Check:\n');
  console.log(`1. Priority Fee: ${hasPriorityFee ? 'YES ✅' : 'NO ❌'}`);
  console.log(`2. Compute Units: ${computeUnitLimit ? computeUnitLimit.toLocaleString() : 'Default'}`);
  console.log(`3. Price per CU: ${computeUnitPrice ? computeUnitPrice.toLocaleString() + ' microlamports' : 'Default'}`);
  console.log(`4. Transaction Size: ${instructions.length} instructions`);
  console.log(`5. Account Count: ${message.staticAccountKeys?.length || message.accountKeys?.length}`);
}

analyzeSniperTx();
