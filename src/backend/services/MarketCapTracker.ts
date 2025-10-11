/**
 * Market Cap Tracker using DexScreener API (backend data only)
 * Fetches token market cap data for pump.fun tokens
 * Note: Frontend displays GMGN.ai and Pump.fun links for users
 */

export interface TokenMarketData {
  mintAddress: string;
  currentMcap: number;
  athMcap: number;
  priceUsd: number;
  liquidity: number;
  volume24h: number;
  priceChange24h: number;
  chainId: string;
  dexId: string;
  pairAddress: string;
}

export class MarketCapTracker {
  private baseUrl = 'https://api.dexscreener.com/latest/dex';
  private cache: Map<string, { data: TokenMarketData; timestamp: number }> = new Map();
  private cacheDuration = 60000; // 1 minute cache

  async getTokenMarketData(mintAddress: string): Promise<TokenMarketData | null> {
    try {
      // Check cache first
      const cached = this.cache.get(mintAddress);
      if (cached && Date.now() - cached.timestamp < this.cacheDuration) {
        return cached.data;
      }

      console.log(`📊 [MarketCap] Fetching data for ${mintAddress.slice(0, 8)}...`);

      // Fetch from DexScreener
      const response = await fetch(`${this.baseUrl}/tokens/${mintAddress}`);

      if (!response.ok) {
        console.log(`⚠️  [MarketCap] API returned ${response.status} for ${mintAddress.slice(0, 8)}`);
        return null;
      }

      const data = await response.json();

      // DexScreener returns pairs array
      if (!data.pairs || data.pairs.length === 0) {
        console.log(`⚠️  [MarketCap] No pairs found for ${mintAddress.slice(0, 8)}`);
        return null;
      }

      // Get the most liquid pair (usually the main one)
      const mainPair = data.pairs.reduce((prev: any, current: any) => {
        return (current.liquidity?.usd || 0) > (prev.liquidity?.usd || 0) ? current : prev;
      });

      const marketData: TokenMarketData = {
        mintAddress,
        currentMcap: mainPair.fdv || mainPair.marketCap || 0,
        athMcap: mainPair.fdv || mainPair.marketCap || 0, // Initial value, will update over time
        priceUsd: parseFloat(mainPair.priceUsd || '0'),
        liquidity: mainPair.liquidity?.usd || 0,
        volume24h: mainPair.volume?.h24 || 0,
        priceChange24h: mainPair.priceChange?.h24 || 0,
        chainId: mainPair.chainId || 'solana',
        dexId: mainPair.dexId || 'unknown',
        pairAddress: mainPair.pairAddress || ''
      };

      // Cache the result
      this.cache.set(mintAddress, {
        data: marketData,
        timestamp: Date.now()
      });

      console.log(`✅ [MarketCap] ${mintAddress.slice(0, 8)}: $${this.formatNumber(marketData.currentMcap)}`);

      return marketData;
    } catch (error) {
      console.error(`❌ [MarketCap] Error fetching data for ${mintAddress}:`, error);
      return null;
    }
  }

  async updateTokenMarketCap(mintAddress: string, currentATH: number = 0): Promise<{
    currentMcap: number;
    athMcap: number;
  } | null> {
    const marketData = await this.getTokenMarketData(mintAddress);

    if (!marketData) {
      return null;
    }

    // Update ATH if current is higher
    const newATH = Math.max(currentATH, marketData.currentMcap);

    return {
      currentMcap: marketData.currentMcap,
      athMcap: newATH
    };
  }

  private formatNumber(num: number): string {
    if (num >= 1_000_000) {
      return `${(num / 1_000_000).toFixed(2)}M`;
    } else if (num >= 1_000) {
      return `${(num / 1_000).toFixed(2)}K`;
    }
    return num.toFixed(2);
  }

  clearCache() {
    this.cache.clear();
  }
}
