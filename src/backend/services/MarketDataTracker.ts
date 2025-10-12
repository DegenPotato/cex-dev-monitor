import { TokenMintProvider } from '../providers/TokenMintProvider.js';
import fetch from 'cross-fetch';
import { Connection, PublicKey } from '@solana/web3.js';

/**
 * Market Data Tracker using DexScreener API
 * - Polls every 1 minute
 * - Updates current_mcap and ath_mcap
 * - Batch support: 30 tokens per request
 * - Rate limited to 300 calls/minute
 */
export class MarketDataTracker {
  private isRunning = false;
  private intervalId: NodeJS.Timeout | null = null;
  private readonly DEXSCREENER_BASE = 'https://api.dexscreener.com';
  private readonly POLL_INTERVAL = 60 * 1000; // 1 minute
  private readonly BATCH_SIZE = 30; // DexScreener allows up to 30 tokens per request
  private readonly MAX_CALLS_PER_MINUTE = 280; // Stay under 300/min limit
  private readonly DELAY_BETWEEN_CALLS = Math.ceil((60 * 1000) / this.MAX_CALLS_PER_MINUTE);
  private readonly PUMPFUN_PROGRAM_ID = '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P';
  private readonly TOTAL_SUPPLY = 1_000_000_000; // Pump.fun tokens have 1B supply
  private connection: Connection;

  constructor() {
    this.connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
  }

  /**
   * Start polling for market data
   */
  start() {
    if (this.isRunning) {
      console.log('📊 [MarketData] Already running');
      return;
    }

    this.isRunning = true;
    console.log(`📊 [MarketData] Starting tracker (${this.DELAY_BETWEEN_CALLS}ms delay between calls)`);
    
    // Run immediately, then poll every minute
    this.updateAllTokens();
    this.intervalId = setInterval(() => {
      this.updateAllTokens();
    }, this.POLL_INTERVAL);
  }

  /**
   * Stop polling
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('📊 [MarketData] Tracker stopped');
  }

  /**
   * Update all tokens from database using batch requests
   */
  private async updateAllTokens() {
    try {
      const tokens = await TokenMintProvider.findAll();
      console.log(`📊 [MarketData] Updating ${tokens.length} tokens in batches of ${this.BATCH_SIZE}...`);
      
      let updated = 0;
      let failed = 0;

      // Process tokens in batches
      for (let i = 0; i < tokens.length; i += this.BATCH_SIZE) {
        const batch = tokens.slice(i, i + this.BATCH_SIZE);
        const addresses = batch.map(t => t.mint_address);

        try {
          const marketDataMap = await this.fetchTokensBatch(addresses);
          
          // Update each token in the batch
          for (const token of batch) {
            let marketData = marketDataMap.get(token.mint_address);
            
            // PRIORITY: Try Pump.fun on-chain data FIRST for pumpfun tokens
            if (token.platform === 'pumpfun') {
              const pumpFunData = await this.fetchPumpFunData(token.mint_address);
              if (pumpFunData && pumpFunData.marketCap) {
                marketData = {
                  fdv: pumpFunData.marketCap,
                  marketCap: pumpFunData.marketCap
                };
              }
            }
            
            // Fallback to DexScreener if Pump.fun data not available (token graduated to Raydium)
            if (!marketData) {
              marketData = marketDataMap.get(token.mint_address);
            }
            
            if (marketData) {
              const updates: any = {
                current_mcap: marketData.fdv || marketData.marketCap || null,
                last_updated: Date.now()
              };

              // Update starting mcap if not set
              if (!token.starting_mcap && updates.current_mcap) {
                updates.starting_mcap = updates.current_mcap;
              }

              // Update ATH if current is higher
              if (updates.current_mcap && (!token.ath_mcap || updates.current_mcap > token.ath_mcap)) {
                updates.ath_mcap = updates.current_mcap;
              }

              // Update name/symbol if we have it from DexScreener
              if (marketData.name && !token.name) {
                updates.name = marketData.name;
              }
              if (marketData.symbol && !token.symbol) {
                updates.symbol = marketData.symbol;
              }

              await TokenMintProvider.update(token.mint_address, updates);
              updated++;
            } else {
              failed++;
            }
          }

          // Rate limiting delay between batches
          await this.delay(this.DELAY_BETWEEN_CALLS);
        } catch (error: any) {
          console.error(`📊 [MarketData] Error updating batch:`, error.message);
          failed += batch.length;
        }
      }

      console.log(`📊 [MarketData] Update complete: ${updated} updated, ${failed} failed/not found`);
    } catch (error) {
      console.error('📊 [MarketData] Error in updateAllTokens:', error);
    }
  }

