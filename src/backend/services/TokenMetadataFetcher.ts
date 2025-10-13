import fetch from 'cross-fetch';
import { globalGeckoTerminalLimiter } from './GeckoTerminalRateLimiter.js';

/**
 * Token Metadata Fetcher
 * Fetches token metadata and market data from GeckoTerminal API
 * Uses global rate limiter to prevent 429 errors
 */
export class TokenMetadataFetcher {
  private readonly GECKOTERMINAL_BASE = 'https://api.geckoterminal.com/api/v2';

  constructor() {}

  /**
   * Fetch token metadata and market data from GeckoTerminal
   */
  async fetchMetadata(mintAddress: string): Promise<{
    name?: string;
    symbol?: string;
    decimals?: number;
    image?: string;
    priceUsd?: number;
    fdvUsd?: number;
    totalReserveUsd?: number;
    volumeUsd24h?: number;
    launchpadGraduationPercentage?: number;
    launchpadCompleted?: boolean;
    launchpadCompletedAt?: string | null;
  } | null> {
    try {
      const data = await globalGeckoTerminalLimiter.executeRequest(async () => {
        const url = `${this.GECKOTERMINAL_BASE}/networks/solana/tokens/${mintAddress}?include_composition=true`;
        
        const response = await fetch(url, {
          headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        return await response.json();
      });
      const attributes = data?.data?.attributes;
      
      if (!attributes) {
        console.log(`⚠️ [GeckoTerminal] No data for ${mintAddress.slice(0, 8)}...`);
        return null;
      }

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

      console.log(`✅ [GeckoTerminal] ${attributes.name} (${attributes.symbol}) - FDV: $${metadata.fdvUsd?.toFixed(2) || 'N/A'}, Progress: ${metadata.launchpadGraduationPercentage}%`);
      
      return metadata;
    } catch (error: any) {
      if (error.message.startsWith('HTTP')) {
        console.log(`⚠️ [GeckoTerminal] ${error.message} for ${mintAddress.slice(0, 8)}...`);
      } else {
        console.error(`❌ [GeckoTerminal] Error fetching data for ${mintAddress.slice(0, 8)}...:`, error.message);
      }
      return null;
    }
  }

  /**
   * Batch fetch metadata for multiple tokens (up to 30 at a time)
   */
  async fetchMetadataBatch(mintAddresses: string[]): Promise<Map<string, any>> {
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
        });
        const tokensData = data?.data;
        
        if (!tokensData || !Array.isArray(tokensData)) {
          console.log(`⚠️ [GeckoTerminal] No data for batch of ${batch.length} tokens`);
          continue;
        }

        // Process each token in the batch
        for (const tokenData of tokensData) {
          const attributes = tokenData.attributes;
          if (!attributes) continue;
          
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
      } catch (error: any) {
        if (error.message.startsWith('HTTP')) {
          console.log(`⚠️ [GeckoTerminal] ${error.message} for batch of ${batch.length} tokens`);
        } else {
          console.error(`❌ [GeckoTerminal] Error fetching batch:`, error.message);
        }
      }
    }

    return results;
  }
}
