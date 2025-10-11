import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';

/**
 * Known Solana DeFi Program IDs
 */
export const DEFI_PROGRAMS = {
  // DEX Programs
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  JUPITER: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CPMM: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
  ORCA_WHIRLPOOL: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
  METEORA: 'METAewgxyPbgwsseH8T16a39CQ5VyVxZi9zXiDPY18m',
  
  // Token Programs
  TOKEN_PROGRAM: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
  TOKEN_2022: 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb',
  
  // Liquidity Programs
  RAYDIUM_LIQUIDITY: 'RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr',
};

export enum ActivityType {
  SWAP = 'SWAP',
  MINT = 'MINT',
  BURN = 'BURN',
  ADD_LIQUIDITY = 'ADD_LIQUIDITY',
  REMOVE_LIQUIDITY = 'REMOVE_LIQUIDITY',
  TRANSFER = 'TRANSFER',
  STAKE = 'STAKE',
  UNSTAKE = 'UNSTAKE',
  UNKNOWN = 'UNKNOWN'
}

export interface DefiActivity {
  signature: string;
  timestamp: number;
  type: ActivityType;
  program: string;
  programName: string;
  tokens: {
    in?: string;
    out?: string;
    mint?: string;
  };
  amounts: {
    in?: number;
    out?: number;
  };
  status: 'success' | 'failed';
}

export interface DefiProfile {
  wallet: string;
  activities: DefiActivity[];
  stats: {
    totalActivities: number;
    swaps: number;
    mints: number;
    burns: number;
    liquidityOps: number;
    programUsage: Record<string, number>;
    uniquePrograms: number;
  };
  patterns: {
    isSerialMinter: boolean;
    hasQuickLPRemoval: boolean;
    hasBurnActivity: boolean;
    avgTimeBetweenMintAndLP: number | null;
  };
}

export class DefiActivityAnalyzer {
  private getProgramName(programId: string): string {
    const programs: Record<string, string> = {
      [DEFI_PROGRAMS.PUMP_FUN]: 'Pump.fun',
      [DEFI_PROGRAMS.JUPITER]: 'Jupiter',
      [DEFI_PROGRAMS.JUPITER_V6]: 'Jupiter V6',
      [DEFI_PROGRAMS.RAYDIUM_AMM]: 'Raydium AMM',
      [DEFI_PROGRAMS.RAYDIUM_CPMM]: 'Raydium CPMM',
      [DEFI_PROGRAMS.ORCA_WHIRLPOOL]: 'Orca Whirlpool',
      [DEFI_PROGRAMS.METEORA]: 'Meteora',
      [DEFI_PROGRAMS.TOKEN_PROGRAM]: 'SPL Token',
      [DEFI_PROGRAMS.TOKEN_2022]: 'Token-2022',
      [DEFI_PROGRAMS.RAYDIUM_LIQUIDITY]: 'Raydium Liquidity',
    };
    return programs[programId] || 'Unknown';
  }

  private determineActivityType(tx: ParsedTransactionWithMeta, program: string): ActivityType {
    if (!tx.meta || !tx.transaction.message.instructions) {
      return ActivityType.UNKNOWN;
    }

    const instructions = tx.transaction.message.instructions;
    
    // Check for pump.fun mint
    if (program === DEFI_PROGRAMS.PUMP_FUN) {
      return ActivityType.MINT;
    }
    
    // Check for swaps (Jupiter, Raydium, Orca)
    if ([DEFI_PROGRAMS.JUPITER, DEFI_PROGRAMS.JUPITER_V6, DEFI_PROGRAMS.RAYDIUM_AMM, DEFI_PROGRAMS.ORCA_WHIRLPOOL].includes(program)) {
      return ActivityType.SWAP;
    }
    
    // Check for liquidity operations
    if ([DEFI_PROGRAMS.RAYDIUM_LIQUIDITY, DEFI_PROGRAMS.METEORA].includes(program)) {
      // Analyze pre/post balances to determine if add or remove
      const preBalances = tx.meta.preBalances;
      const postBalances = tx.meta.postBalances;
      
      if (postBalances[0] < preBalances[0]) {
        return ActivityType.ADD_LIQUIDITY;
      } else {
        return ActivityType.REMOVE_LIQUIDITY;
      }
    }
    
    // Check for token burns/mints in SPL token program
    if (program === DEFI_PROGRAMS.TOKEN_PROGRAM || program === DEFI_PROGRAMS.TOKEN_2022) {
      for (const ix of instructions) {
        if ('parsed' in ix && ix.parsed) {
          const type = ix.parsed.type;
          if (type === 'burn') return ActivityType.BURN;
          if (type === 'mintTo') return ActivityType.MINT;
          if (type === 'transfer') return ActivityType.TRANSFER;
        }
      }
    }
    
    return ActivityType.UNKNOWN;
  }

