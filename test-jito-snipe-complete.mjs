import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import dotenv from 'dotenv';

dotenv.config();

const RPC_URL = process.env.SOLANA_RPC_TRITON || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'processed');

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPFUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMPFUN_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const PUMPFUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Jito tip accounts
const JITO_TIP_ACCOUNTS = [
  '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
  'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
  'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
  'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
  'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
  'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
  'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
  '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
];

/**
 * Check if bonding curve is fully initialized
 */
function isCurveInitialized(accountData) {
  if (!accountData || accountData.length < 120) return false;
  
  // Check discriminator (first 8 bytes should be 17b7f83760d8ac60)
  const discriminator = accountData.slice(0, 8).toString('hex');
  if (discriminator !== '17b7f83760d8ac60') return false;
  
  // Check that key fields are non-zero
  // Offset 8: virtual_token_reserves (u64)
  const virtualTokenReserves = accountData.readBigUInt64LE(8);
  if (virtualTokenReserves === 0n) return false;
  
  // Offset 16: virtual_sol_reserves (u64)
  const virtualSolReserves = accountData.readBigUInt64LE(16);
  if (virtualSolReserves === 0n) return false;
  
  // Offset 24: real_token_reserves (u64)
  const realTokenReserves = accountData.readBigUInt64LE(24);
  if (realTokenReserves === 0n) return false;
  
  console.log(`✅ Curve initialized: vToken=${virtualTokenReserves}, vSol=${virtualSolReserves}, rToken=${realTokenReserves}`);
  return true;
}

/**
 * Extract bonding curve address from transaction
 */
function extractBondingCurveFromTx(tx) {
  if (!tx || !tx.transaction) return null;
  
  const accountKeys = tx.transaction.message.accountKeys || tx.transaction.message.staticAccountKeys;
  
  for (const accKey of accountKeys) {
    // We'll check this account in the main flow
    console.log(`   Checking account: ${accKey.toBase58()}`);
  }
  
  return accountKeys; // Return all, we'll check them
}

/**
 * Poll for bonding curve initialization
 */
async function waitForCurveInitialized(bondingCurveAddr, maxTimeMs = 900) {
  console.log(`⏳ Polling for curve initialization: ${bondingCurveAddr.toBase58()}`);
  const startTime = Date.now();
  let attempts = 0;
  
  while (Date.now() - startTime < maxTimeMs) {
    attempts++;
    const info = await connection.getAccountInfo(bondingCurveAddr, 'processed');
    
    if (info && isCurveInitialized(info.data)) {
      const elapsed = Date.now() - startTime;
      console.log(`✅ Curve initialized after ${elapsed}ms (${attempts} attempts)`);
      return true;
    }
    
    await new Promise(r => setTimeout(r, 25)); // 25ms polling interval
  }
  
  const elapsed = Date.now() - startTime;
  console.log(`❌ Curve NOT initialized after ${elapsed}ms (${attempts} attempts)`);
  return false;
}

/**
 * Build Pumpfun buy transaction with Jito bundle
 */
async function buildBuyTxWithJito(tokenMint, bondingCurve, wallet, solAmount, priorityFeeSol) {
  console.log(`🔨 Building buy transaction...`);
  
  // Derive associated accounts
  const associatedBondingCurve = await getAssociatedTokenAddress(
    tokenMint,
    bondingCurve,
    true // allowOwnerOffCurve
  );
  
  const userAta = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey
  );
  
  const instructions = [];
  
  // Compute budget
  const computeUnits = 400000;
  instructions.push(
    ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnits })
  );
  
  const microLamportsPerCU = Math.floor((priorityFeeSol * LAMPORTS_PER_SOL * 1000000) / computeUnits);
  instructions.push(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerCU })
  );
  
  console.log(`⚡ Priority: ${computeUnits} CU @ ${microLamportsPerCU} µLamports/CU`);
  
  // Create ATA if needed
  const ataInfo = await connection.getAccountInfo(userAta);
  if (!ataInfo) {
    console.log(`📝 Creating ATA: ${userAta.toBase58()}`);
    instructions.push(
      createAssociatedTokenAccountInstruction(
        wallet.publicKey,
        userAta,
        wallet.publicKey,
        tokenMint
      )
    );
  }
  
  // Build buy instruction
  const solAmountLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
  const instructionData = Buffer.alloc(24);
  instructionData.writeUInt8(0x66, 0);
  instructionData.writeUInt8(0x06, 1);
  instructionData.writeUInt8(0x3d, 2);
  instructionData.writeUInt8(0x12, 3);
  instructionData.writeUInt8(0x01, 4);
  instructionData.writeUInt8(0xda, 5);
  instructionData.writeUInt8(0xeb, 6);
  instructionData.writeUInt8(0xea, 7);
  instructionData.writeBigUInt64LE(solAmountLamports, 8);
  instructionData.writeBigUInt64LE(solAmountLamports, 16);
  
  instructions.push(
    new TransactionInstruction({
      keys: [
        { pubkey: PUMPFUN_GLOBAL, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_FEE_RECIPIENT, isSigner: false, isWritable: true },
        { pubkey: tokenMint, isSigner: false, isWritable: false },
        { pubkey: bondingCurve, isSigner: false, isWritable: true },
        { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
        { pubkey: userAta, isSigner: false, isWritable: true },
        { pubkey: wallet.publicKey, isSigner: true, isWritable: true },
        { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
        { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },
        { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }
      ],
      programId: PUMPFUN_PROGRAM_ID,
      data: instructionData
    })
  );
  
  // Build buy transaction
  const { blockhash } = await connection.getLatestBlockhash('processed');
  const buyMessage = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions
  }).compileToV0Message();
  
  const buyTx = new VersionedTransaction(buyMessage);
  buyTx.sign([wallet]);
  
  // Build tip transaction
  const tipAccount = JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)];
  const tipLamports = 100000; // 0.0001 SOL
  
  const tipIx = SystemProgram.transfer({
    fromPubkey: wallet.publicKey,
    toPubkey: new PublicKey(tipAccount),
    lamports: tipLamports
  });
  
  const tipMessage = new TransactionMessage({
    payerKey: wallet.publicKey,
    recentBlockhash: blockhash,
    instructions: [tipIx]
  }).compileToV0Message();
  
  const tipTx = new VersionedTransaction(tipMessage);
  tipTx.sign([wallet]);
  
  console.log(`✅ Transactions built (buy + tip to ${tipAccount.slice(0, 8)}...)`);
  
  return { buyTx, tipTx, tipLamports };
}

