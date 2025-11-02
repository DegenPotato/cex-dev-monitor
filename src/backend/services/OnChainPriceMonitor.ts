/**
 * On-Chain Price Monitor via Solana WebSocket
 * Real-time price tracking directly from Raydium/Orca pools
 */

import { EventEmitter } from 'events';

export interface Campaign {
  id: string;
  tokenMint: string;
  poolAddress: string;
  startPrice: number;
  currentPrice: number;
  currentPriceUSD?: number;
  high: number;
  low: number;
  changePercent: number;
  highestGainPercent: number;  // Highest % gain from start
  lowestDropPercent: number;   // Lowest % drop from start
  startTime: number;
  lastUpdate: number;
  subscriptionId: number | null;
  isActive: boolean;
  priceHistory: Array<{ price: number; timestamp: number; }>;
}

export type AlertAction = 
  | { type: 'notification' }
  | { type: 'buy'; amount: number; slippage: number }
  | { type: 'sell'; amount: number; slippage: number }
  | { type: 'telegram'; chatId: string; message?: string }
  | { type: 'discord'; webhookUrl: string; message?: string };

export interface PriceAlert {
  id: string;
  campaignId: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  hit: boolean;
  hitAt?: number;
  actions: AlertAction[]; // Multiple actions can be triggered
}

/**
 * On-Chain Price Monitor
 * Subscribes to Solana account changes for real-time price updates
 */
export class OnChainPriceMonitor extends EventEmitter {
  private campaigns: Map<string, Campaign> = new Map();
  private alerts: Map<string, PriceAlert[]> = new Map();

  constructor() {
    super();
  }

  /**
   * Start a new monitoring campaign for a token
   */
  async startCampaign(tokenMint: string, poolAddress: string): Promise<Campaign> {
    // Check if already monitoring
    const existing = Array.from(this.campaigns.values())
      .find(c => c.tokenMint === tokenMint && c.poolAddress === poolAddress);
    
    if (existing && existing.isActive) {
      console.log(`⚠️ Already monitoring ${tokenMint} in pool ${poolAddress}`);
      return existing;
    }

    const campaignId = `${tokenMint}_${Date.now()}`;
    
    // Get initial price from Jupiter (real-time)
    const initialPrice = await this.fetchJupiterPrice(tokenMint); // Use SOL close price as current
    
    const campaign: Campaign = {
      id: campaignId,
      tokenMint,
      poolAddress,
      startPrice: initialPrice,
      currentPrice: initialPrice,
      high: initialPrice,
      low: initialPrice,
      changePercent: 0,
      highestGainPercent: 0,
      lowestDropPercent: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      subscriptionId: null,
      isActive: true,
      priceHistory: [{ price: initialPrice, timestamp: Date.now() }]
    };

    this.campaigns.set(campaignId, campaign);

    console.log(`🚀 Started campaign ${campaignId} for ${tokenMint}`);
    console.log(`   Initial price: ${initialPrice.toFixed(9)} SOL`);
    
    // Start polling for this campaign (15 second intervals)
    this.startPricePolling(campaignId);
    
    this.emit('campaign_started', campaign);
    return campaign;
  }

  /**
   * Start polling for price updates every 15 seconds
   */
  private startPricePolling(campaignId: string) {
    const interval = setInterval(async () => {
      const campaign = this.campaigns.get(campaignId);
      if (!campaign || !campaign.isActive) {
        clearInterval(interval);
        return;
      }

      try {
        // Fetch real-time price from Jupiter (actual swap price)
        const jupiterPrice = await this.fetchJupiterPrice(campaign.tokenMint);
        
        // Use Jupiter price as current (most accurate real-time)
        const newPrice = jupiterPrice;
        const SOL_USD_PRICE = 180; // Approximate for USD display
        const usdPrice = newPrice * SOL_USD_PRICE;
        
        // Update campaign stats
        campaign.currentPrice = newPrice;
        campaign.currentPriceUSD = usdPrice;
        campaign.high = Math.max(campaign.high, newPrice); // Track session high locally
        campaign.low = Math.min(campaign.low, newPrice);   // Track session low locally
        campaign.changePercent = ((newPrice - campaign.startPrice) / campaign.startPrice) * 100;
        
        // Track highest gain and lowest drop from start price
        campaign.highestGainPercent = Math.max(campaign.highestGainPercent, campaign.changePercent);
        campaign.lowestDropPercent = Math.min(campaign.lowestDropPercent, campaign.changePercent);
        
        campaign.lastUpdate = Date.now();
        
        // Add to history
        campaign.priceHistory.push({ price: newPrice, timestamp: Date.now() });
        
        // Keep last 100 data points
        if (campaign.priceHistory.length > 100) {
          campaign.priceHistory.shift();
        }
        
        // ALWAYS log price updates with timestamp
        const timestamp = new Date().toISOString();
        console.log(`📊 [${timestamp}] ${campaign.tokenMint.slice(0, 8)}... SOL: ${newPrice.toFixed(9)} (${campaign.changePercent >= 0 ? '+' : ''}${campaign.changePercent.toFixed(2)}%) | USD: $${usdPrice.toFixed(8)} | High: ${campaign.high.toFixed(9)} | Low: ${campaign.low.toFixed(9)}`);
        
        // Broadcast update
        console.log(`🔔 [${timestamp}] Emitting price_update for campaign ${campaignId}`);
        this.emit('price_update', campaign);
        
        // Check alerts
        this.checkAlerts(campaignId, newPrice);
      } catch (error) {
        console.error(`Error polling price for ${campaignId}:`, error);
      }
    }, 2000); // 2 seconds (safe for Jupiter API)

    console.log(`📊 Started price polling for ${campaignId} (2s intervals)`);
  }

