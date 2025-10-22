/**
 * Universal Solana Trading Engine
 * Jupiter aggregation + Jito MEV protection + Helius RPC
 */

import {
  Connection,
  PublicKey,
  Transaction,
  VersionedTransaction,
  ComputeBudgetProgram,
  LAMPORTS_PER_SOL,
  SystemProgram
} from '@solana/web3.js';
import fetch from 'node-fetch';
import { getWalletManager } from './wallet.js';
import { execute, queryOne } from '../database/helpers.js';

const JUPITER_API_URL = 'https://quote-api.jup.ag/v6';
const JITO_API_URL = process.env.JITO_API_URL || 'https://mainnet.block-engine.jito.wtf/api/v1';

export interface TradeParams {
  userId: number;
  walletAddress?: string;  // Use specific wallet or default
  tokenMint: string;
  amount: number;  // In SOL or token units
  slippageBps?: number;  // Default 100 (1%)
  priorityLevel?: 'low' | 'medium' | 'high' | 'turbo';
  jitoTip?: number;  // In SOL
  skipTax?: boolean;  // Override tax for special cases
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  amountIn?: number;
  amountOut?: number;
  priceImpact?: number;
  fee?: number;
  taxAmount?: number;  // Tax collected
  netAmount?: number;  // Amount after tax
}

export class TradingEngine {
  private connection: Connection;
  private walletManager = getWalletManager();
  private tradingTaxBps: number;  // Tax in basis points (87 = 0.87%)
  private taxRecipientAddress?: string;  // Where to send tax

  constructor(rpcUrl?: string) {
    const heliusKey = process.env.HELIUS_API_KEY;
    const url = rpcUrl || 
                (heliusKey ? `https://mainnet.helius-rpc.com/?api-key=${heliusKey}` : 'https://api.mainnet-beta.solana.com');
    this.connection = new Connection(url, 'confirmed');
    
    // Load tax configuration (default 0.87% = 87 basis points)
    this.tradingTaxBps = parseInt(process.env.TRADING_TAX_BPS || '87');
    this.taxRecipientAddress = process.env.TRADING_TAX_RECIPIENT;
    
    if (this.tradingTaxBps > 0) {
      console.log(`💰 Trading tax enabled: ${this.tradingTaxBps / 100}%`);
    }
  }
  
  /**
   * Calculate tax amount for a trade
   */
  private calculateTax(amount: number, skipTax?: boolean): { netAmount: number; taxAmount: number } {
    if (skipTax || this.tradingTaxBps === 0 || !this.taxRecipientAddress) {
      return { netAmount: amount, taxAmount: 0 };
    }
    
    const taxAmount = (amount * this.tradingTaxBps) / 10000;
    const netAmount = amount - taxAmount;
    
    return { netAmount, taxAmount };
  }