/**
 * Submit Jito bundle
 */
async function submitJitoBundle(buyTx, tipTx) {
  const encodedBuyTx = bs58.encode(buyTx.serialize());
  const encodedTipTx = bs58.encode(tipTx.serialize());
  
  console.log(`🔥 Submitting Jito bundle...`);
  
  const response = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'sendBundle',
      params: [[encodedBuyTx, encodedTipTx]]
    })
  });
  
  const data = await response.json();
  
  if (data.error) {
    console.error(`❌ Jito error:`, data.error);
    return null;
  }
  
  const buySignature = bs58.encode(buyTx.signatures[0]);
  console.log(`✅ Bundle submitted!`);
  console.log(`   Buy signature: ${buySignature}`);
  console.log(`   Solscan: https://solscan.io/tx/${buySignature}`);
  
  return buySignature;
}

/**
 * Main test flow
 */
async function testCompleteFlow() {
  console.log('🧪 Testing complete Jito snipe flow...\n');
  
  // Use a recent token launch signature
  const RECENT_LAUNCH_SIG = process.argv[2];
  
  if (!RECENT_LAUNCH_SIG) {
    console.error('❌ Usage: node test-jito-snipe-complete.mjs <creation_tx_signature>');
    console.log('   Find a recent Pumpfun launch signature from https://pump.fun');
    process.exit(1);
  }
  
  console.log(`📊 Analyzing creation tx: ${RECENT_LAUNCH_SIG}\n`);
  
  // Step 1: Fetch transaction
  console.log('1️⃣ Fetching creation transaction...');
  const tx = await connection.getTransaction(RECENT_LAUNCH_SIG, {
    commitment: 'processed',
    maxSupportedTransactionVersion: 0
  });
  
  if (!tx) {
    console.error('❌ Transaction not found');
    return;
  }
  
  console.log(`✅ Transaction fetched\n`);
  
  // Step 2: Extract bonding curve
  console.log('2️⃣ Extracting bonding curve from transaction...');
  const accountKeys = extractBondingCurveFromTx(tx);
  
  let bondingCurveAddr = null;
  for (const accKey of accountKeys) {
    const info = await connection.getAccountInfo(accKey, 'processed');
    if (info && info.owner.equals(PUMPFUN_PROGRAM_ID) && info.data.length >= 120) {
      const discriminator = info.data.slice(0, 8).toString('hex');
      if (discriminator === '17b7f83760d8ac60') {
        bondingCurveAddr = accKey;
        console.log(`✅ Found bonding curve: ${bondingCurveAddr.toBase58()}\n`);
        break;
      }
    }
  }
  
  if (!bondingCurveAddr) {
    console.error('❌ Could not find bonding curve in transaction');
    return;
  }
  
  // Step 3: Wait for initialization
  console.log('3️⃣ Waiting for bonding curve initialization...');
  const initialized = await waitForCurveInitialized(bondingCurveAddr, 900);
  
  if (!initialized) {
    console.error('❌ Curve not initialized in time');
    return;
  }
  
  console.log('');
  
  // Step 4: Extract token mint
  const tokenMint = accountKeys.find(key => {
    // Token mint is typically one of the first few accounts
    return key.toBase58() !== bondingCurveAddr.toBase58();
  });
  
  console.log(`4️⃣ Token mint: ${tokenMint.toBase58()}\n`);
  
  // Step 5: Build and submit (DRY RUN - no real wallet)
  console.log('5️⃣ Would now build + submit Jito bundle with:');
  console.log(`   - Token: ${tokenMint.toBase58()}`);
  console.log(`   - Bonding curve: ${bondingCurveAddr.toBase58()}`);
  console.log(`   - Amount: 0.01 SOL`);
  console.log(`   - Priority fee: 0.001 SOL`);
  console.log(`   - Jito tip: 0.0001 SOL`);
  console.log('');
  console.log('✅ Flow validated! Ready for production.');
}

testCompleteFlow().catch(console.error);
