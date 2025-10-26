import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
import { queryAll, execute } from '../database/helpers.js';
export class PoolActivityTracker {
    constructor() {
        this.GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
    }
    /**
     * Search for ALL pools containing a specific token using the search endpoint
     * This is more comprehensive than the token endpoint as it finds all pools
     */
    async searchPoolsForToken(mintAddress, includeTokenData = true) {
        console.log(`🔍 [PoolTracker] Searching ALL pools for token ${mintAddress.slice(0, 8)}...`);
        try {
            const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
                // Use search/pools endpoint which finds ALL pools containing this token
                const includes = includeTokenData ? '&include=base_token,quote_token,dex' : '&include=dex';
                const url = `${this.GECKOTERMINAL_BASE}/search/pools?query=${mintAddress}&network=solana${includes}`;
                console.log(`🔍 [PoolTracker] API URL: ${url}`);
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
                if (response.status === 429) {
                    throw new Error('RATE_LIMITED');
                }
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            });
            if (!data || !data.data) {
                console.log(`📊 [PoolTracker] No pools found for ${mintAddress.slice(0, 8)}...`);
                return null;
            }
            console.log(`✅ [PoolTracker] Found ${data.data.length} pools for ${mintAddress.slice(0, 8)}...`);
            // Log detailed information about each pool found
            data.data.forEach(pool => {
                const attr = pool.attributes;
                console.log(`  📊 Pool: ${attr.name} on ${pool.relationships?.dex?.data.id || 'Unknown DEX'}`);
                console.log(`     Address: ${attr.address}`);
                console.log(`     Created: ${attr.pool_created_at}`);
                console.log(`     Liquidity: $${parseFloat(attr.reserve_in_usd).toLocaleString()}`);
                console.log(`     24h Volume: $${parseFloat(attr.volume_usd.h24).toLocaleString()}`);
                console.log(`     24h Txns: ${attr.transactions.h24.buys} buys, ${attr.transactions.h24.sells} sells`);
            });
            return data;
        }
        catch (error) {
            console.error(`❌ [PoolTracker] Error searching pools for ${mintAddress.slice(0, 8)}...`, error.message);
            return null;
        }
    }
    /**
     * Store ALL pool data in database - captures EVERY field
     */
    async storePoolData(mintAddress, poolData) {
        if (!poolData || !poolData.data || poolData.data.length === 0) {
            return;
        }
        const timestamp = Math.floor(Date.now() / 1000);
        console.log(`💾 [PoolTracker] Storing data for ${poolData.data.length} pools...`);
        // Build token lookup map from included data
        const tokenLookup = new Map();
        if (poolData.included) {
            poolData.included.forEach(item => {
                if (item.type === 'token') {
                    tokenLookup.set(item.id, item.attributes);
                }
            });
        }
        for (const pool of poolData.data) {
            const attr = pool.attributes;
            const poolAddress = attr.address;
            try {
                // Extract token IDs
                const baseTokenId = pool.relationships?.base_token?.data.id;
                const quoteTokenId = pool.relationships?.quote_token?.data.id;
                const dexId = pool.relationships?.dex?.data.id;
                // Get token details from lookup
                const baseToken = baseTokenId ? tokenLookup.get(baseTokenId) : null;
                const quoteToken = quoteTokenId ? tokenLookup.get(quoteTokenId) : null;
                // Parse pool created timestamp
                const poolCreatedAt = attr.pool_created_at ?
                    Math.floor(new Date(attr.pool_created_at).getTime() / 1000) : null;
                // 1. Store/update pool info
                await execute(`
          INSERT OR REPLACE INTO pool_info (
            pool_address, token_mint, name, 
            base_token_address, base_token_symbol,
            quote_token_address, quote_token_symbol,
            dex_id, pool_created_at, last_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    poolAddress,
                    mintAddress,
                    attr.name,
                    baseToken?.address || null,
                    baseToken?.symbol || null,
                    quoteToken?.address || null,
                    quoteToken?.symbol || null,
                    dexId || null,
                    poolCreatedAt,
                    timestamp
                ]);
                // 2. Store pricing data - parse all numeric values
                const parseFloat = (val) => {
                    if (!val || val === 'null' || val === 'NaN')
                        return null;
                    const parsed = Number(val);
                    return isNaN(parsed) ? null : parsed;
                };
                await execute(`
          INSERT INTO pool_pricing (
            pool_address,
            base_token_price_usd, base_token_price_native,
            quote_token_price_usd, quote_token_price_native,
            base_token_price_quote_token, quote_token_price_base_token,
            fdv_usd, market_cap_usd, reserve_in_usd,
            timestamp
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
                    poolAddress,
                    parseFloat(attr.base_token_price_usd),
                    parseFloat(attr.base_token_price_native_currency),
                    parseFloat(attr.quote_token_price_usd),
                    parseFloat(attr.quote_token_price_native_currency),
                    parseFloat(attr.base_token_price_quote_token),
                    parseFloat(attr.quote_token_price_base_token),
                    parseFloat(attr.fdv_usd),
                    parseFloat(attr.market_cap_usd),
                    parseFloat(attr.reserve_in_usd),
                    timestamp
                ]);
                // 3. Store price change percentages
                if (attr.price_change_percentage) {
                    const pc = attr.price_change_percentage;
                    await execute(`
            INSERT INTO pool_price_changes (
              pool_address, m5, m15, m30, h1, h6, h24, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                        poolAddress,
                        parseFloat(pc.m5),
                        parseFloat(pc.m15),
                        parseFloat(pc.m30),
                        parseFloat(pc.h1),
                        parseFloat(pc.h6),
                        parseFloat(pc.h24),
                        timestamp
                    ]);
                }
                // 4. Store transaction data for each timeframe
                if (attr.transactions) {
                    const timeframes = ['m5', 'm15', 'm30', 'h1', 'h6', 'h24'];
                    for (const tf of timeframes) {
                        const txData = attr.transactions[tf];
                        if (txData) {
                            await execute(`
                INSERT INTO pool_transactions (
                  pool_address, timeframe, buys, sells, buyers, sellers, timestamp
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
              `, [
                                poolAddress,
                                tf,
                                txData.buys || 0,
                                txData.sells || 0,
                                txData.buyers || 0,
                                txData.sellers || 0,
                                timestamp
                            ]);
                        }
                    }
                }
                // 5. Store volume data
                if (attr.volume_usd) {
                    const vol = attr.volume_usd;
                    await execute(`
            INSERT INTO pool_volume (
              pool_address, m5_usd, m15_usd, m30_usd, h1_usd, h6_usd, h24_usd, timestamp
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `, [
                        poolAddress,
                        parseFloat(vol.m5),
                        parseFloat(vol.m15),
                        parseFloat(vol.m30),
                        parseFloat(vol.h1),
                        parseFloat(vol.h6),
                        parseFloat(vol.h24),
                        timestamp
                    ]);
                }
                console.log(`  ✅ Stored all data for pool: ${attr.name}`);
            }
            catch (error) {
                console.error(`  ❌ Error storing pool ${poolAddress}:`, error.message);
            }
        }
        console.log(`✅ [PoolTracker] Successfully stored data for all pools`);
    }
    /**
     * Complete workflow: Search pools and store all data
     */
    async trackPoolsForToken(mintAddress) {
        const poolData = await this.searchPoolsForToken(mintAddress, true);
        if (!poolData) {
            return 0;
        }
        await this.storePoolData(mintAddress, poolData);
        return poolData.data.length;
    }
    /**
     * Get latest pool activity summary from database
     */
    async getPoolActivitySummary(mintAddress) {
        return await queryAll(`
      SELECT * FROM pool_activity_summary 
      WHERE token_mint = ? 
      ORDER BY volume_24h_usd DESC
    `, [mintAddress]);
    }
    /**
     * Get pool transaction trends over time
     */
    async getPoolTransactionTrends(poolAddress, hours = 24) {
        const since = Math.floor(Date.now() / 1000) - (hours * 3600);
        return await queryAll(`
      SELECT 
        timeframe,
        AVG(buys) as avg_buys,
        AVG(sells) as avg_sells,
        AVG(buyers) as avg_buyers,
        AVG(sellers) as avg_sellers,
        COUNT(*) as data_points
      FROM pool_transactions
      WHERE pool_address = ? AND timestamp > ?
      GROUP BY timeframe
      ORDER BY 
        CASE timeframe
          WHEN 'm5' THEN 1
          WHEN 'm15' THEN 2
          WHEN 'm30' THEN 3
          WHEN 'h1' THEN 4
          WHEN 'h6' THEN 5
          WHEN 'h24' THEN 6
        END
    `, [poolAddress, since]);
    }
}
// Export singleton instance
export const poolActivityTracker = new PoolActivityTracker();
