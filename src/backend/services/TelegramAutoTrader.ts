/**
 * Telegram Auto-Trading Service
 * Handles automated trading from Telegram detections with comprehensive position tracking
 */

import { EventEmitter } from 'events';
import { getTradingEngine } from '../core/trade.js';
import { getOnChainPriceMonitor } from './OnChainPriceMonitor.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { getDb } from '../database/connection.js';

export interface AutoTradeConfig {
  action_on_detection: string;
  auto_buy_enabled: boolean;
  auto_buy_amount_sol: number;
  auto_buy_wallet_id: number;
  auto_buy_slippage_bps: number;
  auto_buy_priority_level: string;
  auto_buy_jito_tip_sol: number;
  auto_buy_skip_tax: boolean;
  auto_sell_enabled: boolean;
  auto_sell_slippage_bps: number; // Added for sell slippage
  stop_loss_percent: number;
  take_profit_percent: number;
  trailing_stop_enabled: boolean;
  trailing_stop_percent: number;
  auto_monitor_enabled: boolean;
  monitor_duration_hours: number;
  alert_price_changes?: string; // JSON array of price change percentages to alert on
}

export interface DetectionContext {
  userId: number;
  chatId: string;
  chatName: string;
  messageId: number;
  senderId: string;
  senderUsername: string;
  detectionType: string;
  messageText?: string;
}

export class TelegramAutoTrader extends EventEmitter {
  private tradingEngine = getTradingEngine();
  private priceMonitor = getOnChainPriceMonitor();
  // private activePositions = new Map<number, any>(); // Reserved for future caching
  private positionCampaigns = new Map<number, string>();

  constructor() {
    super();
    console.log('✅ [AutoTrader] TelegramAutoTrader initialized');
    
    // Subscribe to price updates
    this.priceMonitor.on('price_update', (data: any) => {
      this.handlePriceUpdate(data).catch(console.error);
    });
  }

  /**
   * Parse action configuration into array
   */
  parseActions(actionConfig: string): string[] {
    const actionMap: Record<string, string[]> = {
      'forward_only': ['forward'],
      'trade_only': ['trade'],
      'monitor_only': ['monitor'],
      'forward_and_trade': ['forward', 'trade'],
      'forward_and_monitor': ['forward', 'monitor'],
      'trade_and_monitor': ['trade', 'monitor'],
      'all': ['forward', 'trade', 'monitor']
    };
    return actionMap[actionConfig] || ['forward'];
  }

  /**
   * Handle contract detection and execute configured actions
   */
  async handleContractDetection(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig
  ): Promise<void> {
    console.log(`🎯 [AutoTrader] Processing ${tokenMint.slice(0, 8)}... (${config.action_on_detection})`);
    
    const actions = this.parseActions(config.action_on_detection);
    const promises = [];
    
    if (actions.includes('trade') && config.auto_buy_enabled) {
      promises.push(this.initiateTrade(tokenMint, context, config));
    }
    
    if (actions.includes('monitor') && config.auto_monitor_enabled) {
      promises.push(this.startMonitoring(tokenMint, context, config));
    }
    
    await Promise.all(promises);
  }