  /**
   * Buy a token with SOL
   */
  async buyToken(params: TradeParams): Promise<TradeResult> {
    try {
      // Get wallet
      const walletAddress = params.walletAddress || 
        (await this.walletManager.getDefaultWallet(params.userId))?.walletAddress;
      
      if (!walletAddress) {
        throw new Error('No wallet available. Create or import a wallet first.');
      }

      const keypair = await this.walletManager.getKeypair(params.userId, walletAddress);

      // Calculate tax
      const { netAmount, taxAmount } = this.calculateTax(params.amount, params.skipTax);
      
      if (taxAmount > 0) {
        console.log(`💰 Applying ${this.tradingTaxBps / 100}% tax: ${taxAmount} SOL`);
        console.log(`   Net amount for trade: ${netAmount} SOL`);
      }

      // Get Jupiter quote
      const inputMint = 'So11111111111111111111111111111111111112'; // SOL
      const outputMint = params.tokenMint;
      const amountLamports = Math.floor(netAmount * LAMPORTS_PER_SOL);

      console.log(`🎯 Getting Jupiter quote for ${params.amount} SOL -> ${outputMint}`);

      const quoteResponse = await fetch(
        `${JUPITER_API_URL}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountLamports}&` +
        `slippageBps=${params.slippageBps || 100}`
      );

      if (!quoteResponse.ok) {
        throw new Error(`Jupiter quote failed: ${await quoteResponse.text()}`);
      }

      const quoteData = await quoteResponse.json();
      console.log(`💱 Best route found: ${quoteData.outAmount / Math.pow(10, quoteData.outputDecimals || 9)} tokens`);

      // Get swap transaction
      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: keypair.publicKey.toString(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: this.getPriorityFee(params.priorityLevel)
        })
      });

      if (!swapResponse.ok) {
        throw new Error(`Jupiter swap failed: ${await swapResponse.text()}`);
      }

      const { swapTransaction } = await swapResponse.json();
      
      // Decode transaction
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);

      // Sign transaction
      transaction.sign([keypair]);

      // Send with Jito if tip provided
      let signature: string;
      
      if (params.jitoTip && params.jitoTip > 0) {
        signature = await this.sendWithJito(transaction, params.jitoTip);
      } else {
        signature = await this.connection.sendTransaction(transaction);
      }

      console.log(`✅ Transaction sent: ${signature}`);

      // Log to database
      await this.logTransaction({
        userId: params.userId,
        walletAddress,
        signature,
        type: 'buy',
        tokenMint: params.tokenMint,
        amountIn: params.amount,
        amountOut: Number(quoteData.outAmount) / Math.pow(10, quoteData.outputDecimals || 9),
        slippageBps: params.slippageBps || 100,
        priorityFee: this.getPriorityFee(params.priorityLevel),
        jitoTip: params.jitoTip
      });

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      // Send tax if applicable
      if (taxAmount > 0 && this.taxRecipientAddress) {
        try {
          const taxTransaction = new Transaction().add(
            SystemProgram.transfer({
              fromPubkey: keypair.publicKey,
              toPubkey: new PublicKey(this.taxRecipientAddress),
              lamports: Math.floor(taxAmount * LAMPORTS_PER_SOL)
            })
          );
          
          const taxSignature = await this.connection.sendTransaction(taxTransaction, [keypair]);
          console.log(`💰 Tax transferred: ${taxAmount} SOL (tx: ${taxSignature})`);
        } catch (taxError) {
          console.error('Failed to transfer tax (trade still successful):', taxError);
        }
      }

      return {
        success: true,
        signature,
        amountIn: params.amount,
        amountOut: Number(quoteData.outAmount) / Math.pow(10, quoteData.outputDecimals || 9),
        priceImpact: quoteData.priceImpactPct,
        fee: this.getPriorityFee(params.priorityLevel) / LAMPORTS_PER_SOL,
        taxAmount,
        netAmount
      };
    } catch (error) {
      console.error('Buy failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Sell a token for SOL
   */
  async sellToken(params: TradeParams & { percentage?: number }): Promise<TradeResult> {
    try {
      // Get wallet
      const walletAddress = params.walletAddress || 
        (await this.walletManager.getDefaultWallet(params.userId))?.walletAddress;
      
      if (!walletAddress) {
        throw new Error('No wallet available');
      }

      const keypair = await this.walletManager.getKeypair(params.userId, walletAddress);

      // Get token balance if selling percentage
      let amountToSell = params.amount;
      
      if (params.percentage) {
        const balance = await this.getTokenBalance(walletAddress, params.tokenMint);
        amountToSell = balance * (params.percentage / 100);
      }

      // Get Jupiter quote
      const inputMint = params.tokenMint;
      const outputMint = 'So11111111111111111111111111111111111112'; // SOL

      // Need to get token decimals
      const tokenInfo = await this.getTokenInfo(params.tokenMint);
      const amountRaw = Math.floor(amountToSell * Math.pow(10, tokenInfo.decimals));

      console.log(`🎯 Selling ${amountToSell} tokens for SOL`);

      const quoteResponse = await fetch(
        `${JUPITER_API_URL}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountRaw}&` +
        `slippageBps=${params.slippageBps || 100}`
      );

      if (!quoteResponse.ok) {
        throw new Error(`Jupiter quote failed: ${await quoteResponse.text()}`);
      }

      const quoteData = await quoteResponse.json();
      const outputSol = Number(quoteData.outAmount) / LAMPORTS_PER_SOL;
      console.log(`💱 Will receive: ${outputSol} SOL`);

      // Get swap transaction
      const swapResponse = await fetch(`${JUPITER_API_URL}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quoteData,
          userPublicKey: keypair.publicKey.toString(),
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: this.getPriorityFee(params.priorityLevel)
        })
      });

      if (!swapResponse.ok) {
        throw new Error(`Jupiter swap failed: ${await swapResponse.text()}`);
      }

      const { swapTransaction } = await swapResponse.json();
      
      // Decode and sign
      const transactionBuf = Buffer.from(swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(transactionBuf);
      transaction.sign([keypair]);

      // Send transaction
      let signature: string;
      
      if (params.jitoTip && params.jitoTip > 0) {
        signature = await this.sendWithJito(transaction, params.jitoTip);
      } else {
        signature = await this.connection.sendTransaction(transaction);
      }

      console.log(`✅ Sell transaction sent: ${signature}`);

      // Log to database
      await this.logTransaction({
        userId: params.userId,
        walletAddress,
        signature,
        type: 'sell',
        tokenMint: params.tokenMint,
        amountIn: amountToSell,
        amountOut: outputSol,
        slippageBps: params.slippageBps || 100,
        priorityFee: this.getPriorityFee(params.priorityLevel),
        jitoTip: params.jitoTip
      });

      // Wait for confirmation
      await this.connection.confirmTransaction(signature, 'confirmed');

      return {
        success: true,
        signature,
        amountIn: amountToSell,
        amountOut: outputSol,
        priceImpact: quoteData.priceImpactPct,
        fee: this.getPriorityFee(params.priorityLevel) / LAMPORTS_PER_SOL
      };
    } catch (error) {
      console.error('Sell failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Transfer tokens
   */
  async transferToken(
    params: TradeParams & { destination: string }
  ): Promise<TradeResult> {
    try {
      const walletAddress = params.walletAddress || 
        (await this.walletManager.getDefaultWallet(params.userId))?.walletAddress;
      
      if (!walletAddress) {
        throw new Error('No wallet available');
      }

      const keypair = await this.walletManager.getKeypair(params.userId, walletAddress);

      // Create transfer instruction
      const { Token, TOKEN_PROGRAM_ID } = await import('@solana/spl-token');
      
      const fromPubkey = keypair.publicKey;
      const toPubkey = new PublicKey(params.destination);
      const mintPubkey = new PublicKey(params.tokenMint);

      // Get token accounts
      const fromTokenAccount = await Token.getAssociatedTokenAddress(
        TOKEN_PROGRAM_ID,
        mintPubkey,
        fromPubkey
      );

      const toTokenAccount = await Token.getAssociatedTokenAddress(
        TOKEN_PROGRAM_ID,
        mintPubkey,
        toPubkey
      );

      // Create transaction
      const transaction = new Transaction();

      // Add priority fee
      if (params.priorityLevel) {
        transaction.add(
          ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: this.getPriorityFee(params.priorityLevel)
          })
        );
      }

      // Add transfer instruction
      const tokenInfo = await this.getTokenInfo(params.tokenMint);
      const amount = Math.floor(params.amount * Math.pow(10, tokenInfo.decimals));

      transaction.add(
        Token.createTransferInstruction(
          TOKEN_PROGRAM_ID,
          fromTokenAccount,
          toTokenAccount,
          fromPubkey,
          [],
          amount
        )
      );

      // Send transaction
      const signature = await this.connection.sendTransaction(
        transaction,
        [keypair],
        { skipPreflight: false, preflightCommitment: 'confirmed' }
      );

      console.log(`✅ Transfer sent: ${signature}`);

      // Log to database
      await this.logTransaction({
        userId: params.userId,
        walletAddress,
        signature,
        type: 'transfer',
        tokenMint: params.tokenMint,
        amountIn: params.amount,
        amountOut: params.amount,
        slippageBps: 0,
        priorityFee: this.getPriorityFee(params.priorityLevel),
        jitoTip: 0
      });

      await this.connection.confirmTransaction(signature, 'confirmed');

      return {
        success: true,
        signature,
        amountIn: params.amount,
        amountOut: params.amount
      };
    } catch (error) {
      console.error('Transfer failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Send transaction with Jito for MEV protection
   */
  private async sendWithJito(
    transaction: VersionedTransaction,
    tipAmount: number
  ): Promise<string> {
    try {
      const jitoApiKey = process.env.JITO_API_KEY;
      if (!jitoApiKey) {
        console.warn('Jito API key not set, falling back to regular send');
        return await this.connection.sendTransaction(transaction);
      }

      // Add tip to Jito
      const tipLamports = Math.floor(tipAmount * LAMPORTS_PER_SOL);
      
      // Serialize transaction
      const serializedTx = transaction.serialize();
      const base64Tx = Buffer.from(serializedTx).toString('base64');

      // Submit bundle to Jito
      const response = await fetch(`${JITO_API_URL}/bundles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${jitoApiKey}`
        },
        body: JSON.stringify({
          transactions: [base64Tx],
          tip: tipLamports
        })
      });

      if (!response.ok) {
        throw new Error(`Jito submission failed: ${await response.text()}`);
      }

      const result = await response.json();
      console.log(`🛡️ Sent via Jito with ${tipAmount} SOL tip`);
      
      return result.signature || result.bundle_id;
    } catch (error) {
      console.error('Jito send failed, falling back:', error);
      return await this.connection.sendTransaction(transaction);
    }
  }

  /**
   * Get priority fee based on level
   */
  private getPriorityFee(level?: string): number {
    switch (level) {
      case 'turbo': return 50000;   // 0.00005 SOL
      case 'high': return 10000;    // 0.00001 SOL  
      case 'medium': return 5000;   // 0.000005 SOL
      case 'low': return 1000;      // 0.000001 SOL
      default: return 5000;
    }
  }

  /**
   * Get token balance
   */
  private async getTokenBalance(walletAddress: string, tokenMint: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${walletAddress}/balances?api-key=${process.env.HELIUS_API_KEY}`
      );
      
      const data = await response.json();
      const token = data.tokens?.find((t: any) => t.mint === tokenMint);
      
      return token ? token.amount / Math.pow(10, token.decimals) : 0;
    } catch (error) {
      console.error('Error getting token balance:', error);
      return 0;
    }
  }

  /**
   * Get token info
   */
  private async getTokenInfo(mint: string): Promise<{ decimals: number; symbol?: string }> {
    try {
      // Try to get from Jupiter token list
      const response = await fetch('https://token.jup.ag/all');
      const tokens = await response.json();
      const token = tokens.find((t: any) => t.address === mint);
      
      if (token) {
        return {
          decimals: token.decimals,
          symbol: token.symbol
        };
      }

      // Fallback to chain query
      const mintPubkey = new PublicKey(mint);
      const { Mint } = await import('@solana/spl-token');
      const mintInfo = await Mint.getMintInfo(this.connection, mintPubkey);
      
      return {
        decimals: mintInfo.decimals
      };
    } catch (error) {
      console.error('Error getting token info:', error);
      return { decimals: 9 }; // Default to 9
    }
  }

  /**
   * Log transaction to database
   */
  private async logTransaction(data: any): Promise<void> {
    try {
      // Get wallet ID
      const wallet = await queryOne(
        'SELECT id FROM trading_wallets WHERE wallet_address = ?',
        [data.walletAddress]
      );

      await execute(`
        INSERT INTO trading_transactions (
          user_id, wallet_id, signature, tx_type, status, token_mint,
          amount_in, amount_out, slippage_bps, priority_fee_lamports,
          jito_tip_lamports, created_at
        ) VALUES (?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.userId,
        wallet?.id,
        data.signature,
        data.type,
        data.tokenMint,
        data.amountIn,
        data.amountOut,
        data.slippageBps,
        data.priorityFee,
        data.jitoTip ? data.jitoTip * LAMPORTS_PER_SOL : 0,
        Date.now()
      ]);

      // Update wallet last used
      await execute(
        'UPDATE trading_wallets SET last_used_at = ?, last_tx_signature = ? WHERE id = ?',
        [Date.now(), data.signature, wallet?.id]
      );
    } catch (error) {
      console.error('Error logging transaction:', error);
    }
  }
}

// Singleton instance
let tradingEngine: TradingEngine | null = null;

export function getTradingEngine(): TradingEngine {
  if (!tradingEngine) {
    tradingEngine = new TradingEngine();
  }
  return tradingEngine;
}
