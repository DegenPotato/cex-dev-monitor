/**
 * TokenRegistrySync - Ensures all tokens from token_mints are in token_registry
 * and provides comprehensive token data with real-time price updates
 */

import { queryAll, queryOne, execute } from '../database/helpers.js';
import { TokenPriceOracle } from './TokenPriceOracle.js';

const tokenPriceOracle = TokenPriceOracle.getInstance();

interface TokenMint {
  mint_address: string;
  token_name?: string;
  token_symbol?: string;
  creator_address?: string;
  timestamp: number;
  platform?: string;
}

interface TokenWithPricing {
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  token_decimals: number;
  first_seen_at: number;
  first_source_type: string;
  
  // Pricing data from Token Price Oracle
  price_usd?: number;
  price_sol?: number;
  price_change_24h?: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  fdv_usd?: number;
  liquidity_usd?: number;
  
  // Launch metrics (calculated from internal data)
  first_seen_price_usd?: number; // Price when first discovered
  launch_price_usd?: number;
  launch_mcap_usd?: number;
  ath_price_usd?: number;
  ath_mcap_usd?: number;
  gain_from_first_seen?: number; // Percentage gain from when first discovered
  gain_from_launch?: number; // Percentage gain from launch
  
  // Metadata
  last_price_update?: number;
  ohlcv_realtime_enabled?: boolean;
}

class TokenRegistrySyncService {
  private syncInterval: NodeJS.Timeout | null = null;
  private readonly SYNC_INTERVAL_MS = 60 * 1000; // 1 minute

  /**
   * Start the sync service
   */
  async start() {
    console.log('🔄 [TokenSync] Starting token registry sync service...');
    
    // Initial sync
    await this.syncTokens();
    await this.syncGeckoDataToRegistry();
    
    // Periodic sync
    this.syncInterval = setInterval(() => {
      this.syncTokens();
      this.syncGeckoDataToRegistry();
    }, this.SYNC_INTERVAL_MS);
    
    console.log('✅ [TokenSync] Token registry sync service started');
  }

