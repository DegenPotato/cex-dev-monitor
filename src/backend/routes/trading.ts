/**
 * Trading API Routes
 * Secure wallet management and trading operations
 */

import { Router, Request } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { getWalletManager } from '../core/wallet.js';
import { getTradingEngine } from '../core/trade.js';
import { queryAll, queryOne } from '../database/helpers.js';

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
const walletManager = getWalletManager();
const tradingEngine = getTradingEngine();

/**
 * Get all wallets for authenticated user
 */
router.get('/api/trading/wallets', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const wallets = await walletManager.getUserWallets(userId);
    
    res.json({ success: true, wallets });
  } catch (error: any) {
    console.error('Error fetching wallets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create new wallet
 */
router.post('/api/trading/wallets/create', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { walletName } = req.body;
    
    const wallet = await walletManager.createWallet(userId, walletName);
    
    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Error creating wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Import existing wallet
 */
router.post('/api/trading/wallets/import', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { privateKey, walletName } = req.body;
    
    if (!privateKey) {
      return res.status(400).json({ error: 'Private key required' });
    }
    
    const wallet = await walletManager.importWallet(userId, privateKey, walletName);
    
    res.json({ success: true, wallet });
  } catch (error: any) {
    console.error('Error importing wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Export wallet (get private key)
 */
router.get('/api/trading/wallets/:walletAddress/export', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { walletAddress } = req.params;
    
    const privateKey = await walletManager.exportWallet(userId, walletAddress);
    
    res.json({ success: true, privateKey });
  } catch (error: any) {
    console.error('Error exporting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set default wallet
 */
router.post('/api/trading/wallets/:walletId/default', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    await walletManager.setDefaultWallet(userId, walletId);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error setting default wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh wallet balance
 */
router.get('/api/trading/wallets/:walletId/balance', authService.requireSecureAuth(), async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    
    const balance = await walletManager.updateBalance(walletId);
    
    res.json({ success: true, balance });
  } catch (error: any) {
    console.error('Error refreshing balance:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete wallet (soft delete)
 */
router.delete('/api/trading/wallets/:walletId', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const walletId = parseInt(req.params.walletId);
    
    await walletManager.deleteWallet(userId, walletId);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting wallet:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Buy token
 */
router.post('/api/trading/buy', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      walletAddress,
      tokenMint, 
      amount, 
      slippageBps,
      priorityLevel,
      jitoTip 
    } = req.body;
    
    if (!tokenMint || !amount) {
      return res.status(400).json({ error: 'Token address and amount required' });
    }
    
    const result = await tradingEngine.buyToken({
      userId,
      walletAddress,
      tokenMint,
      amount,
      slippageBps,
      priorityLevel,
      jitoTip
    });
    
    if (result.success) {
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
router.post('/api/trading/sell', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const { 
      walletAddress,
      tokenMint, 
      amount,
      percentage,
      slippageBps,
      priorityLevel,
      jitoTip 
    } = req.body;
    
    if (!tokenMint || (!amount && !percentage)) {
      return res.status(400).json({ error: 'Token address and amount/percentage required' });
    }
    
    const result = await tradingEngine.sellToken({
      userId,
      walletAddress,
      tokenMint,
      amount,
      slippageBps,
      priorityLevel,
      jitoTip,
      percentage
    } as any);
    
    if (result.success) {
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
router.post('/api/trading/transfer', authService.requireSecureAuth(), async (req, res) => {
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
    
    const result = await tradingEngine.transferToken({
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
 * Get transaction history
 */
router.get('/api/trading/transactions', authService.requireSecureAuth(), async (req, res) => {
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
router.get('/api/trading/wallets/:walletId/holdings', authService.requireSecureAuth(), async (req, res) => {
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
 * Get or create API keys configuration
 */
router.get('/api/trading/config', authService.requireSecureAuth(), async (req, res) => {
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
router.post('/api/trading/config', authService.requireSecureAuth(), async (req, res) => {
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
