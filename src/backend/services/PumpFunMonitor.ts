import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { MonitoredWalletProvider } from '../providers/MonitoredWalletProvider.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { WalletRateLimiter } from './WalletRateLimiter.js';
import { TokenMetadataFetcher } from './TokenMetadataFetcher.js';
import { EventEmitter } from 'events';

// Pump.fun program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export class PumpFunMonitor extends EventEmitter {
  private proxiedConnection: ProxiedSolanaConnection;
  private activeSubscriptions: Map<string, number> = new Map();
  private isBackfilling: Map<string, boolean> = new Map();
  private rateLimiters: Map<string, WalletRateLimiter> = new Map();
  private metadataFetcher: TokenMetadataFetcher;

  constructor() {
    super();
    // Proxied connection for unlimited pump.fun monitoring (10,000 proxies!)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'PumpFunMonitor'
    );
    
    // Initialize metadata fetcher (uses GeckoTerminal API, no blockchain connection needed)
    this.metadataFetcher = new TokenMetadataFetcher();
    
    console.log(`🎯 [PumpFunMonitor] Proxy mode: ${this.proxiedConnection.isProxyEnabled() ? 'ENABLED ✅' : 'DISABLED'}`);
    console.log(`🎛️  [PumpFunMonitor] Using Global Concurrency Limiter for request pacing`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async startMonitoringWallet(walletAddress: string): Promise<void> {
    if (this.activeSubscriptions.has(walletAddress)) {
      console.log(`⚠️  Already monitoring ${walletAddress.slice(0, 8)}...`);
      return;
    }

    console.log(`🚀 [PumpFun] Starting monitoring for ${walletAddress.slice(0, 8)}...`);

    // Get wallet configuration for PumpFun monitoring type
    const wallet = await MonitoredWalletProvider.findByAddress(walletAddress, 'pumpfun');
    
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
    
    // Check if wallet needs backfill or catch-up
    if (!wallet.dev_checked) {
      // First time: Full historical backfill
      console.log(`📚 [Backfill] First-time setup for ${walletAddress.slice(0, 8)}...`);
      await this.backfillWalletHistory(walletAddress);
    } else if (wallet.last_processed_signature) {
      // Already backfilled: Check if we need to catch up
      const needsCatchUp = await this.checkIfCatchUpNeeded(walletAddress, wallet);
      if (needsCatchUp) {
        console.log(`🔄 [Catch-up] Wallet ${walletAddress.slice(0, 8)}... has gap, catching up...`);
        await this.catchUpFromCheckpoint(walletAddress, wallet);
      } else {
        console.log(`✅ [Up-to-date] Wallet ${walletAddress.slice(0, 8)}... is current, no catch-up needed`);
      }
    } else {
      // Backfilled but no checkpoint (old data): Re-backfill
      console.log(`⚠️  [Backfill] Wallet ${walletAddress.slice(0, 8)}... needs checkpoint update...`);
      await this.backfillWalletHistory(walletAddress);
    }

    // Step 2: Start real-time monitoring (websocket subscription)
    await this.startRealtimeMonitoring(walletAddress);
  }

  /**
   * Force re-backfill from a specific slot (for recovering missed deployments)
   */
  async forceRebackfill(walletAddress: string, minSlot?: number): Promise<void> {
    const slotMsg = minSlot ? ` from slot ${minSlot}` : ' (FULL HISTORY)';
    console.log(`🔄 [Force-Rebackfill] Starting for ${walletAddress.slice(0, 8)}...${slotMsg}`);
    console.log(`🔄 [Force-Rebackfill] minSlot parameter value:`, minSlot, `(type: ${typeof minSlot})`);
    
    // Reset checkpoint
    await MonitoredWalletProvider.update(walletAddress, {
      dev_checked: 0,
      last_processed_signature: ''
    });
    
    // Stop monitoring if active
    await this.stopMonitoringWallet(walletAddress);
    
    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Get wallet config
    const wallet = await MonitoredWalletProvider.findByAddress(walletAddress, 'pumpfun');
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Initialize rate limiter (though backfill won't use it - global limiter handles everything)
    const rps = wallet.rate_limit_rps || 1;
    const enabled = wallet.rate_limit_enabled !== 0;
    const rateLimiter = new WalletRateLimiter(walletAddress, rps, enabled);
    this.rateLimiters.set(walletAddress, rateLimiter);
    
    // Trigger backfill with minSlot
    await this.backfillWalletHistory(walletAddress, minSlot);
    
    // Start real-time monitoring after backfill
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
   * Check if wallet needs catch-up (has new transactions since last checkpoint)
   */
  private async checkIfCatchUpNeeded(walletAddress: string, wallet: any): Promise<boolean> {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Fetch the most recent signature
      const recentSignatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(publicKey, { limit: 1 })
      );

      if (recentSignatures.length === 0) {
        return false; // No new transactions
      }

      const mostRecentSig = recentSignatures[0].signature;
      
      // Compare with our checkpoint
      if (wallet.last_processed_signature === mostRecentSig) {
        return false; // Already up-to-date
      }

      console.log(`🔍 [Check] Wallet ${walletAddress.slice(0, 8)}... has new transactions`);
      console.log(`   Last processed: ${wallet.last_processed_signature?.slice(0, 8)}... (${new Date(wallet.last_processed_time!).toLocaleString()})`);
      console.log(`   Most recent: ${mostRecentSig.slice(0, 8)}... (${new Date(recentSignatures[0].blockTime! * 1000).toLocaleString()})`);
      
      return true; // Need to catch up
    } catch (error) {
      console.error(`❌ Error checking catch-up status:`, error);
      return true; // On error, assume we need catch-up
    }
  }

  /**
   * Catch up from last checkpoint to current state
   * Only fetches and processes NEW transactions since last checkpoint
   */
  private async catchUpFromCheckpoint(walletAddress: string, wallet: any): Promise<void> {
    this.isBackfilling.set(walletAddress, true);
    
    try {
      const publicKey = new PublicKey(walletAddress);
      
      const checkpointSlot = wallet.last_processed_slot || 0;
      console.log(`🔄 [Catch-up] Fetching new transactions since slot ${checkpointSlot} (${wallet.last_processed_signature?.slice(0, 8)}...)`);

      // Fetch ALL signatures newer than checkpoint slot (reliable even for very active wallets)
      const newSignatures: any[] = [];
      let lastSignature: string | undefined;
      let hasMore = true;

      while (hasMore) {
        // NO RATE LIMITING - Global limiter handles everything
        const signatures = await this.proxiedConnection.withProxy(conn =>
          conn.getSignaturesForAddress(publicKey, {
            limit: 1000,
            before: lastSignature
          })
        );

        if (signatures.length === 0) {
          hasMore = false;
          break;
        }

        // Filter by slot number (reliable checkpoint method)
        for (const sig of signatures) {
          if (sig.slot > checkpointSlot) {
            newSignatures.push(sig);
          } else {
            // Reached checkpoint - stop searching
            hasMore = false;
            break;
          }
        }

        lastSignature = signatures[signatures.length - 1].signature;
        if (signatures.length < 1000) {
          hasMore = false;
        }
      }

      if (newSignatures.length === 0) {
        console.log(`✅ [Catch-up] No new transactions for ${walletAddress.slice(0, 8)}...`);
        return;
      }

      // Reverse to process chronologically (oldest → newest)
      newSignatures.reverse();

      console.log(`🔄 [Catch-up] Processing ${newSignatures.length} new transactions...`);
      
      let mintsFound = 0;
      
      // Process in parallel chunks for max concurrency
      const chunkSize = 2; // Match GlobalLimiter max concurrent
      for (let i = 0; i < newSignatures.length; i += chunkSize) {
        const chunk = newSignatures.slice(i, Math.min(i + chunkSize, newSignatures.length));
        
        await Promise.all(chunk.map(async (sigInfo) => {
          // NO RATE LIMITING - Global limiter handles everything
          const tx = await this.proxiedConnection.withProxy(conn =>
            conn.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0
            })
          );

          if (tx) {
            const foundMint = await this.analyzeTransactionForMint(tx, walletAddress, sigInfo.signature);
            if (foundMint) mintsFound++;
          }
        }));
      }

      // Update checkpoint to newest processed transaction
      const newestSig = newSignatures[newSignatures.length - 1];
      await MonitoredWalletProvider.update(walletAddress, {
        last_processed_signature: newestSig.signature,
        last_processed_slot: newestSig.slot,
        last_processed_time: newestSig.blockTime ? newestSig.blockTime * 1000 : Date.now(),
        last_history_check: Date.now()
      }, 'pumpfun');

      console.log(`✅ [Catch-up] Complete for ${walletAddress.slice(0, 8)}...`);
      console.log(`   New transactions processed: ${newSignatures.length}`);
      console.log(`   New mints found: ${mintsFound}`);
      console.log(`   Checkpoint updated to: ${newestSig.signature.slice(0, 8)}... (${new Date(newestSig.blockTime! * 1000).toLocaleString()})`);

    } catch (error) {
      console.error(`❌ [Catch-up] Error for ${walletAddress.slice(0, 8)}...:`, error);
    } finally {
      this.isBackfilling.set(walletAddress, false);
    }
  }

  /**
   * Step 1: Historical Backfill
   * Fetches ALL past transactions from OLDEST to NEWEST (chronological order)
   * Establishes the starting point for real-time monitoring
   */
  private async backfillWalletHistory(walletAddress: string, minSlot?: number): Promise<void> {
    this.isBackfilling.set(walletAddress, true);
    
    try {
      const publicKey = new PublicKey(walletAddress);
      
      const minSlotMsg = minSlot ? ` from slot ${minSlot}` : '';
      console.log(`📚 [Backfill] Phase 1: Fetching signatures${minSlotMsg} for ${walletAddress.slice(0, 8)}...`);

      // Phase 1: Collect ALL signatures (newest → oldest)
      const allSignatures: any[] = [];
      let lastSignature: string | undefined;
      let hasMore = true;

      while (hasMore) {
        // NO RATE LIMITING - Global limiter handles all requests
        const signatures = await this.proxiedConnection.withProxy(conn =>
          conn.getSignaturesForAddress(publicKey, {
            limit: 1000,
            before: lastSignature,
            ...(minSlot ? { minContextSlot: minSlot } : {})
          })
        );

        if (signatures.length === 0) {
          hasMore = false;
          break;
        }

        // Filter by slot if specified
        const filteredSigs = minSlot 
          ? signatures.filter(sig => sig.slot >= minSlot)
          : signatures;

        if (filteredSigs.length === 0) {
          hasMore = false;
          break;
        }

        allSignatures.push(...filteredSigs);
        lastSignature = signatures[signatures.length - 1].signature;

        console.log(`📚 [Backfill] Collected ${allSignatures.length} signatures...`);

        if (signatures.length < 1000) {
          hasMore = false;
        }
      }

      if (allSignatures.length === 0) {
        console.log(`📚 [Backfill] No transactions found for ${walletAddress.slice(0, 8)}...`);
        await MonitoredWalletProvider.update(walletAddress, {
          dev_checked: 1,
          last_history_check: Date.now()
        }, 'pumpfun');
        return;
      }

      // Reverse to get chronological order (oldest → newest)
      allSignatures.reverse();

      const oldestSig = allSignatures[0];
      const newestSig = allSignatures[allSignatures.length - 1];
      
      console.log(`📚 [Backfill] Phase 2: Processing ${allSignatures.length} transactions chronologically...`);
      console.log(`   Oldest: ${new Date(oldestSig.blockTime! * 1000).toISOString()} (${oldestSig.signature.slice(0, 8)}...)`);
      console.log(`   Newest: ${new Date(newestSig.blockTime! * 1000).toISOString()} (${newestSig.signature.slice(0, 8)}...)`);

      // Phase 2: Process in chronological order (oldest → newest)
      let totalProcessed = 0;
      let mintsFound = 0;
      const batchSize = 100;

      for (let i = 0; i < allSignatures.length; i += batchSize) {
        const batch = allSignatures.slice(i, Math.min(i + batchSize, allSignatures.length));
        
        console.log(`📚 [Backfill] Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allSignatures.length / batchSize)} (${batch.length} transactions)...`);

        // Process transactions in parallel chunks for max concurrency
        const chunkSize = 2; // Match GlobalLimiter max concurrent
        for (let j = 0; j < batch.length; j += chunkSize) {
          const chunk = batch.slice(j, Math.min(j + chunkSize, batch.length));
          
          await Promise.all(chunk.map(async (sigInfo) => {
            // NO RATE LIMITING - Global limiter handles all requests
            const tx = await this.proxiedConnection.withProxy(conn =>
              conn.getParsedTransaction(sigInfo.signature, {
                maxSupportedTransactionVersion: 0
              })
            );

            if (tx) {
              const foundMint = await this.analyzeTransactionForMint(tx, walletAddress, sigInfo.signature);
              if (foundMint) mintsFound++;
            }
            
            totalProcessed++;
          }));
        }
      }

      // Mark wallet as backfilled and save checkpoint (newest signature)
      await MonitoredWalletProvider.update(walletAddress, {
        dev_checked: 1,
        last_history_check: Date.now(),
        last_processed_signature: newestSig.signature,
        last_processed_slot: newestSig.slot,
        last_processed_time: newestSig.blockTime ? newestSig.blockTime * 1000 : Date.now()
      }, 'pumpfun');

      console.log(`✅ [Backfill] Complete for ${walletAddress.slice(0, 8)}...`);
      console.log(`   Total Transactions: ${totalProcessed}`);
      console.log(`   Pumpfun Mints Found: ${mintsFound}`);
      console.log(`   Timespan: ${new Date(oldestSig.blockTime! * 1000).toLocaleDateString()} → ${new Date(newestSig.blockTime! * 1000).toLocaleDateString()}`);
      console.log(`   Checkpoint saved: ${newestSig.signature.slice(0, 8)}...`);
      console.log(`   Ready for real-time monitoring from: ${new Date(newestSig.blockTime! * 1000).toISOString()}`);

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
                
                // Update checkpoint after processing real-time transaction
                await MonitoredWalletProvider.update(walletAddress, {
                  last_processed_signature: logs.signature,
                  last_processed_slot: tx.slot,
                  last_processed_time: tx.blockTime ? tx.blockTime * 1000 : Date.now()
                }, 'pumpfun');
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
    
    // CRITICAL: Verify the transaction signer is the monitored wallet (the dev/creator)
    const txSigner = accountKeys[0].pubkey.toBase58();
    if (txSigner !== walletAddress) {
      return false; // Not created by our monitored wallet - skip
    }
    
    // Check if transaction involves pump.fun program
    const involvesPumpFun = accountKeys.some(
      key => key.pubkey.toBase58() === PUMPFUN_PROGRAM_ID
    );

    if (!involvesPumpFun) return false;

    let mintFound = false;

    // ONLY METHOD: Check INNER INSTRUCTIONS for mint initialization
    // This is the ONLY reliable way - initializeMint ONLY happens on token creation, never on buys/sells
    if (tx.meta.innerInstructions) {
      for (const innerSet of tx.meta.innerInstructions) {
        for (const instruction of innerSet.instructions) {
          if ('parsed' in instruction && instruction.parsed) {
            const parsed = instruction.parsed;
            
            // Check for InitializeMint in inner instructions
            if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
              const mintAddress = parsed.info?.mint;
              
              if (mintAddress) {
                console.log(`🔍 [PumpFun] Found initializeMint for ${mintAddress.slice(0, 8)} in tx ${signature.slice(0, 8)}`);
                await this.processMintDetection(mintAddress, walletAddress, signature, launchTimestamp);
                mintFound = true;
              }
            }
          }
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
      // CRITICAL: Verify on-chain metadata creator matches monitored wallet
      const mintPubkey = new PublicKey(mintAddress);
      
      // Derive metadata account address (Metaplex standard)
      const TOKEN_METADATA_PROGRAM_ID = new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s');
      const [metadataAccount] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          TOKEN_METADATA_PROGRAM_ID.toBuffer(),
          mintPubkey.toBuffer(),
        ],
        TOKEN_METADATA_PROGRAM_ID
      );
      
      // Fetch metadata account
      const metadataInfo = await this.proxiedConnection.withProxy(conn =>
        conn.getAccountInfo(metadataAccount)
      );
      
      if (metadataInfo && metadataInfo.data) {
        // Parse creator from metadata (creator is at byte 1 + 32 + 4 + 4 + remaining_data + creators_offset)
        // Metaplex metadata structure: key(1) + update_authority(32) + mint(32) + name(4+len) + symbol(4+len) + uri(4+len) + seller_fee(2) + creators...
        // For simplicity, check if monitored wallet appears in the first creator slot
        const creatorOffset = 1 + 32 + 32; // After key, update_authority, mint
        
        // Skip variable length strings (name, symbol, uri)
        let offset = creatorOffset;
        // Name length + string
        const nameLen = metadataInfo.data.readUInt32LE(offset);
        offset += 4 + nameLen;
        // Symbol length + string  
        const symbolLen = metadataInfo.data.readUInt32LE(offset);
        offset += 4 + symbolLen;
        // URI length + string
        const uriLen = metadataInfo.data.readUInt32LE(offset);
        offset += 4 + uriLen;
        // Seller fee basis points
        offset += 2;
        
        // Now we're at creators section
        // has_creator (1 byte)
        const hasCreator = metadataInfo.data.readUInt8(offset);
        offset += 1;
        
        if (hasCreator) {
          // Number of creators (4 bytes)
          offset += 4;
          // First creator address (32 bytes)
          const creatorAddress = new PublicKey(metadataInfo.data.slice(offset, offset + 32)).toBase58();
          
          if (creatorAddress !== walletAddress) {
            console.log(`⚠️  [PumpFun] Metadata creator mismatch: ${creatorAddress.slice(0, 8)} != ${walletAddress.slice(0, 8)}`);
            return; // Skip - not created by monitored wallet
          }
          
          console.log(`✅ [PumpFun] Metadata creator verified: ${creatorAddress.slice(0, 8)}`);
        }
      }
      
      // Try to fetch token metadata from GeckoTerminal
      const tokenInfo = await this.fetchTokenMetadata(mintAddress);

      await TokenMintProvider.create({
        mint_address: mintAddress,
        creator_address: walletAddress,
        name: tokenInfo.name,
        symbol: tokenInfo.symbol,
        timestamp: launchTimestamp, // Actual blockchain launch time
        platform: 'pumpfun',
        signature: signature, // Store transaction signature
        // Save market data from GeckoTerminal (starting_mcap will be added later from internal data)
        current_mcap: tokenInfo.fdvUsd,
        price_usd: tokenInfo.priceUsd,
        graduation_percentage: tokenInfo.launchpadGraduationPercentage,
        launchpad_completed: tokenInfo.launchpadCompleted ? 1 : 0,
        launchpad_completed_at: tokenInfo.launchpadCompletedAt ? new Date(tokenInfo.launchpadCompletedAt).getTime() : undefined,
        total_supply: tokenInfo.totalSupply,
        market_cap_usd: tokenInfo.marketCapUsd,
        coingecko_coin_id: tokenInfo.coingeckoCoinId || undefined,
        gt_score: tokenInfo.gtScore,
        description: tokenInfo.description,
        last_updated: Date.now(),
        metadata: JSON.stringify({
          launchTime: new Date(launchTimestamp).toISOString(),
          decimals: tokenInfo.decimals,
          image: tokenInfo.image,
          totalReserveUsd: tokenInfo.totalReserveUsd,
          volumeUsd24h: tokenInfo.volumeUsd24h,
          // Social/Score data from /info endpoint
          gtScoreDetails: tokenInfo.gtScoreDetails,
          holders: tokenInfo.holders,
          twitterHandle: tokenInfo.twitterHandle,
          telegramHandle: tokenInfo.telegramHandle,
          discordUrl: tokenInfo.discordUrl,
          websites: tokenInfo.websites,
          categories: tokenInfo.categories,
          mintAuthority: tokenInfo.mintAuthority,
          freezeAuthority: tokenInfo.freezeAuthority,
          isHoneypot: tokenInfo.isHoneypot,
          // Store complete metadata for future use
          geckoTerminal: {
            ...tokenInfo
          }
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
        }, 'pumpfun');
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

  private async fetchTokenMetadata(mintAddress: string): Promise<{
    name?: string;
    symbol?: string;
    decimals?: number;
    image?: string;
    priceUsd?: number;
    fdvUsd?: number;
    totalReserveUsd?: number;
    volumeUsd24h?: number;
    launchpadGraduationPercentage?: number;
    launchpadCompleted?: boolean;
    launchpadCompletedAt?: string | null;
    totalSupply?: string;
    marketCapUsd?: number;
    coingeckoCoinId?: string | null;
    gtScore?: number;
    description?: string;
    gtScoreDetails?: any;
    holders?: any;
    twitterHandle?: string;
    telegramHandle?: string;
    discordUrl?: string;
    websites?: string[];
    categories?: string[];
    mintAuthority?: string;
    freezeAuthority?: string;
    isHoneypot?: string;
  }> {
    try {
      console.log(`🔍 [PumpFun] Fetching metadata for ${mintAddress.slice(0, 8)}...`);
      const metadata = await this.metadataFetcher.fetchMetadata(mintAddress);
      
      if (metadata) {
        console.log(`✅ [PumpFun] Metadata found: ${metadata.name || 'N/A'} (${metadata.symbol || 'N/A'})`);
        // Return ALL fields from GeckoTerminal
        return metadata;
      }
      
      console.log(`⚠️ [PumpFun] No metadata found for ${mintAddress.slice(0, 8)}...`);
      return {};
    } catch (error) {
      console.error(`❌ [PumpFun] Error fetching metadata:`, error);
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
