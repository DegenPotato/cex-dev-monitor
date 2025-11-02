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
  startPriceUSD?: number;
  currentPrice: number;
  currentPriceUSD?: number;
  high: number;
  highUSD?: number;
  low: number;
  lowUSD?: number;
  changePercent: number;
  highestGainPercent: number;  // Highest % gain from start
  lowestDropPercent: number;   // Lowest % drop from start
  startTime: number;
  lastUpdate: number;
  subscriptionId: number | null;
  isActive: boolean;
  priceHistory: Array<{ price: number; timestamp: number; }>;
  // Token metadata
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
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
  priceType: 'percentage' | 'exact_sol' | 'exact_usd';
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
  private batchPollingInterval: NodeJS.Timeout | null = null;

  constructor() {
    super();
    // Only start polling in one worker to avoid rate limits in cluster mode
    // PM2 sets instance_var to differentiate workers (0, 1, 2, etc)
    const instanceId = process.env.NODE_APP_INSTANCE || '0';
    if (instanceId === '0') {
      console.log(`🎯 Starting price polling in primary worker (instance ${instanceId})`);
      this.startBatchedPolling();
    } else {
      console.log(`⏸️ Skipping price polling in worker instance ${instanceId} (only primary polls)`);
    }
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
    
    // Fetch metadata and initial price in parallel (both use lite-api)
    const [metadata, initialPrice] = await Promise.all([
      this.fetchTokenMetadata(tokenMint),
      this.fetchInitialPrice(tokenMint)
    ]);
    
    const { priceInSOL, priceInUSD } = initialPrice;
    
    const campaign: Campaign = {
      id: campaignId,
      tokenMint,
      poolAddress,
      startPrice: priceInSOL,
      startPriceUSD: priceInUSD,
      currentPrice: priceInSOL,
      currentPriceUSD: priceInUSD,
      high: priceInSOL,
      highUSD: priceInUSD,
      low: priceInSOL,
      lowUSD: priceInUSD,
      changePercent: 0,
      highestGainPercent: 0,
      lowestDropPercent: 0,
      startTime: Date.now(),
      lastUpdate: Date.now(),
      subscriptionId: null,
      isActive: true,
      priceHistory: [{ price: priceInSOL, timestamp: Date.now() }],
      // Token metadata
      tokenName: metadata.name,
      tokenSymbol: metadata.symbol,
      tokenLogo: metadata.logo
    };

    this.campaigns.set(campaignId, campaign);

    console.log(`🚀 Started campaign ${campaignId} for ${metadata.symbol || tokenMint}`);
    console.log(`   Initial price: ${priceInSOL.toFixed(9)} SOL ($${priceInUSD?.toFixed(6)})`);  
    
    // Campaign will be automatically polled by batched polling system
    this.emit('campaign_started', campaign);
    return campaign;
  }

  /**
   * Start batched polling for ALL active campaigns
   * Polls every 5 seconds, batches up to 10 tokens per request
   */
  private startBatchedPolling() {
    if (this.batchPollingInterval) {
      clearInterval(this.batchPollingInterval);
    }

    this.batchPollingInterval = setInterval(async () => {
      const activeCampaigns = Array.from(this.campaigns.values()).filter(c => c.isActive);
      
      if (activeCampaigns.length === 0) {
        return;
      }

      // Batch campaigns into groups of 50
      const BATCH_SIZE = 50;
      for (let i = 0; i < activeCampaigns.length; i += BATCH_SIZE) {
        const batch = activeCampaigns.slice(i, i + BATCH_SIZE);
        await this.pollBatch(batch);
      }
    }, 1000); // 1 seconds (safe with single worker)

    console.log(`📊 Started batched price polling (2s intervals, max 50 tokens per batch)`);
  }

  /**
   * Poll a batch of campaigns together
   */
  private async pollBatch(campaigns: Campaign[]) {
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const tokenMints = campaigns.map(c => c.tokenMint);
      const allMints = [...tokenMints, SOL_MINT].join(',');
      
      // Batch request to Price API
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${allMints}`;
      const response = await fetch(priceUrl);
      
      if (!response.ok) {
        throw new Error(`Price API error: ${response.status}`);
      }
      
      const priceData = await response.json();
      const solData = priceData[SOL_MINT];
      const solUsdPrice = solData?.usdPrice ? parseFloat(solData.usdPrice) : 0;
      
      // Update each campaign
      for (const campaign of campaigns) {
        const tokenData = priceData[campaign.tokenMint];
        
        if (!tokenData?.usdPrice) {
          console.warn(`⚠️ No price data for ${campaign.tokenMint.slice(0, 8)}, skipping`);
          continue;
        }
        
        const tokenUsdPrice = parseFloat(tokenData.usdPrice);
        const priceInSOL = solUsdPrice > 0 ? tokenUsdPrice / solUsdPrice : 0;
        
        if (priceInSOL === 0) {
          console.warn(`⚠️ Invalid price for ${campaign.tokenMint.slice(0, 8)}, skipping`);
          continue;
        }
        
        // Update campaign stats
        campaign.currentPrice = priceInSOL;
        campaign.currentPriceUSD = tokenUsdPrice;
        campaign.high = Math.max(campaign.high, priceInSOL);
        campaign.highUSD = Math.max(campaign.highUSD || 0, tokenUsdPrice);
        campaign.low = Math.min(campaign.low, priceInSOL);
        campaign.lowUSD = Math.min(campaign.lowUSD || Infinity, tokenUsdPrice);
        campaign.changePercent = ((priceInSOL - campaign.startPrice) / campaign.startPrice) * 100;
        campaign.highestGainPercent = Math.max(campaign.highestGainPercent, campaign.changePercent);
        campaign.lowestDropPercent = Math.min(campaign.lowestDropPercent, campaign.changePercent);
        campaign.lastUpdate = Date.now();
        
        // Add to history
        campaign.priceHistory.push({ price: priceInSOL, timestamp: Date.now() });
        if (campaign.priceHistory.length > 100) {
          campaign.priceHistory.shift();
        }
        
        // Log
        const timestamp = new Date().toISOString();
        const symbol = campaign.tokenSymbol || campaign.tokenMint.slice(0, 8);
        console.log(`📊 [${timestamp}] ${symbol} SOL: ${priceInSOL.toFixed(9)} (${campaign.changePercent >= 0 ? '+' : ''}${campaign.changePercent.toFixed(2)}%) | USD: $${tokenUsdPrice.toFixed(8)} | High: ${campaign.high.toFixed(9)} ($${(campaign.highUSD || 0).toFixed(6)}) | Low: ${campaign.low.toFixed(9)} ($${(campaign.lowUSD || 0).toFixed(6)})`);
        
        // Broadcast update
        this.emit('price_update', campaign);
        
        // Check alerts
        this.checkAlerts(campaign.id, priceInSOL);
      }
    } catch (error) {
      console.error(`Error polling batch:`, error);
    }
  }

  /**
   * Fetch token metadata (name, symbol, logo) from lite-api tokens endpoint
   */
  private async fetchTokenMetadata(tokenMint: string): Promise<{ name?: string; symbol?: string; logo?: string }> {
    try {
      const tokensUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`;
      const response = await fetch(tokensUrl);
      
      if (response.ok) {
        const data = await response.json();
        
        // Response is an array, find the exact match
        if (Array.isArray(data) && data.length > 0) {
          const tokenData = data.find(t => t.id === tokenMint) || data[0];
          
          return {
            name: tokenData.name || undefined,
            symbol: tokenData.symbol || undefined,
            logo: tokenData.icon || undefined  // Field is 'icon', not 'logoURI'
          };
        }
      }
    } catch (error) {
      console.warn(`⚠️ Could not fetch token metadata for ${tokenMint}`);
    }
    
    return {};
  }

  /**
   * Fetch initial price (simple, just Price API v3)
   */
  private async fetchInitialPrice(tokenMint: string): Promise<{ priceInSOL: number; priceInUSD?: number }> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${tokenMint},${SOL_MINT}`;
    const response = await fetch(priceUrl);
    
    if (!response.ok) {
      throw new Error(`Price API error: ${response.status}`);
    }
    
    const priceData = await response.json();
    const tokenData = priceData[tokenMint];
    const solData = priceData[SOL_MINT];
    
    if (!tokenData?.usdPrice || !solData?.usdPrice) {
      throw new Error(`No price data available for ${tokenMint}`);
    }
    
    const tokenUsdPrice = parseFloat(tokenData.usdPrice);
    const solUsdPrice = parseFloat(solData.usdPrice);
    const priceInSOL = tokenUsdPrice / solUsdPrice;
    
    return { priceInSOL, priceInUSD: tokenUsdPrice };
  }


  /**
   * Check and trigger alerts
   */
  private checkAlerts(campaignId: string, currentPrice: number) {
    const alerts = this.alerts.get(campaignId);
    if (!alerts) return;

    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return;

    for (const alert of alerts) {
      if (alert.hit) continue;

      // Determine comparison value based on price type
      let comparisonValue: number;
      if (alert.priceType === 'exact_usd') {
        // Compare USD prices
        comparisonValue = campaign.currentPriceUSD || 0;
      } else {
        // Compare SOL prices (both percentage and exact_sol)
        comparisonValue = currentPrice;
      }

      const triggered = alert.direction === 'above'
        ? comparisonValue >= alert.targetPrice
        : comparisonValue <= alert.targetPrice;

      if (triggered) {
        alert.hit = true;
        alert.hitAt = Date.now();

        const hitTime = new Date(alert.hitAt).toLocaleString('en-US', { 
          month: 'short', 
          day: 'numeric', 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });

        const logMessage = alert.priceType === 'percentage'
          ? `${alert.direction} ${alert.targetPercent}% (target: ${alert.targetPrice.toFixed(9)} SOL, hit at: ${currentPrice.toFixed(9)} SOL)`
          : alert.priceType === 'exact_sol'
          ? `${alert.direction} ${alert.targetPrice.toFixed(9)} SOL (hit at: ${currentPrice.toFixed(9)} SOL)`
          : `${alert.direction} $${alert.targetPrice.toFixed(8)} USD (hit at: $${comparisonValue.toFixed(8)} USD)`;
        
        console.log(`🎯 [${hitTime}] Alert triggered for campaign ${campaignId}: ${logMessage}`);
        
        this.emit('alert_triggered', {
          campaignId,
          alert,
          currentPrice,
          currentPriceUSD: campaign.currentPriceUSD,
          changePercent: campaign.changePercent,
          tokenMint: campaign.tokenMint,
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
    priceType: 'percentage' | 'exact_sol' | 'exact_usd' = 'percentage',
    actions: AlertAction[] = [{ type: 'notification' }]
  ): PriceAlert | null {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign) return null;

    // Calculate target price based on type
    let targetPrice: number;
    if (priceType === 'percentage') {
      // Percentage-based: calculate from start price
      targetPrice = direction === 'above'
        ? campaign.startPrice * (1 + targetPercent / 100)
        : campaign.startPrice * (1 - Math.abs(targetPercent) / 100);
    } else if (priceType === 'exact_sol') {
      // Exact SOL price
      targetPrice = targetPercent; // Re-use targetPercent field for exact price value
    } else {
      // Exact USD price - will be converted to SOL during alert checking
      targetPrice = targetPercent; // Re-use targetPercent field for exact USD value
    }

    const alert: PriceAlert = {
      id: `${campaignId}_alert_${Date.now()}`,
      campaignId,
      targetPrice,
      targetPercent,
      direction,
      priceType,
      hit: false,
      actions
    };

    const campaignAlerts = this.alerts.get(campaignId) || [];
    campaignAlerts.push(alert);
    this.alerts.set(campaignId, campaignAlerts);

    const actionTypes = actions.map(a => a.type).join(', ');
    const priceDisplay = priceType === 'percentage' 
      ? `${direction} ${targetPercent}% (${targetPrice.toFixed(9)} SOL)` 
      : priceType === 'exact_sol'
      ? `${direction} ${targetPercent.toFixed(9)} SOL`
      : `${direction} $${targetPercent.toFixed(8)} USD`;
    console.log(`⚠️ Alert added: ${priceDisplay} with actions: ${actionTypes}`);
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
   * Update alert actions
   */
  updateAlertActions(alertId: string, actions: AlertAction[]): boolean {
    // Find which campaign this alert belongs to
    for (const [campaignId, alerts] of this.alerts.entries()) {
      const alert = alerts.find(a => a.id === alertId);
      if (alert) {
        alert.actions = actions;
        this.alerts.set(campaignId, alerts);
        const actionTypes = actions.map(a => a.type).join(', ');
        console.log(`✏️ Alert ${alertId} actions updated: ${actionTypes}`);
        return true;
      }
    }
    return false;
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
