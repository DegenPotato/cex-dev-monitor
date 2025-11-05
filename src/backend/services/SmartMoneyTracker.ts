/**
 * Smart Money Tracker - Monitors large Pumpfun buys and tracks their performance
 * In-memory only, no database persistence
 */

import { Connection, PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';
import fetch from 'cross-fetch';

const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');

// Known buy discriminators
const BUY_DISCRIMINATORS = ['0094d0da1f435eb0', 'e6345c8dd8b14540'];
const SELL_DISCRIMINATORS = ['33e685a4017f83ad'];

interface TrackedPosition {
  id: string;
  walletAddress: string;
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  tokenLogo?: string;
  
  // Entry details
  entryTx: string;
  entryTime: number;
  entryPrice: number; // SOL per token
  tokensBought: number;
  solSpent: number;
  
  // Exit details (if sold)
  exitTx?: string;
  exitTime?: number;
  exitPrice?: number;
  tokensSold?: number;
  solReceived?: number;
  
  // Performance tracking
  currentPrice: number;
  high: number;
  low: number;
  highTime: number;
  lowTime: number;
  lastUpdate: number;
  
  // Calculated metrics
  unrealizedPnl: number;
  unrealizedPnlPercent: number;
  realizedPnl?: number;
  realizedPnlPercent?: number;
  
  isActive: boolean;
}

interface WalletPerformance {
  walletAddress: string;
  positions: number;
  activePositions: number;
  closedPositions: number;
  totalInvested: number;
  totalRealizedPnl: number;
  totalUnrealizedPnl: number;
  winRate: number;
  bestTrade: number; // Highest % gain
  worstTrade: number; // Worst % loss
}

interface TokenPerformance {
  tokenMint: string;
  tokenSymbol?: string;
  tokenName?: string;
  holders: number;
  totalVolume: number;
  avgEntryPrice: number;
  currentPrice: number;
  bestPerformer: string; // Wallet address with best %
  bestPerformance: number; // % gain
}

export class SmartMoneyTracker extends EventEmitter {
  private connection: Connection;
  private isRunning: boolean = false;
  private pollingInterval: NodeJS.Timeout | null = null;
  
  // In-memory storage
  private positions: Map<string, TrackedPosition> = new Map(); // positionId -> position
  private walletPositions: Map<string, Set<string>> = new Map(); // walletAddress -> Set<positionId>
  private tokenPositions: Map<string, Set<string>> = new Map(); // tokenMint -> Set<positionId>
  
  // Configuration
  private minTokenThreshold: number = 5_000_000; // 5M tokens minimum
  private pollIntervalMs: number = 5000; // Check for new transactions every 5s
  private priceUpdateIntervalMs: number = 1500; // Update prices every 1.5s (matches Manual test: 1-2s)
  
  // Price monitoring
  private priceMonitors: Map<string, NodeJS.Timeout> = new Map(); // tokenMint -> interval
  private lastProcessedSlot: number = 0;

  constructor(connection: Connection) {
    super();
    this.connection = connection;
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
    
    // Get current slot
    this.lastProcessedSlot = await this.connection.getSlot('confirmed');
    
    // Start polling for new transactions
    this.pollingInterval = setInterval(() => {
      this.pollTransactions().catch(console.error);
    }, this.pollIntervalMs);

    this.emit('started');
  }

  /**
   * Stop monitoring
   */
  stop(): void {
    if (!this.isRunning) return;

    console.log('🛑 Stopping Smart Money Tracker...');
    this.isRunning = false;

    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }

    // Stop all price monitors
    for (const [, interval] of this.priceMonitors) {
      clearInterval(interval);
    }
    this.priceMonitors.clear();

    this.emit('stopped');
  }

  /**
   * Poll for new Pumpfun transactions
   */
  private async pollTransactions(): Promise<void> {
    try {
      const currentSlot = await this.connection.getSlot('confirmed');
      
      if (currentSlot <= this.lastProcessedSlot) {
        return; // No new slots
      }

      // Get signatures for Pumpfun program
      const signatures = await this.connection.getSignaturesForAddress(
        PUMPFUN_PROGRAM_ID,
        { limit: 100 },
        'confirmed'
      );

      // Process each signature
      for (const sig of signatures) {
        if (sig.slot && sig.slot <= this.lastProcessedSlot) {
          continue; // Already processed
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
      const tx = await this.connection.getTransaction(signature, {
        commitment: 'confirmed',
        maxSupportedTransactionVersion: 0
      });

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

      const walletAddress = accountKeys[0].toBase58(); // Fee payer

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
            await this.handleBuy(signature, walletAddress, tokenMint, tx);
          } else if (isSell) {
            await this.handleSell(signature, walletAddress, tokenMint, tx);
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
    walletAddress: string,
    tokenMint: string,
    tx: any
  ): Promise<void> {
    // Extract token balance change
    if (!tx.meta?.postTokenBalances || !tx.meta?.preTokenBalances) return;

    let tokensBought = 0;
    let decimals = 6;

    for (const post of tx.meta.postTokenBalances) {
      if (post.mint === tokenMint) {
        const pre = tx.meta.preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
        const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
        const postAmount = BigInt(post.uiTokenAmount.amount);
        const change = postAmount - preAmount;

        if (change > 0n) {
          decimals = post.uiTokenAmount.decimals;
          tokensBought = Number(change) / Math.pow(10, decimals);
          break;
        }
      }
    }

    // Check if meets minimum threshold
    if (tokensBought < this.minTokenThreshold) {
      return; // Too small, ignore
    }

    // Calculate SOL spent
    let solSpent = 0;
    if (tx.meta?.preBalances && tx.meta?.postBalances) {
      const change = tx.meta.preBalances[0] - tx.meta.postBalances[0];
      solSpent = change / 1e9;
    }

    if (solSpent <= 0) return;

    // Calculate entry price
    const entryPrice = solSpent / tokensBought;

    // Create position
    const positionId = `${walletAddress}-${tokenMint}-${Date.now()}`;
    const position: TrackedPosition = {
      id: positionId,
      walletAddress,
      tokenMint,
      entryTx: signature,
      entryTime: tx.blockTime! * 1000,
      entryPrice,
      tokensBought,
      solSpent,
      currentPrice: entryPrice,
      high: entryPrice,
      low: entryPrice,
      highTime: tx.blockTime! * 1000,
      lowTime: tx.blockTime! * 1000,
      lastUpdate: Date.now(),
      unrealizedPnl: 0,
      unrealizedPnlPercent: 0,
      isActive: true
    };

    // Store position
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

    // Start price monitoring for this token if not already started
    if (!this.priceMonitors.has(tokenMint)) {
      this.startPriceMonitor(tokenMint);
    }

    console.log(`🎯 New position detected: ${walletAddress.slice(0, 8)} bought ${tokensBought.toLocaleString()} ${tokenMint.slice(0, 8)} for ${solSpent.toFixed(4)} SOL`);

    this.emit('positionOpened', position);
  }

  /**
   * Handle a sell transaction
   */
  private async handleSell(
    signature: string,
    walletAddress: string,
    tokenMint: string,
    tx: any
  ): Promise<void> {
    // Find active positions for this wallet and token
    const walletPositionIds = this.walletPositions.get(walletAddress);
    if (!walletPositionIds) return;

    for (const positionId of walletPositionIds) {
      const position = this.positions.get(positionId);
      if (!position || !position.isActive || position.tokenMint !== tokenMint) continue;

      // Extract tokens sold and SOL received
      let tokensSold = 0;
      let solReceived = 0;

      if (tx.meta?.postTokenBalances && tx.meta?.preTokenBalances) {
        for (const post of tx.meta.postTokenBalances) {
          if (post.mint === tokenMint) {
            const pre = tx.meta.preTokenBalances.find((p: any) => p.accountIndex === post.accountIndex);
            const preAmount = pre ? BigInt(pre.uiTokenAmount.amount) : 0n;
            const postAmount = BigInt(post.uiTokenAmount.amount);
            const change = preAmount - postAmount;

            if (change > 0n) {
              tokensSold = Number(change) / Math.pow(10, post.uiTokenAmount.decimals);
              break;
            }
          }
        }
      }

      if (tx.meta?.postBalances && tx.meta?.preBalances) {
        const change = tx.meta.postBalances[0] - tx.meta.preBalances[0];
        solReceived = change / 1e9;
      }

      if (tokensSold <= 0 || solReceived <= 0) continue;

      // Close position
      const exitPrice = solReceived / tokensSold;
      position.exitTx = signature;
      position.exitTime = tx.blockTime! * 1000;
      position.exitPrice = exitPrice;
      position.tokensSold = tokensSold;
      position.solReceived = solReceived;
      position.realizedPnl = solReceived - position.solSpent;
      position.realizedPnlPercent = (position.realizedPnl / position.solSpent) * 100;
      position.isActive = false;

      console.log(`💰 Position closed: ${walletAddress.slice(0, 8)} sold ${tokenMint.slice(0, 8)} for ${position.realizedPnlPercent.toFixed(2)}% profit`);

      this.emit('positionClosed', position);
    }
  }

  /**
   * Start monitoring price for a token using Jupiter
   */
  private startPriceMonitor(tokenMint: string): void {
    const interval = setInterval(async () => {
      try {
        // Check if any active positions for this token
        const tokenPositionIds = this.tokenPositions.get(tokenMint);
        if (!tokenPositionIds || tokenPositionIds.size === 0) {
          clearInterval(interval);
          this.priceMonitors.delete(tokenMint);
          return;
        }

        const hasActivePosition = Array.from(tokenPositionIds).some(id => {
          const pos = this.positions.get(id);
          return pos && pos.isActive;
        });

        if (!hasActivePosition) {
          clearInterval(interval);
          this.priceMonitors.delete(tokenMint);
          return;
        }

        // Fetch current price from Jupiter
        const currentPrice = await this.fetchTokenPriceFromJupiter(tokenMint);
        if (!currentPrice) return;

        // Update all active positions for this token
        for (const positionId of tokenPositionIds) {
          const position = this.positions.get(positionId);
          if (!position || !position.isActive) continue;

          const previousPrice = position.currentPrice;
          position.currentPrice = currentPrice;
          position.lastUpdate = Date.now();

          // Update high/low
          if (currentPrice > position.high) {
            position.high = currentPrice;
            position.highTime = Date.now();
          }
          if (currentPrice < position.low) {
            position.low = currentPrice;
            position.lowTime = Date.now();
          }

          // Calculate unrealized P&L
          const currentValue = position.tokensBought * currentPrice;
          position.unrealizedPnl = currentValue - position.solSpent;
          position.unrealizedPnlPercent = (position.unrealizedPnl / position.solSpent) * 100;

          // Emit update if price changed significantly (>1%)
          if (Math.abs((currentPrice - previousPrice) / previousPrice) > 0.01) {
            this.emit('priceUpdate', position);
          }
        }
      } catch (error) {
        console.error(`Error monitoring price for ${tokenMint}:`, error);
      }
    }, this.priceUpdateIntervalMs);

    this.priceMonitors.set(tokenMint, interval);
  }

  /**
   * Fetch current price for a token from Jupiter Price API v3
   * Correct method using Price API (not swap API)
   */
  private async fetchTokenPriceFromJupiter(tokenMint: string): Promise<number | null> {
    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const PRICE_API_URL = 'https://price.jup.ag/v3/price';

      // Get price for token in terms of SOL
      const response = await fetch(
        `${PRICE_API_URL}?ids=${tokenMint}&vsToken=${SOL_MINT}`
      );

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      
      // Response format: { data: { [tokenMint]: { id: string, mintSymbol: string, vsToken: string, vsTokenSymbol: string, price: number } } }
      const tokenData = data.data?.[tokenMint];
      if (!tokenData || typeof tokenData.price !== 'number') {
        return null;
      }
      
      return tokenData.price; // Already in SOL
    } catch (error) {
      return null;
    }
  }

  /**
   * Get all positions
   */
  getPositions(): TrackedPosition[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get active positions only
   */
  getActivePositions(): TrackedPosition[] {
    return Array.from(this.positions.values()).filter(p => p.isActive);
  }

  /**
   * Get wallet leaderboard
   */
  getWalletLeaderboard(): WalletPerformance[] {
    const leaderboard: Map<string, WalletPerformance> = new Map();

    for (const position of this.positions.values()) {
      if (!leaderboard.has(position.walletAddress)) {
        leaderboard.set(position.walletAddress, {
          walletAddress: position.walletAddress,
          positions: 0,
          activePositions: 0,
          closedPositions: 0,
          totalInvested: 0,
          totalRealizedPnl: 0,
          totalUnrealizedPnl: 0,
          winRate: 0,
          bestTrade: 0,
          worstTrade: 0
        });
      }

      const perf = leaderboard.get(position.walletAddress)!;
      perf.positions++;
      perf.totalInvested += position.solSpent;

      if (position.isActive) {
        perf.activePositions++;
        perf.totalUnrealizedPnl += position.unrealizedPnl;
        perf.bestTrade = Math.max(perf.bestTrade, position.unrealizedPnlPercent);
      } else {
        perf.closedPositions++;
        perf.totalRealizedPnl += position.realizedPnl || 0;
        perf.bestTrade = Math.max(perf.bestTrade, position.realizedPnlPercent || 0);
        perf.worstTrade = Math.min(perf.worstTrade, position.realizedPnlPercent || 0);
      }
    }

    // Calculate win rates
    for (const perf of leaderboard.values()) {
      if (perf.closedPositions > 0) {
        const wins = Array.from(this.positions.values()).filter(
          p => p.walletAddress === perf.walletAddress && 
               !p.isActive && 
               (p.realizedPnlPercent || 0) > 0
        ).length;
        perf.winRate = (wins / perf.closedPositions) * 100;
      }
    }

    return Array.from(leaderboard.values())
      .sort((a, b) => (b.totalRealizedPnl + b.totalUnrealizedPnl) - (a.totalRealizedPnl + a.totalUnrealizedPnl));
  }

  /**
   * Get token leaderboard
   */
  getTokenLeaderboard(): TokenPerformance[] {
    const leaderboard: Map<string, TokenPerformance> = new Map();

    for (const position of this.positions.values()) {
      if (!leaderboard.has(position.tokenMint)) {
        leaderboard.set(position.tokenMint, {
          tokenMint: position.tokenMint,
          tokenSymbol: position.tokenSymbol,
          tokenName: position.tokenName,
          holders: 0,
          totalVolume: 0,
          avgEntryPrice: 0,
          currentPrice: position.currentPrice,
          bestPerformer: '',
          bestPerformance: 0
        });
      }

      const perf = leaderboard.get(position.tokenMint)!;
      perf.holders++;
      perf.totalVolume += position.solSpent;

      // Update best performer
      const posPerf = position.isActive ? position.unrealizedPnlPercent : (position.realizedPnlPercent || 0);
      if (posPerf > perf.bestPerformance) {
        perf.bestPerformance = posPerf;
        perf.bestPerformer = position.walletAddress;
      }
    }

    // Calculate average entry prices
    for (const [tokenMint, perf] of leaderboard) {
      const positions = Array.from(this.positions.values()).filter(p => p.tokenMint === tokenMint);
      perf.avgEntryPrice = positions.reduce((sum, p) => sum + p.entryPrice, 0) / positions.length;
    }

    return Array.from(leaderboard.values())
      .sort((a, b) => b.bestPerformance - a.bestPerformance);
  }

  /**
   * Get tracker status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      totalPositions: this.positions.size,
      activePositions: Array.from(this.positions.values()).filter(p => p.isActive).length,
      closedPositions: Array.from(this.positions.values()).filter(p => !p.isActive).length,
      monitoredTokens: this.priceMonitors.size,
      trackedWallets: this.walletPositions.size
    };
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
    
    for (const [, interval] of this.priceMonitors) {
      clearInterval(interval);
    }
    this.priceMonitors.clear();

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
    // Use RPC URL from environment or default
    const rpcUrl = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
    const connection = new Connection(rpcUrl, 'confirmed');
    smartMoneyTrackerInstance = new SmartMoneyTracker(connection);
  }
  return smartMoneyTrackerInstance;
}
