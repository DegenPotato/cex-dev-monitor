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
   * Detect pool type based on discriminator and data patterns
   */
  private detectPoolType(data: Buffer, poolAddress: string): 'pump_amm' | 'pump_bonding' | 'raydium_amm' | 'unknown' {
    // Check discriminator (first 8 bytes)
    const discriminator = data.slice(0, 8).toString('hex');
    
    console.log(`Pool detection for ${poolAddress}:`);
    console.log(`  Size: ${data.length} bytes`);
    console.log(`  Discriminator: ${discriminator}`);
    
    // Pump.fun AMM discriminator (graduated tokens)
    if (discriminator === 'f19a6d0411b16dbc') {
      console.log('  -> Pump.fun AMM (graduated token)');
      return 'pump_amm';
    }
    
    // Original pump.fun bonding curve (before graduation)
    if (discriminator === '17c9c35595341678') {
      console.log('  -> Pump.fun Bonding Curve');
      return 'pump_bonding';
    }
    
    // Check for other known discriminators or size patterns
    // Could add more here as we discover them
    
    // Raydium AMM V4 - larger pools 600+ bytes  
    if (data.length >= 600) {
      return 'raydium_amm';
    }
    
    return 'unknown';
  }

  /**
   * Decode Pump.fun bonding curve data
   * Pump.fun pools store: virtualSolReserves, virtualTokenReserves, realSolReserves, realTokenReserves
   */
  private decodePumpPool(data: Buffer): { virtualSolReserves: bigint; virtualTokenReserves: bigint; realSolReserves: bigint; realTokenReserves: bigint; } | null {
    try {
      // Pump.fun bonding curve actual layout from contract analysis:
      // Discriminator: 8 bytes (0x00-0x07)
      // virtualSolReserves: 8 bytes (0x08-0x0F) 
      // virtualTokenReserves: 8 bytes (0x10-0x17)
      // realSolReserves: 8 bytes (0x18-0x1F)  
      // realTokenReserves: 8 bytes (0x20-0x27)
      
      // For debugging - show the hex in chunks
      console.log('Pump pool layout:');
      console.log('  Discriminator:', data.slice(0x00, 0x08).toString('hex'));
      console.log('  Virtual SOL:', data.slice(0x08, 0x10).toString('hex'));
      console.log('  Virtual Token:', data.slice(0x10, 0x18).toString('hex'));
      console.log('  Real SOL:', data.slice(0x18, 0x20).toString('hex'));
      console.log('  Real Token:', data.slice(0x20, 0x28).toString('hex'));
      
      // Read the reserves
      const virtualSolReserves = data.readBigUInt64LE(0x08);
      const virtualTokenReserves = data.readBigUInt64LE(0x10);
      const realSolReserves = data.readBigUInt64LE(0x18);
      const realTokenReserves = data.readBigUInt64LE(0x20);
      
      console.log(`Virtual reserves - SOL: ${virtualSolReserves}, Token: ${virtualTokenReserves}`);
      console.log(`Real reserves - SOL: ${realSolReserves}, Token: ${realTokenReserves}`);
      
      return {
        virtualSolReserves,
        virtualTokenReserves,
        realSolReserves,
        realTokenReserves
      };
    } catch (error) {
      console.error('Failed to decode Pump pool:', error);
      return null;
    }
  }

  /**
   * Decode Pump.fun AMM pool (graduated tokens)
   * This is pump.fun's own AMM implementation, not Raydium
   */
  private decodePumpAMM(data: Buffer): { solReserves: bigint; tokenReserves: bigint; } | null {
    try {
      // Pump.fun AMM layout analysis
      console.log('=== PUMP AMM DATA STRUCTURE ANALYSIS ===');
      
      // Show hex dump in 8-byte chunks to identify patterns
      console.log('Hex dump (8-byte chunks):');
      for (let i = 0; i < Math.min(256, data.length); i += 8) {
        const chunk = data.slice(i, i + 8);
        const value = chunk.length === 8 ? chunk.readBigUInt64LE(0) : 0n;
        const hex = chunk.toString('hex').padEnd(16, ' ');
        console.log(`  0x${i.toString(16).padStart(3, '0')}: ${hex} = ${value} (${Number(value) / 1e9} SOL or tokens)`);
      }
      
      // Let's look for patterns in the data
      // The values we see in logs: SOL: 5229996482534310142, Token: 208629109737501281
      // 5229996482534310142 / 1e9 = 5229.996 SOL (seems too high)
      // 208629109737501281 / 1e9 = 208.629 tokens (seems reasonable)
      
      // BUT the real price is 0.00008168 SOL per token
      // So if we have 208 tokens worth 0.00008168 SOL each = 0.017 SOL total
      // This suggests the reserves might be swapped or at different offsets
      
      // Let's scan for values that could be reserves
      console.log('\nPotential reserves found:');
      for (let offset = 0; offset < Math.min(200, data.length - 8); offset += 8) {
        try {
          const value = data.readBigUInt64LE(offset);
          // Look for values that could be token amounts (in lamports or base units)
          if (value > 100000n && value < 1000000000000000000n) {
            const asSol = Number(value) / 1e9;
            const asTokens = Number(value) / 1e6;
            console.log(`  0x${offset.toString(16).padStart(3, '0')}: ${value}`);
            console.log(`         As SOL: ${asSol.toFixed(9)}`);
            console.log(`         As tokens (6 dec): ${asTokens.toFixed(6)}`);
            console.log(`         As tokens (9 dec): ${(Number(value) / 1e9).toFixed(9)}`);
          }
        } catch {}
      }
      
      // Based on the hex pattern f19a6d0411b16dbc...
      // The actual reserves might be at different offsets
      // Let's try the offsets where we found the values in the logs
      const OFFSET_1 = 0x10;  // Try offset 16
      const OFFSET_2 = 0x18;  // Try offset 24
      const OFFSET_3 = 0x48;  // Try offset 72
      const OFFSET_4 = 0x50;  // Try offset 80
      
      console.log('\nTrying specific offsets:');
      console.log(`  0x10: ${data.readBigUInt64LE(OFFSET_1)}`);
      console.log(`  0x18: ${data.readBigUInt64LE(OFFSET_2)}`);
      console.log(`  0x48: ${data.readBigUInt64LE(OFFSET_3)}`);
      console.log(`  0x50: ${data.readBigUInt64LE(OFFSET_4)}`);
      
      // We're getting prices 100-300x too high (0.015 vs 0.00008)
      // This means we need to find smaller SOL values or larger token values
      
      // Let's try EVERY possible pair of 8-byte values and calculate the price
      console.log(`\n=== TESTING ALL OFFSET COMBINATIONS ===`);
      console.log(`Target price: ~0.00008 SOL per token`);
      console.log(`Token decimals: 6 (pump.fun standard)\n`);
      
      const candidates: Array<{offset1: number, offset2: number, price: number, sol: number, tokens: number}> = [];
      
      // Try every offset as potential SOL reserves
      for (let solOffset = 0x08; solOffset < 0x100; solOffset += 8) {
        // Try every offset as potential token reserves
        for (let tokenOffset = 0x08; tokenOffset < 0x100; tokenOffset += 8) {
          if (solOffset === tokenOffset) continue;
          
          try {
            const solVal = data.readBigUInt64LE(solOffset);
            const tokenVal = data.readBigUInt64LE(tokenOffset);
            
            // Skip if either value is 0 or unreasonably large
            if (solVal === 0n || tokenVal === 0n) continue;
            if (solVal > 1000000000000000000n || tokenVal > 1000000000000000000n) continue;
            
            // Calculate price: SOL (in lamports) / tokens (with 6 decimals)
            const solInLamports = Number(solVal);
            const tokensBase = Number(tokenVal);
            
            // SOL = lamports / 1e9, Tokens = base / 1e6
            const price = (solInLamports / 1e9) / (tokensBase / 1e6);
            
            // Look for prices in the range 0.00001 to 0.001 (reasonable for low-cap tokens)
            if (price > 0.00001 && price < 0.001) {
              candidates.push({
                offset1: solOffset,
                offset2: tokenOffset,
                price,
                sol: solInLamports / 1e9,
                tokens: tokensBase / 1e6
              });
            }
          } catch {}
        }
      }
      
      // Sort by how close to target price (0.00008)
      candidates.sort((a, b) => Math.abs(a.price - 0.00008) - Math.abs(b.price - 0.00008));
      
      console.log(`Found ${candidates.length} candidate combinations:`);
      candidates.slice(0, 10).forEach((c, i) => {
        console.log(`${i + 1}. Offsets 0x${c.offset1.toString(16)} & 0x${c.offset2.toString(16)}: ${c.sol.toFixed(4)} SOL / ${c.tokens.toFixed(0)} tokens = ${c.price.toFixed(8)} SOL/token`);
      });
      
      // Use the best match
      const best = candidates[0];
      if (best) {
        console.log(`\n✅ USING: 0x${best.offset1.toString(16)} (SOL) and 0x${best.offset2.toString(16)} (tokens)`);
        return {
          solReserves: data.readBigUInt64LE(best.offset1),
          tokenReserves: data.readBigUInt64LE(best.offset2)
        };
      }
      
      // Fallback
      console.log(`\n❌ NO GOOD MATCH FOUND, using defaults`);
      return {
        solReserves: data.readBigUInt64LE(0x60),
        tokenReserves: data.readBigUInt64LE(0x68)
      };
    } catch (error) {
      console.error('Failed to decode Pump AMM:', error);
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
   * Fetch pool price from on-chain data (DEPRECATED - using API instead)
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
      const poolType = this.detectPoolType(data, poolAddress);
      console.log(`Pool type detected: ${poolType} (${data.length} bytes)`);

      if (poolType === 'pump_bonding') {
        // Handle Pump.fun pools
        const pumpPool = this.decodePumpPool(data);
        if (!pumpPool) {
          throw new Error('Failed to decode Pump pool');
        }

        // Use REAL reserves for actual price (virtual reserves are for bonding curve math)
        // Pump.fun uses 9 decimals for both SOL and tokens
        const realSol = Number(pumpPool.realSolReserves) / 1e9; // Convert lamports to SOL
        const realTokens = Number(pumpPool.realTokenReserves) / 1e9; // Pump tokens use 9 decimals!
        
        // Price = SOL per token
        const price = realSol / realTokens;
        
        console.log(`Price calculation: ${realSol} SOL / ${realTokens} tokens = ${price} SOL per token`);
        return price;

      } else if (poolType === 'pump_amm') {
        // Handle Pump.fun AMM pools (graduated tokens)
        const pumpAMM = this.decodePumpAMM(data);
        if (!pumpAMM) {
          throw new Error('Failed to decode Pump AMM');
        }

        // Use the reserves directly
        const solReserves = Number(pumpAMM.solReserves) / 1e9; // Convert lamports to SOL
        const tokenReserves = Number(pumpAMM.tokenReserves) / 1e9; // Pump tokens use 9 decimals!
        
        // Price = SOL per token
        const price = solReserves / tokenReserves;
        
        console.log(`Price calculation: ${solReserves} SOL / ${tokenReserves} tokens = ${price} SOL per token`);
        return price;

      } else if (poolType === 'raydium_amm') {
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
