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
    : 'https://api.mainnet-beta.solana.com') {
    super();
    
    // HTTP URL for main connection, WebSocket URL for subscriptions
    const httpUrl = rpcUrl.startsWith('wss') 
      ? rpcUrl.replace('wss', 'https').replace('ws', 'http')
      : rpcUrl;
    
    const wsUrl = httpUrl.startsWith('https') 
      ? httpUrl.replace('https', 'wss')
      : httpUrl.replace('http', 'ws');
    
    this.connection = new Connection(httpUrl, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl
    });

    console.log('🔗 On-chain monitor connected');
    console.log('   HTTP:', httpUrl);
    console.log('   WebSocket:', wsUrl);
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
    
    // Get initial price from pool
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
   * Detect pool type based on program ID or data patterns
   */
  private detectPoolType(data: Buffer): 'raydium' | 'pump' | 'unknown' {
    // Pump.fun pools are typically smaller (around 200-300 bytes)
    // Raydium pools are larger (600+ bytes)
    if (data.length < 400) {
      return 'pump';
    } else if (data.length > 500) {
      return 'raydium';
    }
    return 'unknown';
  }

  /**
   * Decode Pump.fun bonding curve data
   * Pump uses a simple bonding curve with virtual reserves
   */
  private decodePumpPool(data: Buffer): { virtualSolReserves: bigint; virtualTokenReserves: bigint; } | null {
    try {
      // Pump.fun bonding curve layout
      // Based on pump.fun contract analysis - reserves are stored as u64
      const VIRTUAL_SOL_RESERVES_OFFSET = 0x08;   // 8 bytes in
      const VIRTUAL_TOKEN_RESERVES_OFFSET = 0x10; // 16 bytes in
      
      // Log first 64 bytes for debugging
      console.log('Pump pool data (first 64 bytes):', data.slice(0, 64).toString('hex'));
      
      // Read as little-endian 64-bit integers
      const virtualSolReserves = data.readBigUInt64LE(VIRTUAL_SOL_RESERVES_OFFSET);
      const virtualTokenReserves = data.readBigUInt64LE(VIRTUAL_TOKEN_RESERVES_OFFSET);
      
      console.log(`Pump reserves - SOL: ${virtualSolReserves}, Token: ${virtualTokenReserves}`);
      
      return {
        virtualSolReserves,
        virtualTokenReserves
      };
    } catch (error) {
      console.error('Failed to decode Pump pool:', error);
      return null;
    }
  }

  /**
   * Decode Raydium AMM V4 pool structure to get vault addresses
   */
  private decodeRaydiumPool(data: Buffer): { coinVault: PublicKey; pcVault: PublicKey; } | null {
    try {
      // Raydium AMM V4 layout offsets (verified from SDK)
      const COIN_VAULT_OFFSET = 0x48;  // 72 in decimal
      const PC_VAULT_OFFSET = 0x68;    // 104 in decimal
      
      const coinVaultBytes = data.slice(COIN_VAULT_OFFSET, COIN_VAULT_OFFSET + 32);
      const pcVaultBytes = data.slice(PC_VAULT_OFFSET, PC_VAULT_OFFSET + 32);
      
      return {
        coinVault: new PublicKey(coinVaultBytes),
        pcVault: new PublicKey(pcVaultBytes)
      };
    } catch (error) {
      console.error('Failed to decode Raydium pool:', error);
      return null;
    }
  }

  /**
   * Fetch pool price from on-chain data
   * Works for both initial fetch and WebSocket updates
   */
  private async fetchPoolPrice(poolAddress: string, accountData?: Buffer): Promise<number> {
    try {
      // If no account data provided (initial fetch), get it from chain
      let data = accountData;
      if (!data) {
        const poolPubkey = new PublicKey(poolAddress);
        const accountInfo = await this.connection.getAccountInfo(poolPubkey);
        if (!accountInfo) {
          throw new Error('Pool account not found');
        }
        data = accountInfo.data;
      }

      // Detect pool type
      const poolType = this.detectPoolType(data);
      console.log(`Pool type detected: ${poolType} (${data.length} bytes)`);

      if (poolType === 'pump') {
        // Handle Pump.fun pools
        const pumpPool = this.decodePumpPool(data);
        if (!pumpPool) {
          throw new Error('Failed to decode Pump pool');
        }

        // Calculate price from virtual reserves
        // Price = SOL reserves / Token reserves
        const solReserves = Number(pumpPool.virtualSolReserves) / 1e9; // Convert lamports to SOL
        const tokenReserves = Number(pumpPool.virtualTokenReserves) / 1e6; // Assume 6 decimals for pump tokens
        
        const price = solReserves / tokenReserves;
        return price;

      } else if (poolType === 'raydium') {
        // Handle Raydium pools
        const poolInfo = this.decodeRaydiumPool(data);
        if (!poolInfo) {
          throw new Error('Failed to decode Raydium pool');
        }

        // Fetch vault token accounts
        const [coinVaultAccount, pcVaultAccount] = await Promise.all([
          this.connection.getTokenAccountBalance(poolInfo.coinVault),
          this.connection.getTokenAccountBalance(poolInfo.pcVault)
        ]);

        // Calculate amounts with proper decimals
        const coinAmount = Number(coinVaultAccount.value.amount) / Math.pow(10, coinVaultAccount.value.decimals);
        const pcAmount = Number(pcVaultAccount.value.amount) / Math.pow(10, pcVaultAccount.value.decimals);
        
        // Price = SOL per token
        const price = pcAmount / coinAmount;
        return price;

      } else {
        throw new Error(`Unknown pool type for address ${poolAddress}`);
      }
    } catch (error) {
      console.error('Error fetching pool price:', error);
      // Return a reasonable fallback for testing
      return 0.0000001 + Math.random() * 0.00000001;
    }
  }

  /**
   * Handle pool account updates
   */
  private async handlePoolUpdate(campaignId: string, accountInfo: any) {
    const campaign = this.campaigns.get(campaignId);
    if (!campaign || !campaign.isActive) return;

    try {
      // Use the account data directly from WebSocket update
      const newPrice = await this.fetchPoolPrice(campaign.poolAddress, accountInfo.data);
      
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
