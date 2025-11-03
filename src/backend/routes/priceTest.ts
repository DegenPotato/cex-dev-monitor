/**
 * Test Lab Routes - On-chain WebSocket campaigns
 */

import { Router, Request, Response } from 'express';
import { WebSocketServer } from 'ws';
import { getOnChainPriceMonitor } from '../services/OnChainPriceMonitor.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { getDb, saveDatabase } from '../database/connection.js';
import { getTradingEngine } from '../core/trade.js';
import { telegramClientService } from '../services/TelegramClientService.js';
import { queryOne } from '../database/helpers.js';

// Lazy load trading engine
let tradingEngine: ReturnType<typeof getTradingEngine> | null = null;
const getTradingEngineInstance = () => {
  if (!tradingEngine) tradingEngine = getTradingEngine();
  return tradingEngine;
};

const authService = new SecureAuthService();
const monitor = getOnChainPriceMonitor();

// In-memory storage for Test Lab monitors (session-only, clears on restart)
const testLabMonitors = new Map<string, any>();
const testLabMonitorIdCounter = { value: 1 };

// In-memory position tracking for Test Lab (session-only)
interface TestLabPosition {
  userId: number;
  walletId: number;
  tokenMint: string;
  tokenSymbol?: string;
  balance: number; // Token balance
  avgEntryPrice: number; // In SOL
  totalInvested: number; // Total SOL invested
  realizedPnl: number; // Realized profit/loss in SOL
  trades: Array<{
    type: 'buy' | 'sell';
    amountSol: number;
    amountTokens: number;
    pricePerToken: number;
    signature: string;
    timestamp: number;
  }>;
  campaignId?: string;
  firstTradeAt: number;
  lastTradeAt: number;
}

const testLabPositions = new Map<string, TestLabPosition>(); // key: `${walletId}_${tokenMint}`

// Check if position exists and has balance
export function hasActivePosition(walletId: number, tokenMint: string): boolean {
  const key = `${walletId}_${tokenMint}`;
  const position = testLabPositions.get(key);
  return position ? position.balance > 0 : false;
}

// Helper to get/create position
function getOrCreatePosition(walletId: number, tokenMint: string, userId: number, tokenSymbol?: string): TestLabPosition {
  const key = `${walletId}_${tokenMint}`;
  if (!testLabPositions.has(key)) {
    testLabPositions.set(key, {
      userId,
      walletId,
      tokenMint,
      tokenSymbol,
      balance: 0,
      avgEntryPrice: 0,
      totalInvested: 0,
      realizedPnl: 0,
      trades: [],
      firstTradeAt: Date.now(),
      lastTradeAt: Date.now()
    });
  }
  return testLabPositions.get(key)!;
}

// Track buy trade
export function trackTestLabBuy(userId: number, walletId: number, tokenMint: string, tokenSymbol: string, amountSol: number, amountTokens: number, pricePerToken: number, signature: string, campaignId?: string) {
  const position = getOrCreatePosition(walletId, tokenMint, userId, tokenSymbol);
  position.tokenSymbol = tokenSymbol || position.tokenSymbol;
  
  // Update position
  position.balance += amountTokens;
  position.totalInvested += amountSol;
  position.avgEntryPrice = position.totalInvested / position.balance; // Weighted average
  position.lastTradeAt = Date.now();
  position.campaignId = campaignId || position.campaignId;
  
  // Record trade
  position.trades.push({
    type: 'buy',
    amountSol,
    amountTokens,
    pricePerToken,
    signature,
    timestamp: Date.now()
  });
  
  console.log(`📊 [Test Lab Position] BUY tracked: ${amountTokens.toFixed(2)} ${tokenSymbol} @ ${pricePerToken.toFixed(6)} SOL`);
  console.log(`   New balance: ${position.balance.toFixed(2)} | Avg entry: ${position.avgEntryPrice.toFixed(6)} SOL | Invested: ${position.totalInvested.toFixed(4)} SOL`);
  
  // Broadcast position update
  broadcastTestLabUpdate({
    type: 'test_lab_position_update',
    data: {
      userId,
      walletId,
      tokenMint,
      tokenSymbol,
      position: {
        balance: position.balance,
        avgEntryPrice: position.avgEntryPrice,
        totalInvested: position.totalInvested,
        realizedPnl: position.realizedPnl,
        tradeCount: position.trades.length
      }
    }
  });
}

