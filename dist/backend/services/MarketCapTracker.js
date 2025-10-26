/**
 * Market Cap Tracker using DexScreener API (backend data only)
 * Fetches token market cap data for pump.fun tokens
 * Note: Frontend displays GMGN.ai and Pump.fun links for users
 */
export class MarketCapTracker {
    constructor() {
        this.baseUrl = 'https://api.dexscreener.com/latest/dex';
        this.cache = new Map();
        this.cacheDuration = 60000; // 1 minute cache
    }
    async getTokenMarketData(mintAddress) {
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
            const mainPair = data.pairs.reduce((prev, current) => {
                return (current.liquidity?.usd || 0) > (prev.liquidity?.usd || 0) ? current : prev;
            });
            const marketData = {
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
        }
        catch (error) {
            console.error(`❌ [MarketCap] Error fetching data for ${mintAddress}:`, error);
            return null;
        }
    }
    async updateTokenMarketCap(mintAddress, currentATH = 0) {
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
    formatNumber(num) {
        if (num >= 1000000) {
            return `${(num / 1000000).toFixed(2)}M`;
        }
        else if (num >= 1000) {
            return `${(num / 1000).toFixed(2)}K`;
        }
        return num.toFixed(2);
    }
    clearCache() {
        this.cache.clear();
    }
}
