/**
 * Smart Money Tracker - Monitors large Pumpfun buys and tracks their performance
 * In-memory only, no database persistence
 */

import { PublicKey } from '@solana/web3.js';
import EventEmitter from 'events';
import fetch from 'cross-fetch';
import { getWebSocketServer } from './WebSocketService.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { globalRPCServerRotator } from './RPCServerRotator.js';

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
  totalSupply?: number;
  
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
  currentPrice: number; // in SOL
  currentPriceUsd?: number; // in USD
  marketCapUsd?: number; // total supply * price USD
  marketCapSol?: number; // total supply * price SOL
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
  tokenLogo?: string;
  holders: number;
  totalVolume: number;
  avgEntryPrice: number;
  currentPrice: number;
  bestPerformer: string; // Wallet address with best %
  bestPerformance: number; // % gain
}

export class SmartMoneyTracker extends EventEmitter {
  private connection: ProxiedSolanaConnection;
  private isRunning: boolean = false;
  private useRpcRotation: boolean = true; // Enable RPC rotation by default
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
  private batchPriceMonitor: NodeJS.Timeout | null = null; // Single batch monitor for all tokens
  private lastProcessedSlot: number = 0;
  
  // WebSocket
  private wsService = getWebSocketServer();

  constructor(connection: ProxiedSolanaConnection) {
    super();
    this.connection = connection;
    
    // Apply initial RPC rotation setting
    if (this.useRpcRotation) {
      globalRPCServerRotator.enable();
    } else {
      globalRPCServerRotator.disable();
    }
    
    console.log(`🎯 [SmartMoneyTracker] Initialized with ${this.useRpcRotation ? 'RPC rotation ENABLED' : 'RPC rotation DISABLED'}`);
  }

