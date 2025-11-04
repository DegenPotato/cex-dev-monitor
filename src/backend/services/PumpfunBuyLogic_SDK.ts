/**
 * Pumpfun Buy Logic - Uses official Pump.fun SDK
 */

import { 
  Connection, 
  PublicKey, 
  Transaction, 
  LAMPORTS_PER_SOL,
  Keypair,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { PumpSdk } from '@pump-fun/pump-sdk';
import { AnchorProvider, Wallet } from '@coral-xyz/anchor';

export interface PumpfunBuyParams {
  connection: Connection;
  wallet: Keypair;
  tokenMint: PublicKey;
  amountSol: number; // Amount in SOL to spend
  slippageBps: number; // Slippage in basis points (100 = 1%)
  priorityFee?: number; // Priority fee in SOL
  bondingCurveAddress?: PublicKey; // Optional - ignored, SDK handles it
  associatedBondingCurveAddress?: PublicKey; // Optional - ignored, SDK handles it
  curveData?: any; // Optional - ignored, SDK fetches fresh
}

export interface PumpfunBuyResult {
  signature: string;
  tokensReceived: string;
}

/**
 * Execute Pumpfun buy using official SDK
 */
export async function executePumpfunBuy(
  params: PumpfunBuyParams
): Promise<PumpfunBuyResult> {
  const { connection, wallet, tokenMint, amountSol, slippageBps, priorityFee } = params;
  
  console.log(`💰 [PumpfunBuy SDK] Buying ${amountSol} SOL worth of ${tokenMint.toBase58()}`);
  console.log(`📉 Slippage: ${slippageBps / 100}%`);
  
  // Initialize SDK
  const anchorWallet = new Wallet(wallet);
  const provider = new AnchorProvider(connection, anchorWallet, { commitment: 'confirmed' });
  const sdk = new PumpSdk(provider);
  
  try {
    // Build buy instructions using SDK
    const solAmountLamports = BigInt(Math.floor(amountSol * LAMPORTS_PER_SOL));
    const maxSolCost = solAmountLamports; // Same as amount for now
    
    console.log(`🔨 [PumpfunBuy SDK] Building instructions...`);
    const instructions = await sdk.buyInstructions(
      tokenMint,
      solAmountLamports,
      slippageBps,
      maxSolCost
    );
    
    console.log(`✅ [PumpfunBuy SDK] Generated ${instructions.length} instructions`);
    
    // Create transaction
    const transaction = new Transaction();
    
    // Add priority fee if specified
    if (priorityFee && priorityFee > 0) {
      const computeUnitLimit = 400000;
      transaction.add(
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
      );
      
      const microLamportsPerComputeUnit = Math.floor(
        (priorityFee * LAMPORTS_PER_SOL * 1000000) / computeUnitLimit
      );
      
      transaction.add(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerComputeUnit })
      );
      
      console.log(`⚡ Priority fee: ${priorityFee} SOL = ${microLamportsPerComputeUnit} µLamports/CU`);
    }
    
    // Add SDK instructions
    instructions.forEach(ix => transaction.add(ix));
    
    // Set blockhash
    const { blockhash } = await connection.getLatestBlockhash();
    transaction.recentBlockhash = blockhash;
    transaction.feePayer = wallet.publicKey;
    
    // Sign transaction
    transaction.sign(wallet);
    
    // Send transaction
    console.log(`📤 [PumpfunBuy SDK] Sending transaction...`);
    const signature = await connection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: true,
      maxRetries: 3
    });
    
    console.log(`📤 Transaction sent: ${signature}`);
    
    // Wait for confirmation
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    console.log(`✅ [PumpfunBuy SDK] Transaction confirmed!`);
    
    // Return result (estimate tokens for now)
    return {
      signature,
      tokensReceived: (amountSol * 2000000000).toString() // Rough estimate
    };
    
  } catch (error: any) {
    console.error(`❌ [PumpfunBuy SDK] Error:`, error.message);
    throw error;
  }
}
