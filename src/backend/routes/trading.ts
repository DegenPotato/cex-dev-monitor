/**
 * Trading API Routes
 * Secure wallet management and trading operations
 */

import { Router, Request, Response } from 'express';
import { solPriceOracle } from '../services/SolPriceOracle.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
// import { getWalletManager } from '../core/wallet.js'; // Using walletStorageService instead
import { getTradingEngine } from '../core/trade.js';
import { queryAll, queryOne, execute } from '../database/helpers.js';
// Using compatibility service until migration completes
import { walletStorageServiceCompat as walletStorageService } from '../services/WalletStorageServiceCompat.js';
import { tokenSourceTracker } from '../services/TokenSourceTracker.js';
import { portfolioService } from '../services/PortfolioService.js';

const authService = new SecureAuthService();

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username: string;
    role: string;
  };
}

const router = Router();
// const walletManager = getWalletManager(); // Removed - using walletStorageService
// Lazy load tradingEngine to ensure env vars are loaded first
let tradingEngine: ReturnType<typeof getTradingEngine> | null = null;
const getTradingEngineInstance = () => {
  if (!tradingEngine) tradingEngine = getTradingEngine();
  return tradingEngine;
};

/**
 * Get all wallets for authenticated user
 */
router.get('/api/trading/wallets', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const wallets = await walletStorageService.getUserWallets(userId);
    
    // Enrich each wallet with real-time token holdings
    const enrichedWallets = await Promise.all(
      wallets.map(async (wallet: any) => {
        const portfolio = await portfolioService.getWalletPortfolio(wallet.id, userId);
        return {
          ...wallet,
          balance: portfolio?.solBalance || wallet.balance || 0,
          tokens: portfolio?.tokens || [],
          totalValueUSD: portfolio?.totalValueUSD || 0
        };
      })
    );
    
    res.json({ success: true, wallets: enrichedWallets });
  } catch (error: any) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create new wallet
 */