  /**
   * Get bonding curve PDA for a Pump.fun token
   */
  private async getBondingCurvePDA(mintAddress: string): Promise<PublicKey> {
    const mint = new PublicKey(mintAddress);
    const programId = new PublicKey(this.PUMPFUN_PROGRAM_ID);
    
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mint.toBuffer()],
      programId
    );
    
    return bondingCurve;
  }

  /**
   * Fetch bonding curve data from Pump.fun on-chain
   * Reads bonding curve account and calculates market cap
   */
  private async fetchPumpFunData(mintAddress: string): Promise<{
    marketCap?: number;
    virtualSolReserves?: number;
    virtualTokenReserves?: number;
    bondingCurveProgress?: number;
  } | null> {
    try {
      const bondingCurvePDA = await this.getBondingCurvePDA(mintAddress);
      
      // Fetch bonding curve account
      const accountInfo = await this.connection.getAccountInfo(bondingCurvePDA);
      
      if (!accountInfo || !accountInfo.data) {
        return null;
      }

      // Parse bonding curve data
      // Layout (simplified, adjust based on actual Pump.fun program):
      // - 8 bytes: virtual_sol_reserves (u64)
      // - 8 bytes: virtual_token_reserves (u64)
      // - 8 bytes: real_sol_reserves (u64)
      // - 8 bytes: real_token_reserves (u64)
      
      const data = accountInfo.data;
      const virtualSolReserves = data.readBigUInt64LE(0);
      const virtualTokenReserves = data.readBigUInt64LE(8);
      // Note: real reserves at offset 16 & 24 if needed later
      
      // Calculate price: SOL per token
      const priceInSol = Number(virtualSolReserves) / Number(virtualTokenReserves);
      
      // TODO: Fetch SOL/USD price from an oracle or API
      const solPriceUSD = 150; // Hardcoded for now, should fetch real-time
      
      // Market cap = price * total supply
      const marketCapUSD = priceInSol * this.TOTAL_SUPPLY * solPriceUSD;
      
      // Calculate bonding curve progress
      const initialTokenReserves = 800_000_000; // Pump.fun starts with 800M tokens
      const tokensLeft = Number(virtualTokenReserves);
      const bondingCurveProgress = ((initialTokenReserves - tokensLeft) / initialTokenReserves) * 100;
      
      console.log(`💎 [PumpFun] ${mintAddress.slice(0, 8)}... - MCap: $${marketCapUSD.toFixed(0)}, Progress: ${bondingCurveProgress.toFixed(1)}%`);
      
      return {
        marketCap: marketCapUSD,
        virtualSolReserves: Number(virtualSolReserves),
        virtualTokenReserves: Number(virtualTokenReserves),
        bondingCurveProgress
      };
    } catch (error: any) {
      console.error(`❌ [PumpFun] Error reading bonding curve for ${mintAddress.slice(0, 8)}...:`, error.message);
      return null;
    }
  }

  /**
   * Fetch market data from DexScreener for multiple tokens (batch)
   * Returns a Map of mint_address -> market data
   */
  private async fetchTokensBatch(mintAddresses: string[]): Promise<Map<string, {
    name?: string;
    symbol?: string;
    priceUsd?: string;
    fdv?: number;
    marketCap?: number;
    liquidity?: number;
    volume24h?: number;
    priceChange24h?: number;
    imageUrl?: string;
    websites?: string[];
    socials?: any[];
  }>> {
    const resultMap = new Map();

    try {
      const addressesParam = mintAddresses.join(',');
      const url = `${this.DEXSCREENER_BASE}/latest/dex/tokens/${addressesParam}`;
      
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        console.error(`📊 [MarketData] DexScreener API error: ${response.status}`);
        return resultMap;
      }

      const data = await response.json();
      
      // Debug: Log the response to see what DexScreener returns
      console.log(`📊 [MarketData] DexScreener response for ${mintAddresses.length} tokens:`, JSON.stringify(data, null, 2));
      
      // DexScreener returns pairs, not direct token data
      // We need to match pairs to our tokens
      if (data.pairs && Array.isArray(data.pairs)) {
        for (const pair of data.pairs) {
          const tokenAddress = pair.baseToken?.address;
          
          if (tokenAddress && mintAddresses.includes(tokenAddress)) {
            resultMap.set(tokenAddress, {
              name: pair.baseToken?.name,
              symbol: pair.baseToken?.symbol,
              priceUsd: pair.priceUsd,
              fdv: pair.fdv,
              marketCap: pair.marketCap,
              liquidity: pair.liquidity?.usd,
              volume24h: pair.volume?.h24,
              priceChange24h: pair.priceChange?.h24,
              imageUrl: pair.info?.imageUrl,
              websites: pair.info?.websites?.map((w: any) => w.url),
              socials: pair.info?.socials
            });
          }
        }
      }

      console.log(`📊 [MarketData] Fetched ${resultMap.size}/${mintAddresses.length} tokens from DexScreener`);
      return resultMap;
    } catch (error: any) {
      console.error(`📊 [MarketData] Error fetching batch:`, error.message);
      return resultMap;
    }
  }

  /**
   * Get status
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      pollInterval: this.POLL_INTERVAL,
      maxCallsPerMinute: this.MAX_CALLS_PER_MINUTE,
      delayBetweenCalls: this.DELAY_BETWEEN_CALLS
    };
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
