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
    
    // Fetch token metadata first
    const metadata = await this.fetchTokenMetadata(tokenMint);
    
    // Get initial price from Jupiter (real-time)
    const { priceInSOL, priceInUSD } = await this.fetchJupiterPrice(tokenMint);
    
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
        const { priceInSOL, priceInUSD } = await this.fetchJupiterPrice(campaign.tokenMint);
        
        // Update campaign stats
        campaign.currentPrice = priceInSOL;
        campaign.currentPriceUSD = priceInUSD;
        campaign.high = Math.max(campaign.high, priceInSOL); // Track session high locally
        campaign.highUSD = Math.max(campaign.highUSD || 0, priceInUSD || 0);
        campaign.low = Math.min(campaign.low, priceInSOL);   // Track session low locally
        campaign.lowUSD = Math.min(campaign.lowUSD || Infinity, priceInUSD || Infinity);
        campaign.changePercent = ((priceInSOL - campaign.startPrice) / campaign.startPrice) * 100;
        
        // Track highest gain and lowest drop from start price
        campaign.highestGainPercent = Math.max(campaign.highestGainPercent, campaign.changePercent);
        campaign.lowestDropPercent = Math.min(campaign.lowestDropPercent, campaign.changePercent);
        
        campaign.lastUpdate = Date.now();
        
        // Add to history
        campaign.priceHistory.push({ price: priceInSOL, timestamp: Date.now() });
        
        // Keep last 100 data points
        if (campaign.priceHistory.length > 100) {
          campaign.priceHistory.shift();
        }
        
        // ALWAYS log price updates with timestamp
        const timestamp = new Date().toISOString();
        const symbol = campaign.tokenSymbol || campaign.tokenMint.slice(0, 8);
        console.log(`📊 [${timestamp}] ${symbol} SOL: ${priceInSOL.toFixed(9)} (${campaign.changePercent >= 0 ? '+' : ''}${campaign.changePercent.toFixed(2)}%) | USD: $${(priceInUSD || 0).toFixed(8)} | High: ${campaign.high.toFixed(9)} ($${(campaign.highUSD || 0).toFixed(6)}) | Low: ${campaign.low.toFixed(9)} ($${(campaign.lowUSD || 0).toFixed(6)})`);
        
        // Broadcast update
        console.log(`🔔 [${timestamp}] Emitting price_update for campaign ${campaignId}`);
        this.emit('price_update', campaign);
        
        // Check alerts
        this.checkAlerts(campaignId, priceInSOL);
      } catch (error) {
        console.error(`Error polling price for ${campaignId}:`, error);
      }
    }, 1000); // 1 seconds (safe for Jupiter API)

    console.log(`📊 Started price polling for ${campaignId} (1s intervals)`);
  }

  /**
   * Fetch token metadata (name, symbol, logo)
   */
  private async fetchTokenMetadata(tokenMint: string): Promise<{ name?: string; symbol?: string; logo?: string }> {
    try {
      const tokenApiUrl = `https://api.jup.ag/tokens/v2/search?mint=${tokenMint}`;
      const response = await fetch(tokenApiUrl);
      
      if (response.ok) {
        const data = await response.json();
        return {
          name: data.name || undefined,
          symbol: data.symbol || undefined,
          logo: data.logoURI || undefined
        };
      }
    } catch (error) {
      console.warn(`⚠️ Could not fetch token metadata for ${tokenMint}`);
    }
    
    return {};
  }

  /**
   * Fetch current price from Jupiter
   * Try Price API v3 first (fast, clean), fallback to Quote API (always works)
   * Returns both SOL and USD prices
   */
  private async fetchJupiterPrice(tokenMint: string): Promise<{ priceInSOL: number; priceInUSD?: number }> {
    const SOL_MINT = 'So11111111111111111111111111111111111111112';
    
    try {
      // Try Price API v3 first (only works for listed tokens)
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${tokenMint},${SOL_MINT}`;
      const priceResponse = await fetch(priceUrl);
      
      if (priceResponse.ok) {
        const priceData = await priceResponse.json();
        const tokenData = priceData[tokenMint];
        const solData = priceData[SOL_MINT];
        
        if (tokenData?.usdPrice && solData?.usdPrice) {
          const tokenUsdPrice = parseFloat(tokenData.usdPrice);
          const solUsdPrice = parseFloat(solData.usdPrice);
          const priceInSOL = tokenUsdPrice / solUsdPrice;
          console.log(`💰 Jupiter Price API: ${tokenMint.slice(0, 8)}... = ${priceInSOL.toFixed(12)} SOL ($${tokenUsdPrice.toFixed(8)})`);
          return { priceInSOL, priceInUSD: tokenUsdPrice };
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
      console.warn(`⚠️ Error fetching decimals for ${tokenMint}, using default 6`);
    }
    
    const outAmount = parseInt(quoteData.outAmount);
    const tokensReceived = outAmount / Math.pow(10, decimals);
    const priceInSOL = 1 / tokensReceived;
    
    // Get SOL USD price to calculate token USD price
    let priceInUSD: number | undefined;
    try {
      const solPriceUrl = `https://lite-api.jup.ag/price/v3?ids=${SOL_MINT}`;
      const solPriceResponse = await fetch(solPriceUrl);
      if (solPriceResponse.ok) {
        const solPriceData = await solPriceResponse.json();
        const solUsdPrice = parseFloat(solPriceData[SOL_MINT]?.usdPrice || '0');
        if (solUsdPrice > 0) {
          priceInUSD = priceInSOL * solUsdPrice;
          console.log(`✅ Calculated USD price: $${priceInUSD.toFixed(8)} (SOL at $${solUsdPrice.toFixed(2)})`);
        } else {
          console.warn(`⚠️ SOL USD price is 0 or invalid`);
        }
      } else {
        console.warn(`⚠️ Failed to fetch SOL price: ${solPriceResponse.status}`);
      }
    } catch (error) {
      console.error(`⚠️ Error calculating USD price:`, error);
    }
    
    console.log(`💰 Jupiter Quote API: ${tokenMint.slice(0, 8)}... = ${priceInSOL.toFixed(12)} SOL${priceInUSD ? ` ($${priceInUSD.toFixed(8)})` : ''} (${decimals} decimals)`);
    
    return { priceInSOL, priceInUSD };
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
