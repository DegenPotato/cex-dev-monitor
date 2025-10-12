import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { MonitoredWalletProvider } from '../providers/MonitoredWalletProvider.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { WalletRateLimiter } from './WalletRateLimiter.js';
import { EventEmitter } from 'events';

/**
 * Trading Activity Monitor
 * Tracks ALL trading activity: buys, sells, swaps across all DEXs
 * Architecture mirrors PumpFunMonitor for consistency
 */
export class TradingActivityMonitor extends EventEmitter {
  private proxiedConnection: ProxiedSolanaConnection;
  private activeSubscriptions: Map<string, number> = new Map();
  private isBackfilling: Map<string, boolean> = new Map();
  private rateLimiters: Map<string, WalletRateLimiter> = new Map();

  constructor() {
    super();
    // Proxied connection for trading activity monitoring
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'TradingActivityMonitor'
    );
  }

  /**
   * Start monitoring a wallet for trading activity
   */
  async startMonitoringWallet(walletAddress: string): Promise<void> {
    if (this.activeSubscriptions.has(walletAddress)) {
      console.log(`⚠️  Already monitoring trading activity for ${walletAddress.slice(0, 8)}...`);
      return;
    }

    console.log(`📊 [Trading] Starting monitoring for ${walletAddress.slice(0, 8)}...`);

    // Get wallet configuration
    const wallet = await MonitoredWalletProvider.findByAddress(walletAddress);
    
    if (!wallet) {
      console.error(`❌ Wallet not found: ${walletAddress}`);
      return;
    }

    // Initialize rate limiter for this wallet
    const rps = wallet.rate_limit_rps || 1;
    const enabled = wallet.rate_limit_enabled !== 0;
    const rateLimiter = new WalletRateLimiter(walletAddress, rps, enabled);
    this.rateLimiters.set(walletAddress, rateLimiter);

    console.log(`🎚️  [RateLimit] Initialized for ${walletAddress.slice(0, 8)}... at ${rps} RPS (${enabled ? 'enabled' : 'disabled'})`);
    
    // For now: Fetch and analyze recent transactions for iteration
    await this.fetchRecentTransactions(walletAddress, 20); // Start with 20 recent txs

    console.log(`✅ [Trading] Initial fetch complete for ${walletAddress.slice(0, 8)}...`);
    console.log(`📊 [Trading] Ready for backfill + real-time monitoring implementation`);
  }

  /**
   * Stop monitoring a wallet
   */
  async stopMonitoringWallet(walletAddress: string): Promise<void> {
    const subscriptionId = this.activeSubscriptions.get(walletAddress);
    if (subscriptionId !== undefined) {
      await this.proxiedConnection.withProxy(async conn => {
        await conn.removeAccountChangeListener(subscriptionId);
      });
      this.activeSubscriptions.delete(walletAddress);
      this.rateLimiters.delete(walletAddress);
      console.log(`⛔ [Trading] Stopped monitoring ${walletAddress.slice(0, 8)}...`);
    }
  }

  /**
   * Fetch recent transactions for analysis and iteration
   * This is our starting point - similar to how we iterated on PumpFun
   */
  private async fetchRecentTransactions(walletAddress: string, limit: number = 20): Promise<void> {
    const rateLimiter = this.rateLimiters.get(walletAddress);
    
    try {
      const publicKey = new PublicKey(walletAddress);
      
      console.log(`📊 [Trading] Fetching ${limit} recent transactions for ${walletAddress.slice(0, 8)}...`);

      // Fetch recent signatures
      const signatures = rateLimiter 
        ? await rateLimiter.execute(() => 
            this.proxiedConnection.withProxy(conn =>
              conn.getSignaturesForAddress(publicKey, { limit })
            )
          )
        : await this.proxiedConnection.withProxy(conn =>
            conn.getSignaturesForAddress(publicKey, { limit })
          );

      console.log(`📊 [Trading] Found ${signatures.length} recent transactions`);

      // Process each transaction
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
          await this.analyzeTransaction(tx, walletAddress, sigInfo.signature);
        }
      }

    } catch (error) {
      console.error(`❌ [Trading] Error fetching transactions for ${walletAddress.slice(0, 8)}...:`, error);
    }
  }

  /**
   * Analyze a transaction for trading activity
   * TODO: Implement categorization (buy, sell, swap, transfer, etc.)
   */
  private async analyzeTransaction(
    tx: ParsedTransactionWithMeta,
    walletAddress: string,
    signature: string
  ): Promise<void> {
    if (!tx.meta || tx.meta.err) return;

    // Get transaction timestamp
    const txTimestamp = tx.blockTime ? new Date(tx.blockTime * 1000).toISOString() : 'unknown';
    
    // Log basic transaction info for now
    console.log(`📊 [Trading] Transaction ${signature.slice(0, 8)}... at ${txTimestamp}`);
    
    // Check for token balance changes (indicates trading activity)
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];
    
    if (preBalances.length > 0 || postBalances.length > 0) {
      console.log(`   Token balances changed: ${preBalances.length} pre, ${postBalances.length} post`);
    }

    // Check which programs were involved
    const accountKeys = tx.transaction.message.accountKeys;
    const programIds = accountKeys.map(key => key.pubkey.toBase58());
    
    // Common DEX program IDs to look for
    const knownDEXs = {
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4': 'Jupiter',
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8': 'Raydium',
      'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc': 'Orca',
      '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin': 'Serum',
    };

    for (const [programId, dexName] of Object.entries(knownDEXs)) {
      if (programIds.includes(programId)) {
        console.log(`   🔥 DEX Activity: ${dexName}`);
      }
    }

    // TODO: Implement full categorization like DevWalletAnalyzer
    // - Identify transaction type (buy, sell, swap, transfer)
    // - Calculate amounts
    // - Track token involved
    // - Store in database
  }

  /**
   * Stop all monitoring
   */
  async stopAll(): Promise<void> {
    console.log(`⏹️  Stopping all trading activity monitors...`);
    
    const walletAddresses = Array.from(this.activeSubscriptions.keys());
    
    for (const walletAddress of walletAddresses) {
      await this.stopMonitoringWallet(walletAddress);
      console.log(`  ❌ Stopped monitoring ${walletAddress.slice(0, 8)}...`);
    }
    
    console.log(`✅ All trading activity monitoring stopped`);
  }

  /**
   * Get list of actively monitored wallets
   */
  getActiveMonitors(): string[] {
    return Array.from(this.activeSubscriptions.keys());
  }
}
