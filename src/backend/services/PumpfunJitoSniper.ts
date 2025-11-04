import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction, ComputeBudgetProgram, TransactionInstruction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createAssociatedTokenAccountInstruction, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID } from '@solana/spl-token';
import { JitoSniper } from './JitoSniper.js';

// Pumpfun constants
const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMPFUN_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMPFUN_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM');
const PUMPFUN_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

/**
 * Pumpfun Jito Sniper
 * Builds Pumpfun buy transactions and submits via Jito bundles for block 0 entry
 */
export class PumpfunJitoSniper {
  private jitoSniper: JitoSniper;
  
  constructor(private connection: Connection) {
    this.jitoSniper = new JitoSniper(connection);
  }
  
  /**
   * Derive bonding curve PDA
   */
  private deriveBondingCurvePDA(tokenMint: PublicKey): [PublicKey, number] {
    return PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), tokenMint.toBuffer()],
      PUMPFUN_PROGRAM_ID
    );
  }
  
  /**
   * Build a Pumpfun buy transaction as VersionedTransaction
   */
  async buildPumpfunBuyTx(
    tokenMint: PublicKey,
    wallet: Keypair,
    solAmount: number,
    priorityFee: number = 0.001
  ): Promise<VersionedTransaction> {
    console.log(`🔨 [PumpfunJitoSniper] Building buy tx for ${tokenMint.toBase58()}...`);
    
    // Derive PDAs
    const [bondingCurve] = this.deriveBondingCurvePDA(tokenMint);
    const associatedBondingCurve = await getAssociatedTokenAddress(
      tokenMint,
      bondingCurve,
      true // allowOwnerOffCurve
    );
    const userAta = await getAssociatedTokenAddress(
      tokenMint,
      wallet.publicKey
    );
    
    const instructions: TransactionInstruction[] = [];
    
    // Add priority fee
    if (priorityFee > 0) {
      const computeUnitLimit = 200000; // Pumpfun buys typically use ~100-150k CUs
      instructions.push(
        ComputeBudgetProgram.setComputeUnitLimit({ units: computeUnitLimit })
      );
      
      const microLamportsPerComputeUnit = Math.floor(
        (priorityFee * LAMPORTS_PER_SOL * 1000000) / computeUnitLimit
      );
      instructions.push(
        ComputeBudgetProgram.setComputeUnitPrice({ microLamports: microLamportsPerComputeUnit })
      );
      
      console.log(`⚡ Priority fee: ${priorityFee} SOL = ${microLamportsPerComputeUnit} µLamports/CU`);
    }
    
    // Create ATA if needed
    const ataInfo = await this.connection.getAccountInfo(userAta);
    if (!ataInfo) {
      console.log(`📝 Creating ATA for user: ${userAta.toBase58()}`);
      instructions.push(
        createAssociatedTokenAccountInstruction(
          wallet.publicKey, // payer
          userAta, // ata
          wallet.publicKey, // owner
          tokenMint // mint
        )
      );
    }
    
    // Build buy instruction data
    const solAmountLamports = BigInt(Math.floor(solAmount * LAMPORTS_PER_SOL));
    const instructionData = Buffer.alloc(24);
    // Instruction discriminator for "buy" (66063d1201daebea)
    instructionData.writeUInt8(0x66, 0);
    instructionData.writeUInt8(0x06, 1);
    instructionData.writeUInt8(0x3d, 2);
    instructionData.writeUInt8(0x12, 3);
    instructionData.writeUInt8(0x01, 4);
    instructionData.writeUInt8(0xda, 5);
    instructionData.writeUInt8(0xeb, 6);
    instructionData.writeUInt8(0xea, 7);
    instructionData.writeBigUInt64LE(solAmountLamports, 8); // amount
    instructionData.writeBigUInt64LE(solAmountLamports, 16); // max sol cost
    
    // Add Pumpfun buy instruction
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
    
    // Build VersionedTransaction
    const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
    const message = new TransactionMessage({
      payerKey: wallet.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    
    const tx = new VersionedTransaction(message);
    tx.sign([wallet]);
    
    console.log(`✅ [PumpfunJitoSniper] Buy tx built and signed`);
    return tx;
  }
  
  /**
   * Snipe a token using Jito bundle
   */
  async snipeToken(
    tokenMint: string,
    wallet: Keypair,
    solAmount: number,
    priorityFee: number = 0.001,
    jitoTipLamports: number = 100000
  ): Promise<{ success: boolean; signature?: string; error?: string }> {
    try {
      console.log(`🎯 [PumpfunJitoSniper] Sniping ${tokenMint} with ${solAmount} SOL...`);
      
      // Build buy transaction
      const buyTx = await this.buildPumpfunBuyTx(
        new PublicKey(tokenMint),
        wallet,
        solAmount,
        priorityFee
      );
      
      // Submit bundle
      const bundleResult = await this.jitoSniper.submitBuyBundle(
        buyTx,
        wallet,
        jitoTipLamports
      );
      
      if (!bundleResult.success) {
        return {
          success: false,
          error: bundleResult.error
        };
      }
      
      const signature = bundleResult.signatures[0];
      console.log(`🔗 [PumpfunJitoSniper] Buy tx: https://solscan.io/tx/${signature}`);
      
      // Wait for confirmation
      const confirmed = await this.jitoSniper.waitForBundleConfirmation(signature, 30);
      
      if (!confirmed) {
        return {
          success: false,
          signature,
          error: 'Bundle not confirmed in time'
        };
      }
      
      console.log(`✅ [PumpfunJitoSniper] Snipe successful!`);
      return {
        success: true,
        signature
      };
      
    } catch (error: any) {
      console.error(`❌ [PumpfunJitoSniper] Snipe failed:`, error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}
