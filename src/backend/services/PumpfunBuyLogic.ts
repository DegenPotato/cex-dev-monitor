/**
 * Pumpfun Buy Logic - Implements the actual Pumpfun bonding curve buy instruction
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  TransactionInstruction,
  SystemProgram,
  LAMPORTS_PER_SOL,
  Keypair,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import { detectPumpfunFormat } from './PumpfunFormatDetector.js';
// Pumpfun Program ID
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Pumpfun Global State (usually constant)
const PUMPFUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');

// Pumpfun Fee Recipient
const PUMPFUN_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');

// Event Authority (for logging)
const PUMPFUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

// Constants
const FEE_BASIS_POINTS = 100n; // 1% fee

export interface PumpfunBuyParams {
  connection: Connection;
  wallet: Keypair;
  tokenMint: PublicKey;
  amountSol: number; // Amount in SOL to spend
  slippageBps: number; // Slippage in basis points (100 = 1%)
  priorityFee?: number; // Priority fee in SOL
  bondingCurveAddress?: PublicKey; // Optional - use extracted bonding curve PDA
  associatedBondingCurveAddress?: PublicKey; // Optional - use extracted associated bonding curve
  curveData?: BondingCurveData | null; // Optional bonding curve snapshot
}

export interface BondingCurveData {
  virtualTokenReserves: bigint;
  virtualSolReserves: bigint;
  realTokenReserves: bigint;
  realSolReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  creator: PublicKey;
}

/**
 * Derive the bonding curve PDA for a token
 */
export function deriveBondingCurvePDA(tokenMint: PublicKey): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from('bonding_curve'),
      tokenMint.toBuffer()
    ],
    PUMPFUN_PROGRAM_ID
  );
}

/**
 * Fetch bonding curve data from chain
 */
export async function fetchBondingCurveData(
  connection: Connection,
  bondingCurve: PublicKey
): Promise<BondingCurveData | null> {
  try {
    let accountInfo = await connection.getAccountInfo(bondingCurve, 'processed');

    if (!accountInfo) {
      // Retry a couple of times with small delay in case the account hasn't propagated yet
      for (let attempt = 0; attempt < 2 && !accountInfo; attempt++) {
        await new Promise(resolve => setTimeout(resolve, 150 * (attempt + 1)));
        accountInfo = await connection.getAccountInfo(bondingCurve, 'processed');
      }
    }

    if (!accountInfo) {
      accountInfo = await connection.getAccountInfo(bondingCurve, 'confirmed');
    }

    if (!accountInfo) {
      await new Promise(resolve => setTimeout(resolve, 250));
      accountInfo = await connection.getAccountInfo(bondingCurve, 'confirmed');
    }

    if (!accountInfo) {
      accountInfo = await connection.getAccountInfo(bondingCurve, 'finalized');
    }

    if (!accountInfo) {
      console.warn(`⚠️ [PumpfunBuy] Bonding curve account not yet available: ${bondingCurve.toBase58()}`);
      return null;
    }

    // Parse the account data (this is based on Pumpfun's structure)
    const data = accountInfo.data;
    
    // Skip discriminator (8 bytes)
    let offset = 8;
    
    // Read virtual token reserves (8 bytes)
    const virtualTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Read virtual SOL reserves (8 bytes)
    const virtualSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Read real token reserves (8 bytes)
    const realTokenReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Read real SOL reserves (8 bytes)
    const realSolReserves = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Read token total supply (8 bytes)
    const tokenTotalSupply = data.readBigUInt64LE(offset);
    offset += 8;
    
    // Read complete flag (1 byte)
    const complete = data[offset] === 1;
    offset += 1;
    
    // Read creator (32 bytes)
    const creatorBytes = data.slice(offset, offset + 32);
    const creator = new PublicKey(creatorBytes);
    
    return {
      virtualTokenReserves,
      virtualSolReserves,
      realTokenReserves,
      realSolReserves,
      tokenTotalSupply,
      complete,
      creator
    };
  } catch (error) {
    console.error('Error fetching bonding curve data:', error);
    return null;
  }
}

/**
 * Calculate buy amount using constant product formula
 */
export function calculateBuyAmount(
  solAmount: bigint,
  virtualSolReserves: bigint,
  virtualTokenReserves: bigint
): bigint {
  // Apply fee (1%)
  const solAmountAfterFee = (solAmount * (10000n - FEE_BASIS_POINTS)) / 10000n;
  
  // Calculate using constant product formula: x * y = k
  // New token amount = virtualTokenReserves - (k / (virtualSolReserves + solAmountAfterFee))
  const k = virtualSolReserves * virtualTokenReserves;
  const newSolReserves = virtualSolReserves + solAmountAfterFee;
  const newTokenReserves = k / newSolReserves;
  const tokensToBuy = virtualTokenReserves - newTokenReserves;
  
  return tokensToBuy;
}

