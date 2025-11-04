/**
 * Trading Engine - Handles real token trading on Solana
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { queryOne } from '../database/helpers.js';
import { walletStorageServiceCompat } from './WalletStorageServiceCompat.js';
import { executePumpfunBuy } from './PumpfunBuyLogic.js';

export interface TradeParams {
  connection?: Connection; // Optional - use specific connection for consistency
  userId?: number;
  walletAddress: string;
  tokenMint: string;
  amount: number; // in SOL
  slippageBps?: number;
  priorityFee?: number;
  skipTax?: boolean;
  bondingCurveAddress?: string; // Optional - use extracted bonding curve PDA
  associatedBondingCurveAddress?: string; // Optional - use extracted associated bonding curve
  curveData?: {
    virtualTokenReserves?: bigint;
    virtualSolReserves?: bigint;
    realTokenReserves?: bigint;
    realSolReserves?: bigint;
    tokenTotalSupply?: bigint;
    complete?: boolean;
    creator?: PublicKey;
  };
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

      // Use provided connection or default
      const connection = params.connection || this.connection;

      // Get wallet keypair
      const wallet = await this.getWalletKeypair(params.walletAddress);
      if (!wallet) {
        return { success: false, error: 'Wallet not found or unauthorized' };
      }

      // Check SOL balance
      const balance = await connection.getBalance(wallet.publicKey);
      const balanceSOL = balance / LAMPORTS_PER_SOL;
      
      if (balanceSOL < params.amount + (params.priorityFee || 0.001)) {
        return { 
          success: false, 
          error: `Insufficient balance: ${balanceSOL.toFixed(4)} SOL (need ${params.amount + (params.priorityFee || 0.001)} SOL)` 
        };
      }

      console.log(`💳 [TradingEngine] Wallet balance: ${balanceSOL.toFixed(4)} SOL`);

      // Execute Pumpfun buy
      const result = await executePumpfunBuy({
        connection, // Use the same connection for consistency
        wallet,
        tokenMint: new PublicKey(params.tokenMint),
        amountSol: params.amount,
        slippageBps: params.slippageBps || 1000, // Default 10% slippage
        priorityFee: params.priorityFee,
        bondingCurveAddress: params.bondingCurveAddress ? new PublicKey(params.bondingCurveAddress) : undefined,
        associatedBondingCurveAddress: params.associatedBondingCurveAddress ? new PublicKey(params.associatedBondingCurveAddress) : undefined,
        curveData: (params.curveData && params.curveData.creator) ? {
          virtualTokenReserves: params.curveData.virtualTokenReserves || 0n,
          virtualSolReserves: params.curveData.virtualSolReserves || 0n,
          realTokenReserves: params.curveData.realTokenReserves || 0n,
          realSolReserves: params.curveData.realSolReserves || 0n,
          tokenTotalSupply: params.curveData.tokenTotalSupply || 0n,
          complete: params.curveData.complete ?? false,
          creator: params.curveData.creator
        } : undefined
      });
      
      console.log(`✅ [TradingEngine] Buy successful!`);
      console.log(`🔗 View on Solscan: https://solscan.io/tx/${result.signature}`);
      
      return {
        success: true,
        signature: result.signature,
        tokenAmount: parseFloat(result.tokensReceived) || params.amount * 1000000
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
      // Find wallet record and owner
      const wallet = await queryOne<{
        id: number;
        user_id: number;
      }>(
        `SELECT id, user_id FROM trading_wallets WHERE public_key = ? AND is_deleted = 0 LIMIT 1`,
        [walletAddress]
      );

      if (!wallet) {
        console.error('❌ [TradingEngine] Wallet not found:', walletAddress);
        return null;
      }

      try {
        // Decrypt using the same service as Fetcher (supports both schemas)
        const keypair = await walletStorageServiceCompat.getWalletKeypair(wallet.id, wallet.user_id);
        return keypair;
      } catch (error: any) {
        console.error('❌ [TradingEngine] Wallet decryption failed:', error.message || error);
        return null;
      }
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