  /**
   * Execute auto-buy and create position
   */
  async initiateTrade(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig
  ): Promise<any> {
    // Get wallet
    const wallet = await queryOne(
      'SELECT * FROM trading_wallets WHERE id = ? AND user_id = ?',
      [config.auto_buy_wallet_id, context.userId]
    ) as any;
    
    if (!wallet) throw new Error('Wallet not found');
    
    // Create position
    const positionId = await this.createPosition({
      user_id: context.userId,
      wallet_id: config.auto_buy_wallet_id,
      token_mint: tokenMint,
      source_chat_id: context.chatId,
      source_chat_name: context.chatName,
      source_message_id: context.messageId,
      source_sender_id: context.senderId,
      source_sender_username: context.senderUsername,
      detection_type: context.detectionType,
      detected_at: Date.now(),
      status: 'pending'
    });
    
    // Broadcast creation (REAL-TIME!)
    this.broadcast('telegram_position_created', {
      position_id: positionId,
      user_id: context.userId,
      token_mint: tokenMint,
      source_chat_name: context.chatName,
      source_sender_username: context.senderUsername,
      action: 'Initiating buy...'
    });
    
    // Execute buy
    const tradeResult = await this.tradingEngine.buyToken({
      userId: context.userId,
      walletAddress: wallet.wallet_address || wallet.public_key,
      tokenMint: tokenMint,
      amount: config.auto_buy_amount_sol,
      slippageBps: config.auto_buy_slippage_bps,
      priorityLevel: config.auto_buy_priority_level as any,
      jitoTip: config.auto_buy_jito_tip_sol,
      skipTax: config.auto_buy_skip_tax
    });
    
    if (tradeResult.success) {
      const pricePerToken = config.auto_buy_amount_sol / (tradeResult.amountOut || 1);
      
      // Update position
      await this.updatePosition(positionId, {
        status: 'open',
        token_symbol: tradeResult.tokenSymbol,
        initial_balance: tradeResult.amountOut,
        current_balance: tradeResult.amountOut,
        avg_entry_price: pricePerToken,
        current_price: pricePerToken,
        total_invested_sol: config.auto_buy_amount_sol,
        total_buys: 1,
        first_buy_at: Date.now()
      });
      
      // Link transaction
      if (tradeResult.signature) {
        await execute(
          `UPDATE trading_transactions 
           SET position_id = ?, triggered_by = ? 
           WHERE signature = ?`,
          [positionId, 'telegram_detection', tradeResult.signature]
        );
      }
      
      // Broadcast success (REAL-TIME!)
      this.broadcast('telegram_trade_executed', {
        position_id: positionId,
        trade_type: 'buy',
        amount_sol: config.auto_buy_amount_sol,
        amount_tokens: tradeResult.amountOut,
        signature: tradeResult.signature,
        new_balance: tradeResult.amountOut,
        new_avg_price: pricePerToken,
        token_symbol: tradeResult.tokenSymbol
      });
      
      // Setup auto-sell
      if (config.auto_sell_enabled) {
        await this.setupAutoSell(positionId, config);
      }
      
      return { success: true, positionId, signature: tradeResult.signature };
    } else {
      // Failed
      await this.updatePosition(positionId, {
        status: 'failed',
        exit_reason: tradeResult.error
      });
      
      this.broadcast('telegram_position_alert', {
        position_id: positionId,
        alert_type: 'error',
        message: `Buy failed: ${tradeResult.error}`
      });
      
      throw new Error(tradeResult.error);
    }
  }

  /**
   * Start price monitoring
   */
  async startMonitoring(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig
  ): Promise<any> {
    const poolInfo = await this.getPoolAddress(tokenMint);
    if (!poolInfo) throw new Error('No pool found');
    
    const campaign = await this.priceMonitor.startCampaign(tokenMint, poolInfo.pool_address);
    
    // Add price alerts
    if (config.alert_price_changes) {
      const alerts = JSON.parse(config.alert_price_changes);
      for (const change of alerts) {
        await this.priceMonitor.addAlert(
          campaign.id,
          change,
          change > 0 ? 'above' : 'below',
          'percentage',
          [{ type: 'notification' }]
        );
      }
    }
    
    // Broadcast
    this.broadcast('telegram_monitoring_started', {
      token_mint: tokenMint,
      campaign_id: campaign.id,
      source_chat_name: context.chatName
    });
    
    return { success: true, campaignId: campaign.id };
  }

