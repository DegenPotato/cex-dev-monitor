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
  high: number;
  low: number;
  changePercent: number;
  startTime: number;
  lastUpdate: number;
  subscriptionId: number | null;
  isActive: boolean;
  priceHistory: Array<{ price: number; timestamp: number; }>;
}

export interface PriceAlert {
  id: string;
  campaignId: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  hit: boolean;
  hitAt?: number;
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
    
    // Get initial price from API
    const initialPrice = await this.fetchPriceFromAPI(tokenMint);
    
    const campaign: Campaign = {
      id: campaignId,
      tokenMint,
      poolAddress,
      startPrice: initialPrice,
      currentPrice: initialPrice,
      high: initialPrice,
      low: initialPrice,
      changePercent: 0,
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
        // Fetch latest price from API
        const newPrice = await this.fetchPriceFromAPI(campaign.tokenMint);
        
        // Update campaign stats
        campaign.currentPrice = newPrice;
        campaign.high = Math.max(campaign.high, newPrice);
        campaign.low = Math.min(campaign.low, newPrice);
        campaign.changePercent = ((newPrice - campaign.startPrice) / campaign.startPrice) * 100;
        campaign.lastUpdate = Date.now();
        
        // Add to history
        campaign.priceHistory.push({ price: newPrice, timestamp: Date.now() });
        
        // Keep last 100 data points
        if (campaign.priceHistory.length > 100) {
          campaign.priceHistory.shift();
        }
        
        // Broadcast update
        this.emit('price_update', campaign);
        
        // Check alerts
        this.checkAlerts(campaignId, newPrice);
      } catch (error) {
        console.error(`Error polling price for ${campaignId}:`, error);
      }
    }, 15000); // 15 seconds

    console.log(`📊 Started price polling for ${campaignId} (15s intervals)`);
  }

  /**
   * Fetch price from GeckoTerminal API
   * Much more reliable than decoding on-chain data
   */
  private async fetchPriceFromAPI(tokenMint: string): Promise<number> {
    try {
      const response = await fetch(
        `https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/${tokenMint}`
      );
      
      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }
      
      const data = await response.json();
      const priceUSD = parseFloat(data.data.attributes.token_prices[tokenMint.toLowerCase()]);
      
      if (!priceUSD) {
        throw new Error('No price data from GeckoTerminal');
      }
      
      // Get SOL price to convert USD to SOL
      const solPriceUSD = await this.getSolPrice();
      const priceInSOL = priceUSD / solPriceUSD;
      
      return priceInSOL;
    } catch (error) {
      console.error(`Error fetching price from API for ${tokenMint}:`, error);
      throw error;
    }
  }

  /**
   * Get current SOL price in USD
   */
  private async getSolPrice(): Promise<number> {
    try {
      const response = await fetch(
        'https://api.geckoterminal.com/api/v2/simple/networks/solana/token_price/So11111111111111111111111111111111111111112'
      );
      const data = await response.json();
      return parseFloat(data.data.attributes.token_prices['so11111111111111111111111111111111111111112']);
    } catch (error) {
      console.error('Error fetching SOL price:', error);
      return 186; // Fallback
    }
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

        console.log(`🎯 Alert triggered for campaign ${campaignId}: ${alert.direction} ${alert.targetPrice.toFixed(9)}`);
        
        this.emit('alert_triggered', {
          campaignId,
          alert,
          currentPrice,
          timestamp: Date.now()
        });
      }
    }
  }

  /**
   * Add an alert to a campaign
   */
  addAlert(campaignId: string, targetPercent: number, direction: 'above' | 'below'): PriceAlert | null {
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
      hit: false
    };

    const campaignAlerts = this.alerts.get(campaignId) || [];
    campaignAlerts.push(alert);
    this.alerts.set(campaignId, campaignAlerts);

    console.log(`⚠️ Alert added: ${direction} ${targetPercent}% (${targetPrice.toFixed(9)} SOL)`);
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
