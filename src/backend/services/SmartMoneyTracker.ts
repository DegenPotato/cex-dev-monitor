/**
 * Smart Money Tracker - Monitors large Pumpfun buys and tracks their performance
 * In-memory only, no database persistence
 */

import { Connection, PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';
import fetch from 'cross-fetch';
import { getWebSocketServer } from './WebSocketService.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { RPCServerRotator } from './RPCServerRotator.js';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Known buy discriminators (verified via live sampling + manual analysis)
const BUY_DISCRIMINATORS = [
  '0094d0da1f435eb0', // 16-account buy (with creator fee)
  'e6345c8dd8b14540', // 14-account buy (without creator fee)  
  '48feac982b20e013', // 19-account buy variant (46% of txs!)
  '00b08712a8402815'  // 19-account buy variant with 293-byte data (rare, <1%)
];
const SELL_DISCRIMINATORS = [
  '33e685a4017f83ad', // Original sell
  'db0d98c38ed07cfd'  // New sell variant (21% of live txs)
];

// Known but NOT tracked (setup/wrapper instructions, not actual trades)
// These appear alongside actual buy/sell instructions in the same transaction
// Tracking them would cause duplicate detections:
// - e3c092e6b37125bf (ATA/token account setup, 3% of txs, 27 bytes)
// - 8b8dd6794046280e (Setup wrapper, <1%, 25 bytes)
// - e5986f6e9dcba52c (Unknown wrapper, <1%)

// Known gas wallets to ignore (Jupiter, etc.)
const GAS_WALLET_BLACKLIST = [
  'CgPfjJEeUHFcr1cXnpkZM9wWGB5RV9m2mjyrwYrhAJWK', // Jupiter Gas Wallet
];

interface Trade {
  tx: string;
  time: number;
  type: 'buy' | 'sell';
  tokens: number; // Amount of tokens
  sol: number; // SOL spent (buy) or received (sell)
  price: number; // Price per token in SOL at trade time
}

interface TrackedPosition {
  id: string;
  walletAddress: string;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogo?: string;
  totalSupply?: number;
  
  // Trade history
  trades: Trade[];
  buyCount: number;
  sellCount: number;
  
  // Aggregated entry/exit data
  firstBuyTime: number;
  lastBuyTime: number;
  firstSellTime?: number;
  lastSellTime?: number;
  totalTokensBought: number;
  totalTokensSold: number;
  totalSolSpent: number;
  totalSolReceived: number;
  avgBuyPrice: number; // Average SOL per token across all buys
  avgSellPrice?: number; // Average SOL per token across all sells
  
  // Current holdings
  currentHolding: number; // tokens currently held (bought - sold)
  
  // Performance tracking
  currentPrice: number; // Current market price in SOL per token
  currentPriceUsd?: number; // Current market price in USD per token
  marketCapUsd?: number; // total supply * price USD
  marketCapSol?: number; // total supply * price SOL
  high: number; // Highest SOL price
  low: number; // Lowest SOL price
  highTime: number;
  lowTime: number;
  highUsd?: number; // Highest USD price
  lowUsd?: number; // Lowest USD price
  highUsdTime?: number;
  lowUsdTime?: number;
  lastUpdate: number;
  
  // Calculated metrics
  unrealizedPnl: number; // P&L on current holdings
  unrealizedPnlPercent: number;
  realizedPnl: number; // P&L from completed sells
  realizedPnlPercent: number;
  totalPnl: number; // realized + unrealized
  totalPnlPercent: number;
  
  isActive: boolean; // Has unsold tokens
}

interface WalletPerformance {
  walletAddress: string;
  positions: number;
  activePositions: number;
  closedPositions: number;
  totalBuys: number;
  totalSells: number;
  totalInvested: number;
  totalReturned: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  totalPnl: number;
  winRate: number;
  avgHoldingTime: number; // milliseconds
  bestTrade: number; // Highest % gain
  worstTrade: number; // Worst % loss
  avgEntryPrice: number; // across all positions
  avgExitPrice: number; // across closed positions
}

interface TokenPerformance {
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogo?: string;
  holders: number;
  totalBuys: number;
  totalSells: number;
  totalVolumeTokens: number;
  totalVolumeSol: number;
  avgBuyPrice: number;
  avgSellPrice: number;
  currentPrice: number;
  currentPriceUsd?: number;
  marketCapUsd?: number;
  marketCapSol?: number;
  bestPerformer: string; // Wallet address with best %
  bestPerformance: number; // % gain
  worstPerformer: string;
  worstPerformance: number;
  avgHoldingTime: number;
}

export class SmartMoneyTracker extends EventEmitter {
  private connection: Connection; // Direct connection for WebSocket
  private proxiedConnection: ProxiedSolanaConnection; // For RPC calls with isolated rotator
  private rpcRotator: RPCServerRotator; // Isolated RPC rotator for this tracker
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  private subscriptionId: number | null = null;
  
  // In-memory storage
  private positions: Map<string, TrackedPosition> = new Map(); // positionId -> position
  private walletPositions: Map<string, Set<string>> = new Map(); // walletAddress -> Set<positionId>
  private tokenPositions: Map<string, Set<string>> = new Map(); // tokenMint -> Set<positionId>
  
  // Configuration
  private minTokenThreshold: number = 5_000_000; // 5M tokens minimum
  private pollIntervalMs: number = 5000; // Check for new transactions every 5s
  private priceUpdateIntervalMs: number = 1500; // Update prices every 1.5s (matches Manual test: 1-2s)
  
  // RPC Rotation Config (isolated from global)
  private maxConcurrentRequests: number = 10; // Max concurrent RPC requests
  private rpcRateLimitPerServer: number = 90; // Max requests per 10s per server (safety ceiling)
  
  // Price monitoring
  private batchPriceMonitor: NodeJS.Timeout | null = null; // Single batch monitor for all tokens
  private lastProcessedSlot: number = 0;
  
  // WebSocket
  private wsService = getWebSocketServer();

  constructor(rpcUrl: string, config?: {
    maxConcurrentRequests?: number;
    rpcRateLimitPerServer?: number;
    pollIntervalMs?: number;
    priceUpdateIntervalMs?: number;
  }) {
    super();
    
    // Apply custom config
    if (config?.maxConcurrentRequests) this.maxConcurrentRequests = config.maxConcurrentRequests;
    if (config?.rpcRateLimitPerServer) this.rpcRateLimitPerServer = config.rpcRateLimitPerServer;
    if (config?.pollIntervalMs) this.pollIntervalMs = config.pollIntervalMs;
    if (config?.priceUpdateIntervalMs) this.priceUpdateIntervalMs = config.priceUpdateIntervalMs;
    
    // Direct connection for WebSocket only
    this.connection = new Connection(rpcUrl, 'confirmed');
    
    // Create ISOLATED RPC rotator for Smart Money Tracker
    this.rpcRotator = new RPCServerRotator();
    this.rpcRotator.enable();
    
    // ProxiedConnection using the ISOLATED rotator
    this.proxiedConnection = new ProxiedSolanaConnection(
      rpcUrl,
      { commitment: 'confirmed' },
      undefined,
      'SmartMoneyTracker',
      this.rpcRotator // Pass isolated rotator
    );
    
    console.log(`🎯 [SmartMoneyTracker] Initialized:`);
    console.log(`   📡 WebSocket: Direct RPC`);
    console.log(`   🔄 Transactions: ISOLATED 20-server rotator`);
    console.log(`   ⚡ Max Concurrent: ${this.maxConcurrentRequests}`);
    console.log(`   🚦 Rate Limit: ${this.rpcRateLimitPerServer} req/10s per server`);
  }

  /**
   * Update configuration (including RPC settings)
   */
  updateConfig(config: {
    minTokenThreshold?: number;
    pollIntervalMs?: number;
    priceUpdateIntervalMs?: number;
    maxConcurrentRequests?: number;
    rpcRateLimitPerServer?: number;
  }): void {
    if (config.minTokenThreshold !== undefined) {
      this.minTokenThreshold = config.minTokenThreshold;
      console.log(`📊 [SmartMoneyTracker] Min token threshold: ${this.minTokenThreshold.toLocaleString()}`);
    }
    if (config.pollIntervalMs !== undefined) {
      this.pollIntervalMs = config.pollIntervalMs;
      console.log(`⏱️  [SmartMoneyTracker] Poll interval: ${this.pollIntervalMs}ms`);
    }
    if (config.priceUpdateIntervalMs !== undefined) {
      this.priceUpdateIntervalMs = config.priceUpdateIntervalMs;
      console.log(`💹 [SmartMoneyTracker] Price update interval: ${this.priceUpdateIntervalMs}ms`);
      
      // Restart batch price monitoring with new interval
      if (this.isRunning && this.batchPriceMonitor) {
        clearInterval(this.batchPriceMonitor);
        this.startBatchPriceMonitoring();
      }
    }
    if (config.maxConcurrentRequests !== undefined) {
      this.maxConcurrentRequests = config.maxConcurrentRequests;
      console.log(`⚡ [SmartMoneyTracker] Max concurrent requests: ${this.maxConcurrentRequests}`);
    }
    if (config.rpcRateLimitPerServer !== undefined) {
      this.rpcRateLimitPerServer = config.rpcRateLimitPerServer;
      console.log(`🚦 [SmartMoneyTracker] RPC rate limit per server: ${this.rpcRateLimitPerServer} req/10s`);
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return {
      minTokenThreshold: this.minTokenThreshold,
      pollIntervalMs: this.pollIntervalMs,
      priceUpdateIntervalMs: this.priceUpdateIntervalMs,
      maxConcurrentRequests: this.maxConcurrentRequests,
      rpcRateLimitPerServer: this.rpcRateLimitPerServer,
      isRunning: this.isRunning
    };
  }

  /**
   * Start monitoring
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Tracker is already running');
    }

    console.log('🎯 Starting Smart Money Tracker...');
    this.isRunning = true;
    
    // Subscribe to Pumpfun program logs via WebSocket
    await this.startWebSocketMonitoring();
    
    // Start batch price monitoring
    this.startBatchPriceMonitoring();
    
    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  async stop(): Promise<void> {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Smart Money Tracker...');
    this.isRunning = false;

    // Unsubscribe from WebSocket
    if (this.subscriptionId !== null) {
      try {
        await this.connection.removeOnLogsListener(this.subscriptionId);
        console.log('✅ Unsubscribed from Pumpfun program logs');
      } catch (error) {
        console.error('Error unsubscribing:', error);
      }
      this.subscriptionId = null;
    }

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Stop batch price monitor
    if (this.batchPriceMonitor) {
      clearInterval(this.batchPriceMonitor);
      this.batchPriceMonitor = null;
    }

    // Disable isolated RPC rotator
    this.rpcRotator.disable();

    this.emit('stopped');
  }

  /**
   * Start WebSocket monitoring for Pumpfun program transactions
   */
  private async startWebSocketMonitoring(): Promise<void> {
    try {
      console.log('📡 [SmartMoneyTracker] Starting WebSocket subscription to Pumpfun program...');
      
      this.subscriptionId = this.connection.onLogs(
        PUMPFUN_PROGRAM_ID,
        async (logs) => {
          if (!this.isRunning) return;
          
          // Process the transaction
          const signature = logs.signature;
          await this.processTransaction(signature);
        },
        'confirmed'
      );
      
      console.log(`✅ [SmartMoneyTracker] WebSocket subscribed (ID: ${this.subscriptionId})`);
    } catch (error) {
      console.error('❌ [SmartMoneyTracker] WebSocket subscription failed:', error);
      // Fallback to polling if WebSocket fails
      console.log('⚠️ [SmartMoneyTracker] Falling back to polling...');
      this.pollingInterval = setInterval(
        () => this.pollTransactions(),
        this.pollIntervalMs
      );
    }
  }

  /**
   * Fallback polling method (used if WebSocket fails)
   */
  private async pollTransactions(): Promise<void> {
    try {
      const currentSlot = await this.connection.getSlot('confirmed');
      
      if (currentSlot <= this.lastProcessedSlot) {
        return;
      }

      const signatures = await this.connection.getSignaturesForAddress(
        PUMPFUN_PROGRAM_ID,
        { limit: 50 },
        'confirmed'
      );

      for (const sig of signatures) {
        if (sig.slot && sig.slot <= this.lastProcessedSlot) {
          continue;
        }
        await this.processTransaction(sig.signature);
      }

      this.lastProcessedSlot = currentSlot;
    } catch (error) {
      console.error('Error polling transactions:', error);
    }
  }

  /**
   * Process a single transaction
   */
  private async processTransaction(signature: string): Promise<void> {
    try {
      // Fetch transaction using rotated RPC (isolated 20-server rotation)
      const tx = await this.proxiedConnection.withProxy(conn =>
        conn.getTransaction(signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        })
      );

      if (!tx || !tx.meta?.innerInstructions) return;

      const message = tx.transaction.message;
      let accountKeys = message.staticAccountKeys;

      // Include loaded addresses
      if (message.addressTableLookups && message.addressTableLookups.length > 0 && tx.meta?.loadedAddresses) {
        const allKeys = [...accountKeys];
        if (tx.meta.loadedAddresses.writable) allKeys.push(...tx.meta.loadedAddresses.writable);
        if (tx.meta.loadedAddresses.readonly) allKeys.push(...tx.meta.loadedAddresses.readonly);
        accountKeys = allKeys;
      }

      // Find Pumpfun instructions
      for (const innerGroup of tx.meta.innerInstructions) {
        for (const innerIx of innerGroup.instructions) {
          const programIdIndex = innerIx.programIdIndex;
          if (programIdIndex === undefined || programIdIndex >= accountKeys.length) continue;

          const programId = accountKeys[programIdIndex];
          if (!programId.equals(PUMPFUN_PROGRAM_ID)) continue;

          const data = Buffer.from(innerIx.data, 'base64');
          if (data.length < 24) continue;

          const discriminator = data.slice(0, 8).toString('hex');

          // Check if it's a buy or sell
          const isBuy = BUY_DISCRIMINATORS.includes(discriminator);
          const isSell = SELL_DISCRIMINATORS.includes(discriminator);

          if (!isBuy && !isSell) continue;

          // Extract token mint from accounts (usually account index 2)
          const accounts = (innerIx as any).accounts || [];
          if (accounts.length < 3) continue;

          const tokenMint = accountKeys[accounts[2]].toBase58();

          // Process buy or sell
          if (isBuy) {
            await this.handleBuy(signature, tokenMint, tx);
          } else if (isSell) {
            await this.handleSell(signature, tokenMint, tx);
          }
        }
      }
    } catch (error) {
      console.error(`Error processing transaction ${signature}:`, error);
    }
  }

  /**
   * Handle a buy transaction
   */
  private async handleBuy(
    signature: string,
    tokenMint: string,
    tx: any
  ): Promise<void> {
    // Extract token balance change and actual wallet (token account owner)
    if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return;

    let tokensBought = 0;
    let decimals = 6;
    let walletAddress: string | null = null;

    for (const post of tx.meta.postTokenBalances) {
      if (post.mint === tokenMint) {
        const pre = tx.meta.preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;

        if (change > 0n) {
          decimals = post.uiTokenAmount.decimals;
          tokensBought = Number(change) / Math.pow(10, decimals);
          // Use token account owner, not fee payer
          walletAddress = post.owner;
          break;
        }
      }
    }

    // Validate wallet
    if (!walletAddress || GAS_WALLET_BLACKLIST.includes(walletAddress)) {
      console.log(`⚠️ [SmartMoneyTracker] Skipping buy - invalid or blacklisted wallet: ${walletAddress}`);
      return;
    }

    // Check if meets minimum threshold for FIRST buy only
    if (tokensBought < this.minTokenThreshold) {
      // Check if existing position exists
      const existingPosition = this.findPositionByWalletToken(walletAddress, tokenMint);
      if (!existingPosition) {
        return; // First buy too small, ignore
      }
      // Continue for additional buys even if below threshold
    }

    // Calculate SOL spent
    let solSpent = 0;
    if (tx.meta?.preBalances && tx.meta?.postBalances) {
      const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      solSpent = change / 1e9;
    }

    if (solSpent <= 0) return;

    // Calculate buy price
    const buyPrice = solSpent / tokensBought;
    const tradeTime = tx.blockTime! * 1000;

    // Find or create position for this wallet-token pair
    let position = this.findPositionByWalletToken(walletAddress, tokenMint);
    
    if (!position) {
      // Create new position
      const positionId = `${walletAddress}-${tokenMint}`;
      position = {
        id: positionId,
        walletAddress,
        tokenMint,
        trades: [],
        buyCount: 0,
        sellCount: 0,
        firstBuyTime: tradeTime,
        lastBuyTime: tradeTime,
        firstSellTime: undefined,
        lastSellTime: undefined,
        totalTokensBought: 0,
        totalTokensSold: 0,
        totalSolSpent: 0,
        totalSolReceived: 0,
        avgBuyPrice: 0,
        avgSellPrice: undefined,
        currentHolding: 0,
        currentPrice: buyPrice,
        currentPriceUsd: undefined,
        marketCapUsd: undefined,
        marketCapSol: undefined,
        high: buyPrice,
        low: buyPrice,
        highTime: tradeTime,
        lowTime: tradeTime,
        lastUpdate: Date.now(),
        unrealizedPnl: 0,
        unrealizedPnlPercent: 0,
        realizedPnl: 0,
        realizedPnlPercent: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        isActive: true,
        tokenSymbol: undefined,
        tokenName: undefined,
        tokenLogo: undefined,
        totalSupply: 1_000_000_000 // Pumpfun tokens are always 1 billion
      };
      
      this.positions.set(positionId, position);
      
      // Index by wallet
      if (!this.walletPositions.has(walletAddress)) {
        this.walletPositions.set(walletAddress, new Set());
      }
      this.walletPositions.get(walletAddress)!.add(positionId);
      
      // Index by token
      if (!this.tokenPositions.has(tokenMint)) {
        this.tokenPositions.set(tokenMint, new Set());
      }
      this.tokenPositions.get(tokenMint)!.add(positionId);
    }

    // Add trade to history FIRST (don't let metadata extraction block this)
    position.trades.push({
      tx: signature,
      time: tradeTime,
      type: 'buy',
      tokens: tokensBought,
      sol: solSpent,
      price: buyPrice
    });

    // Update aggregated stats
    position.buyCount++;
    position.lastBuyTime = tradeTime;
    position.totalTokensBought += tokensBought;
    position.totalSolSpent += solSpent;
    position.currentHolding += tokensBought;
    position.avgBuyPrice = position.totalSolSpent / position.totalTokensBought;
    position.isActive = position.currentHolding > 0;

    // Update price tracking
    if (buyPrice > position.high) {
      position.high = buyPrice;
      position.highTime = tradeTime;
    }
    if (buyPrice < position.low) {
      position.low = buyPrice;
      position.lowTime = tradeTime;
    }

    // Extract metadata SYNCHRONOUSLY if missing (we have the tx right here!)
    if (!position.tokenSymbol) {
      try {
        const metadata = await this.extractTokenMetadataFromTransaction(tx, tokenMint);
        if (metadata) {
          position.tokenSymbol = metadata.symbol || undefined;
          position.tokenName = metadata.name || undefined;
          position.tokenLogo = metadata.logo || undefined;
        } else {
          // Fallback to Jupiter API
          try {
            const jupMeta = await this.fetchTokenMetadata(tokenMint);
            if (jupMeta) {
              position.tokenSymbol = jupMeta.symbol;
              position.tokenName = jupMeta.name;
              position.tokenLogo = jupMeta.logo;
            }
          } catch {}
        }
      } catch {}
    }

    console.log(`💰 [SmartMoneyTracker] BUY ${position.tokenSymbol || tokenMint.slice(0, 8)} - Wallet: ${walletAddress.slice(0, 8)} | Tokens: ${tokensBought.toLocaleString()} | SOL: ${solSpent.toFixed(4)} | Price: ${buyPrice.toFixed(10)} SOL/token | BuyCount: ${position.buyCount}`);

    // Broadcast buy to frontend
    this.emit('newBuy', position);
    this.wsService.broadcast('smartMoney:newBuy', {
      position: this.sanitizePosition(position),
      stats: this.getStatus()
    });
  }

  /**
   * Handle a sell transaction
   */
  private async handleSell(
    signature: string,
    tokenMint: string,
    tx: any
  ): Promise<void> {
    // Extract token balance change and actual wallet (token account owner)
    if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return;

    let tokensSold = 0;
    let decimals = 6;
    let walletAddress: string | null = null;

    for (const post of tx.meta.postTokenBalances) {
      if (post.mint === tokenMint) {
        const pre = tx.meta.preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = preAmount - postAmount; // Negative for sell

        if (change > 0n) {
          decimals = post.uiTokenAmount.decimals;
          tokensSold = Number(change) / Math.pow(10, decimals);
          // Use token account owner, not fee payer
          walletAddress = post.owner;
          break;
        }
      }
    }

    // Validate wallet
    if (!walletAddress || GAS_WALLET_BLACKLIST.includes(walletAddress)) {
      console.log(`⚠️ [SmartMoneyTracker] Skipping sell - invalid or blacklisted wallet: ${walletAddress}`);
      return;
    }

    if (tokensSold <= 0) return;

    // Find existing position
    const position = this.findPositionByWalletToken(walletAddress, tokenMint);
    
    if (!position) {
      console.log(`⚠️ [SmartMoneyTracker] Sell detected but no position found for ${walletAddress.slice(0, 8)} - ${tokenMint.slice(0, 8)}`);
      return;
    }

    // Calculate SOL received
    let solReceived = 0;
    if (tx.meta?.preBalances && tx.meta?.postBalances) {
      const change = tx.meta.postBalances[0] - tx.meta.preBalances[0];
      solReceived = change / 1e9;
    }

    if (solReceived <= 0) return;

    const sellPrice = solReceived / tokensSold;
    const tradeTime = tx.blockTime! * 1000;

    // Add sell trade to history
    position.trades.push({
      tx: signature,
      time: tradeTime,
      type: 'sell',
      tokens: tokensSold,
      sol: solReceived,
      price: sellPrice
    });

    // Update aggregated stats
    position.sellCount++;
    if (!position.firstSellTime) {
      position.firstSellTime = tradeTime;
    }
    position.lastSellTime = tradeTime;
    position.totalTokensSold += tokensSold;
    position.totalSolReceived += solReceived;
    position.currentHolding -= tokensSold;
    
    // Recalculate average sell price
    if (position.totalTokensSold > 0) {
      position.avgSellPrice = position.totalSolReceived / position.totalTokensSold;
    }

    // Calculate realized P&L (from sells)
    position.realizedPnl = position.totalSolReceived - (position.avgBuyPrice * position.totalTokensSold);
    position.realizedPnlPercent = position.totalSolSpent > 0 
      ? (position.realizedPnl / position.totalSolSpent) * 100 
      : 0;

    // Update active status
    position.isActive = position.currentHolding > 0.01; // Allow for small rounding errors

    console.log(`📤 [SmartMoneyTracker] SELL ${position.tokenSymbol || tokenMint.slice(0, 8)} - Wallet: ${walletAddress.slice(0, 8)} | Tokens: ${tokensSold.toLocaleString()} | SOL: ${solReceived.toFixed(4)} | Holding: ${position.currentHolding.toLocaleString()} | Realized P&L: ${position.realizedPnl.toFixed(4)} SOL (${position.realizedPnlPercent.toFixed(2)}%)`);

    this.emit('positionUpdated', position);
    this.wsService.broadcast('smartMoney:positionUpdated', {
      position: this.sanitizePosition(position),
      stats: this.getStatus()
    });
  }

  /**
   * Find position by wallet and token (single position per wallet-token pair)
   */
  private findPositionByWalletToken(walletAddress: string, tokenMint: string): TrackedPosition | undefined {
    const positionId = `${walletAddress}-${tokenMint}`;
    return this.positions.get(positionId);
  }

  /**
   * Start batch price monitoring for ALL active tokens (efficient!)
   */
  private startBatchPriceMonitoring(): void {
    // Clear any existing batch monitor
    if (this.batchPriceMonitor) {
      clearInterval(this.batchPriceMonitor);
    }

    this.batchPriceMonitor = setInterval(async () => {
      try {
        // Get all unique token mints from active positions
        const activeTokens = new Set<string>();
        for (const position of this.positions.values()) {
          if (position.isActive) {
            activeTokens.add(position.tokenMint);
          }
        }

        if (activeTokens.size === 0) return;

        console.log(`📊 [SmartMoneyTracker] Batch updating prices for ${activeTokens.size} tokens...`);

        // Batch fetch prices for all active tokens
        const priceData = await this.batchFetchPricesFromJupiter(Array.from(activeTokens));

        // Update all positions with new prices
        for (const position of this.positions.values()) {
          if (!position.isActive) continue;

          const prices = priceData.get(position.tokenMint);
          if (!prices) continue;

          const previousPrice = position.currentPrice;
          position.currentPrice = prices.priceInSol;
          position.currentPriceUsd = prices.priceInUsd;
          position.lastUpdate = Date.now();

          // Calculate market cap if we have total supply
          if (position.totalSupply) {
            position.marketCapUsd = position.totalSupply * prices.priceInUsd;
            position.marketCapSol = position.totalSupply * prices.priceInSol;
          }

          // Update high/low (SOL)
          if (prices.priceInSol > position.high) {
            position.high = prices.priceInSol;
            position.highTime = Date.now();
          }
          if (prices.priceInSol < position.low) {
            position.low = prices.priceInSol;
            position.lowTime = Date.now();
          }

          // Update high/low (USD)
          if (prices.priceInUsd) {
            if (!position.highUsd || prices.priceInUsd > position.highUsd) {
              position.highUsd = prices.priceInUsd;
              position.highUsdTime = Date.now();
            }
            if (!position.lowUsd || prices.priceInUsd < position.lowUsd) {
              position.lowUsd = prices.priceInUsd;
              position.lowUsdTime = Date.now();
            }
          }

          // Calculate unrealized P&L (on current holdings)
          const currentValue = position.currentHolding * prices.priceInSol;
          const costBasis = position.currentHolding * position.avgBuyPrice;
          position.unrealizedPnl = currentValue - costBasis;
          position.unrealizedPnlPercent = costBasis > 0 ? (position.unrealizedPnl / costBasis) * 100 : 0;
          
          // Calculate total P&L
          position.totalPnl = position.realizedPnl + position.unrealizedPnl;
          position.totalPnlPercent = position.totalSolSpent > 0 
            ? (position.totalPnl / position.totalSolSpent) * 100 
            : 0;

          // Emit update if price changed significantly (>1%)
          if (previousPrice && Math.abs((prices.priceInSol - previousPrice) / previousPrice) > 0.01) {
            this.emit('priceUpdate', position);
            
            // Broadcast to WebSocket (throttled by >1% change)
            this.wsService.broadcast('smartMoney:priceUpdate', {
              position: this.sanitizePosition(position),
              stats: this.getStatus()
            });
          }
        }
      } catch (error) {
        console.error(`❌ [SmartMoneyTracker] Batch price update error:`, error);
      }
    }, this.priceUpdateIntervalMs);

    console.log(`✅ [SmartMoneyTracker] Batch price monitoring started (interval: ${this.priceUpdateIntervalMs}ms)`);
  }

  /**
   * Batch fetch prices for all active tokens from Jupiter Price API v3
   * Returns both SOL and USD prices (MATCHES WORKING MANUAL TEST IMPLEMENTATION)
   */
  private async batchFetchPricesFromJupiter(tokenMints: string[]): Promise<Map<string, { priceInSol: number; priceInUsd: number }>> {
    const results = new Map<string, { priceInSol: number; priceInUsd: number }>();
    
    if (tokenMints.length === 0) return results;

    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      // Use lite-api endpoint (same as Manual test)
      const idsParam = [...tokenMints, SOL_MINT].join(',');
      const priceUrl = `https://lite-api.jup.ag/price/v3?ids=${idsParam}`;
      
      const response = await fetch(priceUrl);
      if (!response.ok) {
        console.error(`❌ [Jupiter Price API] HTTP ${response.status}`);
        if (response.status === 429) {
          console.error(`⚠️  [Jupiter Price API] RATE LIMITED - Status 429`);
        }
        return results;
      }

      const priceData = await response.json();
      const solData = priceData[SOL_MINT];
      
      if (!solData?.usdPrice) {
        console.error(`❌ [Jupiter Price API] No SOL price data available`);
        return results;
      }
      
      const solUsdPrice = parseFloat(solData.usdPrice);

      // Parse results for each token
      for (const tokenMint of tokenMints) {
        const tokenData = priceData[tokenMint];
        
        if (tokenData?.usdPrice) {
          const tokenUsdPrice = parseFloat(tokenData.usdPrice);
          const priceInSol = tokenUsdPrice / solUsdPrice; // Calculate SOL price (same as Manual test)
          
          results.set(tokenMint, {
            priceInSol,
            priceInUsd: tokenUsdPrice
          });
        }
      }

      console.log(`📊 [Jupiter Price API] Fetched ${results.size}/${tokenMints.length} token prices (SOL: $${solUsdPrice.toFixed(2)})`);
      return results;
    } catch (error: any) {
      console.error(`❌ [Jupiter Price API] Batch fetch error: ${error.message}`);
      return results;
    }
  }

  // Legacy single-token price fetch removed - use batchFetchPricesFromJupiter() directly for better efficiency

  /**
   * Extract token metadata directly from blockchain (Metaplex metadata account)
   */
  private async extractTokenMetadataFromTransaction(_tx: any, tokenMint: string): Promise<{ name?: string; symbol?: string; logo?: string } | null> {
    try {
      // For Pumpfun, metadata is often in the mint account
      // Try to fetch the mint account to get token details
      const mintPubkey = new PublicKey(tokenMint);
      
      // Get mint account info (rotated RPC)
      const mintInfo = await this.proxiedConnection.withProxy(conn =>
        conn.getAccountInfo(mintPubkey, 'confirmed')
      );

      if (!mintInfo) {
        return null;
      }

      // Extract total supply from mint account (first 36 bytes: mintAuthority(32) + supply(8))
      // SPL Token mint layout: mintAuthority(32) + supply(8) + decimals(1) + isInitialized(1) + freezeAuthority(32)
      if (mintInfo.data.length >= 82) {
        const supply = mintInfo.data.readBigUInt64LE(36);
        const decimals = mintInfo.data.readUInt8(44);
        const totalSupply = Number(supply) / Math.pow(10, decimals);
        
        // Find position and set total supply
        for (const position of this.positions.values()) {
          if (position.tokenMint === tokenMint) {
            position.totalSupply = totalSupply;
          }
        }
      }

      // Try to extract metadata from Metaplex metadata account
      // Metaplex metadata PDA is derived from: ['metadata', metadataProgramId, mint]
      const METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer()
        ],
        METADATA_PROGRAM_ID
      );

      const metadataAccount = await this.proxiedConnection.withProxy(conn =>
        conn.getAccountInfo(metadataPDA, 'confirmed')
      );

      if (metadataAccount && metadataAccount.data.length > 0) {
        // Parse Metaplex metadata (simplified - full parser would be more complex)
        const data = metadataAccount.data;
        
        // Skip first byte (key), then read name
        let offset = 1 + 32 + 32; // key + update authority + mint
        
        // Read name length (u32)
        const nameLen = data.readUInt32LE(offset);
        offset += 4;
        const name = data.slice(offset, offset + nameLen).toString('utf8').replace(/\0/g, '').trim();
        offset += nameLen;
        
        // Read symbol length (u32)
        const symbolLen = data.readUInt32LE(offset);
        offset += 4;
        const symbol = data.slice(offset, offset + symbolLen).toString('utf8').replace(/\0/g, '').trim();
        offset += symbolLen;
        
        // Read uri length (u32)
        const uriLen = data.readUInt32LE(offset);
        offset += 4;
        const uri = data.slice(offset, offset + uriLen).toString('utf8').replace(/\0/g, '').trim();
        
        // Try to fetch logo from URI if it's a valid URL
        let logo: string | undefined;
        if (uri && uri.startsWith('http')) {
          try {
            const uriResponse = await fetch(uri);
            const uriData = await uriResponse.json();
            logo = uriData.image || uriData.logo;
          } catch {
            // Silent fail - logo is optional
          }
        }
        
        return {
          name: name || undefined,
          symbol: symbol || undefined,
          logo
        };
      }

      return null;
    } catch (error: any) {
      console.log(`⚠️  [SmartMoneyTracker] Could not extract metadata from transaction: ${error.message}`);
      return null;
    }
  }

  /**
   * Fetch token metadata from Jupiter tokens API
   */
  private async fetchTokenMetadata(tokenMint: string): Promise<{ name?: string; symbol?: string; logo?: string } | null> {
    try {
      const tokensUrl = `https://lite-api.jup.ag/tokens/v2/search?query=${tokenMint}`;
      const response = await fetch(tokensUrl);
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      
      // Find exact match for the token mint
      const token = data.find((t: any) => t.address === tokenMint);
      if (!token) {
        return null;
      }
      
      return {
        name: token.name,
        symbol: token.symbol,
        logo: token.logoURI
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all positions (sanitized for frontend)
   */
  getPositions(): any[] {
    return Array.from(this.positions.values()).map(p => this.sanitizePosition(p));
  }

  /**
   * Get active positions only (sanitized for frontend)
   */
  getActivePositions(): any[] {
    return Array.from(this.positions.values())
      .filter(p => p.isActive)
      .map(p => this.sanitizePosition(p));
  }

  /**
   * Get wallet leaderboard with comprehensive metrics
   */
  getWalletLeaderboard(): WalletPerformance[] {
    const leaderboard: Map<string, WalletPerformance> = new Map();
    
    // Return empty array if no positions
    if (this.positions.size === 0) {
      return [];
    }

    for (const position of this.positions.values()) {
      if (!leaderboard.has(position.walletAddress)) {
        leaderboard.set(position.walletAddress, {
          walletAddress: position.walletAddress,
          positions: 0,
          activePositions: 0,
          closedPositions: 0,
          totalBuys: 0,
          totalSells: 0,
          totalInvested: 0,
          totalReturned: 0,
          totalRealizedPnl: 0,
          totalUnrealizedPnl: 0,
          totalPnl: 0,
          winRate: 0,
          avgHoldingTime: 0,
          bestTrade: -Infinity,
          worstTrade: Infinity,
          avgEntryPrice: 0,
          avgExitPrice: 0
        });
      }

      const perf = leaderboard.get(position.walletAddress)!;
      perf.positions++;
      perf.totalBuys += position.buyCount;
      perf.totalSells += position.sellCount;
      perf.totalInvested += position.totalSolSpent;
      perf.totalReturned += position.totalSolReceived;
      perf.totalRealizedPnl += position.realizedPnl;
      perf.totalUnrealizedPnl += position.unrealizedPnl;
      perf.totalPnl += position.totalPnl || 0;

      if (position.isActive) {
        perf.activePositions++;
      } else {
        perf.closedPositions++;
      }

      // Track best/worst trades (with NaN check)
      const posPerf = position.totalPnlPercent || 0;
      if (posPerf > perf.bestTrade) perf.bestTrade = posPerf;
      if (posPerf < perf.worstTrade) perf.worstTrade = posPerf;
    }

    // Calculate aggregates
    for (const [walletAddress, perf] of leaderboard) {
      const walletPositions = Array.from(this.positions.values())
        .filter(p => p.walletAddress === walletAddress);
      
      // Win rate
      const wins = walletPositions.filter(p => p.totalPnl > 0).length;
      perf.winRate = walletPositions.length > 0 ? (wins / walletPositions.length) * 100 : 0;
      
      // Avg holding time
      const holdingTimes = walletPositions
        .filter(p => p.lastSellTime)
        .map(p => p.lastSellTime! - p.firstBuyTime);
      perf.avgHoldingTime = holdingTimes.length > 0 
        ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
        : 0;
      
      // Avg prices (safe division)
      perf.avgEntryPrice = walletPositions.length > 0
        ? walletPositions.reduce((sum, p) => sum + (p.avgBuyPrice || 0), 0) / walletPositions.length
        : 0;
      const withSells = walletPositions.filter(p => p.avgSellPrice);
      perf.avgExitPrice = withSells.length > 0
        ? withSells.reduce((sum, p) => sum + (p.avgSellPrice || 0), 0) / withSells.length
        : 0;
      
      // Handle edge cases
      if (perf.bestTrade === -Infinity) perf.bestTrade = 0;
      if (perf.worstTrade === Infinity) perf.worstTrade = 0;
    }

    return Array.from(leaderboard.values())
      .sort((a, b) => b.totalPnl - a.totalPnl);
  }

  /**
   * Get token leaderboard with comprehensive metrics
   */
  getTokenLeaderboard(): TokenPerformance[] {
    const leaderboard: Map<string, TokenPerformance> = new Map();
    
    // Return empty array if no positions
    if (this.positions.size === 0) {
      return [];
    }

    for (const position of this.positions.values()) {
      if (!leaderboard.has(position.tokenMint)) {
        leaderboard.set(position.tokenMint, {
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol || undefined,
          tokenName: position.tokenName || undefined,
          tokenLogo: position.tokenLogo || undefined,
          holders: 0,
          totalBuys: 0,
          totalSells: 0,
          totalVolumeTokens: 0,
          totalVolumeSol: 0,
          avgBuyPrice: 0,
          avgSellPrice: 0,
          currentPrice: position.currentPrice || 0,
          currentPriceUsd: position.currentPriceUsd || undefined,
          marketCapUsd: position.marketCapUsd || undefined,
          marketCapSol: position.marketCapSol || undefined,
          bestPerformer: '',
          bestPerformance: -Infinity,
          worstPerformer: '',
          worstPerformance: Infinity,
          avgHoldingTime: 0
        });
      }

      const perf = leaderboard.get(position.tokenMint)!;
      perf.holders++;
      perf.totalBuys += position.buyCount;
      perf.totalSells += position.sellCount;
      perf.totalVolumeTokens += position.totalTokensBought;
      perf.totalVolumeSol += position.totalSolSpent || 0;

      // Update best/worst performers (with NaN check)
      const posPerf = position.totalPnlPercent || 0;
      if (posPerf > perf.bestPerformance) {
        perf.bestPerformance = posPerf;
        perf.bestPerformer = position.walletAddress;
      }
      if (posPerf < perf.worstPerformance) {
        perf.worstPerformance = posPerf;
        perf.worstPerformer = position.walletAddress;
      }
    }

    // Calculate aggregates
    for (const [tokenMint, perf] of leaderboard) {
      const tokenPositions = Array.from(this.positions.values())
        .filter(p => p.tokenMint === tokenMint);
      
      // Avg prices (safe division)
      perf.avgBuyPrice = tokenPositions.length > 0
        ? tokenPositions.reduce((sum, p) => sum + (p.avgBuyPrice || 0), 0) / tokenPositions.length
        : 0;
      const withSells = tokenPositions.filter(p => p.avgSellPrice);
      perf.avgSellPrice = withSells.length > 0
        ? withSells.reduce((sum, p) => sum + (p.avgSellPrice || 0), 0) / withSells.length
        : 0;
      
      // Avg holding time
      const holdingTimes = tokenPositions
        .filter(p => p.lastSellTime)
        .map(p => p.lastSellTime! - p.firstBuyTime);
      perf.avgHoldingTime = holdingTimes.length > 0
        ? holdingTimes.reduce((a, b) => a + b, 0) / holdingTimes.length
        : 0;
      
      // Use most recent price and market cap
      const recent = tokenPositions
        .sort((a, b) => b.lastUpdate - a.lastUpdate)[0];
      if (recent) {
        perf.currentPrice = recent.currentPrice;
        perf.currentPriceUsd = recent.currentPriceUsd;
        perf.marketCapUsd = recent.marketCapUsd;
        perf.marketCapSol = recent.marketCapSol;
      }
      
      // Handle edge cases
      if (perf.bestPerformance === -Infinity) perf.bestPerformance = 0;
      if (perf.worstPerformance === Infinity) perf.worstPerformance = 0;
    }

    return Array.from(leaderboard.values())
      .sort((a, b) => b.bestPerformance - a.bestPerformance);
  }

  /**
   * Get combined leaderboards
   */
  getLeaderboards() {
    return {
      wallets: this.getWalletLeaderboard(),
      tokens: this.getTokenLeaderboard()
    };
  }

  /**
   * Sanitize position for frontend (convert all undefined to 0 or appropriate defaults)
   */
  private sanitizePosition(position: TrackedPosition): any {
    return {
      ...position,
      tokenSymbol: position.tokenSymbol || '',
      tokenName: position.tokenName || '',
      tokenLogo: position.tokenLogo || '',
      totalSupply: position.totalSupply || 0,
      firstSellTime: position.firstSellTime || 0,
      lastSellTime: position.lastSellTime || 0,
      avgSellPrice: position.avgSellPrice || 0,
      currentPriceUsd: position.currentPriceUsd || 0,
      marketCapUsd: position.marketCapUsd || 0,
      marketCapSol: position.marketCapSol || 0,
      highUsd: position.highUsd || 0,
      lowUsd: position.lowUsd || 0,
      highUsdTime: position.highUsdTime || 0,
      lowUsdTime: position.lowUsdTime || 0,
      // Trade counts
      buyCount: position.buyCount || 0,
      sellCount: position.sellCount || 0,
      // Entry fields - always defined in creation
      entryPrice: position.avgBuyPrice || 0,
      solSpent: position.totalSolSpent || 0,
      tokensBought: position.totalTokensBought || 0,
      // Exit fields
      exitPrice: position.avgSellPrice || 0,
      exitTime: position.lastSellTime || 0,
      exitTx: position.trades.filter(t => t.type === 'sell').pop()?.tx || '',
      entryTx: position.trades[0]?.tx || '',
      entryTime: position.firstBuyTime || 0
    };
  }

  /**
   * Get tracker statistics
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalPositions: this.positions.size,
      activePositions: Array.from(this.positions.values()).filter(p => p.isActive).length,
      closedPositions: Array.from(this.positions.values()).filter(p => !p.isActive).length,
      monitoredTokens: this.tokenPositions.size, // All unique tokens with positions (batch monitored)
      trackedWallets: this.walletPositions.size
    };
  }

  /**
   * Clear all data (for refresh) - public version
   */
  clearAllData(): void {
    this.clear();
  }

  /**
   * Clear all data (for refresh) - internal
   */
  private clear(): void {
    this.positions.clear();
    this.walletPositions.clear();
    this.tokenPositions.clear();
    
    // Stop batch price monitor if running
    if (this.batchPriceMonitor) {
      clearInterval(this.batchPriceMonitor);
      this.batchPriceMonitor = null;
    }

    this.emit('cleared');
  }
}

// Singleton instance
let smartMoneyTrackerInstance: SmartMoneyTracker | null = null;

/**
 * Get the singleton instance of SmartMoneyTracker
 */
export function getSmartMoneyTracker(): SmartMoneyTracker {
  if (!smartMoneyTrackerInstance) {
    // Use private RPC endpoint
    const rpcUrl = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
    smartMoneyTrackerInstance = new SmartMoneyTracker(rpcUrl);
  }
  return smartMoneyTrackerInstance;
}
