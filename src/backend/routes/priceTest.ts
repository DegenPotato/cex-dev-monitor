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
          
          if (result.success) {
            console.log(`✅ Sell executed: ${result.signature}`);
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
 * Start telegram monitoring for Test Lab
 */
router.post('/api/test-lab/telegram-monitor/start', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { telegramAccountId, chatId, username } = req.body;
    
    if (!telegramAccountId || !chatId || !username) {
      return res.status(400).json({ error: 'telegramAccountId, chatId, and username required' });
    }

    const db = await getDb();
    const stmt = db.prepare(`
      INSERT INTO test_lab_telegram_monitors (user_id, telegram_account_id, chat_id, target_username)
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run([userId, telegramAccountId, chatId, username]);
    saveDatabase();
    
    console.log(`✅ Started Test Lab monitoring: @${username} in chat ${chatId}`);
    
    res.json({ 
      success: true,
      message: `Now monitoring @${username} in selected chat` 
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

    const db = await getDb();
    const stmt = db.prepare(`
      UPDATE test_lab_telegram_monitors 
      SET is_active = 0, updated_at = ?
      WHERE id = ? AND user_id = ?
    `);
    
    stmt.run([Date.now(), monitorId, userId]);
    saveDatabase();
    
    console.log(`🛑 Stopped Test Lab monitor ID ${monitorId}`);
    
    res.json({ success: true });
  } catch (error: any) {
    console.error('❌ Error stopping telegram monitor:', error);
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
