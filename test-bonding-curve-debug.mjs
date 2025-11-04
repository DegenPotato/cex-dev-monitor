import WebSocket from 'ws';
import fetch from 'node-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

const RPC_HTTP = 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const WS_URL = 'wss://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

const connection = new Connection(RPC_HTTP, 'confirmed');

console.log('🧪 Testing: Debug Bonding Curve Account\n');

// Derive bonding curve PDA
function deriveBondingCurvePDA(tokenMint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('bonding_curve'),
      tokenMint.toBuffer()
    ],
    PUMPFUN_PROGRAM
  );
}

// Get full transaction details
async function getFullTransaction(signature) {
  try {
    const response = await fetch(RPC_HTTP, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          signature,
          { encoding: 'jsonParsed', commitment: 'confirmed', maxSupportedTransactionVersion: 0 }
        ]
      })
    });

    const data = await response.json();
    return data.result;
  } catch (error) {
    console.error('Error fetching transaction:', error);
    return null;
  }
}

// Extract all accounts from transaction
function extractAccounts(tx) {
  const accounts = new Set();
  
  // Get accounts from account keys
  if (tx?.transaction?.message?.accountKeys) {
    tx.transaction.message.accountKeys.forEach(key => {
      if (typeof key === 'string') {
        accounts.add(key);
      } else if (key?.pubkey) {
        accounts.add(key.pubkey);
      }
    });
  }
  
  // Get accounts from instructions
  if (tx?.transaction?.message?.instructions) {
    tx.transaction.message.instructions.forEach(ix => {
      if (ix?.accounts) {
        ix.accounts.forEach(acc => accounts.add(acc));
      }
      if (ix?.parsed?.info?.account) {
        accounts.add(ix.parsed.info.account);
      }
      if (ix?.parsed?.info?.mint) {
        accounts.add(ix.parsed.info.mint);
      }
      if (ix?.parsed?.info?.source) {
        accounts.add(ix.parsed.info.source);
      }
      if (ix?.parsed?.info?.destination) {
        accounts.add(ix.parsed.info.destination);
      }
    });
  }
  
  // Get post token balances
  if (tx?.meta?.postTokenBalances) {
    tx.meta.postTokenBalances.forEach(balance => {
      if (balance?.mint) accounts.add(balance.mint);
      if (balance?.owner) accounts.add(balance.owner);
    });
  }
  
  return Array.from(accounts);
}

// Check multiple accounts
async function checkAccounts(accounts) {
  console.log(`\n📊 Checking ${accounts.length} accounts from transaction:\n`);
  
  for (const account of accounts) {
    try {
      const pubkey = new PublicKey(account);
      const info = await connection.getAccountInfo(pubkey);
      
      if (info) {
        console.log(`✅ ${account.slice(0, 8)}... | ${info.data.length} bytes | Owner: ${info.owner.toBase58().slice(0, 8)}...`);
        
        // Check if this is owned by Pumpfun
        if (info.owner.toBase58() === PUMPFUN_PROGRAM.toBase58()) {
          console.log(`   ⚡ PUMPFUN ACCOUNT! Data size: ${info.data.length} bytes`);
          
          // Check discriminator
          if (info.data.length >= 8) {
            const discriminator = info.data.slice(0, 8);
            console.log(`   Discriminator: ${discriminator.toString('hex')}`);
          }
        }
      } else {
        console.log(`❌ ${account.slice(0, 8)}... | Account not found`);
      }
    } catch (error) {
      console.log(`⚠️  ${account.slice(0, 8)}... | Invalid pubkey`);
    }
  }
}

// Test token creation
async function testTokenCreation(logs) {
  console.log('\n' + '='.repeat(80));
  console.log('🎉 TOKEN CREATION DETECTED!');
  console.log('='.repeat(80));
  console.log(`📄 Signature: ${logs.signature}\n`);
  
  // Get full transaction
  console.log('📋 Fetching full transaction details...');
  const tx = await getFullTransaction(logs.signature);
  
  if (!tx) {
    console.error('❌ Could not fetch transaction');
    return false;
  }
  
  // Extract mint
  let tokenMint = null;
  if (tx.meta?.postTokenBalances) {
    for (const balance of tx.meta.postTokenBalances) {
      if (balance?.mint && balance.mint.endsWith('pump')) {
        tokenMint = balance.mint;
        break;
      }
    }
  }
  
  if (tokenMint) {
    console.log(`✅ Token mint: ${tokenMint}`);
    
    // Derive bonding curve
    const [bondingCurvePDA] = deriveBondingCurvePDA(new PublicKey(tokenMint));
    console.log(`📍 Expected bonding curve PDA: ${bondingCurvePDA.toBase58()}`);
  }
  
  // Extract all accounts
  const accounts = extractAccounts(tx);
  
  // Check all accounts
  await checkAccounts(accounts);
  
  // If we have a token mint, specifically check the bonding curve
  if (tokenMint) {
    const [bondingCurvePDA] = deriveBondingCurvePDA(new PublicKey(tokenMint));
    console.log(`\n🔍 Specifically checking bonding curve PDA...`);
    const bondingInfo = await connection.getAccountInfo(bondingCurvePDA);
    if (bondingInfo) {
      console.log(`✅ Bonding curve EXISTS! ${bondingInfo.data.length} bytes`);
    } else {
      console.log(`❌ Bonding curve NOT FOUND at expected address`);
    }
  }
  
  console.log('='.repeat(80) + '\n');
  return true;
}

// WebSocket listener
const ws = new WebSocket(WS_URL);
let tokensTested = 0;

ws.on('open', () => {
  console.log('✅ Connected to WebSocket\n');
  
  ws.send(JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'logsSubscribe',
    params: [
      { mentions: [PUMPFUN_PROGRAM.toBase58()] },
      { commitment: 'processed' }
    ]
  }));
});

ws.on('message', async (data) => {
  try {
    const message = JSON.parse(data.toString());
    
    if (message.method === 'logsNotification') {
      const logs = message.params.result.value;
      
      // Check if it's a token creation
      const isTokenCreation = logs.logs && Array.isArray(logs.logs) && 
        logs.logs.some(log => log.includes('Program log: Instruction: Create')) &&
        logs.logs.some(log => log.includes('Instruction: MintTo')) &&
        logs.logs.some(log => log.includes('Instruction: Buy'));
      
      if (!isTokenCreation) return;
      
      // Test
      await testTokenCreation(logs);
      tokensTested++;
      
      if (tokensTested >= 2) {
        console.log('\n✅ Tested 2 tokens, exiting...\n');
        ws.close();
      }
    }
  } catch (error) {
    // Ignore
  }
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
});

ws.on('close', () => {
  console.log('🔌 WebSocket disconnected\n');
  process.exit(0);
});