// Track sell trade
export function trackTestLabSell(userId: number, walletId: number, tokenMint: string, tokenSymbol: string, amountSol: number, amountTokens: number, pricePerToken: number, signature: string) {
  const position = getOrCreatePosition(walletId, tokenMint, userId, tokenSymbol);
  
  if (position.balance === 0) {
    console.warn(`⚠️  [Test Lab Position] Sell attempted but position is already closed`);
    return;
  }
  
  // Calculate realized P/L for this sell
  const costBasis = position.avgEntryPrice * amountTokens;
  const saleProceeds = amountSol;
  const realizedPnl = saleProceeds - costBasis;
  position.realizedPnl += realizedPnl;
  
  // Update position
  const percentageSold = amountTokens / position.balance;
  position.balance -= amountTokens;
  position.totalInvested *= (1 - percentageSold);
  position.lastTradeAt = Date.now();
  
  // Record trade
  position.trades.push({
    type: 'sell',
    amountSol,
    amountTokens,
    pricePerToken,
    signature,
    timestamp: Date.now()
  });
  
  const pnlPercent = (realizedPnl / costBasis) * 100;
  console.log(`📊 [Test Lab Position] SELL tracked: ${amountTokens.toFixed(2)} ${tokenSymbol} @ ${pricePerToken.toFixed(6)} SOL`);
  console.log(`   💰 Trade P/L: ${realizedPnl.toFixed(4)} SOL (${pnlPercent > 0 ? '+' : ''}${pnlPercent.toFixed(2)}%)`);
  console.log(`   💵 Total Realized P/L: ${position.realizedPnl.toFixed(4)} SOL`);
  console.log(`   📦 Remaining balance: ${position.balance.toFixed(2)} tokens`);
  
  // Check if position is closed
  if (position.balance === 0) {
    finalizeTestLabPosition(position);
  } else {
    // Broadcast position update
    broadcastTestLabUpdate({
      type: 'test_lab_position_update',
      data: {
        userId,
        walletId,
        tokenMint,
        tokenSymbol,
        position: {
          balance: position.balance,
          avgEntryPrice: position.avgEntryPrice,
          totalInvested: position.totalInvested,
          realizedPnl: position.realizedPnl,
          tradeCount: position.trades.length
        }
      }
    });
  }
}

// Finalize closed position
function finalizeTestLabPosition(position: TestLabPosition) {
  const duration = position.lastTradeAt - position.firstTradeAt;
  const durationMinutes = Math.floor(duration / 60000);
  const durationHours = Math.floor(durationMinutes / 60);
  const durationDays = Math.floor(durationHours / 24);
  
  let durationStr = '';
  if (durationDays > 0) durationStr = `${durationDays}d ${durationHours % 24}h`;
  else if (durationHours > 0) durationStr = `${durationHours}h ${durationMinutes % 60}m`;
  else durationStr = `${durationMinutes}m`;
  
  const totalBuys = position.trades.filter(t => t.type === 'buy').length;
  const totalSells = position.trades.filter(t => t.type === 'sell').length;
  const roiPercent = (position.realizedPnl / position.trades.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.amountSol, 0)) * 100;
  
  console.log(`\n🏁 ===== TEST LAB POSITION CLOSED =====`);
  console.log(`   Token: ${position.tokenSymbol || position.tokenMint.slice(0, 8)}`);
  console.log(`   Campaign: ${position.campaignId || 'N/A'}`);
  console.log(`   Duration: ${durationStr}`);
  console.log(`   Total Trades: ${position.trades.length} (${totalBuys} buys, ${totalSells} sells)`);
  console.log(`   Total Invested: ${position.trades.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.amountSol, 0).toFixed(4)} SOL`);
  console.log(`   Final Realized P/L: ${position.realizedPnl.toFixed(4)} SOL`);
  console.log(`   ROI: ${roiPercent > 0 ? '+' : ''}${roiPercent.toFixed(2)}%`);
  console.log(`========================================\n`);
  
  // Broadcast final summary to frontend
  broadcastTestLabUpdate({
    type: 'test_lab_position_closed',
    data: {
      userId: position.userId,
      walletId: position.walletId,
      tokenMint: position.tokenMint,
      tokenSymbol: position.tokenSymbol,
      summary: {
        campaignId: position.campaignId,
        duration: durationStr,
        durationMs: duration,
        totalTrades: position.trades.length,
        totalBuys,
        totalSells,
        totalInvested: position.trades.filter(t => t.type === 'buy').reduce((sum, t) => sum + t.amountSol, 0),
        finalRealizedPnl: position.realizedPnl,
        roi: roiPercent,
        trades: position.trades
      }
    }
  });
  
  // Remove from memory
  const key = `${position.walletId}_${position.tokenMint}`;
  testLabPositions.delete(key);
}

