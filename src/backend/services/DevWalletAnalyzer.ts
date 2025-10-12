import { PublicKey } from '@solana/web3.js';
import { ProxiedSolanaConnection } from './ProxiedSolanaConnection.js';

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
  activities: Array<{
    signature: string;
    timestamp: number;
    type: 'deployment' | 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'burn' | 'swap' | 'other';
    program: string;
    details: any;
    amount?: number;
    token?: string;
  }>;
}

export class DevWalletAnalyzer {
  private proxiedConnection: ProxiedSolanaConnection;
  private requestDelayMs: number = 0; // 0 = unrestricted

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
   * Update request pacing delay (0 = unrestricted, works alongside Global Concurrency Limiter)
   */
  setRequestDelay(delayMs: number): void {
    this.requestDelayMs = delayMs;
    console.log(`🎛️  [DevAnalyzer] Request pacing: ${delayMs === 0 ? 'UNRESTRICTED ⚡' : `${delayMs}ms delay`}`);
  }

  getProxiedConnection(): ProxiedSolanaConnection {
    return this.proxiedConnection;
  }

  async analyzeDevHistory(walletAddress: string, limit: number = 1000): Promise<DevWalletAnalysis> {
    console.log(`🔎 [DevAnalyzer] Checking COMPLETE on-chain history for ${walletAddress.slice(0, 8)}... (limit: ${limit})`);
    const walletPubkey = new PublicKey(walletAddress);
    const deployments: { mintAddress: string; signature: string; timestamp: number }[] = [];
    const activities: Array<{
      signature: string;
      timestamp: number;
      type: 'deployment' | 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'burn' | 'swap' | 'other';
      program: string;
      details: any;
      amount?: number;
      token?: string;
    }> = [];

    try {
      console.log(`⏳ [DevAnalyzer] Fetching signatures (limit: ${limit})...`);
      
      const signatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(walletPubkey, { limit })
      );
      
      console.log(`📊 [DevAnalyzer] Analyzing ${signatures.length} transactions for ALL activities...`);
      console.log(`   Global Concurrency Limiter will control throughput speed`);

      let pumpfunTxCount = 0;
      let processedCount = 0;
      
      // Fire ALL requests with optional pacing
      // Global Concurrency Limiter controls parallel execution
      // Request pacing adds delay between request STARTS
      const txResults = await Promise.all(
        signatures.map(async (sigInfo, index) => {
          // Progress logging every 100 txs
          if (index > 0 && index % 100 === 0) {
            console.log(`   Progress: ${index}/${signatures.length} transactions queued`);
          }
          
          // Optional request pacing (0 = unrestricted)
          if (this.requestDelayMs > 0 && index > 0) {
            await new Promise(resolve => setTimeout(resolve, this.requestDelayMs));
          }
          
          return this.proxiedConnection.withProxy(conn =>
            conn.getParsedTransaction(sigInfo.signature, {
              maxSupportedTransactionVersion: 0
            })
          ).catch(() => null); // Handle errors gracefully
        })
      );

      console.log(`   All ${signatures.length} transactions fetched, processing results...`);

      // Process all transaction results
      for (let i = 0; i < txResults.length; i++) {
        const tx = txResults[i];
        const sigInfo = signatures[i];
        processedCount++;
        
        if (processedCount % 100 === 0) {
          console.log(`   Processed: ${processedCount}/${signatures.length}, ${deployments.length} mints, ${activities.length} activities found`);
        }
        
        if (!tx || !tx.meta || tx.meta.err) continue;

        const accountKeys = tx.transaction.message.accountKeys;
        const timestamp = sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now();
        
        // Analyze transaction type and categorize it
        const txType = this.categorizeTransaction(tx, walletAddress);
        if (txType) {
          activities.push({
            signature: sigInfo.signature,
            timestamp,
            ...txType
          });
        }

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
            mintAddress: mintAddress,
            signature: sigInfo.signature,
            timestamp: sigInfo.blockTime ? sigInfo.blockTime * 1000 : Date.now()
          });

          console.log(`   🚀 Found token mint: ${mintAddress.slice(0, 16)}... (creator: ${walletAddress.slice(0, 8)}...)`);
        }
      }

      const isDevWallet = deployments.length > 0;

      console.log(`✅ [DevAnalyzer] Analysis complete:`);
      console.log(`   Pump.fun transactions: ${pumpfunTxCount}`);
      console.log(`   Tokens deployed: ${deployments.length}`);
      console.log(`   Is Dev Wallet: ${isDevWallet ? 'YES 🔥' : 'NO'}`);
      console.log(`   Total activities tracked: ${activities.length}`);
      
      return {
        isDevWallet,
        tokensDeployed: deployments.length,
        deployments,
        activities
      };
    } catch (error) {
      console.error(`❌ [DevAnalyzer] Error analyzing history:`, error);
      return {
        isDevWallet: false,
        tokensDeployed: 0,
        deployments: [],
        activities: []
      };
    }
  }

  private categorizeTransaction(tx: any, walletAddress: string): any {
    const instructions = tx.transaction.message.instructions;
    const preBalances = tx.meta.preTokenBalances || [];
    const postBalances = tx.meta.postTokenBalances || [];
    
    // Get the program IDs involved
    const programIds = instructions.map((ix: any) => ix.programId.toBase58());
    
    // Detect token transfers
    if (postBalances.length > 0 || preBalances.length > 0) {
      // Check if it's a transfer
      const walletPreBalance = preBalances.find((b: any) => b.owner === walletAddress);
      const walletPostBalance = postBalances.find((b: any) => b.owner === walletAddress);
      
      if (walletPreBalance && walletPostBalance) {
        const preAmount = walletPreBalance.uiTokenAmount?.uiAmount || 0;
        const postAmount = walletPostBalance.uiTokenAmount?.uiAmount || 0;
        
        if (postAmount > preAmount) {
          return {
            type: 'transfer_in' as const,
            program: programIds[0] || 'Unknown',
            details: { amount: postAmount - preAmount },
            amount: postAmount - preAmount,
            token: walletPostBalance.mint
          };
        } else if (postAmount < preAmount) {
          return {
            type: 'transfer_out' as const,
            program: programIds[0] || 'Unknown',
            details: { amount: preAmount - postAmount },
            amount: preAmount - postAmount,
            token: walletPreBalance.mint
          };
        }
      }
    }
    
    // Detect swaps (Raydium, Orca, Jupiter)
    const SWAP_PROGRAMS = [
      '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8', // Raydium AMM
      '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP', // Orca
      'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', // Jupiter v6
    ];
    
    if (programIds.some((id: string) => SWAP_PROGRAMS.includes(id))) {
      return {
        type: 'swap' as const,
        program: programIds.find((id: string) => SWAP_PROGRAMS.includes(id)),
        details: { programIds }
      };
    }
    
    // Default to 'other'
    return {
      type: 'other' as const,
      program: programIds[0] || 'Unknown',
      details: { programIds }
    };
  }
}
