/**
 * Telegram Auto-Trading API Routes
 * Handles configuration and position management for automated trading
 */

import { Router, Response } from 'express';
import { getTelegramAutoTrader } from '../services/TelegramAutoTrader.js';
import { getOnChainPriceMonitor } from '../services/OnChainPriceMonitor.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const router = Router();
const authService = new SecureAuthService();

// Initialize autoTrader lazily to avoid startup issues
let autoTrader: any = null;
const getAutoTrader = () => {
  if (!autoTrader) {
    autoTrader = getTelegramAutoTrader();
  }
  return autoTrader;
};

/**
 * Get auto-trade configuration for a chat
 */
router.get('/api/telegram/auto-trade/config/:chatId', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { chatId } = req.params;

    // Get configuration from telegram_monitored_chats
    const config = await queryOne(
      `SELECT 
        action_on_detection,
        auto_buy_enabled,
        auto_buy_amount_sol,
        auto_buy_wallet_id,
        auto_buy_slippage_bps,
        auto_buy_priority_level,
        auto_buy_jito_tip_sol,
        auto_buy_skip_tax,
        auto_sell_enabled,
        auto_sell_slippage_bps,
        stop_loss_percent,
        take_profit_percent,
        trailing_stop_enabled,
        trailing_stop_percent,
        auto_monitor_enabled,
        monitor_duration_hours,
        alert_price_changes
      FROM telegram_monitored_chats
      WHERE user_id = ? AND chat_id = ?`,
      [userId, chatId]
    ) as any;

    if (!config) {
      // Return default configuration
      return res.json({
        config: {
          action_on_detection: 'forward_only',
          auto_buy_enabled: false,
          auto_buy_amount_sol: 0.1,
          auto_buy_wallet_id: null,
          auto_buy_slippage_bps: 500,
          auto_buy_priority_level: 'high',
          auto_buy_jito_tip_sol: 0.001,
          auto_buy_skip_tax: false,
          auto_sell_enabled: false,
          auto_sell_slippage_bps: 1000,
          stop_loss_percent: -50,
          take_profit_percent: 100,
          trailing_stop_enabled: false,
          trailing_stop_percent: 20,
          auto_monitor_enabled: false,
          monitor_duration_hours: 24,
          alert_price_changes: '[-20, 50, 100]'
        }
      });
    }

    res.json({ config });
  } catch (error: any) {
    console.error('Error fetching auto-trade config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Save auto-trade configuration for a chat
 */
router.post('/api/telegram/auto-trade/config', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { chatId, config } = req.body;

    if (!chatId || !config) {
      return res.status(400).json({ error: 'chatId and config required' });
    }

    // Verify chat ownership
    const chat = await queryOne(
      'SELECT id FROM telegram_monitored_chats WHERE user_id = ? AND chat_id = ?',
      [userId, chatId]
    );

    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    // Update configuration
    await execute(
      `UPDATE telegram_monitored_chats SET
        action_on_detection = ?,
        auto_buy_enabled = ?,
        auto_buy_amount_sol = ?,
        auto_buy_wallet_id = ?,
        auto_buy_slippage_bps = ?,
        auto_buy_priority_level = ?,
        auto_buy_jito_tip_sol = ?,
        auto_buy_skip_tax = ?,
        auto_sell_enabled = ?,
        auto_sell_slippage_bps = ?,
        stop_loss_percent = ?,
        take_profit_percent = ?,
        trailing_stop_enabled = ?,
        trailing_stop_percent = ?,
        auto_monitor_enabled = ?,
        monitor_duration_hours = ?,
        alert_price_changes = ?,
        updated_at = ?
      WHERE user_id = ? AND chat_id = ?`,
      [
        config.action_on_detection,
        config.auto_buy_enabled ? 1 : 0,
        config.auto_buy_amount_sol,
        config.auto_buy_wallet_id,
        config.auto_buy_slippage_bps,
        config.auto_buy_priority_level,
        config.auto_buy_jito_tip_sol,
        config.auto_buy_skip_tax ? 1 : 0,
        config.auto_sell_enabled ? 1 : 0,
        config.auto_sell_slippage_bps || 1000,
        config.stop_loss_percent,
        config.take_profit_percent,
        config.trailing_stop_enabled ? 1 : 0,
        config.trailing_stop_percent || 20,
        config.auto_monitor_enabled ? 1 : 0,
        config.monitor_duration_hours || 24,
        JSON.stringify(config.alert_price_changes || []),
        Date.now(),
        userId,
        chatId
      ]
    );

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error saving auto-trade config:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Create manual position for monitoring (like Test Lab)
 */
router.post('/api/telegram/positions/manual', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const { tokenMint, poolAddress } = req.body;
    const userId = req.user!.id;
    
    if (!tokenMint || !poolAddress) {
      return res.status(400).json({ error: 'Token mint and pool address required' });
    }
    
    // Create a manual position in database
    const now = Math.floor(Date.now() / 1000);
    const result = await execute(
      `INSERT INTO telegram_trading_positions (
        user_id, token_mint, pool_address,
        buy_amount_sol, total_invested_sol,
        tokens_bought, current_tokens,
        status, is_manual, created_at, updated_at
      ) VALUES (?, ?, ?, 0, 0, 0, 0, 'open', 1, ?, ?)`,
      [userId, tokenMint, poolAddress, now, now]
    );
    const positionId = (result as any).lastInsertRowid;
    
    // Start monitoring campaign
    const priceMonitor = getOnChainPriceMonitor();
    const campaign = await priceMonitor.startCampaign(tokenMint, poolAddress);
    
    // Link position to campaign
    getAutoTrader().linkPositionToCampaign(positionId, campaign.id);
    
    res.json({ 
      success: true, 
      positionId,
      campaignId: campaign.id,
      message: 'Manual monitoring started' 
    });
  } catch (error: any) {
    console.error('Error creating manual position:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all positions for the user
 */
router.get('/api/telegram/positions', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    // Initialize WebSocket on first use
    initializeWebSocket();
    
    const userId = req.user!.id;
    const { status, limit = 100 } = req.query;

    let query = `
      SELECT 
        p.*,
        w.wallet_name,
        w.public_key as wallet_address,
        t.token_symbol,
        t.token_name,
        t.price_usd,
        t.price_sol,
        t.market_cap_usd as current_mcap_usd
      FROM telegram_trading_positions p
      LEFT JOIN trading_wallets w ON p.wallet_id = w.id
      LEFT JOIN token_market_data t ON p.token_mint = t.mint_address
      WHERE p.user_id = ?
    `;
    
    const params: any[] = [userId];
    
    if (status) {
      query += ' AND p.status = ?';
      params.push(status);
    }
    
    query += ' ORDER BY p.created_at DESC LIMIT ?';
    params.push(Number(limit));

    const positions = await queryAll(query, params) as any[];
    
    // Calculate current values and P&L for each position
    const enrichedPositions = positions.map(p => {
      // Initialize values if they don't exist
      p.realized_pnl_sol = p.realized_pnl_sol || 0;
      p.unrealized_pnl_sol = p.unrealized_pnl_sol || 0;
      p.total_pnl_sol = p.total_pnl_sol || 0;
      p.total_invested_sol = p.total_invested_sol || p.buy_amount_sol || 0;
      
      // Use stored tokens - these are the ACTUAL tokens we have
      const actualTokens = p.current_tokens || p.tokens_bought || 0;
      p.current_tokens = actualTokens;
      p.current_balance = actualTokens; // Frontend expects this field
      
      // Get buy price (prefer buy_price_sol, fallback to buy_price_usd which is also SOL)
      const buyPriceSOL = p.buy_price_sol || p.buy_price_usd || 0;
      p.avg_entry_price = buyPriceSOL;  // SOL per token at time of buy
      
      // Get current market price in SOL
      const currentPriceSOL = p.price_sol || 0;  // From token_market_data
      p.current_price = currentPriceSOL;
      
      // Add ALL USD prices (from database and market data)
      p.entry_price_usd = p.buy_price_usd_initial || 0;  // USD price at time of buy
      p.current_price_usd = p.price_usd || p.current_price_usd || 0;  // Current USD price
      p.peak_price_usd = p.peak_price_usd || 0;  // Session high USD
      p.low_price_usd = p.low_price_usd || 0;  // Session low USD
      p.unrealized_pnl_usd = p.unrealized_pnl_usd || 0;  // P&L in USD
      
      // Calculate P&L in SOL
      if (currentPriceSOL > 0 && actualTokens > 0) {
        // Current value in SOL = tokens * current price per token in SOL
        p.current_value_sol = actualTokens * currentPriceSOL;
        
        // Cost basis in SOL = what we paid
        const costBasisSOL = p.total_invested_sol;
        
        // Unrealized P&L = current value - cost basis (both in SOL)
        p.unrealized_pnl_sol = p.current_value_sol - costBasisSOL;
        
        // Total P&L = realized + unrealized (in SOL)
        p.total_pnl_sol = p.realized_pnl_sol + p.unrealized_pnl_sol;
        
        // ROI calculation
        p.roi_percent = costBasisSOL > 0 
          ? (p.total_pnl_sol / costBasisSOL) * 100 
          : 0;
          
        // Log extreme losses for debugging
        if (p.roi_percent < -90) {
          console.log(`⚠️ Position ${p.id}: ${actualTokens.toFixed(4)} tokens, buy @ ${buyPriceSOL.toFixed(9)} SOL, now @ ${currentPriceSOL.toFixed(9)} SOL (${p.roi_percent.toFixed(1)}% loss)`);
        }
      } else {
        // No market data - use stored values
        p.roi_percent = p.roi_percent || 0;
        p.current_value_sol = 0;
      }
      
      // Set default status if missing
      p.status = p.status || 'open';
      
      // Ensure detected_at exists (required by frontend)
      p.detected_at = p.detected_at || p.created_at || Math.floor(Date.now() / 1000);
      
      return p;
    });

    res.json({ positions: enrichedPositions });
  } catch (error: any) {
    console.error('Error fetching positions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get specific position details
 */
router.get('/api/telegram/positions/:id', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;

    const position = await queryOne(
      `SELECT 
        p.*,
        w.wallet_name,
        w.public_key as wallet_address,
        t.token_symbol,
        t.token_name,
        t.price_usd,
        t.price_sol,
        t.market_cap_usd as current_mcap_usd
      FROM telegram_trading_positions p
      LEFT JOIN trading_wallets w ON p.wallet_id = w.id
      LEFT JOIN token_market_data t ON p.token_mint = t.mint_address
      WHERE p.id = ? AND p.user_id = ?`,
      [id, userId]
    ) as any;

    if (!position) {
      return res.status(404).json({ error: 'Position not found' });
    }

    // Get trade history for this position
    const trades = await queryAll(
      `SELECT * FROM trading_transactions 
       WHERE position_id = ? 
       ORDER BY created_at DESC`,
      [id]
    );

    position.trades = trades;

    res.json({ position });
  } catch (error: any) {
    console.error('Error fetching position:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Manual sell for a position
 */
router.post('/api/telegram/positions/:id/sell', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { id } = req.params;
    const { percentage = 100 } = req.body;

    // Verify position ownership
    const position = await queryOne(
      'SELECT * FROM telegram_trading_positions WHERE id = ? AND user_id = ? AND status = ?',
      [id, userId, 'open']
    ) as any;

    if (!position) {
      return res.status(404).json({ error: 'Open position not found' });
    }

    // Get wallet
    const wallet = await queryOne(
      'SELECT * FROM trading_wallets WHERE id = ? AND user_id = ?',
      [position.wallet_id, userId]
    ) as any;

    if (!wallet) {
      return res.status(404).json({ error: 'Wallet not found' });
    }

    // Execute sell via TradingEngine
    const { getTradingEngine } = await import('../core/trade.js');
    const tradingEngine = getTradingEngine();

    const sellResult = await tradingEngine.sellToken({
      userId: userId,
      walletAddress: wallet.wallet_address || wallet.public_key,
      tokenMint: position.token_mint,
      tokenSymbol: position.token_symbol,
      amount: 0, // Will be overridden by percentage
      percentage: percentage,
      slippageBps: 1000, // 10% for safety
      priorityLevel: 'high',
      skipTax: false
    } as any);

    if (sellResult.success) {
      // Calculate realized P&L (use current_tokens for token balance)
      const tokensToSell = (position.current_tokens || position.tokens_bought || 0) * (percentage / 100);
      const proceeds = sellResult.amountOut || 0;  // SOL received
      const costBasis = tokensToSell * (position.buy_price_usd || 0); // buy_price_usd is actually SOL price
      const realizedPnl = proceeds - costBasis;

      // Update position
      await execute(
        `UPDATE telegram_trading_positions SET
          current_tokens = current_tokens * ?,
          current_balance = current_balance * ?,
          realized_pnl_sol = realized_pnl_sol + ?,
          total_pnl_sol = realized_pnl_sol + ? + unrealized_pnl_sol,
          status = CASE WHEN ? = 100 THEN 'closed' ELSE status END,
          exit_reason = CASE WHEN ? = 100 THEN 'manual' ELSE exit_reason END,
          closed_at = CASE WHEN ? = 100 THEN ? ELSE closed_at END,
          last_trade_at = ?,
          total_sells = COALESCE(total_sells, 0) + 1,
          total_trades = COALESCE(total_trades, 0) + 1,
          updated_at = ?
        WHERE id = ?`,
        [
          1 - (percentage / 100),  // current_tokens multiplier
          1 - (percentage / 100),  // current_balance multiplier
          realizedPnl,
          realizedPnl,
          percentage,
          percentage,
          percentage,
          Date.now(),
          Date.now(),
          Date.now(),
          id
        ]
      );

      // Link transaction to position
      if (sellResult.signature) {
        await execute(
          `UPDATE trading_transactions 
           SET position_id = ?, triggered_by = ? 
           WHERE signature = ?`,
          [id, 'manual', sellResult.signature]
        );
      }

      res.json({ 
        success: true, 
        signature: sellResult.signature,
        amountSold: tokensToSell,  // Number of tokens sold
        proceeds: proceeds,  // SOL received
        realizedPnl: realizedPnl  // P&L in SOL
      });
    } else {
      res.status(400).json({ 
        error: sellResult.error || 'Sell failed',
        details: sellResult 
      });
    }
  } catch (error: any) {
    console.error('Error executing sell:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get position analytics by source
 */
router.get('/api/telegram/analytics/source', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;

    // Analytics by chat
    const byChat = await queryAll(
      `SELECT 
        source_chat_id,
        source_chat_name,
        COUNT(*) as total_positions,
        SUM(CASE WHEN status = 'closed' AND total_pnl_sol > 0 THEN 1 ELSE 0 END) as winners,
        SUM(CASE WHEN status = 'closed' AND total_pnl_sol <= 0 THEN 1 ELSE 0 END) as losers,
        AVG(roi_percent) as avg_roi,
        SUM(total_pnl_sol) as total_pnl,
        MAX(roi_percent) as best_roi,
        MIN(roi_percent) as worst_roi
      FROM telegram_trading_positions
      WHERE user_id = ?
      GROUP BY source_chat_id, source_chat_name
      ORDER BY total_pnl DESC`,
      [userId]
    );

    // Analytics by caller
    const byCaller = await queryAll(
      `SELECT 
        source_sender_username,
        COUNT(*) as call_count,
        SUM(CASE WHEN status = 'closed' AND total_pnl_sol > 0 THEN 1 ELSE 0 END) as winners,
        AVG(roi_percent) as avg_roi,
        SUM(total_pnl_sol) as total_pnl,
        MAX(roi_percent) as best_call
      FROM telegram_trading_positions
      WHERE user_id = ? AND source_sender_username IS NOT NULL
      GROUP BY source_sender_username
      ORDER BY avg_roi DESC`,
      [userId]
    );

    res.json({ byChat, byCaller });
  } catch (error: any) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Subscribe to position updates via WebSocket
 * Initialize on first use to ensure env is loaded
 */
let websocketInitialized = false;
const initializeWebSocket = () => {
  if (websocketInitialized) return;
  websocketInitialized = true;
  
  try {
    getAutoTrader().on('websocket_broadcast', async (event: any) => {
      // Broadcast to all connected WebSocket clients
      try {
        // Import broadcast from priceTest which already handles WebSocket
        const { broadcastTestLabUpdate } = await import('./priceTest.js');
        broadcastTestLabUpdate(event);
          
        // Log important events for debugging
        if (event.type === 'telegram_position_price_update') {
          const data = event.data;
          console.log(`📡 [WebSocket] Broadcasting price update for position ${data.position_id}: ${data.current_price_sol?.toFixed(9) || 0} SOL`);
        }
      } catch (error) {
        console.error('❌ [WebSocket] Failed to broadcast:', error);
      }
    });
    
    console.log('[WebSocket] TelegramAutoTrader broadcast listener initialized');
  } catch (error) {
    console.error('[WebSocket] Failed to initialize:', error);
    // Don't crash, just skip WebSocket for now
  }
};

export default router;