// Export helper functions for accessing Test Lab monitors from other modules
export function getTestLabMonitorForChat(chatId: string): any {
  // Find any active monitor for this chat
  for (const monitor of testLabMonitors.values()) {
    if (monitor.chatId === chatId && monitor.isActive) {
      return monitor;
    }
  }
  return null;
}

export function incrementTestLabCampaigns(monitorId: string): void {
  // Find monitor and increment campaign counter
  for (const monitor of testLabMonitors.values()) {
    if (monitor.id === monitorId) {
      monitor.activeCampaigns = (monitor.activeCampaigns || 0) + 1;
      break;
    }
  }
}

export function broadcastTestLabUpdate(message: any): void {
  // Broadcast Test Lab updates to all connected clients
  broadcast(message);
}

export function trackUserCampaign(userId: number, campaignId: string): void {
  // Track campaign for user (makes it show in UI)
  if (!userCampaigns.has(userId)) {
    userCampaigns.set(userId, new Set());
  }
  userCampaigns.get(userId)!.add(campaignId);
  console.log(`✅ [Test Lab] Campaign ${campaignId} tracked for user ${userId}`);
}

// Store WebSocket server instance
let wss: WebSocketServer | null = null;

export function initializePriceTestRoutes(wssInstance: WebSocketServer) {
  wss = wssInstance;
  console.log('✅ Price Test routes initialized with native WebSocket');
}

const router = Router();

// Map user campaigns
const userCampaigns = new Map<number, Set<string>>();

/**
 * Fetch available pools for a token
 */
