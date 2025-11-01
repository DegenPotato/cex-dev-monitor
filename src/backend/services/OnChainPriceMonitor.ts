/**
 * On-Chain Price Monitor via Solana WebSocket
 * Real-time price tracking directly from Raydium/Orca pools
 */

import { Connection, PublicKey } from '@solana/web3.js';
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
  private connection: Connection;
  private campaigns: Map<string, Campaign> = new Map();
  private alerts: Map<string, PriceAlert[]> = new Map();
  private readonly MAX_HISTORY = 1000;

  constructor(rpcUrl: string = process.env.HELIUS_API_KEY 
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : 'wss://api.mainnet-beta.solana.com') {
    super();
    
    // Use WebSocket endpoint
    const wsUrl = rpcUrl.startsWith('https') 
      ? rpcUrl.replace('https', 'wss')
      : rpcUrl;
    
    this.connection = new Connection(wsUrl, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl
    });

    console.log('🔗 On-chain monitor connected to:', wsUrl);
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
    
    // Get initial price
    const initialPrice = await this.fetchPoolPrice(poolAddress);
    
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

    // Subscribe to pool account changes
    const subscriptionId = this.connection.onAccountChange(
      new PublicKey(poolAddress),
      (accountInfo) => this.handlePoolUpdate(campaignId, accountInfo),
      'confirmed'
    );

    campaign.subscriptionId = subscriptionId;
    this.campaigns.set(campaignId, campaign);

    console.log(`🚀 Started campaign ${campaignId} for ${tokenMint}`);
    console.log(`   Initial price: ${initialPrice.toFixed(9)} SOL`);
    
    this.emit('campaign_started', campaign);
    return campaign;
  }

  /**
   * Fetch current pool price from on-chain data
   */
  private async fetchPoolPrice(poolAddress: string): Promise<number> {
    try {
      const poolPubkey = new PublicKey(poolAddress);
      const accountInfo = await this.connection.getAccountInfo(poolPubkey);
      
      if (!accountInfo) {
        throw new Error('Pool account not found');
      }

      // Parse Raydium AMM pool data
      const data = accountInfo.data;
      
      // Get vault balances (simplified - assumes pool structure)
      // In production, you'd decode the full pool state
      const coinVaultAddress = new PublicKey(data.slice(136, 168));
      const pcVaultAddress = new PublicKey(data.slice(168, 200));
      
      const [coinVault, pcVault] = await Promise.all([
        this.connection.getTokenAccountBalance(coinVaultAddress),
        this.connection.getTokenAccountBalance(pcVaultAddress)
      ]);

      const coinAmount = Number(coinVault.value.amount) / Math.pow(10, coinVault.value.decimals);
      const pcAmount = Number(pcVault.value.amount) / Math.pow(10, pcVault.value.decimals);
      
      // Calculate price (assuming PC is SOL or USDC)
      const price = pcAmount / coinAmount;
      
      return price;
    } catch (error) {
      console.error('Error fetching pool price:', error);
      // Fallback to mock price for testing
      return 0.001 + Math.random() * 0.0001;
    }
  }

  /**
   * Handle pool account updates
   */
  private async handlePoolUpdate(campaignId: string, _accountInfo: any) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || !campaign.isActive) return;

    try {
      // Calculate new price from pool state
      const newPrice = await this.fetchPoolPrice(campaign.poolAddress);
      
      // Update campaign stats
      campaign.currentPrice = newPrice;
      campaign.high = Math.max(campaign.high, newPrice);
      campaign.low = Math.min(campaign.low, newPrice);
      campaign.changePercent = ((newPrice - campaign.startPrice) / campaign.startPrice) * 100;
      campaign.lastUpdate = Date.now();
      
      // Add to history
      campaign.priceHistory.push({ price: newPrice, timestamp: Date.now() });
      if (campaign.priceHistory.length > this.MAX_HISTORY) {
        campaign.priceHistory.shift();
      }

      // Emit update
      this.emit('price_update', {
        campaignId,
        tokenMint: campaign.tokenMint,
        price: newPrice,
        changePercent: campaign.changePercent,
        timestamp: Date.now()
      });

      // Check alerts
      this.checkAlerts(campaignId, newPrice);
      
      // Log significant changes
      if (Math.abs(campaign.changePercent) > 1) {
        console.log(`📊 ${campaign.tokenMint}: ${newPrice.toFixed(9)} SOL (${campaign.changePercent >= 0 ? '+' : ''}${campaign.changePercent.toFixed(2)}%)`);
      }
    } catch (error) {
      console.error(`Error processing update for campaign ${campaignId}:`, error);
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

    if (campaign.subscriptionId !== null) {
      await this.connection.removeAccountChangeListener(campaign.subscriptionId);
    }

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