  /**
   * Stop the sync service
   */
  stop() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    console.log('⏹️  [TokenSync] Token registry sync service stopped');
  }

  /**
   * Sync tokens from token_mints to token_registry
   */
  private async syncTokens() {
    try {
      // Get all tokens from token_mints that aren't in token_registry
      const missingTokens = await queryAll<TokenMint>(`
        SELECT DISTINCT 
          tm.mint_address,
          tm.mint_name as token_name,
          tm.mint_symbol as token_symbol,
          tm.creator_address,
          tm.timestamp,
          tm.platform
        FROM token_mints tm
        WHERE NOT EXISTS (
          SELECT 1 FROM token_registry tr 
          WHERE tr.token_mint = tm.mint_address
        )
      `);

      if (missingTokens.length === 0) {
        return;
      }

      console.log(`🔄 [TokenSync] Syncing ${missingTokens.length} tokens to registry...`);

      for (const token of missingTokens) {
        await this.addTokenToRegistry(token);
      }

      console.log(`✅ [TokenSync] Synced ${missingTokens.length} tokens to registry`);
    } catch (error: any) {
      console.error('❌ [TokenSync] Error syncing tokens:', error.message);
    }
  }

  /**
   * Add a token from token_mints to token_registry
   */
  private async addTokenToRegistry(token: TokenMint) {
    try {
      await execute(`
        INSERT INTO token_registry (
          token_mint,
          token_symbol,
          token_name,
          token_decimals,
          first_seen_at,
          first_source_type,
          first_source_details
        ) VALUES (?, ?, ?, 9, ?, 'dex_scan', ?)
      `, [
        token.mint_address,
        token.token_symbol || null,
        token.token_name || null,
        token.timestamp || Date.now(),
        JSON.stringify({
          platform: token.platform,
          creator: token.creator_address
        })
      ]);
      
      // Trigger immediate price fetch for new token
      console.log(`🪙 [TokenSync] New token registered: ${token.mint_address.slice(0, 8)}... - triggering price fetch`);
      tokenPriceOracle.fetchNewToken(token.mint_address).catch(err => {
        console.error(`❌ [TokenSync] Failed to trigger price fetch for ${token.mint_address.slice(0, 8)}...`, err);
      });
    } catch (error: any) {
      // Ignore duplicates
      if (!error.message.includes('UNIQUE constraint')) {
        console.error(`❌ [TokenSync] Error adding token ${token.mint_address}:`, error.message);
      }
    }
  }

  /**
   * Sync data from gecko_token_latest to token_registry
   * Updates symbol, name, decimals, graduation status, etc.
   */
  private async syncGeckoDataToRegistry() {
    try {
      // Get tokens that exist in both gecko_token_latest and token_registry
      const tokensToUpdate = await queryAll<{
        mint_address: string;
        symbol: string | null;
        name: string | null;
        decimals: number | null;
        launchpad_completed: number;
        launchpad_completed_at: number | null;
        launchpad_migrated_pool_address: string | null;
      }>(`
        SELECT 
          g.mint_address,
          g.symbol,
          g.name,
          g.decimals,
          g.launchpad_completed,
          g.launchpad_completed_at,
          g.launchpad_migrated_pool_address
        FROM gecko_token_latest g
        INNER JOIN token_registry tr ON tr.token_mint = g.mint_address
        WHERE 
          -- Only update if data differs
          (tr.token_symbol IS NULL OR tr.token_symbol != g.symbol)
          OR (tr.token_name IS NULL OR tr.token_name != g.name)
          OR (tr.token_decimals IS NULL OR tr.token_decimals != g.decimals)
          OR (tr.is_graduated IS NULL OR tr.is_graduated != g.launchpad_completed)
          OR (tr.graduated_at IS NULL AND g.launchpad_completed_at IS NOT NULL)
          OR (tr.migrated_pool_address IS NULL AND g.launchpad_migrated_pool_address IS NOT NULL)
      `);

      if (tokensToUpdate.length === 0) {
        return;
      }

      console.log(`🔄 [TokenSync] Updating ${tokensToUpdate.length} tokens from Gecko data...`);

      for (const token of tokensToUpdate) {
        await execute(`
          UPDATE token_registry
          SET 
            token_symbol = COALESCE(?, token_symbol),
            token_name = COALESCE(?, token_name),
            token_decimals = COALESCE(?, token_decimals),
            is_graduated = ?,
            graduated_at = COALESCE(?, graduated_at),
            migrated_pool_address = COALESCE(?, migrated_pool_address),
            updated_at = strftime('%s', 'now')
          WHERE token_mint = ?
        `, [
          token.symbol,
          token.name,
          token.decimals,
          token.launchpad_completed,
          token.launchpad_completed_at,
          token.launchpad_migrated_pool_address,
          token.mint_address
        ]);
      }

      console.log(`✅ [TokenSync] Updated ${tokensToUpdate.length} tokens with Gecko data`);
    } catch (error: any) {
      console.error('❌ [TokenSync] Error syncing Gecko data:', error.message);
    }
  }

  /**
   * Get comprehensive token data with real-time pricing
   */
  async getTokensWithPricing(limit: number = 100, offset: number = 0): Promise<TokenWithPricing[]> {
    try {
      // Get tokens from registry
      const tokens = await queryAll<any>(`
        SELECT 
          tr.token_mint,
          tr.token_symbol,
          tr.token_name,
          tr.token_decimals,
          tr.first_seen_at,
          tr.first_source_type,
          tm.ohlcv_realtime_enabled
        FROM token_registry tr
        LEFT JOIN token_mints tm ON tm.mint_address = tr.token_mint
        ORDER BY tr.first_seen_at DESC
        LIMIT ? OFFSET ?
      `, [limit, offset]);

      // Get mint addresses
      const mintAddresses = tokens.map((t: any) => t.token_mint);
      
      // Fetch prices from Token Price Oracle
      const prices = await tokenPriceOracle.getTokenPrices(mintAddresses);

      // Combine data
      const tokensWithPricing: TokenWithPricing[] = [];

      for (const token of tokens) {
        const priceData = prices.get(token.token_mint);
        
        // Get launch metrics from OHLCV data
        const launchMetrics = await this.getLaunchMetrics(token.token_mint);

        tokensWithPricing.push({
          ...token,
          price_usd: priceData?.priceUsd,
          price_sol: priceData?.priceSol,
          price_change_24h: priceData?.priceChange24h,
          market_cap_usd: priceData?.marketCap,
          volume_24h_usd: priceData?.volume24h,
          fdv_usd: priceData?.fdv,
          liquidity_usd: priceData?.liquidity,
          last_price_update: priceData?.lastUpdated,
          ...launchMetrics
        });
      }

      return tokensWithPricing;
    } catch (error: any) {
      console.error('❌ [TokenSync] Error getting tokens with pricing:', error.message);
      return [];
    }
  }

  /**
   * Get launch metrics from internal OHLCV data
   */
  private async getLaunchMetrics(mintAddress: string): Promise<{
    first_seen_price_usd?: number;
    launch_price_usd?: number;
    launch_mcap_usd?: number;
    ath_price_usd?: number;
    ath_mcap_usd?: number;
    gain_from_first_seen?: number;
    gain_from_launch?: number;
  }> {
    try {
      // Get token registry entry to find first_seen_at timestamp
      const registryEntry = await queryOne<{ first_seen_at: number }>(`
        SELECT first_seen_at
        FROM token_registry
        WHERE token_mint = ?
      `, [mintAddress]);

      // Get earliest OHLCV data (launch price)
      const launchData = await queryOne<{ open: number; high: number; market_cap: number }>(`
        SELECT open, high, market_cap
        FROM ohlcv_data
        WHERE mint_address = ?
        ORDER BY timestamp ASC
        LIMIT 1
      `, [mintAddress]);

      // Get price at first_seen_at timestamp (or closest after)
      let firstSeenPrice: number | undefined;
      if (registryEntry?.first_seen_at) {
        const firstSeenData = await queryOne<{ open: number; high: number; close: number }>(`
          SELECT open, high, close
          FROM ohlcv_data
          WHERE mint_address = ?
            AND timestamp >= ?
          ORDER BY timestamp ASC
          LIMIT 1
        `, [mintAddress, registryEntry.first_seen_at]);
        
        firstSeenPrice = firstSeenData?.open || firstSeenData?.close || firstSeenData?.high;
      }

      // Get ATH from OHLCV data
      const athData = await queryOne<{ high: number; market_cap: number }>(`
        SELECT MAX(high) as high, MAX(market_cap) as market_cap
        FROM ohlcv_data
        WHERE mint_address = ?
      `, [mintAddress]);

      // Get current price from token_market_data
      const currentData = await queryOne<{ price_usd: number }>(`
        SELECT price_usd
        FROM token_market_data
        WHERE mint_address = ?
      `, [mintAddress]);

      const launchPrice = launchData?.open || launchData?.high;
      const currentPrice = currentData?.price_usd;
      
      const gainFromLaunch = launchPrice && currentPrice 
        ? ((currentPrice - launchPrice) / launchPrice) * 100
        : undefined;

      const gainFromFirstSeen = firstSeenPrice && currentPrice
        ? ((currentPrice - firstSeenPrice) / firstSeenPrice) * 100
        : undefined;

      return {
        first_seen_price_usd: firstSeenPrice,
        launch_price_usd: launchPrice,
        launch_mcap_usd: launchData?.market_cap,
        ath_price_usd: athData?.high,
        ath_mcap_usd: athData?.market_cap,
        gain_from_first_seen: gainFromFirstSeen,
        gain_from_launch: gainFromLaunch
      };
    } catch (error: any) {
      return {};
    }
  }

  /**
   * Get analytics for token registry
   */
  async getAnalytics() {
    try {
      const totalTokens = await queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM token_registry
      `);

      const tokens24h = await queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM token_registry
        WHERE first_seen_at > strftime('%s', 'now', '-1 day') * 1000
      `);

      const tokens7d = await queryOne<{ count: number }>(`
        SELECT COUNT(*) as count FROM token_registry
        WHERE first_seen_at > strftime('%s', 'now', '-7 days') * 1000
      `);

      const bySource = await queryAll<{ first_source_type: string; count: number }>(`
        SELECT first_source_type, COUNT(*) as count
        FROM token_registry
        GROUP BY first_source_type
      `);

      return {
        total_tokens: totalTokens?.count || 0,
        tokens_24h: tokens24h?.count || 0,
        tokens_7d: tokens7d?.count || 0,
        by_source: bySource.reduce((acc, row) => {
          acc[row.first_source_type] = row.count;
          return acc;
        }, {} as Record<string, number>)
      };
    } catch (error: any) {
      console.error('❌ [TokenSync] Error getting analytics:', error.message);
      return null;
    }
  }
}

// Export singleton instance
export const tokenRegistrySync = new TokenRegistrySyncService();
