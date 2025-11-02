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
    
    // Get initial price from OHLCV candle
    const initialCandle = await this.fetchLatestCandle(poolAddress);
    const initialPrice = initialCandle.solPrice.close; // Use SOL close price as current
    
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
        // Fetch latest OHLCV candle (SOL and USD prices)
        const candle = await this.fetchLatestCandle(campaign.poolAddress);
        const newPrice = candle.solPrice.close; // Use SOL close as current price
        const usdPrice = candle.usdPrice.close; // USD price for reference
        
        // Update campaign stats with candle data
        campaign.currentPrice = newPrice;
        campaign.high = Math.max(campaign.high, candle.solPrice.high); // Track session high
        campaign.low = Math.min(campaign.low, candle.solPrice.low);    // Track session low
        campaign.changePercent = ((newPrice - campaign.startPrice) / campaign.startPrice) * 100;
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
    }, 15000); // 15 seconds

    console.log(`📊 Started price polling for ${campaignId} (15s intervals)`);
  }

  /**
   * Fetch OHLCV data from GeckoTerminal API
   * Returns the latest 5-minute candle with prices in both SOL and USD
   */
  private async fetchLatestCandle(poolAddress: string): Promise<{
    solPrice: { open: number; high: number; low: number; close: number; };
    usdPrice: { open: number; high: number; low: number; close: number; };
    timestamp: number;
  }> {
    try {
      const url = `https://api.geckoterminal.com/api/v2/networks/solana/pools/${poolAddress}/ohlcv/minute`;
      
      // Fetch both SOL and USD prices in parallel
      const [solResponse, usdResponse] = await Promise.all([
        // SOL prices (token currency)
        fetch(`${url}?aggregate=5&limit=1&currency=token&token=base`, {
          headers: { 'Accept': 'application/json' }
        }),
        // USD prices
        fetch(`${url}?aggregate=5&limit=1&currency=usd`, {
          headers: { 'Accept': 'application/json' }
        })
      ]);
      
      if (!solResponse.ok || !usdResponse.ok) {
        throw new Error(`GeckoTerminal API error: ${solResponse.status} / ${usdResponse.status}`);
      }
      
      const solData = await solResponse.json();
      const usdData = await usdResponse.json();
      
      const solOhlcv = solData?.data?.attributes?.ohlcv_list;
      const usdOhlcv = usdData?.data?.attributes?.ohlcv_list;
      
      if (!solOhlcv?.length || !usdOhlcv?.length) {
        throw new Error('No OHLCV data available');
      }
      
      // Parse OHLCV data: [timestamp, open, high, low, close, volume]
      const solCandle = solOhlcv[0];
      const usdCandle = usdOhlcv[0];
      
      return {
        solPrice: {
          open: parseFloat(solCandle[1]),
          high: parseFloat(solCandle[2]),
          low: parseFloat(solCandle[3]),
          close: parseFloat(solCandle[4])
        },
        usdPrice: {
          open: parseFloat(usdCandle[1]),
          high: parseFloat(usdCandle[2]),
          low: parseFloat(usdCandle[3]),
          close: parseFloat(usdCandle[4])
        },
        timestamp: solCandle[0]
      };
    } catch (error) {
      console.error(`Error fetching OHLCV data for pool ${poolAddress}:`, error);
      throw error;
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
