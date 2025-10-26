import fetch from 'cross-fetch';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';
/**
 * Token Metadata Fetcher
 * Fetches token metadata and market data from GeckoTerminal API
 * Uses global rate limiter to prevent 429 errors
 */
export class TokenMetadataFetcher {
    constructor() {
        this.GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';
    }
    /**
     * Fetch token metadata and market data from GeckoTerminal (both endpoints)
     */
    async fetchMetadata(mintAddress) {
        try {
            // Call 1: Get market data (price, volume, supply)
            const marketData = await globalGeckoTerminalLimiter.executeRequest(async () => {
                const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}?include_composition=true`;
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' }
                });
                if (!response.ok) {
                    throw new Error(`HTTP ${response.status}`);
                }
                return await response.json();
            }, '/tokens/{address}');
            // Call 2: Get social/score data (optional - don't fail if this endpoint errors)
            let infoData = null;
            try {
                infoData = await globalGeckoTerminalLimiter.executeRequest(async () => {
                    const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}/info`;
                    const response = await fetch(url, {
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return await response.json();
                }, '/tokens/{address}/info');
            }
            catch (error) {
                console.log(`⚠️ [GeckoTerminal] Info endpoint unavailable for ${mintAddress.slice(0, 8)}...: ${error.message}`);
                // Continue without info data
            }
            const attributes = marketData?.data?.attributes;
            const infoAttributes = infoData?.data?.attributes;
            if (!attributes) {
                console.log(`⚠️ [GeckoTerminal] No data for ${mintAddress.slice(0, 8)}...`);
                return null;
            }
            // Debug: Log launchpad_details to see what fields are available
            if (attributes.launchpad_details) {
                console.log(`🔍 [GeckoTerminal] Launchpad details for ${mintAddress.slice(0, 8)}:`, JSON.stringify(attributes.launchpad_details, null, 2));
            }
            const metadata = {
                // Market data from first call
                name: attributes.name || undefined,
                symbol: attributes.symbol || undefined,
                decimals: attributes.decimals || undefined,
                image: attributes.image_url || undefined,
                priceUsd: attributes.price_usd ? parseFloat(attributes.price_usd) : undefined,
                fdvUsd: attributes.fdv_usd ? parseFloat(attributes.fdv_usd) : undefined,
                totalReserveUsd: attributes.total_reserve_in_usd ? parseFloat(attributes.total_reserve_in_usd) : undefined,
                volumeUsd24h: attributes.volume_usd?.h24 ? parseFloat(attributes.volume_usd.h24) : undefined,
                launchpadGraduationPercentage: attributes.launchpad_details?.graduation_percentage || undefined,
                launchpadCompleted: attributes.launchpad_details?.completed || false,
                launchpadCompletedAt: attributes.launchpad_details?.completed_at || null,
                migratedDestinationPoolAddress: attributes.launchpad_details?.migrated_destination_pool_address || null,
                totalSupply: attributes.normalized_total_supply || attributes.total_supply || undefined,
                marketCapUsd: attributes.market_cap_usd ? parseFloat(attributes.market_cap_usd) : undefined,
                coingeckoCoinId: attributes.coingecko_coin_id || null,
                // Social/score data from /info call
                gtScore: infoAttributes?.gt_score || undefined,
                description: infoAttributes?.description || undefined,
                gtScoreDetails: infoAttributes?.gt_score_details || undefined,
                holders: infoAttributes?.holders || undefined,
                twitterHandle: infoAttributes?.twitter_handle || undefined,
                telegramHandle: infoAttributes?.telegram_handle || undefined,
                discordUrl: infoAttributes?.discord_url || undefined,
                websites: infoAttributes?.websites || undefined,
                categories: infoAttributes?.categories || undefined,
                mintAuthority: infoAttributes?.mint_authority || undefined,
                freezeAuthority: infoAttributes?.freeze_authority || undefined,
                isHoneypot: infoAttributes?.is_honeypot || undefined
            };
            console.log(`✅ [GeckoTerminal] ${attributes.name} (${attributes.symbol}) - FDV: $${metadata.fdvUsd?.toFixed(2) || 'N/A'}, Progress: ${metadata.launchpadGraduationPercentage}%`);
            return metadata;
        }
        catch (error) {
            if (error.message.startsWith('HTTP')) {
                console.log(`⚠️ [GeckoTerminal] ${error.message} for ${mintAddress.slice(0, 8)}...`);
            }
            else {
                console.error(`❌ [GeckoTerminal] Error fetching data for ${mintAddress.slice(0, 8)}...:`, error.message);
            }
            return null;
        }
    }
    /**
     * Batch fetch metadata for multiple tokens (up to 30 at a time)
     */
    async fetchMetadataBatch(mintAddresses) {
        const results = new Map();
        const BATCH_SIZE = 30;
        // Process in batches of 30
        for (let i = 0; i < mintAddresses.length; i += BATCH_SIZE) {
            const batch = mintAddresses.slice(i, i + BATCH_SIZE);
            const addresses = batch.join(',');
            try {
                const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
                    const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/multi/${addresses}?include_composition=true`;
                    const response = await fetch(url, {
                        headers: { 'Accept': 'application/json' }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}`);
                    }
                    return await response.json();
                }, '/tokens/multi/{addresses}');
                const tokensData = data?.data;
                if (!tokensData || !Array.isArray(tokensData)) {
                    console.log(`⚠️ [GeckoTerminal] No data for batch of ${batch.length} tokens`);
                    continue;
                }
                // Process each token in the batch
                for (const tokenData of tokensData) {
                    const attributes = tokenData.attributes;
                    if (!attributes)
                        continue;
                    const metadata = {
                        name: attributes.name || undefined,
                        symbol: attributes.symbol || undefined,
                        decimals: attributes.decimals || undefined,
                        image: attributes.image_url || undefined,
                        priceUsd: attributes.price_usd ? parseFloat(attributes.price_usd) : undefined,
                        fdvUsd: attributes.fdv_usd ? parseFloat(attributes.fdv_usd) : undefined,
                        totalReserveUsd: attributes.total_reserve_in_usd ? parseFloat(attributes.total_reserve_in_usd) : undefined,
                        volumeUsd24h: attributes.volume_usd?.h24 ? parseFloat(attributes.volume_usd.h24) : undefined,
                        launchpadGraduationPercentage: attributes.launchpad_details?.graduation_percentage || undefined,
                        launchpadCompleted: attributes.launchpad_details?.completed || false,
                        launchpadCompletedAt: attributes.launchpad_details?.completed_at || null
                    };
                    results.set(attributes.address, metadata);
                }
                console.log(`✅ [GeckoTerminal] Fetched ${tokensData.length}/${batch.length} tokens in batch`);
                // No manual delay needed - global rate limiter handles it
            }
            catch (error) {
                if (error.message.startsWith('HTTP')) {
                    console.log(`⚠️ [GeckoTerminal] ${error.message} for batch of ${batch.length} tokens`);
                }
                else {
                    console.error(`❌ [GeckoTerminal] Error fetching batch:`, error.message);
                }
            }
        }
        return results;
    }
}
