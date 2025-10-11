import { PublicKey } from '@solana/web3.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';

// No artificial rate limiting! Smart per-proxy rate limiting handles everything

export interface WalletAnalysis {
  isFresh: boolean;
  walletAgeDays: number;
  previousTxCount: number;
}

export class WalletAnalyzer {
  private proxiedConnection: ProxiedSolanaConnection;

  constructor() {
    // Proxied connection for unlimited requests (10,000 proxies!)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'WalletAnalyzer'
    );
    
    console.log(`📊 [WalletAnalyzer] Proxy mode: ${this.proxiedConnection.isProxyEnabled() ? 'ENABLED ✅' : 'DISABLED'}`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async analyzeWallet(walletAddress: string): Promise<WalletAnalysis> {
    console.log(`🔍 [WalletAnalyzer] Analyzing wallet: ${walletAddress.slice(0, 8)}...`);
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Optimized fetching: For fresh wallet detection, we only need to know if tx count = 0
      // Start with small batch, only fetch more if needed for age calculation
      
      console.log(`📡 [WalletAnalyzer] Fetching transaction history (queued)...`);
      let allSignatures: any[] = [];
      
      // Use proxied connection (smart per-proxy rate limiting, no artificial delays!)
      let batch = await this.proxiedConnection.withProxy(conn => 
        conn.getSignaturesForAddress(publicKey, { limit: 10 })
      );
      allSignatures.push(...batch);
      // If there are any transactions, this is NOT a fresh wallet
      // Only continue fetching if we need accurate count for established wallets
      if (batch.length > 0) {
        console.log(`📊 [WalletAnalyzer] Wallet has transactions, fetching full history...`);
        
        // Constants
        const INITIAL_CHECK_LIMIT = 10; // Fast check for fresh wallets
        
        if (batch.length === INITIAL_CHECK_LIMIT) {
          // Get more transactions (no artificial delays!)
          batch = await this.proxiedConnection.withProxy(conn => 
            conn.getSignaturesForAddress(publicKey, { limit: 1000 })
          );
          allSignatures = [...batch]; // Replace with full batch
          
          // Optional: Continue pagination if needed (disabled to reduce API calls)
          // while (batch.length === 1000 && allSignatures.length < MAX_TRANSACTIONS) {
          //   ...pagination logic...
          // }
        }
      } else {
        console.log(`✨ [WalletAnalyzer] Fresh wallet detected - zero transactions!`);
      }
      
      const previousTxCount = allSignatures.length;
      console.log(`📊 [WalletAnalyzer] Total transactions found: ${previousTxCount}`);
      
      // Determine wallet age
      let walletAgeDays = 0;
      let firstTransactionTime: number | undefined;
      
      if (allSignatures.length > 0) {
        // Get the oldest transaction (last in the list)
        const oldestSig = allSignatures[allSignatures.length - 1];
        if (oldestSig.blockTime) {
          firstTransactionTime = oldestSig.blockTime * 1000;
          const ageMs = Date.now() - firstTransactionTime;
          walletAgeDays = ageMs / (1000 * 60 * 60 * 24);
        }
      }

      // Define "fresh wallet" criteria:
      // - ZERO prior transactions (brand new wallet that just received first transaction)
      const isFresh = previousTxCount === 0;

      const analysis = {
        isFresh,
        walletAgeDays: Number(walletAgeDays.toFixed(2)),
        previousTxCount,
        firstTransactionTime
      };

      console.log(`✅ [WalletAnalyzer] Analysis complete:`, {
        isFresh: analysis.isFresh,
        age: `${analysis.walletAgeDays}d`,
        txCount: analysis.previousTxCount
      });

      return analysis;
    } catch (error) {
      console.error(`Error analyzing wallet ${walletAddress}:`, error);
      
      // If we can't analyze, assume not fresh for safety
      return {
        isFresh: false,
        walletAgeDays: 0,
        previousTxCount: 0
      };
    }
  }

  /**
   * Quick check - useful for real-time monitoring
   * Only checks transaction count, not age
   */
  async quickFreshCheck(walletAddress: string): Promise<boolean> {
    try {
      const publicKey = new PublicKey(walletAddress);
      const signatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(publicKey, { limit: 20 })
      );
      
      // Fresh if very few transactions
      return signatures.length < 10;
    } catch (error) {
      console.error(`Error in quick check for ${walletAddress}:`, error);
      return false;
    }
  }

  /**
   * Batch analyze multiple wallets
   */
  async analyzeWallets(walletAddresses: string[]): Promise<Map<string, WalletAnalysis>> {
    const results = new Map<string, WalletAnalysis>();
    
    // Analyze in parallel with rate limiting
    const batchSize = 5;
    for (let i = 0; i < walletAddresses.length; i += batchSize) {
      const batch = walletAddresses.slice(i, i + batchSize);
      const analyses = await Promise.all(
        batch.map(address => this.analyzeWallet(address))
      );
      
      batch.forEach((address, index) => {
        results.set(address, analyses[index]);
      });
      
      // Rate limiting - wait 1 second between batches
      if (i + batchSize < walletAddresses.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    return results;
  }
}
