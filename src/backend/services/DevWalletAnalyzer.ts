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

  async analyzeDevHistory(walletAddress: string): Promise<DevWalletAnalysis> {
    console.log(`🔎 [DevAnalyzer] Checking dev history for ${walletAddress.slice(0, 8)}...`);

    try {
      const publicKey = new PublicKey(walletAddress);
      const deployments: TokenDeployment[] = [];

      // Fetch transaction history with proxy (up to 1000 transactions to check for mints)
      console.log(`📡 [DevAnalyzer] Fetching transaction history with proxy rotation...`);
      const signatures = await this.proxiedConnection.withProxy(conn =>
        conn.getSignaturesForAddress(publicKey, { limit: 1000 })
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

        // Now check for initializeMint in inner instructions
        // This confirms a NEW token was minted (not just buying existing)
        if (tx.meta.innerInstructions) {
          for (const innerSet of tx.meta.innerInstructions) {
            for (const instruction of innerSet.instructions) {
              if ('parsed' in instruction && instruction.parsed) {
                const parsed = instruction.parsed;

                if (parsed.type === 'initializeMint' || parsed.type === 'initializeMint2') {
                  const mintAddress = parsed.info?.mint;
                  const mintAuthority = parsed.info?.mintAuthority;

                  // Verify the wallet is the mint authority (final confirmation)
                  if (mintAddress && mintAuthority === walletAddress) {
                    deployments.push({
                      mintAddress,
                      signature: sigInfo.signature,
                      timestamp: (sigInfo.blockTime || 0) * 1000,
                      decimals: parsed.info?.decimals
                    });

                    console.log(`   🚀 Found VERIFIED mint: ${mintAddress.slice(0, 16)}... (authority: ${mintAuthority.slice(0, 8)}...)`);
                  }
                }
              }
            }
          }
        }

        // Rate limit: small delay every 5 transactions
        if (checkedCount % 5 === 0) {
          await this.delay(200);
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