router.get('/api/test-lab/pools/:tokenMint', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    
    // Fetch pools from GeckoTerminal
    const url = `https://api.geckoterminal.com/api/v2/networks/solana/tokens/${tokenMint}/pools`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`GeckoTerminal API error: ${response.status}`);
    }
    
    const data = await response.json();
    const pools = data.data || [];
    
    // Parse and format pool data
    const formattedPools = pools.map((pool: any) => {
      const attributes = pool.attributes;
      const relationships = pool.relationships;
      
      // Helper to safely parse numbers
      const parseNum = (val: any, defaultVal: number = 0): number => {
        const num = parseFloat(val);
        return isNaN(num) ? defaultVal : num;
      };
      
      return {
        address: attributes.address,
        name: attributes.name,
        dex: relationships?.dex?.data?.id || 'unknown',
        baseToken: attributes.base_token_price_usd,
        priceUsd: attributes.base_token_price_usd,
        liquidityUsd: attributes.reserve_in_usd,
        volume24h: parseNum(attributes.volume_usd?.h24, 0),
        priceChange24h: parseNum(attributes.price_change_percentage?.h24, 0),
        transactions24h: parseNum(attributes.transactions?.h24?.buys, 0) + parseNum(attributes.transactions?.h24?.sells, 0),
        // Burn/lock detection
        poolCreatedAt: attributes.pool_created_at,
        // Note: Burn/lock status requires additional on-chain checks
        // This would need Solana RPC calls to check LP token supply
      };
    }).slice(0, 10); // Limit to top 10 pools
    
    res.json({ 
      success: true, 
      pools: formattedPools 
    });
  } catch (error: any) {
    console.error('❌ Error fetching pools:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start a new monitoring campaign
 */
router.post('/api/test-lab/campaign/start', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tokenMint, poolAddress } = req.body;
    
    if (!tokenMint || !poolAddress) {
      return res.status(400).json({ error: 'tokenMint and poolAddress required' });
    }

    const campaign = await monitor.startCampaign(tokenMint, poolAddress);
    
    // Track user campaigns
    if (!userCampaigns.has(userId)) {
      userCampaigns.set(userId, new Set());
    }
    userCampaigns.get(userId)!.add(campaign.id);
    
    res.json({ 
      success: true, 
      campaign
    });
  } catch (error: any) {
    console.error('❌ Error starting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop a campaign
 */
router.post('/api/test-lab/campaign/stop', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    await monitor.stopCampaign(campaignId);
    
    res.json({ 
      success: true, 
      message: 'Campaign stopped' 
    });
  } catch (error: any) {
    console.error('❌ Error stopping campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get campaign details
 */
router.get('/api/test-lab/campaign/:id', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    
    const campaign = monitor.getCampaign(id);
    
    if (!campaign) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ success: true, campaign });
  } catch (error: any) {
    console.error('❌ Error getting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset campaign baseline
 */
router.post('/api/test-lab/campaign/reset', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.body;
    
    if (!campaignId) {
      return res.status(400).json({ error: 'campaignId required' });
    }

    monitor.resetCampaign(campaignId);
    const campaign = monitor.getCampaign(campaignId);
    
    res.json({ 
      success: true, 
      campaign
    });
  } catch (error: any) {
    console.error('❌ Error resetting campaign:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Add alert to campaign with optional actions
 */
router.post('/api/test-lab/alerts', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId, targetPercent, direction, priceType, actions } = req.body;
    
    if (!campaignId || targetPercent === undefined || !direction) {
      return res.status(400).json({ error: 'campaignId, targetPercent and direction required' });
    }

    // Default to notification if no actions provided
    const alertActions = actions || [{ type: 'notification' }];
    
    // Default to percentage if not specified
    const alertPriceType = priceType || 'percentage';
    
    const alert = monitor.addAlert(campaignId, targetPercent, direction, alertPriceType, alertActions);
    
    if (!alert) {
      return res.status(404).json({ error: 'Campaign not found' });
    }
    
    res.json({ 
      success: true, 
      alert
    });
  } catch (error: any) {
    console.error('❌ Error adding alert:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get alerts for campaign
 */
router.get('/api/test-lab/alerts/:campaignId', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { campaignId } = req.params;
    
    const alerts = monitor.getAlerts(campaignId);
    
    res.json({ success: true, alerts });
  } catch (error: any) {
    console.error('❌ Error getting alerts:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update alert actions
 */
router.put('/api/test-lab/alerts/:alertId/actions', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    const { actions } = req.body;
    
    if (!actions || !Array.isArray(actions)) {
      return res.status(400).json({ error: 'actions array required' });
    }
    
    const success = monitor.updateAlertActions(alertId, actions);
    
    if (!success) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error updating alert actions:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delete an alert
 */
router.delete('/api/test-lab/alerts/:alertId', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { alertId } = req.params;
    
    const success = monitor.deleteAlert(alertId);
    
    if (!success) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error deleting alert:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all campaigns
 */
router.get('/api/test-lab/campaigns', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const userCampaignIds = userCampaigns.get(userId) || new Set();
    
    const campaigns = monitor.getActiveCampaigns()
      .filter(c => userCampaignIds.has(c.id));
    
    res.json({ success: true, campaigns });
  } catch (error: any) {
    console.error('❌ Error getting campaigns:', error);
    res.status(500).json({ error: error.message });
  }
});


// Broadcast to all connected WebSocket clients
function broadcast(message: any) {
  if (!wss) return;
  
  const messageStr = JSON.stringify(message);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(messageStr);
    }
  });
}

// Forward events to native WebSocket with logging
monitor.on('price_update', (campaign) => {
  const timestamp = new Date().toISOString();
  console.log(`🔔 [${timestamp}] Broadcasting price update for ${campaign.id} to ${wss?.clients.size || 0} WebSocket clients`);
  
  broadcast({
    type: 'test_lab_price_update',
    data: campaign
  });
});

monitor.on('alert_triggered', async (data) => {
  const timestamp = new Date().toISOString();
  console.log(`🚨 [${timestamp}] Alert triggered for ${data.campaignId}`);
  
  // Log to database for trigger history
  try {
    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO alert_trigger_history (
        campaign_id, alert_id, token_mint, token_symbol, token_name,
        trigger_price_sol, trigger_price_usd, change_percent,
        alert_type, alert_target, actions_executed, triggered_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    const actionsJson = JSON.stringify(data.alert.actions || []);
    const alertType = `${data.alert.direction} ${data.alert.priceType === 'percentage' ? data.alert.targetPercent + '%' : data.alert.targetPrice}`;
    
    stmt.run([
      data.campaignId,
      data.alert.id,
      data.tokenMint,
      data.alert.tokenSymbol || null,
      data.alert.tokenName || null,
      data.currentPrice,
      data.currentPriceUSD || null,
      data.changePercent || 0,
      alertType,
      data.alert.targetPrice,
      actionsJson,
      Date.now()
    ]);
    
    saveDatabase();
  } catch (error) {
    console.error('❌ Failed to log alert trigger:', error);
  }
  
  // Execute actions
  if (data.alert.actions && data.alert.actions.length > 0) {
    console.log(`⚡ Executing ${data.alert.actions.length} action(s)...`);
    
    for (const action of data.alert.actions) {
      try {
        if (action.type === 'buy') {
          console.log(`💰 BUY: ${action.amount} SOL (slippage: ${action.slippage}%, priority: ${action.priorityFee}, skipTax: ${action.skipTax})`);
          console.log(`   Token: ${data.tokenMint} (${data.tokenSymbol || 'unknown'})`);
          
          if (!action.walletId) {
            console.warn('⚠️ Buy action missing walletId, skipping...');
            continue;
          }
          
          // Get wallet address from ID
          const wallet = await queryOne('SELECT public_key, user_id FROM trading_wallets WHERE id = ?', [action.walletId]) as any;
          if (!wallet) {
            console.error(`❌ Wallet ${action.walletId} not found`);
            continue;
          }
          
          console.log(`   Wallet: ${wallet.public_key.slice(0, 8)}... (User: ${wallet.user_id})`);
          
          const result = await getTradingEngineInstance().buyToken({
            userId: wallet.user_id,
            walletAddress: wallet.public_key,
            tokenMint: data.tokenMint,
            amount: action.amount,
            slippageBps: action.slippage * 100,
            priorityLevel: 'high',
            skipTax: action.skipTax || false
          } as any);
          
          console.log(`   Buy result:`, JSON.stringify(result, null, 2));
          
          if (result.success) {
            console.log(`✅ Buy executed: ${result.signature}`);
          } else {
            console.error(`❌ Buy failed: ${result.error || 'Unknown error'}`);
            if ((result as any).details) {
              console.error(`   Details:`, (result as any).details);
            }
          }
          
        } else if (action.type === 'sell') {
          console.log(`💸 SELL: ${action.amount}% (slippage: ${action.slippage}%, priority: ${action.priorityFee}, skipTax: ${action.skipTax})`);
          console.log(`   Token: ${data.tokenMint} (${data.tokenSymbol || 'unknown'})`);
          
          if (!action.walletId) {
            console.warn('⚠️ Sell action missing walletId, skipping...');
            continue;
          }
          
          // Get wallet address from ID
          const wallet = await queryOne('SELECT public_key, user_id FROM trading_wallets WHERE id = ?', [action.walletId]) as any;
          if (!wallet) {
            console.error(`❌ Wallet ${action.walletId} not found`);
            continue;
          }
          
          console.log(`   Wallet: ${wallet.public_key.slice(0, 8)}... (User: ${wallet.user_id})`);
          
          const sellParams = {
            userId: wallet.user_id,
            walletAddress: wallet.public_key,
            tokenMint: data.tokenMint,
            tokenSymbol: data.tokenSymbol || undefined, // Include token symbol to avoid Jupiter lookup
            percentage: action.amount,
            slippageBps: action.slippage * 100,
            priorityLevel: 'high',
            skipTax: action.skipTax || false
          };
          
          console.log(`   Sell params:`, JSON.stringify(sellParams, null, 2));
          
          const result = await getTradingEngineInstance().sellToken(sellParams as any);
          
          console.log(`   Sell result:`, JSON.stringify(result, null, 2));
          
          if (result.success && result.signature) {
            console.log(`✅ Sell executed: ${result.signature}`);
            
            // Track Test Lab sell position (in-memory)
            if (result.amountOut && result.amountIn) {
              const pricePerToken = result.amountOut / result.amountIn; // SOL per token
              trackTestLabSell(
                wallet.user_id,
                action.walletId,
                data.tokenMint,
                data.tokenSymbol || data.tokenMint.slice(0, 8),
                result.amountOut, // SOL received
                result.amountIn, // Tokens sold
                pricePerToken,
                result.signature
              );
            }
          } else {
            console.error(`❌ Sell failed: ${result.error || 'Unknown error'}`);
            if ((result as any).details) {
              console.error(`   Details:`, (result as any).details);
            }
          }
          
        } else if (action.type === 'telegram') {
          console.log(`📤 TELEGRAM: Chat ${action.chatId}, Account ${action.accountId}`);
          
          if (!action.accountId || !action.chatId) {
            console.warn('⚠️ Telegram action missing accountId or chatId, skipping...');
            continue;
          }
          
          // Get the client for this account
          const client = await telegramClientService.getClient(action.accountId);
          if (!client) {
            console.error(`❌ Telegram account ${action.accountId} not connected`);
            continue;
          }
          
          // Format alert message
          const message = action.message || 
            `🎯 Alert Triggered!\n\n` +
            `Token: ${data.tokenMint}\n` +
            `Price: ${data.currentPrice.toFixed(9)} SOL` +
            (data.currentPriceUSD ? ` ($${data.currentPriceUSD.toFixed(8)})` : '') +
            `\nChange: ${data.changePercent.toFixed(2)}%\n` +
            `Alert: ${data.alert.direction} ${data.alert.priceType === 'percentage' ? data.alert.targetPercent + '%' : data.alert.targetPrice}`;
          
          // Send message
          await client.sendMessage(action.chatId, { message });
          console.log(`✅ Telegram message sent to chat ${action.chatId}`);
          
        } else if (action.type === 'discord') {
          console.log(`🔔 DISCORD: ${action.webhookUrl}`);
          
          if (!action.webhookUrl) {
            console.warn('⚠️ Discord action missing webhookUrl, skipping...');
            continue;
          }
          
          // Format webhook payload
          const payload = {
            content: action.message || 
              `🎯 **Alert Triggered!**\n\n` +
              `Token: \`${data.tokenMint}\`\n` +
              `Price: ${data.currentPrice.toFixed(9)} SOL` +
              (data.currentPriceUSD ? ` ($${data.currentPriceUSD.toFixed(8)})` : '') +
              `\nChange: ${data.changePercent.toFixed(2)}%\n` +
              `Alert: ${data.alert.direction} ${data.alert.priceType === 'percentage' ? data.alert.targetPercent + '%' : data.alert.targetPrice}`
          };
          
          const response = await fetch(action.webhookUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          });
          
          if (response.ok) {
            console.log(`✅ Discord webhook sent`);
          } else {
            console.error(`❌ Discord webhook failed: ${response.status}`);
          }
          
        } else {
          console.log(`🔔 NOTIFICATION (broadcasted via WebSocket)`);
        }
      } catch (error) {
        console.error(`❌ Failed to execute action ${action.type}:`, error);
      }
    }
  }
  
  // Broadcast to WebSocket clients
  broadcast({
    type: 'test_lab_alert',
    data
  });
});

/**
 * List active Telegram monitors (from in-memory storage)
 */
router.get('/api/test-lab/telegram-monitors', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Get monitors from memory for this user
    const userMonitors = Array.from(testLabMonitors.values())
      .filter(m => m.userId === userId && m.isActive);
    
    // Format for frontend compatibility
    const parsedMonitors = userMonitors.map(m => ({
      id: m.id,
      user_id: m.userId,
      chat_id: m.chatId,
      telegram_account_id: m.telegramAccountId,
      monitored_user_ids: m.selectedUserIds || [],
      exclude_no_username: m.excludeNoUsername,
      process_bot_messages: !m.excludeBots,
      test_lab_alerts: m.alerts || [],
      active_campaigns: m.activeCampaigns || 0,
      config: m,
      is_active: m.isActive
    }));
    
    res.json({ success: true, monitors: parsedMonitors });
  } catch (error) {
    console.error('Failed to fetch monitors:', error);
    res.status(500).json({ error: 'Failed to fetch monitors' });
  }
});

/**
 * Start telegram monitoring for Test Lab (in-memory only, no database persistence)
 */
router.post('/api/test-lab/telegram-monitor/start', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { 
      telegramAccountId, 
      chatId, 
      monitorAllUsers, 
      selectedUserIds, 
      excludeBots, 
      excludeNoUsername,
      initialAction,
      buyAmountSol,
      walletId,
      onlyBuyNew,
      alerts 
    } = req.body;
    
    if (!telegramAccountId || !chatId) {
      return res.status(400).json({ error: 'telegramAccountId and chatId required' });
    }

    if (!alerts || alerts.length === 0) {
      return res.status(400).json({ error: 'At least one alert is required' });
    }

    if (initialAction === 'buy_and_monitor') {
      if (!walletId) {
        return res.status(400).json({ error: 'Wallet selection required for buy_and_monitor' });
      }
      if (!buyAmountSol || buyAmountSol <= 0) {
        return res.status(400).json({ error: 'Buy amount must be greater than 0' });
      }
    }

    // Store in memory only - no database persistence for Test Lab!
    const monitorKey = `${userId}_${chatId}`;
    const monitorId = `test_lab_monitor_${testLabMonitorIdCounter.value++}`;
    
    // Store configuration in memory
    const config = {
      id: monitorId,
      userId,
      telegramAccountId,
      chatId,
      monitorAllUsers,
      selectedUserIds: selectedUserIds.map((id: string) => parseInt(id)),
      excludeBots,
      excludeNoUsername,
      initialAction: initialAction || 'monitor_only',
      buyAmountSol: buyAmountSol || null,
      walletId: walletId || null,
      onlyBuyNew: onlyBuyNew !== false,
      alerts: alerts || [],
      activeCampaigns: 0,
      isActive: true,
      createdAt: Date.now()
    };
    
    // Replace any existing monitor for this chat
    testLabMonitors.set(monitorKey, config);
    
    const target = monitorAllUsers 
      ? 'all users' 
      : `${selectedUserIds.length} user(s)`;
    console.log(`✅ [Test Lab] Started monitoring: ${target} in chat ${chatId} with ${alerts.length} alert(s)`);
    
    res.json({ 
      success: true,
      message: `Now monitoring ${target} with ${alerts.length} alert(s)` 
    });
  } catch (error: any) {
    console.error('❌ Error starting telegram monitor:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop telegram monitoring
 */
router.post('/api/test-lab/telegram-monitor/stop', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { monitorId } = req.body;
    
    if (!monitorId) {
      return res.status(400).json({ error: 'monitorId required' });
    }

    // Find and deactivate the monitor in memory
    let found = false;
    for (const [, monitor] of testLabMonitors.entries()) {
      if (monitor.id === monitorId && monitor.userId === userId) {
        monitor.isActive = false;
        found = true;
        break;
      }
    }
    
    if (!found) {
      return res.status(404).json({ error: 'Monitor not found' });
    }
    
    console.log(`🛑 Stopped Test Lab monitor ID ${monitorId}`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error stopping telegram monitor:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Start GMGN scraper test
 */
router.post('/api/test-lab/gmgn-test/start', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint, debugMode } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint required' });
    }

    console.log(`🧪 Starting GMGN scraper test for ${tokenMint}${debugMode ? ' (DEBUG MODE)' : ''}`);
    
    // Import scraper service dynamically
    const { getGMGNScraperService } = await import('../services/GMGNScraperService.js');
    const gmgnScraperService = getGMGNScraperService();
    
    // Enable debug mode if requested
    if (debugMode) {
      gmgnScraperService.setDebugMode(true);
    }
    
    // Start the service if not already running
    await gmgnScraperService.start();
    
    // Add monitor for this token with EMAs: 21, 50, 100, 200 and RSI 14, RSI 2
    await gmgnScraperService.addMonitor(tokenMint, '5m', ['RSI_14', 'RSI_2', 'EMA_21', 'EMA_50', 'EMA_100', 'EMA_200']);
    
    // Listen for updates and broadcast to WebSocket
    gmgnScraperService.on('monitor_update', (data: any) => {
      console.log(`📊 GMGN Update for ${data.tokenMint.slice(0, 8)}...`);
      console.log(`   Price: $${data.values.PRICE?.toFixed(8) || 'N/A'}`);
      console.log(`   RSI(14): ${data.values.RSI_14?.toFixed(2) || 'N/A'}`);
      console.log(`   RSI(2): ${data.values.RSI_2?.toFixed(2) || 'N/A'}`);
      console.log(`   EMA(21): ${data.values.EMA_21?.toFixed(8) || 'N/A'}`);
      console.log(`   EMA(50): ${data.values.EMA_50?.toFixed(8) || 'N/A'}`);
      console.log(`   EMA(100): ${data.values.EMA_100?.toFixed(8) || 'N/A'}`);
      console.log(`   EMA(200): ${data.values.EMA_200?.toFixed(8) || 'N/A'}`);
      
      // Broadcast to WebSocket
      broadcast({
        type: 'gmgn_indicator_update',
        data
      });
    });

    // Listen for screenshots and broadcast
    gmgnScraperService.on('screenshot', (data: any) => {
      console.log(`📸 Screenshot available: ${data.path}`);
      broadcast({
        type: 'gmgn_screenshot',
        data: {
          tokenMint: data.tokenMint,
          timestamp: data.timestamp,
          url: `/api/test-lab/gmgn-test/screenshot/${data.tokenMint}?t=${data.timestamp}`
        }
      });
    });
    
    res.json({ 
      success: true,
      message: `GMGN scraper test started for ${tokenMint}. Check console for extracted values.` 
    });
  } catch (error: any) {
    console.error('❌ Error starting GMGN test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get latest screenshot for a token
 */
router.get('/api/test-lab/gmgn-test/screenshot/:tokenMint', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const fs = await import('fs');
    const path = await import('path');
    
    const screenshotDir = './screenshots';
    
    // Find latest screenshot for this token
    if (!fs.existsSync(screenshotDir)) {
      return res.status(404).json({ error: 'No screenshots available' });
    }
    
    const files = fs.readdirSync(screenshotDir)
      .filter(f => f.startsWith(tokenMint) && f.endsWith('.png'))
      .sort()
      .reverse();
    
    if (files.length === 0) {
      return res.status(404).json({ error: 'No screenshot found for this token' });
    }
    
    const latestScreenshot = path.join(screenshotDir, files[0]);
    res.sendFile(path.resolve(latestScreenshot));
  } catch (error: any) {
    console.error('❌ Error getting screenshot:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop GMGN scraper test
 */
router.post('/api/test-lab/gmgn-test/stop', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    // Import scraper service dynamically
    const { getGMGNScraperService } = await import('../services/GMGNScraperService.js');
    const gmgnScraperService = getGMGNScraperService();
    
    if (tokenMint) {
      await gmgnScraperService.removeMonitor(tokenMint);
    } else {
      await gmgnScraperService.stop();
    }
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error stopping GMGN test:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active monitors
 */
router.get('/api/test-lab/telegram-monitor/active', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    const db = await getDb();
    const stmt = db.prepare(`
      SELECT * FROM test_lab_telegram_monitors 
      WHERE user_id = ? AND is_active = 1
      ORDER BY created_at DESC
    `);
    
    const monitors = (stmt as any).all([userId]);
    
    res.json({ success: true, monitors });
  } catch (error: any) {
    console.error('❌ Error getting monitors:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