/**
 * Build Pumpfun buy instruction
 */
export async function buildPumpfunBuyInstruction(
  params: PumpfunBuyParams
): Promise<Transaction> {
  const { connection, wallet, tokenMint, amountSol, slippageBps, priorityFee, bondingCurveAddress, associatedBondingCurveAddress, curveData: providedCurve } = params;
  
  // Use provided bonding curve address OR derive it
  let bondingCurve: PublicKey;
  if (bondingCurveAddress) {
    bondingCurve = bondingCurveAddress;
    console.log(`✅ [PumpfunBuy] Using extracted bonding curve: ${bondingCurve.toBase58()}`);
  } else {
    [bondingCurve] = deriveBondingCurvePDA(tokenMint);
    console.log(`🧮 [PumpfunBuy] Derived bonding curve PDA: ${bondingCurve.toBase58()}`);
  }
  
  // Use provided associated bonding curve OR derive it
  let associatedBondingCurve: PublicKey;
  if (associatedBondingCurveAddress) {
    associatedBondingCurve = associatedBondingCurveAddress;
    console.log(`✅ [PumpfunBuy] Using extracted associated bonding curve: ${associatedBondingCurve.toBase58()}`);
  } else {
    associatedBondingCurve = await getAssociatedTokenAddress(
      tokenMint,
      bondingCurve,
      true // Allow owner off curve
    );
    console.log(`🧮 [PumpfunBuy] Derived associated bonding curve: ${associatedBondingCurve.toBase58()}`);
  }
  
  // Get user's associated token account
  const userAta = await getAssociatedTokenAddress(
    tokenMint,
    wallet.publicKey
  );
  
  // Fetch bonding curve data (PumpfunSniper already polled for initialization)
  const curveData = providedCurve || await fetchBondingCurveData(connection, bondingCurve);
  if (!curveData) {
    throw new Error('Failed to fetch bonding curve data');
  }
  
  if (curveData.complete) {
    throw new Error('Token has already graduated from bonding curve');
  }
  
  // Calculate expected tokens
  const solAmountLamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
  const expectedTokens = calculateBuyAmount(
    solAmountLamports,
    curveData.virtualSolReserves,
    curveData.virtualTokenReserves
  );
  
  // Apply slippage
  const minTokensOut = (expectedTokens * BigInt(10000 - slippageBps)) / 10000n;
  
  console.log(`💰 Buying with ${amountSol} SOL`);
  console.log(`📊 Expected tokens: ${expectedTokens.toString()}`);
  console.log(`📉 Min tokens (with ${slippageBps/100}% slippage): ${minTokensOut.toString()}`);
  
  // Create transaction
  const transaction = new Transaction();
  
  // Add priority fee if specified (Jupiter-style)
  if (priorityFee && priorityFee > 0) {
    // Set compute unit limit (standard for Pumpfun transactions)
    const computeUnitLimit = 400000;
    transaction.add(
      ComputeBudgetProgram.setComputeUnitLimit({
        units: computeUnitLimit
      })
    );
    
    // Calculate price per compute unit
    // priorityFee is in SOL, convert to micro-lamports per compute unit
    // Formula: (priorityFee in SOL * LAMPORTS_PER_SOL * 1,000,000) / computeUnits
    const microLamportsPerComputeUnit = Math.floor(
      (priorityFee * LAMPORTS_PER_SOL * 1000000) / computeUnitLimit
    );
    
    transaction.add(
      ComputeBudgetProgram.setComputeUnitPrice({
        microLamports: microLamportsPerComputeUnit
      })
    );
    
    console.log(`⚡ Priority fee: ${priorityFee} SOL = ${microLamportsPerComputeUnit} µLamports/CU`);
  }
  
  // Create associated token account if needed
  const ataInfo = await connection.getAccountInfo(userAta);
  if (!ataInfo) {
    const createAtaIx = createAssociatedTokenAccountInstruction(
      wallet.publicKey, // payer
      userAta, // ata
      wallet.publicKey, // owner
      tokenMint // mint
    );
    transaction.add(createAtaIx);
  }
  
  // DYNAMIC FORMAT DETECTION: Detect if this token uses 14 or 16-account format
  console.log(`🔍 [PumpfunBuy] Detecting instruction format...`);
  const format = await detectPumpfunFormat(connection, tokenMint);
  
  if (!format) {
    throw new Error('Could not detect Pumpfun buy format - no recent buy transactions found');
  }
  
  console.log(`✅ [PumpfunBuy] Detected ${format.accountCount}-account format (${format.hasCreatorVault ? 'WITH' : 'WITHOUT'} creator fee)`);
  
  // Build buy instruction data
  const instructionData = Buffer.alloc(24);
  
  // Use discriminator from detected format
  const discBytes = Buffer.from(format.discriminator, 'hex');
  discBytes.copy(instructionData, 0);
  
  // Amount (8 bytes)
  instructionData.writeBigUInt64LE(solAmountLamports, 8);
  
  // Max sol cost (8 bytes) - same as amount for simplicity
  instructionData.writeBigUInt64LE(solAmountLamports, 16);
  
  // Build account list based on detected format
  const accountKeys = [
    { pubkey: PUMPFUN_GLOBAL, isSigner: false, isWritable: false },           // 0
    { pubkey: PUMPFUN_FEE_RECIPIENT, isSigner: false, isWritable: true },     // 1
    { pubkey: tokenMint, isSigner: false, isWritable: false },                // 2
    { pubkey: bondingCurve, isSigner: false, isWritable: true },              // 3
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },    // 4
    { pubkey: userAta, isSigner: false, isWritable: true },                   // 5
    { pubkey: wallet.publicKey, isSigner: true, isWritable: true },           // 6
    { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },  // 7
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },         // 8
    { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false }, // 9
    { pubkey: PUMPFUN_EVENT_AUTHORITY, isSigner: false, isWritable: false },  // 10
    { pubkey: PUMPFUN_PROGRAM_ID, isSigner: false, isWritable: false }        // 11
  ];
  
  // Add creator vault accounts if format requires them (16-account format)
  if (format.hasCreatorVault && format.vaultAuthority && format.vaultPda) {
    console.log(`💰 [PumpfunBuy] Adding creator vault accounts:`);
    console.log(`   Vault Authority: ${format.vaultAuthority.toBase58()}`);
    console.log(`   Vault PDA: ${format.vaultPda.toBase58()}`);
    
    accountKeys.push(
      { pubkey: format.vaultAuthority, isSigner: false, isWritable: false },  // 12
      { pubkey: format.vaultPda, isSigner: false, isWritable: true }          // 13
    );
  }
  
  console.log(`📋 [PumpfunBuy] Building instruction with ${accountKeys.length} accounts`);
  
  // Create buy instruction
  const buyInstruction = new TransactionInstruction({
    keys: accountKeys,
    programId: PUMPFUN_PROGRAM_ID,
    data: instructionData
  });
  
  transaction.add(buyInstruction);
  
  // Set recent blockhash
  const { blockhash } = await connection.getLatestBlockhash();
  transaction.recentBlockhash = blockhash;
  transaction.feePayer = wallet.publicKey;
  
  return transaction;
}