  /**
   * Analyze wallet's DeFi activity history
   */
  async analyzeWallet(
    connection: Connection,
    walletAddress: string,
    limit: number = 1000
  ): Promise<DefiProfile> {
    const pubkey = new PublicKey(walletAddress);
    const activities: DefiActivity[] = [];
    const programUsage: Record<string, number> = {};

    try {
      // Fetch transaction signatures
      const signatures = await connection.getSignaturesForAddress(pubkey, { limit });
      
      console.log(`📊 [DefiAnalyzer] Analyzing ${signatures.length} transactions for ${walletAddress.slice(0, 8)}...`);
      
      // Fetch and parse each transaction
      // getParsedTransactions has strict limits: ~10-20 req/min per server
      // With 20 servers rotating: 200-400 req/min total capacity
      // Safe rate: 3 req/sec = 180 req/min (leaves headroom)
      for (let i = 0; i < signatures.length; i += 5) {
        const batch = signatures.slice(i, Math.min(i + 5, signatures.length));
        
        // Method-specific rate limit: 500ms delay = 2 req/sec (very conservative)
        // This ensures we stay under 10 req/min even if server rotation fails
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
        
        const txs = await connection.getParsedTransactions(
          batch.map(s => s.signature),
          { maxSupportedTransactionVersion: 0 }
        );
        
        for (let j = 0; j < txs.length; j++) {
          const tx = txs[j];
          const sig = batch[j];
          
          if (!tx || !tx.transaction) continue;
          
          // Extract all program IDs from the transaction
          const programIds = new Set<string>();
          for (const ix of tx.transaction.message.instructions) {
            if ('programId' in ix) {
              programIds.add(ix.programId.toString());
            }
          }
          
          // Find DeFi-related programs
          for (const programId of programIds) {
            if (Object.values(DEFI_PROGRAMS).includes(programId)) {
              const activityType = this.determineActivityType(tx, programId);
              const programName = this.getProgramName(programId);
              
              // Track program usage
              programUsage[programName] = (programUsage[programName] || 0) + 1;
              
              activities.push({
                signature: sig.signature,
                timestamp: (sig.blockTime || 0) * 1000,
                type: activityType,
                program: programId,
                programName,
                tokens: {}, // TODO: Extract token info
                amounts: {}, // TODO: Extract amounts
                status: tx.meta?.err ? 'failed' : 'success'
              });
            }
          }
        }
        
        // Progress logging
        if ((i + 5) % 25 === 0 || i + 5 >= signatures.length) {
          console.log(`   Progress: ${Math.min(i + 5, signatures.length)}/${signatures.length} checked`);
        }
      }
      
      // Calculate stats
      const stats = {
        totalActivities: activities.length,
        swaps: activities.filter(a => a.type === ActivityType.SWAP).length,
        mints: activities.filter(a => a.type === ActivityType.MINT).length,
        burns: activities.filter(a => a.type === ActivityType.BURN).length,
        liquidityOps: activities.filter(a => 
          a.type === ActivityType.ADD_LIQUIDITY || a.type === ActivityType.REMOVE_LIQUIDITY
        ).length,
        programUsage,
        uniquePrograms: Object.keys(programUsage).length
      };
      
      // Detect patterns
      const mints = activities.filter(a => a.type === ActivityType.MINT);
      const lpRemovals = activities.filter(a => a.type === ActivityType.REMOVE_LIQUIDITY);
      const burns = activities.filter(a => a.type === ActivityType.BURN);
      
      const patterns = {
        isSerialMinter: mints.length > 3,
        hasQuickLPRemoval: lpRemovals.length > 0 && mints.length > 0,
        hasBurnActivity: burns.length > 0,
        avgTimeBetweenMintAndLP: null as number | null
      };
      
      console.log(`✅ [DefiAnalyzer] Analysis complete: ${activities.length} DeFi activities found`);
      console.log(`   Programs used: ${Object.keys(programUsage).join(', ')}`);
      console.log(`   Swaps: ${stats.swaps}, Mints: ${stats.mints}, Burns: ${stats.burns}, LP Ops: ${stats.liquidityOps}`);
      
      return {
        wallet: walletAddress,
        activities,
        stats,
        patterns
      };
      
    } catch (error) {
      console.error(`❌ [DefiAnalyzer] Error analyzing ${walletAddress}:`, error);
      throw error;
    }
  }
}

export const defiActivityAnalyzer = new DefiActivityAnalyzer();
