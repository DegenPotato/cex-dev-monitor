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
  SystemProgram,
  Commitment
} from '@solana/web3.js';
// @ts-ignore - node-fetch types not needed for runtime
import fetch from 'node-fetch';
import { getWalletManager } from './wallet.js';
import { execute, queryOne } from '../database/helpers.js';
import { TokenPriceOracle } from '../services/TokenPriceOracle.js';

const JUPITER_API_URL = 'https://lite-api.jup.ag/swap/v1';
const JITO_API_URL = process.env.JITO_API_URL || 'https://mainnet.block-engine.jito.wtf/api/v1';

export interface TradeParams {
  userId: number;
  walletAddress?: string;  // Use specific wallet or default
  tokenMint: string;
  tokenSymbol?: string;  // Pass from frontend to avoid lookup
  amount: number;  // In SOL or token units
  slippageBps?: number;  // Default 100 (1%)
  priorityLevel?: 'low' | 'medium' | 'high' | 'turbo';
  commitmentLevel?: 'processing' | 'confirmed' | 'finalized';  // Default 'confirmed'
  jitoTip?: number;  // In SOL
  skipTax?: boolean;  // Override tax for special cases
}

export interface TradeResult {
  success: boolean;
  signature?: string;
  error?: string;
  amountIn?: number;
  amountOut?: number;
  tokenSymbol?: string;  // Token symbol (for display)
  tokenMint?: string;    // Token mint address
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
      const inputMint = 'So11111111111111111111111111111111111111112'; // SOL (native mint)
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
      console.log('💾 Logging buy transaction to database...');
      try {
        await this.logTransaction({
          userId: params.userId,
          walletAddress,
          signature,
          type: 'buy',
          tokenMint: params.tokenMint,
          tokenSymbol: params.tokenSymbol || 'UNKNOWN',
          amountIn: params.amount,
          amountOut: Number(quoteData.outAmount) / Math.pow(10, quoteData.outputDecimals || 9),
          netAmount,
          taxAmount,
          slippageBps: params.slippageBps || 100,
          priorityFee: this.getPriorityFee(params.priorityLevel),
          jitoTip: params.jitoTip || 0,
          priceImpact: quoteData.priceImpactPct || 0
        });
        console.log('✅ Buy transaction logged successfully');
      } catch (logError) {
        console.error('❌ CRITICAL: Failed to log buy transaction:', logError);
      }