  /**
   * Update configuration
   */
  updateConfig(config: {
    minTokenThreshold?: number;
    pollIntervalMs?: number;
    priceUpdateIntervalMs?: number;
    useRpcRotation?: boolean;
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
    if (config.useRpcRotation !== undefined) {
      this.useRpcRotation = config.useRpcRotation;
      
      // Apply RPC rotation setting immediately
      if (this.useRpcRotation) {
        globalRPCServerRotator.enable();
        console.log(`✅ [SmartMoneyTracker] RPC rotation ENABLED - Using 20 RPC server pool`);
      } else {
        globalRPCServerRotator.disable();
        console.log(`⛔ [SmartMoneyTracker] RPC rotation DISABLED - Using direct connection to single RPC`);
      }
      
      console.log(`🔄 [SmartMoneyTracker] RPC rotator state confirmed: ${globalRPCServerRotator.isEnabled() ? 'ENABLED' : 'DISABLED'}`);
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
      useRpcRotation: this.useRpcRotation,
      isRunning: this.isRunning,
      // Also include actual RPC rotator state for verification
      rpcRotatorEnabled: globalRPCServerRotator.isEnabled()
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
    
    // Get current slot
    this.lastProcessedSlot = await this.connection.withProxy(conn => conn.getSlot('confirmed'));
    
    // Start polling for new transactions
    this.pollingInterval = setInterval(() => {
      this.pollTransactions().catch(console.error);
    }, this.pollIntervalMs);

    // Start batch price monitoring for all active tokens
    this.startBatchPriceMonitoring();

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

    // Stop batch price monitor
    if (this.batchPriceMonitor) {
      clearInterval(this.batchPriceMonitor);
      this.batchPriceMonitor = null;
    }

    this.emit('stopped');
  }

  /**
   * Poll for new Pumpfun transactions
   */
  private async pollTransactions(): Promise<void> {
    try {
      console.log('🔍 [SmartMoneyTracker] Polling for new transactions...');
      const currentSlot = await this.connection.withProxy(conn => conn.getSlot('confirmed'));
      
      if (currentSlot <= this.lastProcessedSlot) {
        return; // No new slots
      }

      // Get signatures for Pumpfun program
      const signatures = await this.connection.withProxy(conn => 
        conn.getSignaturesForAddress(
          PUMPFUN_PROGRAM_ID,
          { limit: 100 },
          'confirmed'
        )
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
      const tx = await this.connection.withProxy(conn => 
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

    // Extract token metadata directly from transaction accounts
    this.extractTokenMetadataFromTransaction(tx, tokenMint).then(metadata => {
      if (metadata && position) {
        position.tokenSymbol = metadata.symbol || undefined;
        position.tokenName = metadata.name || undefined;
        position.tokenLogo = metadata.logo || undefined;
        console.log(`📦 [SmartMoneyTracker] Extracted metadata for ${tokenMint.slice(0, 8)}: ${metadata.symbol || 'Unknown'}`);
      } else {
        // Fallback to Jupiter API
        this.fetchTokenMetadata(tokenMint).then(jupMeta => {
          if (jupMeta && position) {
            position.tokenSymbol = jupMeta.symbol;
            position.tokenName = jupMeta.name;
            position.tokenLogo = jupMeta.logo;
            console.log(`📦 [SmartMoneyTracker] Fallback Jupiter metadata for ${tokenMint.slice(0, 8)}: ${jupMeta.symbol || 'Unknown'}`);
          }
        }).catch(() => {});
      }
    }).catch(() => {
      // Try Jupiter fallback
      this.fetchTokenMetadata(tokenMint).then(jupMeta => {
        if (jupMeta && position) {
          position.tokenSymbol = jupMeta.symbol;
          position.tokenName = jupMeta.name;
          position.tokenLogo = jupMeta.logo;
        }
      }).catch(() => {});
    });

    // NOTE: Price monitoring is now handled by batch monitoring (startBatchPriceMonitoring)
    // Individual per-token monitoring is no longer used

    console.log(`🎯 New position detected: ${walletAddress.slice(0, 8)} bought ${tokensBought.toLocaleString()} ${position.tokenSymbol || tokenMint.slice(0, 8)} for ${solSpent.toFixed(4)} SOL`);

    this.emit('positionOpened', position);
    
    // Broadcast to WebSocket
    this.wsService.broadcast('smartMoney:positionOpened', {
      position,
      stats: this.getStatus()
    });
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
      
      // Broadcast to WebSocket
      this.wsService.broadcast('smartMoney:positionClosed', {
        position,
        stats: this.getStatus()
      });
    }
  }

  // Legacy per-token price monitoring removed - now using efficient batch monitoring via startBatchPriceMonitoring()

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

          // Update high/low
          if (prices.priceInSol > position.high) {
            position.high = prices.priceInSol;
            position.highTime = Date.now();
          }
          if (prices.priceInSol < position.low) {
            position.low = prices.priceInSol;
            position.lowTime = Date.now();
          }

          // Calculate unrealized P&L
          const currentValue = position.tokensBought * prices.priceInSol;
          position.unrealizedPnl = currentValue - position.solSpent;
          position.unrealizedPnlPercent = (position.unrealizedPnl / position.solSpent) * 100;

          // Emit update if price changed significantly (>1%)
          if (previousPrice && Math.abs((prices.priceInSol - previousPrice) / previousPrice) > 0.01) {
            this.emit('priceUpdate', position);
            
            // Broadcast to WebSocket (throttled by >1% change)
            this.wsService.broadcast('smartMoney:priceUpdate', {
              position,
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
   * Returns both SOL and USD prices
   */
  private async batchFetchPricesFromJupiter(tokenMints: string[]): Promise<Map<string, { priceInSol: number; priceInUsd: number }>> {
    const results = new Map<string, { priceInSol: number; priceInUsd: number }>();
    
    if (tokenMints.length === 0) return results;

    try {
      const SOL_MINT = 'So11111111111111111111111111111111111111112';
      const PRICE_API_URL = 'https://price.jup.ag/v3/price';

      // Batch fetch prices (Jupiter supports comma-separated IDs)
      const idsParam = tokenMints.join(',');
      
      // Get prices in USD
      const usdResponse = await fetch(`${PRICE_API_URL}?ids=${idsParam}`);
      if (!usdResponse.ok) {
        console.error(`❌ [Jupiter Price API] HTTP ${usdResponse.status} for batch USD prices`);
        if (usdResponse.status === 429) {
          console.error(`⚠️  [Jupiter Price API] RATE LIMITED - Status 429`);
        }
        return results;
      }

      const usdData = await usdResponse.json();

      // Get prices in SOL
      const solResponse = await fetch(`${PRICE_API_URL}?ids=${idsParam}&vsToken=${SOL_MINT}`);
      if (!solResponse.ok) {
        console.error(`❌ [Jupiter Price API] HTTP ${solResponse.status} for batch SOL prices`);
        return results;
      }

      const solData = await solResponse.json();

      // Parse results
      for (const tokenMint of tokenMints) {
        const usdPrice = usdData.data?.[tokenMint]?.price;
        const solPrice = solData.data?.[tokenMint]?.price;

        if (typeof solPrice === 'number' && typeof usdPrice === 'number') {
          results.set(tokenMint, {
            priceInSol: solPrice,
            priceInUsd: usdPrice
          });
        }
      }

      console.log(`📊 [Jupiter Price API] Fetched ${results.size}/${tokenMints.length} token prices in batch`);
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
      
      // Get mint account info
      const mintInfo = await this.connection.withProxy(conn => 
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

      const metadataAccount = await this.connection.withProxy(conn =>
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
          tokenLogo: position.tokenLogo,
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
   * Get combined leaderboards
   */
  getLeaderboards() {
    return {
      wallets: this.getWalletLeaderboard(),
      tokens: this.getTokenLeaderboard()
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
    // Use private RPC endpoint with rotation enabled
    const rpcUrl = process.env.RPC_URL || 'https://tritono-main-e861.mainnet.rpcpool.com/00d87746-cade-4061-b5cf-5e4fc1deab03';
    const connection = new ProxiedSolanaConnection(
      rpcUrl,
      { commitment: 'confirmed' },
      undefined, // No proxy file
      'SmartMoneyTracker'
    );
    smartMoneyTrackerInstance = new SmartMoneyTracker(connection);
  }
  return smartMoneyTrackerInstance;
}
