import { Connection, Keypair, PublicKey, SystemProgram, TransactionMessage, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';

/**
 * Jito Bundle Sniper
 * Uses Jito bundles via HTTP API for block 0 entry on Pumpfun launches
 */
export class JitoSniper {
  private jitoApiUrl: string;
  private jitoTipAccounts: string[];
  
  constructor(
    private connection: Connection,
    jitoApiUrl: string = 'https://mainnet.block-engine.jito.wtf/api/v1'
  ) {
    this.jitoApiUrl = jitoApiUrl;
    
    // Jito tip accounts (hardcoded from their docs)
    this.jitoTipAccounts = [
      '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
      'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
      'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
      'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
      'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
      'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
      'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
      '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT'
    ];
  }
  
  /**
   * Submit a buy transaction as a Jito bundle
   * 
   * @param signedBuyTx - The SIGNED buy transaction (VersionedTransaction)
   * @param wallet - Wallet keypair for signing tip transaction
   * @param tipLamports - Tip amount in lamports (default 100000 = 0.0001 SOL)
   * @returns Transaction signatures
   */
  async submitBuyBundle(
    signedBuyTx: VersionedTransaction,
    wallet: Keypair,
    tipLamports: number = 100000
  ): Promise<{ success: boolean; signatures: string[]; error?: string }> {
    console.log(`🔥 [JitoSniper] Submitting bundle with ${tipLamports / 1e9} SOL tip...`);
    
    try {
      // Select random tip account
      const tipAccount = this.jitoTipAccounts[Math.floor(Math.random() * this.jitoTipAccounts.length)];
      console.log(`💰 [JitoSniper] Using tip account: ${tipAccount}`);
      
      // Create tip transaction (simple SOL transfer to Jito)
      const { blockhash } = await this.connection.getLatestBlockhash('confirmed');
      
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
      
      // Serialize both transactions
      const encodedBuyTx = bs58.encode(signedBuyTx.serialize());
      const encodedTipTx = bs58.encode(tipTx.serialize());
      
      // Submit bundle to Jito
      const response = await fetch(`${this.jitoApiUrl}/bundles`, {
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
        console.error(`❌ [JitoSniper] Jito API error:`, data.error);
        return {
          success: false,
          signatures: [],
          error: data.error.message || JSON.stringify(data.error)
        };
      }
      
      console.log(`✅ [JitoSniper] Bundle submitted! Result:`, data.result);
      
      // Extract signatures
      const buyTxSignature = bs58.encode(signedBuyTx.signatures[0]);
      const tipTxSignature = bs58.encode(tipTx.signatures[0]);
      
      return {
        success: true,
        signatures: [buyTxSignature, tipTxSignature]
      };
      
    } catch (error: any) {
      console.error(`❌ [JitoSniper] Bundle submission failed:`, error.message);
      return {
        success: false,
        signatures: [],
        error: error.message
      };
    }
  }
  
  /**
   * Wait for bundle confirmation by checking transaction signature
   * 
   * @param signature - The buy transaction signature to monitor
   * @param maxAttempts - Maximum polling attempts
   * @returns true if transaction confirmed, false otherwise
   */
  async waitForBundleConfirmation(signature: string, maxAttempts: number = 30): Promise<boolean> {
    console.log(`⏳ [JitoSniper] Waiting for bundle confirmation...`);
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const status = await this.connection.getSignatureStatus(signature);
        
        if (status?.value?.confirmationStatus === 'confirmed' || 
            status?.value?.confirmationStatus === 'finalized') {
          console.log(`✅ [JitoSniper] Bundle confirmed! Status: ${status.value.confirmationStatus}`);
          return true;
        }
        
        if (status?.value?.err) {
          console.error(`❌ [JitoSniper] Transaction failed:`, status.value.err);
          return false;
        }
      } catch (error: any) {
        // Ignore and retry
      }
      
      await new Promise(resolve => setTimeout(resolve, 400)); // Poll every 400ms
    }
    
    console.warn(`⚠️ [JitoSniper] Bundle not confirmed after ${maxAttempts} attempts`);
    return false;
  }
}
