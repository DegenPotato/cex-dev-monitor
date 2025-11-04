/**
 * Trading Engine - Handles real token trading on Solana
 */

import { Connection, Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { queryAll } from '../database/helpers.js';
import { decrypt } from '../utils/encryption.js';

export interface TradeParams {
  userId?: number;
  walletAddress: string;
  tokenMint: string;
  amount: number; // in SOL
  slippageBps?: number;
  priorityFee?: number;
  skipTax?: boolean;
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  tokenAmount?: number;
  error?: string;
}

export class TradingEngine {
  private connection: Connection;
  
  constructor() {
    // Use dedicated RPC for trading
    const rpcUrl = process.env.TRADING_RPC_URL || 
                   'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
    
    this.connection = new Connection(rpcUrl, 'confirmed');
    console.log('💰 [TradingEngine] Initialized with RPC:', rpcUrl.split('/')[2]);
  }

  /**
   * Buy tokens on Pumpfun
   */
  async buyToken(params: TradeParams): Promise<TradeResult> {
    try {
      console.log('🔴 [TradingEngine] LIVE BUY REQUEST:', {
        token: params.tokenMint,
        amount: params.amount,
        wallet: params.walletAddress.substring(0, 8) + '...',
        slippage: params.slippageBps,
        priority: params.priorityFee
      });

      // Get wallet keypair
      const wallet = await this.getWalletKeypair(params.walletAddress);
      if (!wallet) {
        return { success: false, error: 'Wallet not found or unauthorized' };
      }

      // Check SOL balance
      const balance = await this.connection.getBalance(wallet.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;
      
      if (balanceSOL < params.amount + (params.priorityFee || 0.001)) {
        return { 
          success: false, 
          error: `Insufficient balance: ${balanceSOL.toFixed(4)} SOL (need ${params.amount + (params.priorityFee || 0.001)} SOL)` 
        };
      }

      console.log(`💳 [TradingEngine] Wallet balance: ${balanceSOL.toFixed(4)} SOL`);

      // TODO: Implement actual Pumpfun buy transaction
      // This requires:
      // 1. Deriving the bonding curve PDA
      // 2. Getting the current price from the bonding curve
      // 3. Building the buy instruction for Pumpfun program
      // 4. Adding priority fee if specified
      // 5. Signing and sending the transaction

      // For now, create a simple SOL transfer as a test
      const transaction = new Transaction();
      
      // Add priority fee if specified
      if (params.priorityFee) {
        // TODO: Add compute budget instruction
      }

      // For testing: Just transfer 0.001 SOL to a burn address
      const testTransfer = SystemProgram.transfer({
        fromPubkey: wallet.publicKey,
        toPubkey: new PublicKey('11111111111111111111111111111111'), // System program (effectively burns)
        lamports: 0.001 * LAMPORTS_PER_SOL
      });
      
      transaction.add(testTransfer);
      
      // Get recent blockhash
      const { blockhash } = await this.connection.getLatestBlockhash();
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = wallet.publicKey;
      
      // Sign and send
      transaction.sign(wallet);
      
      const signature = await this.connection.sendRawTransaction(
        transaction.serialize(),
        { skipPreflight: false }
      );
      
      console.log(`✅ [TradingEngine] Transaction sent: ${signature}`);
      
      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');
      
      console.log(`✅ [TradingEngine] Transaction confirmed!`);
      console.log(`🔗 View on Solscan: https://solscan.io/tx/${signature}`);
      
      return {
        success: true,
        signature,
        tokenAmount: params.amount * 1000000 // Estimated tokens (placeholder)
      };
      
    } catch (error: any) {
      console.error('❌ [TradingEngine] Buy error:', error);
      return {
        success: false,
        error: error.message || 'Unknown error'
      };
    }
  }

  /**
   * Sell tokens on Pumpfun
   */
  async sellToken(params: TradeParams): Promise<TradeResult> {
    console.log('🔴 [TradingEngine] LIVE SELL REQUEST:', params.tokenMint);
    
    // TODO: Implement actual sell transaction
    return {
      success: false,
      error: 'Sell not yet implemented'
    };
  }

  /**
   * Get wallet keypair from database
   */
  private async getWalletKeypair(walletAddress: string): Promise<Keypair | null> {
    try {
      // Query wallet from database
      const wallets = await queryAll<any>(
        `SELECT * FROM trading_wallets WHERE public_key = ? AND is_deleted = 0 LIMIT 1`,
        [walletAddress]
      );
      
      if (wallets.length === 0) {
        console.error('❌ [TradingEngine] Wallet not found:', walletAddress);
        return null;
      }
      
      const wallet = wallets[0];
      
      // Decrypt private key
      const privateKeyString = decrypt(wallet.private_key);
      const privateKeyBytes = Uint8Array.from(
        privateKeyString.match(/.{1,2}/g)!.map((byte: string) => parseInt(byte, 16))
      );
      
      // Create keypair
      return Keypair.fromSecretKey(privateKeyBytes);
      
    } catch (error: any) {
      console.error('❌ [TradingEngine] Failed to get wallet:', error);
      return null;
    }
  }
}

// Export singleton instance
let tradingEngineInstance: TradingEngine | null = null;

export function getTradingEngineInstance(): TradingEngine {
  if (!tradingEngineInstance) {
    tradingEngineInstance = new TradingEngine();
  }
  return tradingEngineInstance;
}

export default TradingEngine;