      // Wait for confirmation
      const commitment = (params.commitmentLevel || 'confirmed') as Commitment;
      await this.connection.confirmTransaction(signature, commitment);

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
    } catch (error: any) {
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
        console.log(`📊 Token balance: ${balance}, selling ${params.percentage}% = ${amountToSell} tokens`);
      }

      // Get Jupiter quote
      const inputMint = params.tokenMint;
      const outputMint = 'So11111111111111111111111111111111111111112'; // SOL (native mint)

      // Need to get token decimals and symbol
      const tokenInfo = await this.getTokenInfo(params.tokenMint, params.tokenSymbol);
      const amountRaw = Math.floor(amountToSell * Math.pow(10, tokenInfo.decimals));

      console.log(`🎯 Selling ${amountToSell} ${tokenInfo.symbol || 'tokens'} (${amountRaw} raw) for SOL`);

      // Use higher slippage for sells (500 = 5%) to avoid failures
      const slippageBps = params.slippageBps || 500;
      
      const quoteResponse = await fetch(
        `${JUPITER_API_URL}/quote?` +
        `inputMint=${inputMint}&` +
        `outputMint=${outputMint}&` +
        `amount=${amountRaw}&` +
        `slippageBps=${slippageBps}&` +
        `onlyDirectRoutes=false&` +
        `asLegacyTransaction=false`
      );

      if (!quoteResponse.ok) {
        throw new Error(`Jupiter quote failed: ${await quoteResponse.text()}`);
      }

      const quoteData = await quoteResponse.json();
      const outputSol = Number(quoteData.outAmount) / LAMPORTS_PER_SOL;
      console.log(`💱 Will receive: ${outputSol} SOL`);

      // Calculate tax on the SOL received
      const { netAmount, taxAmount } = this.calculateTax(outputSol, params.skipTax);
      
      if (taxAmount > 0) {
        console.log(`💰 Tax will be collected: ${taxAmount} SOL (${this.tradingTaxBps / 100}%)`);
        console.log(`   Net SOL after tax: ${netAmount} SOL`);
      }

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
      console.log('💾 Logging sell transaction to database...');
      try {
        await this.logTransaction({
          userId: params.userId,
          walletAddress,
          signature,
          type: 'sell',
          tokenMint: params.tokenMint,
          tokenSymbol: tokenInfo.symbol || 'UNKNOWN',
          amountIn: amountToSell,
          amountOut: outputSol,
          netAmount, // Net SOL after tax
          taxAmount, // Tax calculated on SOL received
          slippageBps: slippageBps,
          priorityFee: this.getPriorityFee(params.priorityLevel),
          jitoTip: params.jitoTip || 0,
          priceImpact: quoteData.priceImpactPct || 0
        });
        console.log('✅ Sell transaction logged successfully');
      } catch (logError) {
        console.error('❌ CRITICAL: Failed to log sell transaction:', logError);
      }

      // Wait for confirmation
      const commitment = (params.commitmentLevel || 'confirmed') as Commitment;
      await this.connection.confirmTransaction(signature, commitment);

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
        amountIn: amountToSell,
        amountOut: outputSol,
        tokenSymbol: tokenInfo.symbol || 'UNKNOWN',
        tokenMint: params.tokenMint,
        priceImpact: quoteData.priceImpactPct,
        fee: this.getPriorityFee(params.priorityLevel) / LAMPORTS_PER_SOL,
        taxAmount,
        netAmount
      };
    } catch (error: any) {
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
      const splToken = await import('@solana/spl-token');
      const { Token, TOKEN_PROGRAM_ID } = splToken as any;
      
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
        tokenSymbol: params.tokenSymbol || 'UNKNOWN',
        amountIn: params.amount,
        amountOut: params.amount,
        netAmount: params.amount,
        taxAmount: 0,
        slippageBps: 0,
        priorityFee: this.getPriorityFee(params.priorityLevel),
        jitoTip: 0,
        priceImpact: 0
      });

      const commitment = (params.commitmentLevel || 'confirmed') as Commitment;
      await this.connection.confirmTransaction(signature, commitment);

      return {
        success: true,
        signature,
        amountIn: params.amount,
        amountOut: params.amount
      };
    } catch (error: any) {
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
   * Get token info using TokenPriceOracle (GeckoTerminal/Helius)
   */
  private async getTokenInfo(mint: string, symbolHint?: string): Promise<{ decimals: number; symbol?: string }> {
    try {
      // Get decimals from blockchain (always reliable)
      const mintPubkey = new PublicKey(mint);
      const mintInfo = await this.connection.getParsedAccountInfo(mintPubkey);
      const data = (mintInfo.value?.data as any);
      const decimals = data?.parsed?.info?.decimals || 9;
      
      // If symbol hint provided from frontend, use it
      if (symbolHint) {
        return { decimals, symbol: symbolHint };
      }
      
      // Otherwise, try TokenPriceOracle (GeckoTerminal)
      try {
        const oracle = TokenPriceOracle.getInstance();
        const tokenData = await oracle.getTokenPrice(mint);
        
        if (tokenData?.symbol) {
          return { decimals, symbol: tokenData.symbol };
        }
      } catch (error) {
        console.warn(`⚠️ Could not fetch token metadata from oracle (${mint.slice(0, 8)}...), using default`);
      }
      
      return { decimals, symbol: 'TOKEN' };
    } catch (error) {
      console.error('Error getting token info:', error);
      return { decimals: 9, symbol: 'TOKEN' };
    }
  }

  // ... (rest of the code remains the same)
  /**
   * Log transaction to database with full details
   */
  private async logTransaction(data: any): Promise<void> {
    console.log('📝 [logTransaction] Starting with data:', {
      userId: data.userId,
      walletAddress: data.walletAddress?.substring(0, 8) + '...',
      type: data.type,
      signature: data.signature?.substring(0, 8) + '...',
      tokenMint: data.tokenMint?.substring(0, 8) + '...'
    });
    
    try {
      // Get wallet ID
      const wallet = await queryOne(
        'SELECT id FROM trading_wallets WHERE public_key = ? AND is_deleted = 0',
        [data.walletAddress]
      ) as any;
      
      if (!wallet) {
        console.error('❌ [logTransaction] Wallet not found:', data.walletAddress);
        throw new Error('Wallet not found in database');
      }
      
      console.log('✅ [logTransaction] Found wallet ID:', wallet.id);

      // Get token metadata from oracle
      let tokenName = data.tokenSymbol;
      let tokenPriceUsd = 0;
      let solPriceUsd = 186.42; // Default, will be replaced by oracle

      try {
        const oracle = TokenPriceOracle.getInstance();
        const tokenData = await oracle.getTokenPrice(data.tokenMint);
        if (tokenData) {
          tokenName = tokenData.name;
          tokenPriceUsd = tokenData.priceUsd;
        }
        
        // Get SOL price
        const solData = await oracle.getTokenPrice('So11111111111111111111111111111111111111112');
        if (solData) {
          solPriceUsd = solData.priceUsd;
        }
      } catch (e) {
        console.warn('Could not fetch token prices for trade logging');
      }

      // Calculate total fees and USD values
      const priorityFeeSol = (data.priorityFee || 0) / LAMPORTS_PER_SOL;
      const jitoTipSol = data.jitoTip || 0;
      const taxAmountSol = data.taxAmount || 0;
      const totalFeeSol = priorityFeeSol + jitoTipSol + taxAmountSol;
      
      // Calculate USD value based on trade type
      let totalValueUsd = 0;
      if (data.type === 'buy') {
        totalValueUsd = data.amountIn * solPriceUsd;
      } else if (data.type === 'sell') {
        totalValueUsd = (data.amountOut || 0) * solPriceUsd;
      }

      console.log('💾 [logTransaction] Inserting into database:', {
        userId: data.userId,
        walletId: wallet?.id,
        type: data.type,
        tokenSymbol: data.tokenSymbol,
        amountIn: data.amountIn,
        amountOut: data.amountOut,
        totalValueUsd
      });

      await execute(`
        INSERT INTO trading_transactions (
          user_id, wallet_id, signature, tx_type, status, 
          token_mint, token_symbol, token_name,
          amount_in, amount_out, price_per_token,
          slippage_bps, priority_fee_sol, jito_tip_sol,
          tax_amount_sol, net_amount_sol, total_fee_sol,
          token_price_usd, sol_price_usd, total_value_usd,
          price_impact_pct,
          created_at
        ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        data.userId,
        wallet?.id,
        data.signature,
        data.type,
        data.tokenMint,
        data.tokenSymbol || 'UNKNOWN',
        tokenName,
        data.amountIn,
        data.amountOut || 0,
        tokenPriceUsd,
        data.slippageBps || 100,
        priorityFeeSol,
        jitoTipSol,
        taxAmountSol,
        data.netAmount || data.amountIn,
        totalFeeSol,
        tokenPriceUsd,
        solPriceUsd,
        totalValueUsd,
        data.priceImpact || 0,
        Math.floor(Date.now() / 1000)
      ]);
      
      console.log('✅ [logTransaction] Transaction inserted successfully into trading_transactions table');

      // Update wallet last used
      if (wallet?.id) {
        await execute(
          'UPDATE trading_wallets SET updated_at = ? WHERE id = ?',
          [Math.floor(Date.now() / 1000), wallet.id]
        );
        console.log('✅ [logTransaction] Wallet last_used timestamp updated');
      }
    } catch (error) {
      console.error('❌ Error logging transaction:', error);
      console.error('❌ Transaction data:', JSON.stringify(data, null, 2));
      
      // Fallback: Try basic insert without new columns
      try {
        console.log('🔄 Attempting fallback transaction logging...');
        const wallet = await queryOne(
          'SELECT id FROM trading_wallets WHERE public_key = ? AND is_deleted = 0',
          [data.walletAddress]
        ) as any;
        
        await execute(`
          INSERT INTO trading_transactions (
            user_id, wallet_id, signature, tx_type, status, token_mint,
            token_symbol, amount_in, amount_out, created_at
          ) VALUES (?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)
        `, [
          data.userId,
          wallet?.id,
          data.signature,
          data.type,
          data.tokenMint,
          data.tokenSymbol || 'UNKNOWN',
          data.amountIn,
          data.amountOut || 0,
          Math.floor(Date.now() / 1000)
        ]);
        console.log('✅ Fallback transaction logging succeeded');
      } catch (fallbackError) {
        console.error('❌ Fallback transaction logging also failed:', fallbackError);
      }
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
