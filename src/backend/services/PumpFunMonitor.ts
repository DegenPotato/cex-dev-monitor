import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { MonitoredWalletProvider } from '../providers/MonitoredWalletProvider.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { WalletRateLimiter } from './WalletRateLimiter.js';
import { EventEmitter } from 'events';

// Pump.fun program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export class PumpFunMonitor extends EventEmitter {
  private proxiedConnection: ProxiedSolanaConnection;
  private activeSubscriptions: Map<string, number> = new Map();
  private isBackfilling: Map<string, boolean> = new Map();
  private rateLimiters: Map<string, WalletRateLimiter> = new Map();

  constructor() {
    super();
    // Proxied connection for unlimited pump.fun monitoring (10,000 proxies!)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'PumpFunMonitor'
    );
    
    console.log(`🎯 [PumpFunMonitor] Proxy mode: ${this.proxiedConnection.isProxyEnabled() ? 'ENABLED ✅' : 'DISABLED'}`);
    console.log(`🎛️  [PumpFunMonitor] Using Global Concurrency Limiter for request pacing`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async startMonitoringWallet(walletAddress: string): Promise<void> {
    if (this.activeSubscriptions.has(walletAddress)) {
      console.log(`⚠️  Already monitoring pump.fun for ${walletAddress.slice(0, 8)}...`);
      return;
    }

    console.log(`🎯 [PumpFun] Starting monitoring for ${walletAddress.slice(0, 8)}...`);

    // Check if wallet needs historical backfill
    const wallet = await MonitoredWalletProvider.findByAddress(walletAddress);
    
    if (!wallet) {
      console.error(`❌ Wallet not found: ${walletAddress}`);
      return;
    }

    // Initialize rate limiter for this wallet
    const rps = wallet.rate_limit_rps || 1; // Default: 1 request per second
    const enabled = wallet.rate_limit_enabled !== 0; // Default: enabled
    const rateLimiter = new WalletRateLimiter(walletAddress, rps, enabled);
    this.rateLimiters.set(walletAddress, rateLimiter);

    console.log(`🎚️  [RateLimit] Initialized for ${walletAddress.slice(0, 8)}... at ${rps} RPS (${enabled ? 'enabled' : 'disabled'})`);
    
    if (!wallet.dev_checked) {
      // Step 1: Historical backfill (fetch ALL past transactions)
      console.log(`📚 [Backfill] Fetching historical data for ${walletAddress.slice(0, 8)}...`);
      await this.backfillWalletHistory(walletAddress);
    } else {
      console.log(`✅ [Backfill] Wallet ${walletAddress.slice(0, 8)}... already backfilled`);
    }

    // Step 2: Start real-time monitoring (websocket subscription)
    await this.startRealtimeMonitoring(walletAddress);
  }

  async stopMonitoringWallet(walletAddress: string): Promise<void> {
    const subscriptionId = this.activeSubscriptions.get(walletAddress);
    if (subscriptionId !== undefined) {
      await this.proxiedConnection.withProxy(async conn => {
        await conn.removeAccountChangeListener(subscriptionId);
      });
      this.activeSubscriptions.delete(walletAddress);
      console.log(`⛔ [PumpFun] Stopped monitoring ${walletAddress.slice(0, 8)}...`);
    }
  }

  /**
   * Step 1: Historical Backfill
   * Fetches ALL past transactions and extracts Pumpfun mints
   */
  private async backfillWalletHistory(walletAddress: string): Promise<void> {
    this.isBackfilling.set(walletAddress, true);
    const rateLimiter = this.rateLimiters.get(walletAddress);
    
    try {
      const publicKey = new PublicKey(walletAddress);
      let totalProcessed = 0;
      let mintsFound = 0;
      let lastSignature: string | undefined;
      let hasMore = true;

      console.log(`📚 [Backfill] Starting full historical scan for ${walletAddress.slice(0, 8)}...`);

      while (hasMore) {
        // Fetch signatures in batches of 1000 (Solana max) - rate limited
        const signatures = rateLimiter 
          ? await rateLimiter.execute(() => 
              this.proxiedConnection.withProxy(conn =>
                conn.getSignaturesForAddress(publicKey, {
                  limit: 1000,
                  before: lastSignature
                })
              )
            )
          : await this.proxiedConnection.withProxy(conn =>
              conn.getSignaturesForAddress(publicKey, {
                limit: 1000,
                before: lastSignature
              })
            );

        if (signatures.length === 0) {
          hasMore = false;
          break;
        }

        console.log(`📚 [Backfill] Processing batch of ${signatures.length} transactions...`);

        // Process each transaction - rate limited
        for (const sigInfo of signatures) {
          const tx = rateLimiter
            ? await rateLimiter.execute(() =>
                this.proxiedConnection.withProxy(conn =>
                  conn.getParsedTransaction(sigInfo.signature, {
                    maxSupportedTransactionVersion: 0
                  })
                )
              )
            : await this.proxiedConnection.withProxy(conn =>
                conn.getParsedTransaction(sigInfo.signature, {
                  maxSupportedTransactionVersion: 0
                })
              );

          if (tx) {
            const foundMint = await this.analyzeTransactionForMint(tx, walletAddress, sigInfo.signature);
            if (foundMint) mintsFound++;
          }
          
          totalProcessed++;
        }

        // Update last signature for pagination
        lastSignature = signatures[signatures.length - 1].signature;

        // Stop if we got less than 1000 (means we reached the end)
        if (signatures.length < 1000) {
          hasMore = false;
        }
      }

      // Mark wallet as backfilled
      await MonitoredWalletProvider.update(walletAddress, {
        dev_checked: 1,
        last_history_check: Date.now()
      });

      console.log(`✅ [Backfill] Complete for ${walletAddress.slice(0, 8)}...`);
      console.log(`   Processed: ${totalProcessed} transactions`);
      console.log(`   Found: ${mintsFound} Pumpfun token mints`);

    } catch (error) {
      console.error(`❌ [Backfill] Error for ${walletAddress.slice(0, 8)}...:`, error);
    } finally {
      this.isBackfilling.set(walletAddress, false);
    }
  }

  /**
   * Step 2: Real-time Monitoring
   * Uses Solana's onLogs subscription for zero-latency updates
   */
  private async startRealtimeMonitoring(walletAddress: string): Promise<void> {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      console.log(`🔴 [Live] Starting real-time monitoring for ${walletAddress.slice(0, 8)}...`);

      // Subscribe to logs mentioning this wallet address
      const subscriptionId = await this.proxiedConnection.withProxy(async conn => {
        return conn.onLogs(
          publicKey,
          async (logs, _context) => {
            // Check if this transaction involves Pumpfun
            const involvesPumpfun = logs.logs.some(log => 
              log.includes('Program ' + PUMPFUN_PROGRAM_ID)
            );

            if (involvesPumpfun) {
              console.log(`🔴 [Live] Pumpfun activity detected for ${walletAddress.slice(0, 8)}...`);
              
              // Fetch and process the full transaction
              const tx = await this.proxiedConnection.withProxy(conn =>
                conn.getParsedTransaction(logs.signature, {
                  maxSupportedTransactionVersion: 0
                })
              );

              if (tx) {
                await this.analyzeTransactionForMint(tx, walletAddress, logs.signature);
              }
            }
          },
          'confirmed'
        );
      });

      this.activeSubscriptions.set(walletAddress, subscriptionId as number);
      console.log(`✅ [Live] Real-time monitoring active for ${walletAddress.slice(0, 8)}...`);

    } catch (error) {
      console.error(`❌ [Live] Failed to start monitoring for ${walletAddress.slice(0, 8)}...:`, error);
    }
  }

  private async analyzeTransactionForMint(
    tx: ParsedTransactionWithMeta,
    walletAddress: string,
    signature: string
  ): Promise<boolean> {
    if (!tx.meta || tx.meta.err) return false;

    // Get the actual blockchain timestamp (launch time)
    const launchTimestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();

    const accountKeys = tx.transaction.message.accountKeys;
    
    // Check if transaction involves pump.fun program
    const involvesPumpFun = accountKeys.some(
      key => key.pubkey.toBase58() === PUMPFUN_PROGRAM_ID
    );

    if (!involvesPumpFun) return false;

    let mintFound = false;

    // Method 1: Check INNER INSTRUCTIONS for mint initialization (THIS IS THE KEY!)
    if (tx.meta.innerInstructions) {
      for (const innerSet of tx.meta.innerInstructions) {
        for (const instruction of innerSet.instructions) {
          if ('parsed' in instruction && instruction.parsed) {
            const parsed = instruction.parsed;
            
            // Check for InitializeMint in inner instructions
            if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
              const mintAddress = parsed.info?.mint;
              
              if (mintAddress) {
                await this.processMintDetection(mintAddress, walletAddress, signature, launchTimestamp);
                mintFound = true;
              }
            }
          }
        }
      }
    }

    // Method 2: Check for new token accounts in post token balances (high supply = creator)
    if (tx.meta.postTokenBalances && tx.meta.postTokenBalances.length > 0) {
      for (const balance of tx.meta.postTokenBalances) {
        // Creator typically has very high token balance (millions)
        if (balance.owner === walletAddress && balance.uiTokenAmount.uiAmount && balance.uiTokenAmount.uiAmount > 1000000) {
          const mintAddress = balance.mint;
          await this.processMintDetection(mintAddress, walletAddress, signature, launchTimestamp);
          mintFound = true;
        }
      }
    }

    return mintFound;
  }

  // Helper method to process mint detection and avoid duplicates
  private async processMintDetection(mintAddress: string, walletAddress: string, signature: string, launchTimestamp: number): Promise<void> {
    // Check if we already recorded this mint
    const existing = await TokenMintProvider.findByMintAddress(mintAddress);
    if (existing) return;

    try {
      // Try to fetch token metadata
      const tokenInfo = await this.fetchTokenMetadata(mintAddress);

      await TokenMintProvider.create({
        mint_address: mintAddress,
        creator_address: walletAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        timestamp: launchTimestamp, // Actual blockchain launch time
        platform: 'pumpfun',
        signature: signature, // Store transaction signature
        metadata: JSON.stringify({
          launchTime: new Date(launchTimestamp).toISOString(),
          ...tokenInfo
        })
      });

      const launchDate = new Date(launchTimestamp).toLocaleString();
      console.log(`🚀 NEW PUMP.FUN TOKEN MINT: ${tokenInfo.symbol || mintAddress.slice(0, 8)}... by ${walletAddress.slice(0, 8)}...`);
      console.log(`   Mint Address: ${mintAddress}`);
      console.log(`   Launch Time: ${launchDate}`);
      console.log(`   Signature: ${signature}`);

      // IMMEDIATELY mark wallet as dev wallet (real-time detection)
      const wallet = await MonitoredWalletProvider.findByAddress(walletAddress);
      if (wallet) {
        const currentTokens = wallet.tokens_deployed || 0;
        await MonitoredWalletProvider.update(walletAddress, {
          is_dev_wallet: 1,
          tokens_deployed: currentTokens + 1,
          dev_checked: 1
        });
        console.log(`🔥 Wallet marked as DEV: ${walletAddress.slice(0, 8)}... (${currentTokens + 1} tokens)`);
        
        // Emit dev wallet event
        this.emit('dev_wallet_found', {
          address: walletAddress,
          tokensDeployed: currentTokens + 1,
          deployments: [{ mintAddress, signature, timestamp: Date.now() }]
        });
      }

      this.emit('token_mint', {
        mintAddress,
        creator: walletAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        timestamp: launchTimestamp, // Actual blockchain launch time
        launchTime: new Date(launchTimestamp).toISOString(),
        signature
      });
    } catch (error: any) {
      if (!error.message?.includes('UNIQUE constraint failed')) {
        console.error('Error saving token mint:', error);
      }
    }
  }

  private async fetchTokenMetadata(_mintAddress: string): Promise<{ name?: string; symbol?: string }> {
    try {
      // In production, you'd fetch metadata from Metaplex or pump.fun API
      // For now, return basic info
      return {
        name: undefined,
        symbol: undefined
      };
    } catch (error) {
      return {};
    }
  }

  async stopAll(): Promise<void> {
    console.log(`⏹️  Stopping all pump.fun monitors...`);
    
    const walletAddresses = Array.from(this.activeSubscriptions.keys());
    
    for (const walletAddress of walletAddresses) {
      await this.stopMonitoringWallet(walletAddress);
      console.log(`  ❌ Stopped monitoring ${walletAddress.slice(0, 8)}...`);
    }
    
    console.log(`✅ All pump.fun monitoring stopped`);
  }

  getActiveMonitors(): string[] {
    return Array.from(this.activeSubscriptions.keys());
  }
}