router.post('/api/trading/wallets/create', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { walletName } = req.body;
    
    const wallet = await walletStorageService.createWallet(userId, walletName);
    
    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Error creating wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import existing wallet
 */
router.post('/api/trading/wallets/import', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { privateKey, walletName } = req.body;
    
    if (!privateKey) {
      return res.status(400).json({ error: 'Private key required' });
    }
    
    const wallet = await walletStorageService.importWallet(userId, privateKey, walletName);
    
    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Error importing wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Export wallet (get private key)
 */
router.get('/api/trading/wallets/:walletId/export', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    const wallet = await walletStorageService.exportWallet(walletId, userId);
    
    res.json({ success: true, ...wallet });
  } catch (error: any) {
    console.error('Error exporting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set default wallet
 */
router.post('/api/trading/wallets/:walletId/default', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    // Reset all wallets to non-default
    await execute('UPDATE trading_wallets SET is_default = 0 WHERE user_id = ?', [userId]);
    
    // Set this wallet as default
    await execute('UPDATE trading_wallets SET is_default = 1 WHERE id = ? AND user_id = ?', [walletId, userId]);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting default wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh wallet balance
 */
router.get('/api/trading/wallets/:walletId/balance', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    // Get wallet public key
    const wallets = await walletStorageService.getUserWallets(userId);
    const wallet = wallets.find(w => w.id === walletId.toString());
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    // Get balance from blockchain
    const { Connection, PublicKey, LAMPORTS_PER_SOL } = await import('@solana/web3.js');
    const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
    const pubkey = new PublicKey(wallet.publicKey);
    const lamports = await connection.getBalance(pubkey);
    const balance = lamports / LAMPORTS_PER_SOL;
    
    // Update in database
    await walletStorageService.updateWalletBalance(walletId, balance);
    
    res.json({ success: true, balance });
  } catch (error: any) {
    console.error('Error refreshing balance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete wallet (soft delete)
 */
router.delete('/api/trading/wallets/:walletId', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    await walletStorageService.deleteWallet(walletId, userId);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Withdraw SOL to user's connected wallet
 */
router.post('/api/trading/wallets/:walletId/withdraw', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    const { amount } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' });
    }
    
    // Get user's connected wallet from users table
    const user = await queryOne('SELECT wallet_address FROM users WHERE id = ?', [userId]) as { wallet_address?: string } | undefined;
    if (!user || !user.wallet_address) {
      return res.status(400).json({ error: 'No connected wallet found. Please connect your wallet in settings.' });
    }
    
    // Get the trading wallet keypair
    const keypair = await walletStorageService.getWalletKeypair(walletId, userId);
    
    // Import Solana dependencies
    const { 
      Connection, 
      PublicKey, 
      LAMPORTS_PER_SOL, 
      Transaction, 
      SystemProgram,
      sendAndConfirmTransaction 
    } = await import('@solana/web3.js');
    
    const connection = new Connection(process.env.RPC_ENDPOINT || 'https://api.mainnet-beta.solana.com');
    
    // Check balance
    const balance = await connection.getBalance(keypair.publicKey);
    const balanceSOL = balance / LAMPORTS_PER_SOL;
    
    if (balanceSOL < amount) {
      return res.status(400).json({ 
        error: `Insufficient balance. Available: ${balanceSOL} SOL, Requested: ${amount} SOL` 
      });
    }
    
    // Create transfer transaction
    const toPubkey = new PublicKey(user.wallet_address!);
    const lamports = Math.floor(amount * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey,
        lamports
      })
    );
    
    // Send and confirm transaction
    console.log(`💸 Withdrawing ${amount} SOL from wallet ${walletId} to ${user.wallet_address!}...`);
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed' }
    );
    
    console.log(`✅ Withdrawal successful: ${signature}`);
    
    // Update balance in database
    const newBalance = await connection.getBalance(keypair.publicKey);
    await walletStorageService.updateWalletBalance(walletId, newBalance / LAMPORTS_PER_SOL);
    
    // Log the withdrawal (optional - you might want to create a withdrawals table)
    await execute(
      `INSERT INTO trading_transactions (user_id, wallet_id, tx_type, signature, amount_out, status, created_at)
       VALUES (?, ?, 'withdraw', ?, ?, 'completed', strftime('%s', 'now'))`,
      [userId, walletId, signature, amount]
    );
    
    res.json({ 
      success: true, 
      signature,
      amount,
      recipient: user.wallet_address!,
      newBalance: newBalance / LAMPORTS_PER_SOL
    });
  } catch (error: any) {
    console.error('Error processing withdrawal:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Buy token
 */
router.post('/api/trading/buy', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      walletId,
      walletAddress,
      tokenAddress,
      tokenMint, 
      amount, 
      slippage,
      slippageBps,
      priorityFee,
      priorityLevel,
      jitoTip,
      skipTax
    } = req.body;
    
    // Support both old and new field names
    const finalTokenMint = tokenMint || tokenAddress;
    const finalSlippage = slippageBps || (slippage ? slippage * 100 : undefined); // Convert % to bps if needed
    const finalPriorityLevel = priorityLevel || (priorityFee ? 'high' : 'medium');
    
    if (!finalTokenMint || !amount) {
      return res.status(400).json({ 
        error: 'Token address and amount required',
        received: { tokenMint: finalTokenMint, tokenAddress, amount, walletId, walletAddress }
      });
    }
    
    // Resolve walletAddress from walletId if needed
    let finalWalletAddress = walletAddress;
    if (!finalWalletAddress && walletId) {
      const wallet = await queryOne('SELECT public_key FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]) as any;
      if (!wallet) {
        return res.status(400).json({ error: 'Wallet not found' });
      }
      finalWalletAddress = wallet.public_key;
    }
    
    if (!finalWalletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const result = await getTradingEngineInstance().buyToken({
      userId,
      walletAddress: finalWalletAddress,
      tokenMint: finalTokenMint,
      amount,
      slippageBps: finalSlippage,
      priorityLevel: finalPriorityLevel,
      jitoTip,
      skipTax
    });
    
    if (result.success) {
      // Track trade source attribution
      try {
        // Get the token's original source from registry
        const tokenInfo = await queryOne(`
          SELECT first_source_type, telegram_chat_id, telegram_chat_name 
          FROM token_registry 
          WHERE token_mint = ?
        `, [finalTokenMint]) as any;
        
        if (tokenInfo) {
          // Create a trade ID (you might want to store trades in a proper table)
          const tradeId = Date.now(); // Simple ID for now
          
          await tokenSourceTracker.linkTradeToSource({
            tradeId,
            tokenMint: finalTokenMint,
            sourceType: tokenInfo.first_source_type || 'unknown',
            sourceChatId: tokenInfo.telegram_chat_id,
            sourceChatName: tokenInfo.telegram_chat_name
          });
        } else {
          // Token not in registry, register it as a trade-discovered token
          await tokenSourceTracker.registerToken({
            tokenMint: finalTokenMint,
            firstSourceType: 'trade',
            firstSourceDetails: { 
              action: 'buy', 
              amount,
              walletAddress: finalWalletAddress.substring(0, 8) + '...' // Truncated for privacy
            },
            discoveredByUserId: userId
          });
        }
      } catch (trackError) {
        console.error('Failed to track trade source:', trackError);
      }
      
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Error buying token:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Sell token
 */
router.post('/api/trading/sell', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      walletId,
      walletAddress,
      tokenAddress,
      tokenMint, 
      amount,
      percentage,
      slippage,
      slippageBps,
      priorityFee,
      priorityLevel,
      jitoTip,
      skipTax 
    } = req.body;
    
    // Support both old and new field names
    const finalTokenMint = tokenMint || tokenAddress;
    const finalSlippage = slippageBps || (slippage ? slippage * 100 : undefined);
    const finalPriorityLevel = priorityLevel || (priorityFee ? 'high' : 'medium');
    
    if (!finalTokenMint || (!amount && !percentage)) {
      return res.status(400).json({ 
        error: 'Token address and amount/percentage required',
        received: { tokenMint: finalTokenMint, tokenAddress, amount, percentage, walletId, walletAddress }
      });
    }
    
    // Resolve walletAddress from walletId if needed
    let finalWalletAddress = walletAddress;
    if (!finalWalletAddress && walletId) {
      const wallet = await queryOne('SELECT public_key FROM trading_wallets WHERE id = ? AND user_id = ?', [walletId, userId]) as any;
      if (!wallet) {
        return res.status(400).json({ error: 'Wallet not found' });
      }
      finalWalletAddress = wallet.public_key;
    }
    
    if (!finalWalletAddress) {
      return res.status(400).json({ error: 'Wallet address required' });
    }
    
    const result = await getTradingEngineInstance().sellToken({
      userId,
      walletAddress: finalWalletAddress,
      tokenMint: finalTokenMint,
      amount,
      slippageBps: finalSlippage,
      priorityLevel: finalPriorityLevel,
      jitoTip,
      percentage,
      skipTax
    } as any);
    
    if (result.success) {
      // Track trade source attribution
      try {
        // Get the token's original source from registry
        const tokenInfo = await queryOne(`
          SELECT first_source_type, telegram_chat_id, telegram_chat_name 
          FROM token_registry 
          WHERE token_mint = ?
        `, [finalTokenMint]) as any;
        
        if (tokenInfo) {
          // Create a trade ID
          const tradeId = Date.now();
          
          await tokenSourceTracker.linkTradeToSource({
            tradeId,
            tokenMint: finalTokenMint,
            sourceType: tokenInfo.first_source_type || 'unknown',
            sourceChatId: tokenInfo.telegram_chat_id,
            sourceChatName: tokenInfo.telegram_chat_name
          });
        } else {
          // Token not in registry (edge case), register it as a trade-discovered token
          await tokenSourceTracker.registerToken({
            tokenMint: finalTokenMint,
            firstSourceType: 'trade',
            firstSourceDetails: { 
              action: 'sell', 
              amount: amount || percentage,
              walletAddress: finalWalletAddress.substring(0, 8) + '...' // Truncated for privacy
            },
            discoveredByUserId: userId
          });
        }
      } catch (trackError) {
        console.error('Failed to track sell trade source:', trackError);
      }
      
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Error selling token:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Transfer token
 */
router.post('/api/trading/transfer', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      walletAddress,
      tokenMint,
      destination,
      amount,
      priorityLevel
    } = req.body;
    
    if (!tokenMint || !destination || !amount) {
      return res.status(400).json({ error: 'Token, destination and amount required' });
    }
    
    const result = await getTradingEngineInstance().transferToken({
      userId,
      walletAddress,
      tokenMint,
      amount,
      priorityLevel,
      destination
    } as any);
    
    if (result.success) {
      res.json(result);
    } else {
      res.status(400).json(result);
    }
  } catch (error: any) {
    console.error('Error transferring token:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get trade history (formatted for frontend)
 */
router.get('/api/trading/history', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { limit = 50, walletId } = req.query;
    
    let query = `
      SELECT 
        t.id,
        t.signature,
        t.tx_type as type,
        t.status,
        t.token_mint as tokenAddress,
        t.token_symbol as tokenSymbol,
        t.token_name as tokenName,
        t.amount_in as amount,
        t.amount_out,
        t.price_per_token as pricePerToken,
        t.total_fee_sol as totalCost,
        t.error_message as errorMessage,
        t.created_at as timestamp,
        w.public_key as walletAddress,
        w.wallet_name as walletName
      FROM trading_transactions t
      JOIN trading_wallets w ON t.wallet_id = w.id
      WHERE t.user_id = ?
    `;
    const params: any[] = [userId];
    
    if (walletId) {
      query += ' AND t.wallet_id = ?';
      params.push(walletId);
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT ?';
    params.push(limit);
    
    const trades = await queryAll(query, params);
    
    // Format for frontend TradeHistory interface
    const formatted = trades.map((t: any) => ({
      id: t.id?.toString() || '',
      walletName: t.walletName || '',
      walletAddress: t.walletAddress || '',
      type: t.type,
      tokenAddress: t.tokenAddress || '',
      tokenSymbol: t.tokenSymbol || 'UNKNOWN',
      tokenName: t.tokenName || t.tokenSymbol || 'Unknown Token',
      amount: t.amount || 0,
      signature: t.signature || '',
      status: t.status === 'completed' ? 'success' : t.status,
      timestamp: new Date(t.timestamp * 1000), // Convert Unix to Date
      pricePerToken: t.pricePerToken || 0,
      totalCost: t.totalCost || 0,
      errorMessage: t.errorMessage
    }));
    
    res.json({ success: true, trades: formatted });
  } catch (error: any) {
    console.error('❌ Error fetching trade history:', error);
    console.error('Stack trace:', error.stack);
    res.status(500).json({ 
      error: error.message,
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

/**
 * Get transaction history
 */
router.get('/api/trading/transactions', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { limit = 50, offset = 0, walletId } = req.query;
    
    let query = `
      SELECT 
        t.*,
        w.wallet_address,
        w.wallet_name
      FROM trading_transactions t
      JOIN trading_wallets w ON t.wallet_id = w.id
      WHERE t.user_id = ?
    `;
    const params: any[] = [userId];
    
    if (walletId) {
      query += ' AND t.wallet_id = ?';
      params.push(walletId);
    }
    
    query += ' ORDER BY t.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    
    const transactions = await queryAll(query, params);
    
    // Format transactions
    const formatted = transactions.map((tx: any) => ({
      id: tx.id,
      signature: tx.signature,
      txType: tx.tx_type,
      status: tx.status,
      tokenMint: tx.token_mint,
      tokenSymbol: tx.token_symbol,
      tokenName: tx.token_name,
      amountIn: tx.amount_in,
      amountOut: tx.amount_out,
      pricePerToken: tx.price_per_token,
      totalFeeSol: tx.total_fee_sol,
      walletAddress: tx.wallet_address,
      walletName: tx.wallet_name,
      createdAt: tx.created_at,
      confirmedAt: tx.confirmed_at,
      errorMessage: tx.error_message
    }));
    
    res.json({ success: true, transactions: formatted });
  } catch (error: any) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get wallet token holdings
 */
router.get('/api/trading/wallets/:walletId/holdings', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const walletId = parseInt(req.params.walletId);
    
    const holdings = await queryAll(`
      SELECT * FROM wallet_token_holdings
      WHERE wallet_id = ?
      ORDER BY total_value_usd DESC
    `, [walletId]);
    
    res.json({ success: true, holdings });
  } catch (error: any) {
    console.error('Error fetching holdings:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get wallet tokens (alias for holdings with better formatting)
 */
router.get('/api/trading/wallets/:walletId/tokens', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // Get full wallet portfolio with real-time token balances
    const portfolio = await portfolioService.getWalletPortfolio(walletId, userId);
    
    if (!portfolio) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    res.json({ success: true, tokens: portfolio.tokens });
  } catch (error: any) {
    console.error('Error fetching wallet tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get portfolio statistics across all wallets
 */
router.get('/api/trading/portfolio/stats', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // Get comprehensive portfolio stats using real-time data
    const stats = await portfolioService.getUserPortfolioStats(userId);
    
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('Error fetching portfolio stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get or create API keys configuration
 */
router.get('/api/trading/config', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    const config = await queryOne(
      'SELECT * FROM trading_api_keys WHERE user_id = ?',
      [userId]
    );
    
    // Don't send encrypted keys to frontend
    if (config) {
      delete (config as any).helius_api_key_encrypted;
      delete (config as any).jito_api_key_encrypted;
      delete (config as any).jupiter_api_key_encrypted;
    }
    
    res.json({ success: true, config });
  } catch (error: any) {
    console.error('Error fetching config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update API keys configuration
 */
router.post('/api/trading/config', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      heliusApiKey,
      jitoApiKey,
      jupiterApiKey,
      customRpcUrl,
      customWsUrl,
      useMonetizedRpc,
      maxPriorityFeeLamports,
      autoJitoTips
    } = req.body;
    
    // Encrypt API keys if provided
    const { getEncryptionService } = await import('../core/encryption.js');
    const encryption = getEncryptionService();
    
    const updates: any = {
      use_monetized_rpc: useMonetizedRpc ? 1 : 0,
      max_priority_fee_lamports: maxPriorityFeeLamports,
      auto_jito_tips: autoJitoTips ? 1 : 0,
      custom_rpc_url: customRpcUrl,
      custom_ws_url: customWsUrl,
      updated_at: Date.now()
    };
    
    if (heliusApiKey) {
      updates.helius_api_key_encrypted = encryption.encryptCombined(heliusApiKey);
    }
    if (jitoApiKey) {
      updates.jito_api_key_encrypted = encryption.encryptCombined(jitoApiKey);
    }
    if (jupiterApiKey) {
      updates.jupiter_api_key_encrypted = encryption.encryptCombined(jupiterApiKey);
    }
    
    // Check if config exists
    const existing = await queryOne(
      'SELECT id FROM trading_api_keys WHERE user_id = ?',
      [userId]
    );
    
    if (existing) {
      // Update
      const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
      await queryOne(
        `UPDATE trading_api_keys SET ${setClause} WHERE user_id = ?`,
        [...Object.values(updates), userId]
      );
    } else {
      // Insert
      updates.user_id = userId;
      const keys = Object.keys(updates);
      const placeholders = keys.map(() => '?').join(', ');
      await queryOne(
        `INSERT INTO trading_api_keys (${keys.join(', ')}) VALUES (${placeholders})`,
        Object.values(updates)
      );
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error updating config:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