  /**
   * Fetch current price from Jupiter
   * Try Price API v3 first (fast, clean), fallback to Quote API (always works)
   */
  private async fetchJupiterPrice(tokenMint: string): Promise<number> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    try {
      // Try Price API v3 first (only works for listed tokens)
      const priceUrl = `https://api.jup.ag/price/v3?ids=${tokenMint},${SOL_MINT}`;
      const priceResponse = await fetch(priceUrl);
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        const tokenData = priceData[tokenMint];
        const solData = priceData[SOL_MINT];
        
        if (tokenData?.usdPrice && solData?.usdPrice) {
          const priceInSOL = parseFloat(tokenData.usdPrice) / parseFloat(solData.usdPrice);
          console.log(`💰 Jupiter Price API: ${tokenMint.slice(0, 8)}... = ${priceInSOL.toFixed(12)} SOL`);
          return priceInSOL;
        }
      }
    } catch (error) {
      console.log(`⚠️ Price API failed, falling back to Quote API`);
    }
    
    // Fallback: Use Quote API (works for all tokens with liquidity)
    const AMOUNT_IN_LAMPORTS = 1000000000; // 1 SOL
    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${tokenMint}&amount=${AMOUNT_IN_LAMPORTS}&slippageBps=50`;
    
    const quoteResponse = await fetch(quoteUrl);
    if (!quoteResponse.ok) {
      throw new Error(`Jupiter Quote API error: ${quoteResponse.status}`);
    }
    
    const quoteData = await quoteResponse.json();
    if (!quoteData.outAmount) {
      throw new Error(`No quote available for ${tokenMint}`);
    }
    
    // Get decimals: Try Jupiter Token API first, fallback to Solana RPC
    let decimals = 6; // Default fallback
    
    try {
      // Try Jupiter Token API v2 first (fast, includes metadata)
      const tokenApiUrl = `https://api.jup.ag/tokens/v2/search?mint=${tokenMint}`;
      const tokenApiResponse = await fetch(tokenApiUrl);
      
      if (tokenApiResponse.ok) {
        const tokenData = await tokenApiResponse.json();
        if (tokenData?.decimals !== undefined) {
          decimals = tokenData.decimals;
          console.log(`✅ Got decimals from Jupiter Token API: ${decimals}`);
        }
      } else {
        // Fallback to Solana RPC (works for all tokens)
        const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
        const rpcResponse = await fetch(rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'getAccountInfo',
            params: [tokenMint, { encoding: 'jsonParsed' }]
          })
        });
        
        const rpcData = await rpcResponse.json();
        const tokenDecimals = rpcData?.result?.value?.data?.parsed?.info?.decimals;
        
        if (tokenDecimals !== undefined) {
          decimals = tokenDecimals;
          console.log(`✅ Got decimals from Solana RPC: ${decimals}`);
        } else {
          console.warn(`⚠️ Could not fetch decimals, using default 6`);
        }
      }
    } catch (error) {
      console.warn(`⚠️ Error fetching decimals for ${tokenMint}, using default 6:`, error);
    }
    
    const outAmount = parseInt(quoteData.outAmount);
    const tokensReceived = outAmount / Math.pow(10, decimals);
    const priceInSOL = 1 / tokensReceived;
    
    console.log(`💰 Jupiter Quote API: ${tokenMint.slice(0, 8)}... = ${priceInSOL.toFixed(12)} SOL (${decimals} decimals)`);
    
    return priceInSOL;
  }

  /**
   * Check and trigger alerts
   */
  private checkAlerts(campaignId: string, currentPrice: number) {
    const alerts = this.alerts.get(campaignId);
    if (!alerts) return;

    for (const alert of alerts) {
      if (alert.hit) continue;

      const triggered = alert.direction === 'above'
        ? currentPrice >= alert.targetPrice
        : currentPrice <= alert.targetPrice;

      if (triggered) {
        alert.hit = true;
        alert.hitAt = Date.now();

        const campaign = this.campaigns.get(campaignId);
        const hitTime = new Date(alert.hitAt).toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });

        console.log(`🎯 [${hitTime}] Alert triggered for campaign ${campaignId}: ${alert.direction} ${alert.targetPercent}% (target: ${alert.targetPrice.toFixed(9)} SOL, hit at: ${currentPrice.toFixed(9)} SOL)`);
        
        this.emit('alert_triggered', {
          campaignId,
          alert,
          currentPrice,
          currentPriceUSD: campaign?.currentPriceUSD,
          changePercent: campaign?.changePercent,
          tokenMint: campaign?.tokenMint,
          hitTime,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Add an alert to a campaign with configurable actions
   */
  addAlert(
    campaignId: string, 
    targetPercent: number, 
    direction: 'above' | 'below',
    actions: AlertAction[] = [{ type: 'notification' }]
  ): PriceAlert | null {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;

    const targetPrice = direction === 'above'
      ? campaign.startPrice * (1 + targetPercent / 100)
      : campaign.startPrice * (1 - Math.abs(targetPercent) / 100);

    const alert: PriceAlert = {
      id: `${campaignId}_alert_${Date.now()}`,
      campaignId,
      targetPrice,
      targetPercent,
      direction,
      hit: false,
      actions
    };

    const campaignAlerts = this.alerts.get(campaignId) || [];
    campaignAlerts.push(alert);
    this.alerts.set(campaignId, campaignAlerts);

    const actionTypes = actions.map(a => a.type).join(', ');
    console.log(`⚠️ Alert added: ${direction} ${targetPercent}% (${targetPrice.toFixed(9)} SOL) with actions: ${actionTypes}`);
    return alert;
  }

  /**
   * Stop a campaign
   */
  async stopCampaign(campaignId: string) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    campaign.isActive = false;

    console.log(`🛑 Stopped campaign ${campaignId}`);
    this.emit('campaign_stopped', { campaignId });
  }

  /**
   * Get campaign stats
   */
  getCampaign(campaignId: string): Campaign | undefined {
    return this.campaigns.get(campaignId);
  }

  /**
   * Get all active campaigns
   */
  getActiveCampaigns(): Campaign[] {
    return Array.from(this.campaigns.values()).filter(c => c.isActive);
  }

  /**
   * Get alerts for a campaign
   */
  getAlerts(campaignId: string): PriceAlert[] {
    return this.alerts.get(campaignId) || [];
  }

  /**
   * Delete an alert
   */
  deleteAlert(alertId: string): boolean {
    // Find which campaign this alert belongs to
    for (const [campaignId, alerts] of this.alerts.entries()) {
      const alertIndex = alerts.findIndex(a => a.id === alertId);
      if (alertIndex !== -1) {
        alerts.splice(alertIndex, 1);
        this.alerts.set(campaignId, alerts);
        console.log(`🗑️ Alert ${alertId} deleted from campaign ${campaignId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Reset campaign stats
   */
  resetCampaign(campaignId: string) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    campaign.startPrice = campaign.currentPrice;
    campaign.high = campaign.currentPrice;
    campaign.low = campaign.currentPrice;
    campaign.changePercent = 0;
    campaign.startTime = Date.now();
    campaign.priceHistory = [{ price: campaign.currentPrice, timestamp: Date.now() }];
    
    // Clear hit alerts
    const alerts = this.alerts.get(campaignId);
    if (alerts) {
      alerts.forEach(a => a.hit = false);
    }

    console.log(`♻️ Reset campaign ${campaignId}`);
    this.emit('campaign_reset', campaign);
  }

  /**
   * Stop all campaigns
   */
  async stopAll() {
    for (const campaign of this.campaigns.values()) {
      await this.stopCampaign(campaign.id);
    }
  }
}

// Singleton instance
let monitor: OnChainPriceMonitor | null = null;

export function getOnChainPriceMonitor(): OnChainPriceMonitor {
  if (!monitor) {
    monitor = new OnChainPriceMonitor();
  }
  return monitor;
}