/**
 * Execute a Pumpfun buy
 */
export async function executePumpfunBuy(
  params: PumpfunBuyParams
): Promise<{ signature: string; tokensReceived: string }> {
  const { connection, wallet } = params;
  
  try {
    // Build transaction
    const transaction = await buildPumpfunBuyInstruction(params);
    
    // Sign transaction
    transaction.sign(wallet);
    
    // Send transaction - skipPreflight for SPEED (block 0 entry)
    const signature = await connection.sendRawTransaction(
      transaction.serialize(),
      {
        skipPreflight: true, // Skip simulation for fastest execution
        maxRetries: 3
      }
    );
    
    console.log(`📤 Transaction sent: ${signature}`);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      // Decode which account failed if it's an InstructionError
      const error = confirmation.value.err as any;
      if (error.InstructionError && Array.isArray(error.InstructionError)) {
        const accountIndex = error.InstructionError[0];
        const errorDetails = error.InstructionError[1];
        
        // Map account indices to names (based on buyInstruction.keys order)
        const accountNames = [
          '0: PUMPFUN_GLOBAL',
          '1: PUMPFUN_FEE_RECIPIENT',
          '2: tokenMint',
          '3: bondingCurve PDA ⚠️',
          '4: associatedBondingCurve',
          '5: userAta',
          '6: wallet.publicKey',
          '7: SystemProgram',
          '8: TOKEN_PROGRAM_ID',
          '9: ASSOCIATED_TOKEN_PROGRAM_ID',
          '10: PUMPFUN_EVENT_AUTHORITY',
          '11: PUMPFUN_PROGRAM_ID'
        ];
        
        const accountName = accountNames[accountIndex] || `Unknown account ${accountIndex}`;
        
        console.error(`❌ Account ${accountIndex} failed: ${accountName}`);
        console.error(`   Error details: ${JSON.stringify(errorDetails)}`);
        
        throw new Error(`Transaction failed at account ${accountIndex} (${accountName}): ${JSON.stringify(confirmation.value.err)}`);
      }
      
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log(`✅ Transaction confirmed: ${signature}`);
    
    // TODO: Parse transaction logs to get actual tokens received
    const tokensReceived = 'Check transaction logs';
    
    return {
      signature,
      tokensReceived
    };
    
  } catch (error: any) {
    console.error('❌ Pumpfun buy error:', error);
    throw error;
  }
}

export default {
  deriveBondingCurvePDA,
  fetchBondingCurveData,
  calculateBuyAmount,
  buildPumpfunBuyInstruction,
  executePumpfunBuy
};
