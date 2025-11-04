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
  alert_templates?: string | any[]; // Comprehensive alerts support
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
  private tradingEngine: any = null; // Lazy load only when needed
  private priceMonitor = getOnChainPriceMonitor();
  // private activePositions = new Map<number, any>(); // Reserved for future caching
  private positionCampaigns = new Map<number, string>();
  
  /**
   * Get trading engine (lazy initialization)
   */
  private getTradingEngine() {
    if (!this.tradingEngine) {
      try {
        this.tradingEngine = getTradingEngine();
      } catch (error) {
        console.error('❌ [AutoTrader] Failed to initialize TradingEngine:', error);
        throw error;
      }
    }
    return this.tradingEngine;
  }

  constructor() {
    super();
    console.log('✅ [AutoTrader] TelegramAutoTrader initialized');
    
    // Subscribe to price updates
    this.priceMonitor.on('price_update', (data: any) => {
      console.log(`\u2709 [AutoTrader] Received price update for ${data.tokenMint?.slice(0, 8) || 'unknown'}`);
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
        // Buy already sets up monitoring via setupAutoSell or setupMonitoring
        // No need to call startMonitoring again
        return;
      }
    }
    
    // Only start monitoring if no position was created (monitor-only mode)
    if (actions.includes('monitor') && config.auto_monitor_enabled && !positionId) {
      await this.startMonitoring(tokenMint, context, config, null);
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
    const result = await this.getTradingEngine().buyToken({
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
      // IMPORTANT: result.amountOut from TradingEngine is the tokens received
      const tokensReceived = result.amountOut || 0;
      const solSpent = result.amountIn || config.auto_buy_amount_sol;
      
      // Calculate buy price in SOL (SOL per token)
      const buyPriceInSol = tokensReceived > 0 
        ? (solSpent / tokensReceived)  // SOL spent / tokens received
        : 0;
      
      // Fetch current USD price from Jupiter
      let buyPriceUSD = 0;
      try {
        const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${tokenMint},So11111111111111111111111111111111111111112`;
        const priceResponse = await fetch(priceUrl);
        if (priceResponse.ok) {
          const priceData = await priceResponse.json();
          const tokenData = priceData[tokenMint];
          if (tokenData?.usdPrice) {
            buyPriceUSD = parseFloat(tokenData.usdPrice);
          }
        }
      } catch (error) {
        console.error(`⚠️ [AutoTrader] Failed to fetch USD price:`, error);
      }
      
      console.log(`💰 [AutoTrader] Trade executed:`);
      console.log(`   SOL spent: ${solSpent}`);
      console.log(`   Tokens received: ${tokensReceived}`);
      console.log(`   Price per token: ${buyPriceInSol} SOL ($${buyPriceUSD} USD)`);
      
      const positionId = await this.createPosition({
        userId: wallet.user_id,
        walletId: config.auto_buy_wallet_id,
        tokenMint,
        buyAmount: solSpent,
        buyPriceUSD,
        buySignature: result.signature,
        tokensBought: tokensReceived,  // Tokens received from trade
        buyPriceSol: buyPriceInSol,  // Price per token in SOL
        context,
        config
      });
      
      console.log(`📊 [AutoTrader] Position created with ID: ${positionId}`);
      
      // ALWAYS setup monitoring after buy (for price tracking)
      // This handles both auto-sell alerts AND general monitoring
      await this.setupPositionMonitoring(positionId, config);
      
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
    
    const result = await execute(
      `INSERT INTO telegram_trading_positions (
        user_id, wallet_id, token_mint, 
        buy_amount_sol, total_invested_sol,
        buy_signature, buy_price_usd, buy_price_sol, buy_price_usd_initial,
        tokens_bought, current_tokens,
        current_price, current_price_usd,
        peak_price, peak_price_usd,
        low_price, low_price_usd,
        source_chat_id, source_chat_name,
        source_message_id, source_sender_id,
        source_sender_username, detection_type,
        status, detected_at, first_buy_at,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`,
      [
        data.userId,
        data.walletId,
        data.tokenMint,
        data.buyAmount,
        data.buyAmount, // total_invested_sol starts same as buy amount
        data.buySignature,
        data.buyPriceSol || 0,  // buy_price_usd (legacy column, stores SOL)
        data.buyPriceSol || 0,  // buy_price_sol (new correct column)
        data.buyPriceUSD || 0,  // buy_price_usd_initial (ACTUAL USD PRICE)
        data.tokensBought || 0,
        data.tokensBought || 0, // current_tokens starts same as bought
        data.buyPriceSol || 0,  // Initialize current_price to entry price
        data.buyPriceUSD || 0,  // Initialize current_price_usd to entry USD
        data.buyPriceSol || 0,  // Initialize peak to entry
        data.buyPriceUSD || 0,  // Initialize peak_usd to entry USD
        data.buyPriceSol || 0,  // Initialize low to entry
        data.buyPriceUSD || 0,  // Initialize low_usd to entry USD
        data.context.chatId,
        data.context.chatName,
        data.context.messageId || 0,
        data.context.senderId,
        data.context.senderUsername,
        data.context.detectionType || 'standard',
        now, // detected_at
        now, // first_buy_at
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
   * Start price monitoring (for monitor-only mode, no position)
   */
  async startMonitoring(
    tokenMint: string,
    context: DetectionContext,
    config: AutoTradeConfig,
    positionId?: number | null  // Should always be null for monitor-only
  ): Promise<any> {
    console.log(`👁️ [AutoTrader] Starting monitor-only mode for ${tokenMint.slice(0, 8)}`);
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
   * Setup position monitoring with optional auto-sell alerts
   * This consolidates monitoring setup to avoid duplicate campaigns
   */
  private async setupPositionMonitoring(positionId: number, config: AutoTradeConfig): Promise<void> {
    console.log(`📊 [AutoTrader] Setting up monitoring for position ${positionId}`);
    
    const position = await queryOne(
      'SELECT * FROM telegram_trading_positions WHERE id = ?',
      [positionId]
    ) as any;
    
    const poolInfo = await this.getPoolAddress(position.token_mint);
    if (!poolInfo) return;
    
    // Always create/get a campaign for this position
    // The price monitor handles deduplication internally
    const campaign = await this.priceMonitor.startCampaign(
      position.token_mint,
      poolInfo.pool_address
    );
    
    this.positionCampaigns.set(positionId, campaign.id);
    console.log(`🔗 [AutoTrader] Position ${positionId} linked to campaign ${campaign.id}`);
    
    // Only setup alerts if auto-sell is enabled
    if (!config.auto_sell_enabled) {
      console.log(`📈 [AutoTrader] Monitoring-only mode for position ${positionId}`);
      return;
    }
    
    // Build alert templates
    let alertTemplates = [];
    
    // Check for comprehensive alert templates (like Test Lab)
    if (config.alert_templates) {
      try {
        alertTemplates = typeof config.alert_templates === 'string'
          ? JSON.parse(config.alert_templates)
          : config.alert_templates;
      } catch (e) {
        console.error('Failed to parse alert templates:', e);
      }
    }
    
    // If no templates provided, create default ones based on simple stop/take profit
    if (!alertTemplates.length) {
      // Stop loss at configured percentage (default -30%)
      if (config.stop_loss_percent && config.stop_loss_percent < 0) {
        alertTemplates.push({
          target_percent: config.stop_loss_percent,
          direction: 'below',
          price_type: 'percentage',
          actions: [{
            type: 'sell',
            amount: 100, // Sell all
            slippage: config.auto_sell_slippage_bps || 1000,
            priorityFee: 0.0001,
            walletId: position.wallet_id
          }, {
            type: 'notification'
          }]
        });
      }
      
      // Progressive take profits (like Test Lab)
      if (config.take_profit_percent && config.take_profit_percent > 0) {
        // First take profit at configured % - sell 25%
        alertTemplates.push({
          target_percent: config.take_profit_percent,
          direction: 'above',
          price_type: 'percentage',
          actions: [{
            type: 'sell',
            amount: 25,
            slippage: config.auto_sell_slippage_bps || 1000,
            priorityFee: 0.0001,
            walletId: position.wallet_id
          }, {
            type: 'notification'
          }]
        });
        
        // Second at 2x - sell another 25%
        alertTemplates.push({
          target_percent: config.take_profit_percent * 2,
          direction: 'above',
          price_type: 'percentage',
          actions: [{
            type: 'sell',
            amount: 25,
            slippage: config.auto_sell_slippage_bps || 1000,
            priorityFee: 0.0001,
            walletId: position.wallet_id
          }, {
            type: 'notification'
          }]
        });
        
        // Third at 3x - sell another 25%
        alertTemplates.push({
          target_percent: config.take_profit_percent * 3,
          direction: 'above',
          price_type: 'percentage',
          actions: [{
            type: 'sell',
            amount: 25,
            slippage: config.auto_sell_slippage_bps || 1000,
            priorityFee: 0.0001,
            walletId: position.wallet_id
          }, {
            type: 'notification'
          }]
        });
        
        // Final at 5x - sell remaining
        alertTemplates.push({
          target_percent: config.take_profit_percent * 5,
          direction: 'above',
          price_type: 'percentage',
          actions: [{
            type: 'sell',
            amount: 25,
            slippage: config.auto_sell_slippage_bps || 1000,
            priorityFee: 0.0001,
            walletId: position.wallet_id
          }, {
            type: 'notification'
          }]
        });
      }
    }
    
    // Create alerts in price monitor and database
    for (const template of alertTemplates) {
      // Add to price monitor
      await this.priceMonitor.addAlert(
        campaign.id,
        template.target_percent || template.target_price,
        template.direction,
        template.price_type || 'percentage',
        template.actions
      );
      
      // Store in database for tracking (if table exists)
      try {
        await execute(
          `INSERT INTO telegram_position_alerts 
           (position_id, user_id, target_price, target_percent, direction, price_type, actions, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            positionId,
            position.user_id,
            template.target_price || null,
            template.target_percent || null,
            template.direction,
            template.price_type || 'percentage',
            JSON.stringify(template.actions),
            Math.floor(Date.now() / 1000)
          ]
        );
      } catch (e) {
        // Table might not exist yet if migration hasn't run
        console.log('Alert tracking table not ready yet');
      }
    }
    
    console.log(`🎯 [AutoTrader] Set up ${alertTemplates.length} alerts for position ${positionId}`);
  }

  /**
   * Handle price updates - use data directly from OnChainPriceMonitor campaign
   */
  private async handlePriceUpdate(campaign: any): Promise<void> {
    const positions = await queryAll(
      `SELECT * FROM telegram_trading_positions 
       WHERE token_mint = ? AND status = 'open'`,
      [campaign.tokenMint]
    ) as any[];
    
    for (const position of positions) {
      // Get entry prices from position
      const avgEntryPriceSOL = position.buy_price_sol || 0;
      const avgEntryPriceUSD = position.buy_price_usd_initial || 0;
      
      const oldPriceSOL = position.current_price || avgEntryPriceSOL;
      
      // Use campaign data DIRECTLY (from OnChainPriceMonitor)
      const newPriceSOL = campaign.currentPrice;
      const newPriceUSD = campaign.currentPriceUSD;
      const sessionHighSOL = campaign.high;
      const sessionHighUSD = campaign.highUSD;
      const sessionLowSOL = campaign.low;
      const sessionLowUSD = campaign.lowUSD;
      
      // Calculate % gains/losses from entry (not campaign start)
      const highestGainPercent = avgEntryPriceSOL > 0 ? ((sessionHighSOL - avgEntryPriceSOL) / avgEntryPriceSOL) * 100 : 0;
      const lowestDropPercent = avgEntryPriceSOL > 0 ? ((sessionLowSOL - avgEntryPriceSOL) / avgEntryPriceSOL) * 100 : 0;
      
      // Calculate P&L in SOL and USD
      const currentTokens = position.current_tokens || position.tokens_bought || 0;
      const currentValueSOL = currentTokens * newPriceSOL;
      const currentValueUSD = currentTokens * newPriceUSD;
      const costBasisSOL = position.total_invested_sol || (currentTokens * avgEntryPriceSOL);
      const costBasisUSD = avgEntryPriceUSD > 0 ? (currentTokens * avgEntryPriceUSD) : 0;
      const unrealizedPnlSOL = currentValueSOL - costBasisSOL;
      const unrealizedPnlUSD = costBasisUSD > 0 ? (currentValueUSD - costBasisUSD) : 0;
      const totalPnlSOL = (position.realized_pnl_sol || 0) + unrealizedPnlSOL;
      const roi = costBasisSOL > 0 ? (totalPnlSOL / costBasisSOL) * 100 : 0;
      
      // Update position with comprehensive data
      await this.updatePosition(position.id, {
        current_price: newPriceSOL,
        current_price_usd: newPriceUSD,
        peak_price: sessionHighSOL,
        peak_price_usd: sessionHighUSD,
        low_price: sessionLowSOL,
        low_price_usd: sessionLowUSD,
        peak_roi_percent: highestGainPercent,
        max_drawdown_percent: Math.abs(lowestDropPercent),
        unrealized_pnl_sol: unrealizedPnlSOL,
        unrealized_pnl_usd: unrealizedPnlUSD,
        total_pnl_sol: totalPnlSOL,
        roi_percent: roi
      });
      
      // Broadcast comprehensive update (EXACT same structure as Test Lab)
      this.broadcast('telegram_position_price_update', {
        position_id: position.id,
        token_mint: position.token_mint,
        token_symbol: position.token_symbol || campaign.tokenSymbol,
        
        // Current prices (SOL + USD)
        current_price_sol: newPriceSOL,
        current_price_usd: newPriceUSD,
        old_price_sol: oldPriceSOL,
        
        // Entry prices (SOL + USD)
        entry_price_sol: avgEntryPriceSOL,
        entry_price_usd: avgEntryPriceUSD,
        
        // Session stats (SOL + USD for highs/lows)
        session_high_sol: sessionHighSOL,
        session_high_usd: sessionHighUSD,
        session_low_sol: sessionLowSOL,
        session_low_usd: sessionLowUSD,
        highest_gain_percent: highestGainPercent,
        lowest_drop_percent: lowestDropPercent,
        change_percent_from_entry: ((newPriceSOL - avgEntryPriceSOL) / avgEntryPriceSOL) * 100,
        
        // P&L (SOL + USD)
        unrealized_pnl_sol: unrealizedPnlSOL,
        unrealized_pnl_usd: unrealizedPnlUSD,
        total_pnl_sol: totalPnlSOL,
        roi_percent: roi,
        
        // Holdings
        current_tokens: currentTokens,
        current_value_sol: currentValueSOL,
        current_value_usd: currentValueUSD,
        
        // Metadata
        last_update: Date.now()
      });
    }
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
  
  /**
   * Link an existing position to a campaign (for manual positions)
   */
  linkPositionToCampaign(positionId: number, campaignId: string): void {
    this.positionCampaigns.set(positionId, campaignId);
    console.log(`🔗 [AutoTrader] Position ${positionId} linked to campaign ${campaignId}`);
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
