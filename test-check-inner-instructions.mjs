import { Connection, PublicKey } from '@solana/web3.js';

const RPC_URL = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const connection = new Connection(RPC_URL, 'confirmed');

const TX_SIG = 'uPANQUom7Ljd5BVXXkmNsWgxpG6Qz1FSHaG3FAgQcg6KqBuQN1UKkoeCLy6ekMkGPGEivKHwoNRzewkTEaXh2Sv';
const TOKEN_MINT = '6dYs2MTCvs3YFFNdZSbMorD4emPfpsoDGdDvEATcpump';

async function checkInnerInstructions() {
  console.log('🔍 Checking Inner Instructions\n');
  console.log(`Signature: ${TX_SIG}\n`);
  
  const tx = await connection.getTransaction(TX_SIG, {
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx || !tx.meta) {
    console.log('❌ Transaction not found');
    return;
  }
  
  console.log('📊 Token Balance Changes:\n');
  console.log('PRE:');
  tx.meta.preTokenBalances?.filter(b => b.mint === TOKEN_MINT).forEach(b => {
    console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString} (Owner: ${b.owner.slice(0,8)}...)`);
  });
  
  console.log('\nPOST:');
  tx.meta.postTokenBalances?.filter(b => b.mint === TOKEN_MINT).forEach(b => {
    console.log(`  Account ${b.accountIndex}: ${b.uiTokenAmount.uiAmountString} (Owner: ${b.owner.slice(0,8)}...)`);
  });
  
  console.log('\n📝 Inner Instructions:\n');
  if (tx.meta.innerInstructions) {
    tx.meta.innerInstructions.forEach((inner, i) => {
      console.log(`Instruction ${inner.index}:`);
      inner.instructions.forEach((inst, j) => {
        // Decode instruction data
        const data = Buffer.from(inst.data, 'base64');
        console.log(`  ${j}. Program: ${inst.programId.toBase58().slice(0,8)}...`);
        console.log(`     Accounts: ${inst.accounts?.length || 0}`);
        console.log(`     Data (hex): ${data.toString('hex').slice(0, 40)}...`);
        
        // Check for token transfer (discriminator: 03 for SPL Token Transfer)
        if (data[0] === 3 && inst.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
          const amount = data.readBigUInt64LE(1);
          console.log(`     ✅ TOKEN TRANSFER: ${amount} raw units`);
        }
        
        // Check for close account (discriminator: 09)
        if (data[0] === 9 && inst.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
          console.log(`     ❌ CLOSE ACCOUNT`);
        }
      });
    });
  } else {
    console.log('No inner instructions');
  }
  
  console.log('\n🔧 SOL Balance Changes:\n');
  tx.transaction.message.accountKeys.forEach((key, i) => {
    const preBal = tx.meta.preBalances[i];
    const postBal = tx.meta.postBalances[i];
    const change = postBal - preBal;
    if (change !== 0) {
      console.log(`Account ${i} (${key.toBase58().slice(0,8)}...): ${preBal/1e9} → ${postBal/1e9} SOL (${change > 0 ? '+' : ''}${change/1e9})`);
    }
  });
  
  console.log('\n💡 HYPOTHESIS:');
  console.log('This transaction likely:');
  console.log('1. Creates a temporary token account');
  console.log('2. Transfers tokens to it');
  console.log('3. Immediately closes it and sends tokens elsewhere');
  console.log('Result: preTokenBalance=0, postTokenBalance=0, but transfer occurred!');
}

checkInnerInstructions();
