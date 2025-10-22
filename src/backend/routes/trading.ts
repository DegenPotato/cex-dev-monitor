/**
 * Trading API Routes
 * Secure wallet management and trading operations
 */

import { Router, Request } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
// import { getWalletManager } from '../core/wallet.js'; // Using walletStorageService instead
import { getTradingEngine } from '../core/trade.js';
import { queryAll, queryOne, execute } from '../database/helpers.js';
// Using compatibility service until migration completes
import { walletStorageServiceCompat as walletStorageService } from '../services/WalletStorageServiceCompat.js';

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
const tradingEngine = getTradingEngine();

/**
 * Get all wallets for authenticated user
 */
router.get('/api/trading/wallets', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const wallets = await walletStorageService.getUserWallets(userId);
    
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
router.post('/api/trading/wallets/import', authService.requireSecureAuth(), async (req, res) => {
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
router.get('/api/trading/wallets/:walletId/export', authService.requireSecureAuth(), async (req, res) => {
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
router.post('/api/trading/wallets/:walletId/default', authService.requireSecureAuth(), async (req, res) => {
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
router.get('/api/trading/wallets/:walletId/balance', authService.requireSecureAuth(), async (req, res) => {
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
router.delete('/api/trading/wallets/:walletId', authService.requireSecureAuth(), async (req, res) => {
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
router.post('/api/trading/wallets/:walletId/withdraw', authService.requireSecureAuth(), async (req, res) => {
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
 * Get wallet tokens (alias for holdings with better formatting)
 */
router.get('/api/trading/wallets/:walletId/tokens', authService.requireSecureAuth(), async (req, res) => {
  try {
    const walletId = parseInt(req.params.walletId);
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // Verify wallet ownership (compatible with both schemas)
    let wallet;
    try {
      // Try new schema first
      wallet = await queryOne(
        'SELECT * FROM trading_wallets WHERE id = ? AND user_id = ? AND is_deleted = 0',
        [walletId, userId]
      );
    } catch (e) {
      // Fall back to old schema (no is_deleted column)
      wallet = await queryOne(
        'SELECT * FROM trading_wallets WHERE id = ? AND user_id = ?',
        [walletId, userId]
      );
    }
    
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }
    
    // Get token holdings - for now return empty array if no holdings table
    const tokens = await queryAll(`
      SELECT 
        token_mint,
        token_symbol,
        token_name,
        token_amount,
        token_decimals,
        price_usd,
        total_value_usd,
        updated_at
      FROM wallet_token_holdings
      WHERE wallet_id = ?
      ORDER BY total_value_usd DESC
    `, [walletId]).catch(() => []);
    
    res.json({ success: true, tokens });
  } catch (error: any) {
    console.error('Error fetching wallet tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get portfolio statistics across all wallets
 */
router.get('/api/trading/portfolio/stats', authService.requireSecureAuth(), async (req, res) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // Get all user wallets (compatible with both schemas)
    let wallets;
    try {
      // Try new schema first
      wallets = await queryAll(
        'SELECT * FROM trading_wallets WHERE user_id = ? AND is_deleted = 0',
        [userId]
      );
    } catch (e) {
      // Fall back to old schema
      wallets = await queryAll(
        'SELECT id, user_id, wallet_address as public_key, 0 as sol_balance FROM trading_wallets WHERE user_id = ?',
        [userId]
      );
    }
    
    if (!wallets || wallets.length === 0) {
      return res.json({
        success: true,
        stats: {
          totalValueUSD: 0,
          totalSOL: 0,
          totalTokens: 0,
          walletCount: 0,
          profitLoss: 0,
          profitLossPercent: 0,
          topTokens: [],
          recentActivity: []
        }
      });
    }
    
    // Calculate total SOL balance
    const totalSOL = wallets.reduce((sum: number, w: any) => sum + (w.sol_balance || 0), 0);
    
    // Get token holdings if table exists
    let holdings: any[] = [];
    try {
      const walletIds = wallets.map((w: any) => w.id);
      const placeholders = walletIds.map(() => '?').join(',');
      
      holdings = await queryAll(`
        SELECT 
          token_mint,
          token_symbol,
          token_name,
          SUM(token_amount) as total_amount,
          AVG(price_usd) as avg_price,
          SUM(total_value_usd) as total_value
        FROM wallet_token_holdings
        WHERE wallet_id IN (${placeholders})
        GROUP BY token_mint, token_symbol, token_name
        ORDER BY total_value DESC
        LIMIT 10
      `, walletIds);
    } catch (e) {
      // Table might not exist yet
      holdings = [];
    }
    
    // Calculate total portfolio value (assume SOL at $150 for now - should fetch real price)
    const totalTokenValue = holdings.reduce((sum: number, h: any) => sum + (h.total_value || 0), 0);
    const solPrice = 150; // TODO: Fetch real SOL price
    const totalValueUSD = (totalSOL * solPrice) + totalTokenValue;
    
    // Get recent trading activity
    let recentActivity: any[] = [];
    try {
      recentActivity = await queryAll(`
        SELECT 
          t.tx_type,
          t.token_symbol,
          t.amount_in,
          t.amount_out,
          t.created_at,
          t.status,
          w.wallet_name
        FROM trading_transactions t
        JOIN trading_wallets w ON t.wallet_id = w.id
        WHERE t.user_id = ?
        ORDER BY t.created_at DESC
        LIMIT 10
      `, [userId]);
    } catch (e) {
      recentActivity = [];
    }
    
    // Calculate P&L from recent trades (simplified)
    let profitLoss = 0;
    let profitLossPercent = 0;
    
    try {
      const trades = await queryAll(`
        SELECT 
          tx_type,
          amount_in,
          amount_out,
          price_per_token
        FROM trading_transactions
        WHERE user_id = ? AND status = 'completed'
        ORDER BY created_at DESC
        LIMIT 100
      `, [userId]);
      
      // Simple P&L calculation based on buy/sell prices
      const buyTotal = trades
        .filter((t: any) => t.tx_type === 'buy')
        .reduce((sum: number, t: any) => sum + (t.amount_in || 0), 0);
      
      const sellTotal = trades
        .filter((t: any) => t.tx_type === 'sell')
        .reduce((sum: number, t: any) => sum + (t.amount_out || 0), 0);
      
      if (buyTotal > 0) {
        profitLoss = sellTotal - buyTotal;
        profitLossPercent = (profitLoss / buyTotal) * 100;
      }
    } catch (e) {
      // No trades yet
    }
    
    const stats = {
      totalValueUSD,
      totalSOL,
      totalTokens: holdings.length,
      walletCount: wallets.length,
      profitLoss,
      profitLossPercent,
      topTokens: holdings.map((h: any) => ({
        symbol: h.token_symbol,
        name: h.token_name,
        amount: h.total_amount,
        value: h.total_value,
        price: h.avg_price
      })),
      recentActivity: recentActivity.map((a: any) => ({
        type: a.tx_type,
        token: a.token_symbol,
        amount: a.tx_type === 'buy' ? a.amount_out : a.amount_in,
        timestamp: a.created_at,
        status: a.status,
        wallet: a.wallet_name
      }))
    };
    
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('Error fetching portfolio stats:', error);
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
