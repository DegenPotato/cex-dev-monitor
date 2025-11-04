/**
 * PumpfunSniper - Real-time WebSocket monitor for new Pumpfun token launches
 * Uses Solana WebSocket to detect new bonding curves created on Pumpfun
 * Integrates with RPC Server Rotator for distributed connections
 */

import { Connection, PublicKey, Logs, Context } from '@solana/web3.js';
import { EventEmitter } from 'events';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { globalRPCServerRotator } from './RPCServerRotator.js';
import { trackTestLabBuy } from '../routes/priceTest.js';
import { getTradingEngine } from '../core/trade.js';
import { broadcastTestLabUpdate } from '../routes/priceTest.js';

// Pumpfun Program ID
const PUMPFUN_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Bond curve states
interface BondingCurve {
  tokenMint: PublicKey;
  virtualSolReserves: bigint;
  virtualTokenReserves: bigint;
  realSolReserves: bigint;
  realTokenReserves: bigint;
  tokenTotalSupply: bigint;
  complete: boolean;
  bondingCurveAddress: PublicKey;
  createdAt: number;
}

interface SniperConfig {
  userId: number;
  walletId: number;
  walletAddress: string;
  enabled: boolean;
  snipeMode: 'single' | 'all'; // Snipe one token then stop, or snipe all
  buyAmountSol: number;
  stopLoss: number; // Percentage, e.g., -10 for 10% loss
  takeProfits: number[]; // Array of take profit percentages
  takeProfitAmounts?: number[]; // Percentage of position to sell at each TP
  slippageBps: number;
  priorityLevel: 'low' | 'medium' | 'high' | 'ultra';
  skipTax?: boolean;
  maxSnipes?: number; // Maximum number of tokens to snipe (for 'all' mode)
  excludeGraduated?: boolean; // Skip tokens that graduated to Raydium
  minLiquidity?: number; // Minimum SOL liquidity to snipe
  maxLiquidity?: number; // Maximum SOL liquidity to snipe
}

export class PumpfunSniper extends EventEmitter {
  private connection: Connection | null = null;
  private proxiedConnection: ProxiedSolanaConnection | null = null;
  private subscriptionId: number | null = null;
  private config: SniperConfig | null = null;
  private snipedTokens: Set<string> = new Set();
  private isRunning: boolean = false;
  private tradingEngine: any = null;
  private monitoringStartTime: number = 0;

  constructor() {
    super();
    console.log('🎯 [PumpfunSniper] Initialized');
  }