  /**
   * Setup auto-sell alerts
   */
  private async setupAutoSell(positionId: number, config: AutoTradeConfig): Promise<void> {
    const position = await queryOne(
      'SELECT * FROM telegram_trading_positions WHERE id = ?',
      [positionId]
    ) as any;
    
    const poolInfo = await this.getPoolAddress(position.token_mint);
    if (!poolInfo) return;
    
    const campaign = await this.priceMonitor.startCampaign(
      position.token_mint,
      poolInfo.pool_address
    );
    
    this.positionCampaigns.set(positionId, campaign.id);
    
    // Stop loss
    if (config.stop_loss_percent < 0) {
      await this.priceMonitor.addAlert(
        campaign.id,
        config.stop_loss_percent,
        'below',
        'percentage',
        [{
          type: 'sell',
          walletId: position.wallet_id,
          amount: 100,
          slippage: config.auto_sell_slippage_bps / 100,
          priorityFee: 0.001 // Default priority fee
        }]
      );
    }
    
    // Take profit
    if (config.take_profit_percent > 0) {
      await this.priceMonitor.addAlert(
        campaign.id,
        config.take_profit_percent,
        'above',
        'percentage',
        [{
          type: 'sell',
          walletId: position.wallet_id,
          amount: 100,
          slippage: config.auto_sell_slippage_bps / 100,
          priorityFee: 0.001 // Default priority fee
        }]
      );
    }
  }

  /**
   * Handle price updates
   */
  private async handlePriceUpdate(data: any): Promise<void> {
    const positions = await queryAll(
      `SELECT * FROM telegram_trading_positions 
       WHERE token_mint = ? AND status = 'open'`,
      [data.tokenMint]
    ) as any[];
    
    for (const position of positions) {
      const oldPrice = position.current_price || position.avg_entry_price;
      const newPrice = data.currentPrice;
      
      // Calculate P&L
      const marketValue = position.current_balance * newPrice;
      const costBasis = position.current_balance * position.avg_entry_price;
      const unrealizedPnl = marketValue - costBasis;
      const totalPnl = position.realized_pnl_sol + unrealizedPnl;
      const roi = (totalPnl / position.total_invested_sol) * 100;
      
      // Update
      await this.updatePosition(position.id, {
        current_price: newPrice,
        unrealized_pnl_sol: unrealizedPnl,
        total_pnl_sol: totalPnl,
        roi_percent: roi
      });
      
      // Broadcast (REAL-TIME!)
      this.broadcast('telegram_position_price_update', {
        position_id: position.id,
        token_symbol: position.token_symbol,
        old_price: oldPrice,
        new_price: newPrice,
        change_percent: ((newPrice - oldPrice) / oldPrice) * 100,
        unrealized_pnl: unrealizedPnl,
        total_pnl: totalPnl,
        roi_percent: roi
      });
    }
  }

  /**
   * Create position record
   */
  private async createPosition(data: any): Promise<number> {
    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO telegram_trading_positions (
        user_id, wallet_id, token_mint,
        source_chat_id, source_chat_name, source_message_id,
        source_sender_id, source_sender_username, detection_type,
        detected_at, status, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const result = stmt.run([
      data.user_id, data.wallet_id, data.token_mint,
      data.source_chat_id, data.source_chat_name, data.source_message_id,
      data.source_sender_id, data.source_sender_username, data.detection_type,
      data.detected_at, data.status, Date.now(), Date.now()
    ]);
    
    // For sql.js, the lastID is on the result object directly
    return (result as any).lastID || (result as any).lastInsertRowid || 0;
  }

  /**
   * Update position
   */
  private async updatePosition(id: number, updates: any): Promise<void> {
    const fields = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), Date.now(), id];
    
    await execute(
      `UPDATE telegram_trading_positions 
       SET ${fields}, updated_at = ? 
       WHERE id = ?`,
      values
    );
  }

  /**
   * Get pool address
   */
  private async getPoolAddress(tokenMint: string): Promise<any> {
    return await queryOne(
      `SELECT pool_address FROM token_pools 
       WHERE mint_address = ? 
       ORDER BY liquidity_usd DESC 
       LIMIT 1`,
      [tokenMint]
    );
  }

  /**
   * Broadcast to WebSocket
   */
  private broadcast(event: string, data: any): void {
    this.emit('websocket_broadcast', { type: event, data });
  }
}

// Singleton export
let instance: TelegramAutoTrader | null = null;

export function getTelegramAutoTrader(): TelegramAutoTrader {
  if (!instance) {
    instance = new TelegramAutoTrader();
  }
  return instance;
}
