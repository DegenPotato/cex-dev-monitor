import { PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import { MonitoredWalletProvider } from '../providers/MonitoredWalletProvider.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { EventEmitter } from 'events';

// Pump.fun program ID
const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export class PumpFunMonitor extends EventEmitter {
  private proxiedConnection: ProxiedSolanaConnection;
  private checkIntervals: Map<string, NodeJS.Timeout> = new Map();
  private requestDelayMs: number = 15; // Default 15ms, configurable

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
  }

  /**
   * Update request pacing delay
   */
  setRequestDelay(delayMs: number): void {
    this.requestDelayMs = delayMs;
    console.log(`🎛️  [PumpFunMonitor] Request delay updated to ${delayMs}ms`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async startMonitoringWallet(walletAddress: string): Promise<void> {
    if (this.checkIntervals.has(walletAddress)) {
      console.log(`Already monitoring pump.fun for ${walletAddress}`);
      return;
    }

    console.log(`🎯 Started pump.fun monitoring for ${walletAddress}`);

    // Initial check
    await this.checkWalletForPumpFun(walletAddress);

    // Set up periodic checks (every 30 seconds)
    // Note: For true real-time, we'd need to monitor program logs
    const interval = setInterval(async () => {
      await this.checkWalletForPumpFun(walletAddress);
    }, 30000);

    this.checkIntervals.set(walletAddress, interval);
  }

  stopMonitoringWallet(walletAddress: string): void {
    const interval = this.checkIntervals.get(walletAddress);
    if (interval) {
      clearInterval(interval);
      this.checkIntervals.delete(walletAddress);
      console.log(`⛔ Stopped pump.fun monitoring for ${walletAddress}`);
    }
  }

  private async checkWalletForPumpFun(walletAddress: string): Promise<void> {
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Fetch signatures with proxy
      const signatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(publicKey, { limit: 20 })
      );

      for (const sigInfo of signatures) {
        // Request pacing: configurable delay between requests
        await new Promise(resolve => setTimeout(resolve, this.requestDelayMs));
        
        const tx = await this.proxiedConnection.withProxy(conn =>
          conn.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          })
        );

        if (tx) {
          await this.analyzeTransactionForMint(tx, walletAddress, sigInfo.signature);
        }
      }
    } catch (error) {
      console.error(`Error checking pump.fun mints for ${walletAddress}:`, error);
    }
  }

  private async analyzeTransactionForMint(
    tx: ParsedTransactionWithMeta,
    walletAddress: string,
    signature: string
  ): Promise<void> {
    if (!tx.meta || tx.meta.err) return;

    // Get the actual blockchain timestamp (launch time)
    const launchTimestamp = tx.blockTime ? tx.blockTime * 1000 : Date.now();

    const accountKeys = tx.transaction.message.accountKeys;
    
    // Check if transaction involves pump.fun program
    const involvesPumpFun = accountKeys.some(
      key => key.pubkey.toBase58() === PUMPFUN_PROGRAM_ID
    );

    if (!involvesPumpFun) return;

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
        }
      }
    }
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
        metadata: JSON.stringify({
          signature,
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

  stopAll(): void {
    console.log(`⏹️  Stopping all pump.fun monitors...`);
    
    this.checkIntervals.forEach((interval, walletAddress) => {
      clearInterval(interval);
      console.log(`  ❌ Stopped monitoring ${walletAddress.slice(0, 8)}...`);
    });
    
    this.checkIntervals.clear();
    console.log(`✅ All pump.fun monitoring stopped`);
  }

  getActiveMonitors(): string[] {
    return Array.from(this.checkIntervals.keys());
  }
}