  /**
   * Start sniping with configuration
   */
  async startSniping(config: SniperConfig): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️ [PumpfunSniper] Already running');
      return;
    }

    this.config = config;
    this.snipedTokens.clear();
    this.monitoringStartTime = Date.now();
    
    // Get trading engine instance
    this.tradingEngine = getTradingEngine();
    
    console.log('🚀 [PumpfunSniper] Starting sniper with config:', {
      mode: config.snipeMode,
      buyAmount: config.buyAmountSol,
      stopLoss: config.stopLoss,
      takeProfits: config.takeProfits,
      wallet: config.walletAddress.substring(0, 8) + '...'
    });

    // Initialize connections using RPC rotator
    await this.initializeConnections();
    
    // Start monitoring
    await this.startMonitoring();
    
    this.isRunning = true;

    // Broadcast status
    broadcastTestLabUpdate({
      type: 'pumpfun_sniper_started',
      data: {
        userId: config.userId,
        mode: config.snipeMode,
        wallet: config.walletAddress
      }
    });
  }

  /**
   * Initialize RPC connections with rotation
   */
  private async initializeConnections(): Promise<void> {
    // Enable RPC rotation
    if (!globalRPCServerRotator.isEnabled()) {
      globalRPCServerRotator.enable();
    }

    // Create proxied connection for HTTP requests
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com', // Will be overridden by rotator
      { commitment: 'confirmed' },
      undefined,
      'PumpfunSniper'
    );

    // Get next server for WebSocket
    const httpServer = await globalRPCServerRotator.getNextServer();
    const wsUrl = httpServer.replace('https://', 'wss://').replace('http://', 'ws://');
    
    console.log(`📡 [PumpfunSniper] Connecting to WebSocket: ${wsUrl.split('.')[0]}...`);
    
    // Create WebSocket connection (HTTP endpoint + WS endpoint)
    this.connection = new Connection(httpServer, {
      commitment: 'confirmed',
      wsEndpoint: wsUrl
    });
  }

  /**
   * Start monitoring Pumpfun program logs
   */
  private async startMonitoring(): Promise<void> {
    if (!this.connection) {
      throw new Error('Connection not initialized');
    }

    console.log('👁️ [PumpfunSniper] Starting Pumpfun program monitoring...');
    
    // Subscribe to Pumpfun program logs
    this.subscriptionId = this.connection.onLogs(
      PUMPFUN_PROGRAM,
      async (logs: Logs, context: Context) => {
        await this.handleProgramLogs(logs, context);
      },
      'confirmed'
    );

    console.log(`✅ [PumpfunSniper] WebSocket subscription active (ID: ${this.subscriptionId})`);
  }

  /**
   * Handle program logs and detect new token launches
   */
  private async handleProgramLogs(logs: Logs, context: Context): Promise<void> {
    try {
      // Look for bonding curve creation logs
      const creationLog = logs.logs.find(log => 
        log.includes('Program log: Bonding curve created') ||
        log.includes('create') ||
        log.includes('initialize')
      );

      if (!creationLog) {
        return; // Not a creation event
      }

      console.log(`🔍 [PumpfunSniper] Potential new token detected in slot ${context.slot}`);
      
      // Parse transaction to get token details
      const tokenDetails = await this.parseTokenCreation(logs);
      
      if (!tokenDetails) {
        return;
      }

      const { tokenMint, bondingCurve } = tokenDetails;

      // Check if already sniped
      if (this.snipedTokens.has(tokenMint)) {
        console.log(`⏭️ [PumpfunSniper] Token already sniped: ${tokenMint}`);
        return;
      }

      // Apply filters
      if (!(await this.passesFilters(bondingCurve))) {
        return;
      }

      // Execute snipe
      await this.executeSnipe(tokenMint);

    } catch (error: any) {
      console.error('❌ [PumpfunSniper] Error handling logs:', error.message);
    }
  }

  /**
   * Parse token creation from logs
   */
  private async parseTokenCreation(logs: Logs): Promise<{ tokenMint: string; bondingCurve: BondingCurve } | null> {
    try {
      // Extract token mint from logs
      // This is simplified - in production you'd parse the actual instruction data
      const mintMatch = logs.logs.find(log => log.includes('Token mint:'));
      if (!mintMatch) {
        return null;
      }

      const tokenMint = mintMatch.split('Token mint:')[1]?.trim();
      if (!tokenMint || tokenMint.length !== 44) {
        return null;
      }

      // Fetch bonding curve details using RPC rotation
      const bondingCurveData = await this.fetchBondingCurveData(tokenMint);
      
      if (!bondingCurveData) {
        return null;
      }

      return {
        tokenMint,
        bondingCurve: bondingCurveData
      };

    } catch (error: any) {
      console.error('❌ [PumpfunSniper] Error parsing token:', error.message);
      return null;
    }
  }

  /**
   * Fetch bonding curve data from chain
   */
  private async fetchBondingCurveData(tokenMint: string): Promise<BondingCurve | null> {
    if (!this.proxiedConnection) {
      return null;
    }

    try {
      // Use proxied connection with RPC rotation
      return await this.proxiedConnection.withProxy(async (connection) => {
        // Derive bonding curve PDA (simplified - you need actual derivation logic)
        const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
          [
            Buffer.from('bonding_curve'),
            new PublicKey(tokenMint).toBuffer()
          ],
          PUMPFUN_PROGRAM
        );

        // Fetch account data
        const accountInfo = await connection.getAccountInfo(bondingCurvePDA);
        
        if (!accountInfo) {
          return null;
        }

        // Parse bonding curve data (simplified structure)
        // In production, use proper borsh schema
        return {
          tokenMint: new PublicKey(tokenMint),
          virtualSolReserves: BigInt(1000000000), // 1 SOL in lamports
          virtualTokenReserves: BigInt(1000000000000), // Example
          realSolReserves: BigInt(0),
          realTokenReserves: BigInt(0),
          tokenTotalSupply: BigInt(1000000000000),
          complete: false,
          bondingCurveAddress: bondingCurvePDA,
          createdAt: Date.now()
        };
      });

    } catch (error: any) {
      console.error('❌ [PumpfunSniper] Error fetching bonding curve:', error.message);
      return null;
    }
  }

  /**
   * Check if token passes configured filters
   */
  private async passesFilters(bondingCurve: BondingCurve): Promise<boolean> {
    if (!this.config) return false;

    // Check if graduated
    if (this.config.excludeGraduated && bondingCurve.complete) {
      console.log(`⏭️ [PumpfunSniper] Skipping graduated token`);
      return false;
    }

    // Check liquidity limits
    const liquiditySol = Number(bondingCurve.realSolReserves) / 1e9;
    
    if (this.config.minLiquidity && liquiditySol < this.config.minLiquidity) {
      console.log(`⏭️ [PumpfunSniper] Liquidity too low: ${liquiditySol.toFixed(2)} SOL`);
      return false;
    }

    if (this.config.maxLiquidity && liquiditySol > this.config.maxLiquidity) {
      console.log(`⏭️ [PumpfunSniper] Liquidity too high: ${liquiditySol.toFixed(2)} SOL`);
      return false;
    }

    // Check max snipes
    if (this.config.snipeMode === 'all' && this.config.maxSnipes) {
      if (this.snipedTokens.size >= this.config.maxSnipes) {
        console.log(`🛑 [PumpfunSniper] Max snipes reached (${this.config.maxSnipes})`);
        await this.stopSniping();
        return false;
      }
    }

    return true;
  }

  /**
   * Execute the snipe - buy token and set up monitoring
   */
  private async executeSnipe(tokenMint: string): Promise<void> {
    if (!this.config || !this.tradingEngine) {
      return;
    }

    console.log(`🎯 [PumpfunSniper] SNIPING TOKEN: ${tokenMint}`);
    
    try {
      // Mark as sniped immediately to prevent duplicates
      this.snipedTokens.add(tokenMint);

      // Execute buy
      const buyResult = await this.tradingEngine.buyToken({
        userId: this.config.userId,
        walletAddress: this.config.walletAddress,
        tokenMint,
        amount: this.config.buyAmountSol,
        slippageBps: this.config.slippageBps,
        priorityLevel: this.config.priorityLevel,
        skipTax: this.config.skipTax
      });

      if (!buyResult.success) {
        console.error(`❌ [PumpfunSniper] Buy failed:`, buyResult.error);
        this.snipedTokens.delete(tokenMint); // Remove from sniped on failure
        
        broadcastTestLabUpdate({
          type: 'pumpfun_snipe_failed',
          data: {
            tokenMint,
            error: buyResult.error,
            userId: this.config.userId
          }
        });
        return;
      }

      console.log(`✅ [PumpfunSniper] Buy successful! TX: ${buyResult.signature}`);
      
      // Track position
      const tokensBought = buyResult.tokenAmount || 0;
      const pricePerToken = this.config.buyAmountSol / tokensBought;
      
      trackTestLabBuy(
        this.config.userId,
        this.config.walletId,
        tokenMint,
        'PUMP',
        this.config.buyAmountSol,
        tokensBought,
        pricePerToken,
        buyResult.signature,
        'pumpfun-sniper'
      );

      // Set up price monitoring for stop loss and take profits
      await this.setupPriceMonitoring(tokenMint);

      // Broadcast success
      broadcastTestLabUpdate({
        type: 'pumpfun_snipe_success',
        data: {
          tokenMint,
          amountSol: this.config.buyAmountSol,
          tokensBought,
          pricePerToken,
          signature: buyResult.signature,
          userId: this.config.userId
        }
      });

      // If single mode, stop after successful snipe
      if (this.config.snipeMode === 'single') {
        console.log('🛑 [PumpfunSniper] Single snipe mode - stopping after success');
        await this.stopSniping();
      }

    } catch (error: any) {
      console.error(`❌ [PumpfunSniper] Snipe error:`, error.message);
      this.snipedTokens.delete(tokenMint);
    }
  }

  /**
   * Set up price monitoring for SL/TP
   */
  private async setupPriceMonitoring(tokenMint: string): Promise<void> {
    if (!this.config) return;

    console.log(`📊 [PumpfunSniper] Setting up price monitoring for ${tokenMint.substring(0, 8)}...`);
    
    // Import OnChainPriceMonitor
    const { getOnChainPriceMonitor } = await import('../services/OnChainPriceMonitor.js');
    const monitor = getOnChainPriceMonitor();

    // Get pool address (for Pumpfun tokens, use bonding curve address)
    const [bondingCurvePDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('bonding_curve'),
        new PublicKey(tokenMint).toBuffer()
      ],
      PUMPFUN_PROGRAM
    );

    // Start campaign for monitoring
    const campaign = await monitor.startCampaign(tokenMint, bondingCurvePDA.toBase58());

    // Add stop loss alert
    if (this.config.stopLoss) {
      monitor.addAlert(
        campaign.id,
        this.config.stopLoss, // e.g., -10 for 10% loss
        'below',
        'percentage',
        [{
          type: 'sell' as const,
          amount: 100, // Sell 100% on stop loss
          walletId: this.config.walletId,
          slippage: this.config.slippageBps / 100,
          priorityFee: this.config.priorityLevel as any,
          skipTax: this.config.skipTax,
          useDynamicPercentage: true // Dynamic based on current balance
        } as any]
      );
      
      console.log(`🛡️ [PumpfunSniper] Stop loss set at ${this.config.stopLoss}%`);
    }

    // Add take profit alerts
    if (this.config.takeProfits && this.config.takeProfits.length > 0) {
      const tpAmounts = this.config.takeProfitAmounts || 
        this.config.takeProfits.map(() => 100 / this.config!.takeProfits.length); // Equal split if not specified
      
      this.config.takeProfits.forEach((tp, index) => {
        monitor.addAlert(
          campaign.id,
          tp, // e.g., 20 for 20% profit
          'above',
          'percentage',
          [{
            type: 'sell' as const,
            amount: tpAmounts[index], // Percentage to sell
            walletId: this.config!.walletId,
            slippage: this.config!.slippageBps / 100,
            priorityFee: this.config!.priorityLevel as any,
            skipTax: this.config!.skipTax,
            useDynamicPercentage: false // Fixed percentage of initial position
          } as any]
        );
        
        console.log(`💰 [PumpfunSniper] Take profit ${index + 1} set at +${tp}% (sell ${tpAmounts[index]}%)`);
      });
    }
  }

  /**
   * Stop sniping
   */
  async stopSniping(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 [PumpfunSniper] Stopping sniper...');
    
    // Unsubscribe from WebSocket
    if (this.connection && this.subscriptionId !== null) {
      await this.connection.removeOnLogsListener(this.subscriptionId);
      this.subscriptionId = null;
    }

    // Clean up connections
    this.connection = null;
    this.proxiedConnection = null;
    
    this.isRunning = false;
    this.config = null;

    const runtime = Math.floor((Date.now() - this.monitoringStartTime) / 1000);
    
    // Broadcast status
    broadcastTestLabUpdate({
      type: 'pumpfun_sniper_stopped',
      data: {
        totalSniped: this.snipedTokens.size,
        tokens: Array.from(this.snipedTokens),
        runtime
      }
    });

    console.log(`✅ [PumpfunSniper] Stopped. Sniped ${this.snipedTokens.size} tokens in ${runtime}s`);
  }

  /**
   * Get current status
   */
  getStatus(): any {
    return {
      isRunning: this.isRunning,
      config: this.config ? {
        mode: this.config.snipeMode,
        buyAmount: this.config.buyAmountSol,
        wallet: this.config.walletAddress.substring(0, 8) + '...'
      } : null,
      snipedTokens: Array.from(this.snipedTokens),
      totalSniped: this.snipedTokens.size,
      runtime: this.isRunning ? Math.floor((Date.now() - this.monitoringStartTime) / 1000) : 0
    };
  }
}

// Singleton instance
let pumpfunSniperInstance: PumpfunSniper | null = null;

export function getPumpfunSniper(): PumpfunSniper {
  if (!pumpfunSniperInstance) {
    pumpfunSniperInstance = new PumpfunSniper();
  }
  return pumpfunSniperInstance;
}
