import { PublicKey } from '@solana/web3.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';
import { globalRPCServerRotator } from './RPCServerRotator.js';

const PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';

export interface TokenDeployment {
  mintAddress: string;
  signature: string;
  timestamp: number;
  decimals?: number;
}

export interface DevWalletAnalysis {
  isDevWallet: boolean;
  tokensDeployed: number;
  deployments: TokenDeployment[];
}

export class DevWalletAnalyzer {
  private proxiedConnection: ProxiedSolanaConnection;
  private requestDelayMs: number = 15; // Default 15ms, configurable

  constructor() {
    // Proxied connection for unlimited dev history scanning (10,000 proxies!)
    this.proxiedConnection = new ProxiedSolanaConnection(
      'https://api.mainnet-beta.solana.com',
      { commitment: 'confirmed' },
      './proxies.txt',
      'DevWalletAnalyzer'
    );
    
    console.log(`🔎 [DevAnalyzer] Proxy mode: ${this.proxiedConnection.isProxyEnabled() ? 'ENABLED ✅' : 'DISABLED'}`);
  }

  /**
   * Update request pacing delay
   */
  setRequestDelay(delayMs: number): void {
    this.requestDelayMs = delayMs;
    console.log(`🎛️  [DevAnalyzer] Request delay updated to ${delayMs}ms`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async analyzeDevHistory(walletAddress: string, limit: number = 1000): Promise<DevWalletAnalysis> {
    console.log(`🔎 [DevAnalyzer] Checking dev history for ${walletAddress.slice(0, 8)}... (limit: ${limit})`);

    try {
      const publicKey = new PublicKey(walletAddress);
      const deployments: TokenDeployment[] = [];

      // Fetch transaction history with proxy
      console.log(`📡 [DevAnalyzer] Fetching transaction history with proxy rotation...`);
      const signatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(publicKey, { limit })
      );

      console.log(`📊 [DevAnalyzer] Analyzing ${signatures.length} transactions...`);

      let checkedCount = 0;
      let pumpfunTxCount = 0;

      for (const sigInfo of signatures) {
        checkedCount++;

        // Progress update every 100 transactions
        if (checkedCount % 100 === 0) {
          console.log(`   Progress: ${checkedCount}/${signatures.length} checked, ${deployments.length} mints found`);
        }

        // Request pacing: configurable delay between requests
        // This spreads requests over time instead of instant burst
        await this.delay(this.requestDelayMs);

        const tx = await this.proxiedConnection.withProxy(conn =>
          conn.getParsedTransaction(sigInfo.signature, {
            maxSupportedTransactionVersion: 0
          })
        );

        if (!tx || !tx.meta || tx.meta.err) continue;

        const accountKeys = tx.transaction.message.accountKeys;

        // Check if transaction involves pump.fun
        const involvesPumpFun = accountKeys.some(
          key => key.pubkey.toBase58() === PUMPFUN_PROGRAM_ID
        );

        if (!involvesPumpFun) continue;

        pumpfunTxCount++;

        // CRITICAL: Verify this wallet is the TOKEN CREATOR, not just a buyer
        // Creators must be SIGNERS and the mint authority must be set to them
        const walletIsSigner = accountKeys.some(
          key => key.pubkey.toBase58() === walletAddress && key.signer === true
        );

        if (!walletIsSigner) {
          // Not a signer = can't be the creator, skip this transaction
          continue;
        }

        // Check transaction logs for "Program log: Instruction: Create" 
        // This is the ACTUAL pump.fun token creation event
        const logs = tx.meta.logMessages || [];
        const isCreateInstruction = logs.some(log => 
          log.includes('Instruction: Create') || 
          log.includes('invoke [1]: 6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P')
        );

        if (!isCreateInstruction) {
          // This is a buy/sell transaction, not a create
          continue;
        }

        // Pump.fun CREATE transactions don't use standard initializeMint
        // Instead, look for new token accounts in postTokenBalances
        // The mint address is the new token that was created
        const postBalances = tx.meta.postTokenBalances || [];
        const preBalances = tx.meta.preTokenBalances || [];
        
        // Find token accounts that exist in post but not in pre (newly created)
        const newTokens = postBalances.filter(post => {
          // Check if this token balance existed before
          const existedBefore = preBalances.some(pre => 
            pre.mint === post.mint && pre.accountIndex === post.accountIndex
          );
          return !existedBefore;
        });

        // If we found new token accounts in a CREATE transaction, this wallet created tokens
        if (newTokens.length > 0) {
          // The mint address is typically the first new token
          const mintAddress = newTokens[0].mint;
          
          deployments.push({
            mintAddress,
            signature: sigInfo.signature,
            timestamp: (sigInfo.blockTime || 0) * 1000,
            decimals: newTokens[0].uiTokenAmount?.decimals
          });

          console.log(`   🚀 Found token mint: ${mintAddress.slice(0, 16)}... (creator: ${walletAddress.slice(0, 8)}...)`);
        }

        // Add small delay only for RPC rotation mode (not needed with proxies)
        // RPC servers have stricter rate limits, so we pace requests conservatively
        if (globalRPCServerRotator.isEnabled() && checkedCount % 10 === 0) {
          await this.delay(100); // 100ms every 10 txs for RPC mode
        }
      }

      const isDevWallet = deployments.length > 0;

      console.log(`✅ [DevAnalyzer] Analysis complete:`);
      console.log(`   Pump.fun transactions: ${pumpfunTxCount}`);
      console.log(`   Tokens deployed: ${deployments.length}`);
      console.log(`   Is Dev Wallet: ${isDevWallet ? 'YES 🔥' : 'NO'}`);

      return {
        isDevWallet,
        tokensDeployed: deployments.length,
        deployments
      };
    } catch (error) {
      console.error(`❌ [DevAnalyzer] Error analyzing ${walletAddress}:`, error);
      return {
        isDevWallet: false,
        tokensDeployed: 0,
        deployments: []
      };
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
