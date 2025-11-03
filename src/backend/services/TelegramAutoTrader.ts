/**
 * Telegram Auto-Trading Service
 * Handles automated trading from Telegram detections with comprehensive position tracking
 */

import { EventEmitter } from 'events';
import { execute, queryOne, queryAll } from '../database/helpers.js';
import { getTradingEngine } from '../core/trade.js';
import { getOnChainPriceMonitor } from './OnChainPriceMonitor.js';

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
   * Handle contract detection
   */
  async handleContractDetection(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig
  ): Promise<void> {
    console.log(`🎯 [AutoTrader] Processing ${tokenMint.slice(0, 8)}... (${config.action_on_detection})`);
    
    // Parse action
    const actions = this.parseActions(config.action_on_detection);
    let positionId: number | null = null;
    
    // Execute buy first if configured (creates position)
    if (actions.includes('trade') && config.auto_buy_enabled) {
      const buyResult = await this.executeBuy(tokenMint, context, config);
      if (buyResult?.positionId) {
        positionId = buyResult.positionId;
      }
    }
    
    // Start monitoring (with or without position)
    if (actions.includes('monitor') && config.auto_monitor_enabled) {
      await this.startMonitoring(tokenMint, context, config, positionId);
    }
  }

  /**
   * Execute buy order and create position
   */
  async executeBuy(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig
  ): Promise<any> {
    if (!config.auto_buy_wallet_id || !config.auto_buy_amount_sol) {
      console.log(`⏭️ [AutoTrader] Skipping buy - missing wallet or amount`);
      return null;
    }
    
    // Get wallet
    const wallet = await queryOne(
      'SELECT public_key, user_id FROM trading_wallets WHERE id = ?',
      [config.auto_buy_wallet_id]
    ) as any;
    
    if (!wallet) {
      console.error(`❌ [AutoTrader] Wallet ${config.auto_buy_wallet_id} not found`);
      return null;
    }
    
    // Execute buy
    const result = await this.tradingEngine.buyToken({
      userId: wallet.user_id,
      walletAddress: wallet.public_key,
      tokenMint,
      amount: config.auto_buy_amount_sol,
      slippageBps: config.auto_buy_slippage_bps || 300,
      priorityLevel: config.auto_buy_priority_level || 'medium',
      skipTax: config.auto_buy_skip_tax || false
    } as any);
    
    if (result.success && result.signature) {
      console.log(`✅ [AutoTrader] Buy executed: ${result.signature}`);
      
      // Create position in database
      const positionId = await this.createPosition({
        userId: wallet.user_id,
        walletId: config.auto_buy_wallet_id,
        tokenMint,
        buyAmount: config.auto_buy_amount_sol,
        buySignature: result.signature,
        tokensBought: result.amountOut || 0,  // Use amountOut from TradeResult
        buyPriceUsd: result.amountIn && result.amountOut ? (result.amountIn / result.amountOut) : 0,
        context,
        config
      });
      
      console.log(`📊 [AutoTrader] Position created with ID: ${positionId}`);
      
      // Setup auto-sell if configured
      if (config.auto_sell_enabled) {
        await this.setupAutoSell(positionId, config);
      }
      
      // Broadcast position creation
      this.broadcast('telegram_position_created', {
        position_id: positionId,
        token_mint: tokenMint,
        amount_sol: config.auto_buy_amount_sol,
        tokens_bought: result.amountOut || 0,  // Use amountOut from TradeResult
        source_chat_name: context.chatName,
        wallet_address: wallet.public_key
      });
      
      return { success: true, positionId, signature: result.signature };
    }
    
    console.error(`❌ [AutoTrader] Buy failed:`, result.error);
    return { success: false, error: result.error };
  }

  /**
   * Create position record with full tracking
   */
  private async createPosition(data: any): Promise<number> {
    const now = Math.floor(Date.now() / 1000);
    
    // Get current SOL price for USD calculations
    const solPrice = await queryOne('SELECT price FROM sol_price_oracle ORDER BY timestamp DESC LIMIT 1') as any;
    const currentSolPrice = solPrice?.price || 175;
    
    const buyAmountUsd = data.buyAmount * currentSolPrice;
    
    const result = await execute(
      `INSERT INTO telegram_trading_positions (
        user_id, wallet_id, token_mint, 
        buy_amount_sol, buy_amount_usd,
        buy_signature, buy_price_usd,
        tokens_bought, current_tokens,
        source_chat_id, source_chat_name,
        source_message_id, source_sender_id,
        source_sender_username,
        status, entry_mcap_usd,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
      [
        data.userId,
        data.walletId,
        data.tokenMint,
        data.buyAmount,
        buyAmountUsd,
        data.buySignature,
        data.buyPriceUsd || 0,
        data.tokensBought || 0,
        data.tokensBought || 0, // current_tokens starts same as bought
        data.context.chatId,
        data.context.chatName,
        data.context.messageId || 0,
        data.context.senderId,
        data.context.senderUsername,
        0, // entry_mcap_usd - will update after
        now,
        now
      ]
    );
    
    const positionId = result.lastInsertRowid as number;
    
    // Queue position update for WebSocket
    await execute(
      `INSERT INTO position_updates (type, data, created_at) VALUES (?, ?, ?)`,
      [
        'telegram_position_created',
        JSON.stringify({
          position_id: positionId,
          token_mint: data.tokenMint,
          user_id: data.userId,
          wallet_id: data.walletId
        }),
        now
      ]
    );
    
    return positionId;
  }

  /**
   * Start price monitoring with position tracking
   */
  async startMonitoring(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig,
    positionId?: number | null  // Track position if created
  ): Promise<any> {
    const poolInfo = await this.getPoolAddress(tokenMint);
    if (!poolInfo) {
      console.warn(`⚠️ [AutoTrader] No pool found for monitoring ${tokenMint.slice(0, 8)}...`);
      return { success: false, error: 'No pool found' };
    }
    
    const campaign = await this.priceMonitor.startCampaign(tokenMint, poolInfo.pool_address);
    
    // Link campaign to position if we have one
    if (positionId) {
      this.positionCampaigns.set(positionId, campaign.id);
      console.log(`🔗 [AutoTrader] Linked campaign ${campaign.id} to position ${positionId}`);
    }
    
    // Add price alerts
    if (config.alert_price_changes) {
      const alerts = typeof config.alert_price_changes === 'string' 
        ? JSON.parse(config.alert_price_changes) 
        : config.alert_price_changes;
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
   * Get pool address - fetches from GeckoTerminal if not in DB
   */
  private async getPoolAddress(tokenMint: string): Promise<any> {
    // First check database
    const dbPool = await queryOne(
      `SELECT pool_address FROM token_pools 
       WHERE mint_address = ? 
       ORDER BY liquidity_usd DESC 
       LIMIT 1`,
      [tokenMint]
    ) as any;
    
    if (dbPool) {
      return dbPool;
    }
    
    // Fetch from GeckoTerminal API
    console.log(`📊 [AutoTrader] Fetching pool from GeckoTerminal for ${tokenMint.slice(0, 8)}...`);
    
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools`
      );
      
      if (!response.ok) {
        console.error(`❌ [AutoTrader] GeckoTerminal API error: ${response.status}`);
        return null;
      }
      
      const data = await response.json();
      const pools = data.data || [];
      
      if (pools.length === 0) {
        console.log(`⚠️ [AutoTrader] No pools found on GeckoTerminal`);
        return null;
      }
      
      // Get highest liquidity pool
      const bestPool = pools.sort((a: any, b: any) => {
        const liqA = parseFloat(a.attributes.reserve_in_usd || '0');
        const liqB = parseFloat(b.attributes.reserve_in_usd || '0');
        return liqB - liqA;
      })[0];
      
      const poolAddress = bestPool.attributes.address;
      const liquidityUsd = parseFloat(bestPool.attributes.reserve_in_usd || '0');
      
      console.log(`✅ [AutoTrader] Found pool ${poolAddress.slice(0, 8)}... ($${liquidityUsd.toFixed(0)} liquidity)`);
      
      // Save to database
      await execute(
        `INSERT OR REPLACE INTO token_pools (
          mint_address, pool_address, liquidity_usd, dex, created_at
        ) VALUES (?, ?, ?, 'pumpfun', ?)`,
        [tokenMint, poolAddress, liquidityUsd, Math.floor(Date.now() / 1000)]
      );
      
      return { pool_address: poolAddress };
    } catch (error) {
      console.error(`❌ [AutoTrader] Failed to fetch pool:`, error);
      return null;
    }
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
