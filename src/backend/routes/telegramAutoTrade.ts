/**
 * Telegram Auto-Trading API Routes
 * Handles configuration and position management for automated trading
 */

import { Router, Response } from 'express';
import { getTelegramAutoTrader } from '../services/TelegramAutoTrader.js';
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
    // Initialize WebSocket listener on first access
    initializeWebSocket();
    
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
 * Get all positions for the user
 */
router.get('/api/telegram/positions', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { status, limit = 100 } = req.query;

    let query = `
      SELECT 
        p.*,
        w.wallet_name,
        w.public_key as wallet_address
      FROM telegram_trading_positions p
      LEFT JOIN trading_wallets w ON p.wallet_id = w.id
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

    res.json({ positions });
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
        w.public_key as wallet_address
      FROM telegram_trading_positions p
      LEFT JOIN trading_wallets w ON p.wallet_id = w.id
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
      // Calculate realized P&L
      const soldAmount = position.current_balance * (percentage / 100);
      const proceeds = sellResult.amountOut || 0;
      const realizedPnl = proceeds - (soldAmount * position.avg_entry_price);

      // Update position
      await execute(
        `UPDATE telegram_trading_positions SET
          current_balance = current_balance * ?,
          realized_pnl_sol = realized_pnl_sol + ?,
          total_pnl_sol = realized_pnl_sol + ? + unrealized_pnl_sol,
          status = CASE WHEN ? = 100 THEN 'closed' ELSE status END,
          exit_reason = CASE WHEN ? = 100 THEN 'manual' ELSE exit_reason END,
          closed_at = CASE WHEN ? = 100 THEN ? ELSE closed_at END,
          last_trade_at = ?,
          total_sells = total_sells + 1,
          total_trades = total_trades + 1,
          updated_at = ?
        WHERE id = ?`,
        [
          1 - (percentage / 100),
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
        amountSold: soldAmount,
        proceeds: proceeds,
        realizedPnl: realizedPnl
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
 * Initialize this only when the first route is accessed
 */
let websocketInitialized = false;
const initializeWebSocket = () => {
  if (websocketInitialized) return;
  websocketInitialized = true;
  
  getAutoTrader().on('websocket_broadcast', (event: any) => {
    // This will be handled by the main WebSocket server
    // The event should be broadcasted to all connected clients
    const { broadcast } = require('../websocket.js');
    if (broadcast) {
      broadcast(event);
    }
  });
};

export default router;
