/**
 * Unified Token Provider
 * Single interface for all token operations using token_registry + token_market_data
 * Replaces the fragmented TokenMintProvider system
 */

import { queryOne, queryAll, execute } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';

export interface TokenRegistryEntry {
  id?: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  token_decimals?: number;
  
  // Discovery info
  first_seen_at: number;
  first_source_type: string;
  first_source_details?: string;
  
  // Creator/platform
  creator_address?: string;
  platform?: string;
  creation_signature?: string;
  
  // Stats
  total_mentions?: number;
  telegram_mentions?: number;
  wallet_transactions?: number;
  total_trades?: number;
  
  // Metadata
  is_verified?: boolean;
  is_scam?: boolean;
  tags?: string;
  notes?: string;
}

export interface TokenMarketData {
  mint_address: string;
  symbol?: string;
  name?: string;
  price_usd?: number;
  price_sol?: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  price_change_24h?: number;
  fdv?: number;
  total_supply?: number;
  last_updated: number;
}

export interface TokenWithMarketData extends TokenRegistryEntry {
  // Market data fields
  price_usd?: number;
  price_sol?: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  price_change_24h?: number;
}

export class UnifiedTokenProvider {
  
  /**
   * Register a new token or update if exists
   */
  static async registerToken(token: Partial<TokenRegistryEntry>): Promise<void> {
    if (!token.token_mint) {
      throw new Error('token_mint is required');
    }

    const existing = await this.getToken(token.token_mint);
    
    if (existing) {
      // Update existing token
      await this.updateToken(token.token_mint, token);
    } else {
      // Insert new token
      const fields = Object.keys(token);
      const placeholders = fields.map(() => '?');
      const values = fields.map(f => (token as any)[f]);
      
      await execute(
        `INSERT INTO token_registry (${fields.join(', ')}) VALUES (${placeholders.join(', ')})`,
        values
      );
      saveDatabase();
    }
  }

  /**
   * Get token with market data
   */
  static async getToken(mintAddress: string): Promise<TokenWithMarketData | undefined> {
    return await queryOne<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.price_sol,
        tmd.market_cap_usd,
        tmd.volume_24h_usd,
        tmd.liquidity_usd,
        tmd.price_change_24h
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tr.token_mint = ?
    `, [mintAddress]);
  }

  /**
   * Update token registry entry
   */
  static async updateToken(mintAddress: string, updates: Partial<TokenRegistryEntry>): Promise<void> {
    const fields = Object.keys(updates).filter(k => k !== 'token_mint');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => (updates as any)[f]);
    
    await execute(
      `UPDATE token_registry SET ${setClause}, updated_at = strftime('%s', 'now') WHERE token_mint = ?`,
      [...values, mintAddress]
    );
    saveDatabase();
  }

  /**
   * Update or insert market data
   */
  static async updateMarketData(data: Partial<TokenMarketData>): Promise<void> {
    if (!data.mint_address) {
      throw new Error('mint_address is required');
    }

    // Ensure token exists in registry first
    const token = await this.getToken(data.mint_address);
    if (!token) {
      // Auto-register token if not exists
      await this.registerToken({
        token_mint: data.mint_address,
        token_symbol: data.symbol,
        token_name: data.name,
        first_seen_at: Math.floor(Date.now() / 1000),
        first_source_type: 'market_data'
      });
    }

    // Upsert market data
    const fields = Object.keys(data);
    const placeholders = fields.map(() => '?');
    const values = fields.map(f => (data as any)[f]);
    
    const updateClause = fields
      .filter(f => f !== 'mint_address')
      .map(f => `${f} = excluded.${f}`)
      .join(', ');

    await execute(`
      INSERT INTO token_market_data (${fields.join(', ')}) 
      VALUES (${placeholders.join(', ')})
      ON CONFLICT(mint_address) DO UPDATE SET ${updateClause}
    `, values);
    saveDatabase();
  }

  /**
   * Get tokens by source type
   */
  static async getTokensBySource(sourceType: string, limit = 100): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tr.first_source_type = ?
      ORDER BY tr.first_seen_at DESC
      LIMIT ?
    `, [sourceType, limit]);
  }

  /**
   * Get tokens by creator
   */
  static async getTokensByCreator(creatorAddress: string): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tr.creator_address = ?
      ORDER BY tr.first_seen_at DESC
    `, [creatorAddress]);
  }

  /**
   * Get recent token discoveries
   */
  static async getRecentTokens(limit = 50): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd,
        tmd.price_change_24h
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      ORDER BY tr.first_seen_at DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get top gainers
   */
  static async getTopGainers(limit = 10): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd,
        tmd.price_change_24h
      FROM token_registry tr
      INNER JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tmd.price_change_24h > 0
      ORDER BY tmd.price_change_24h DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get top losers
   */
  static async getTopLosers(limit = 10): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd,
        tmd.price_change_24h
      FROM token_registry tr
      INNER JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tmd.price_change_24h < 0
      ORDER BY tmd.price_change_24h ASC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Get most mentioned tokens
   */
  static async getMostMentioned(limit = 10): Promise<TokenWithMarketData[]> {
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      ORDER BY tr.total_mentions DESC
      LIMIT ?
    `, [limit]);
  }

  /**
   * Search tokens by name or symbol
   */
  static async searchTokens(query: string, limit = 20): Promise<TokenWithMarketData[]> {
    const searchPattern = `%${query}%`;
    return await queryAll<TokenWithMarketData>(`
      SELECT 
        tr.*,
        tmd.price_usd,
        tmd.market_cap_usd,
        tmd.volume_24h_usd
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      WHERE tr.token_symbol LIKE ? OR tr.token_name LIKE ? OR tr.token_mint LIKE ?
      ORDER BY tmd.market_cap_usd DESC NULLS LAST
      LIMIT ?
    `, [searchPattern, searchPattern, searchPattern, limit]);
  }

  /**
   * Increment mention count
   */
  static async incrementMentions(
    mintAddress: string, 
    source: 'telegram' | 'wallet' | 'general' = 'general'
  ): Promise<void> {
    const updates: any = {
      total_mentions: execute.raw('total_mentions + 1')
    };

    if (source === 'telegram') {
      updates.telegram_mentions = execute.raw('telegram_mentions + 1');
    } else if (source === 'wallet') {
      updates.wallet_transactions = execute.raw('wallet_transactions + 1');
    }

    const fields = Object.keys(updates);
    const setClause = fields.map(f => `${f} = ${f} + 1`).join(', ');
    
    await execute(
      `UPDATE token_registry SET ${setClause}, updated_at = strftime('%s', 'now') WHERE token_mint = ?`,
      [mintAddress]
    );
    saveDatabase();
  }

  /**
   * Get performance stats by source
   */
  static async getSourcePerformance(): Promise<any[]> {
    return await queryAll(`
      SELECT 
        tr.first_source_type,
        COUNT(DISTINCT tr.token_mint) as total_tokens,
        COUNT(DISTINCT CASE WHEN tmd.price_change_24h > 0 THEN tr.token_mint END) as gainers,
        COUNT(DISTINCT CASE WHEN tmd.price_change_24h < 0 THEN tr.token_mint END) as losers,
        AVG(tmd.price_change_24h) as avg_24h_change,
        SUM(tmd.volume_24h_usd) as total_volume_24h,
        AVG(tmd.market_cap_usd) as avg_market_cap
      FROM token_registry tr
      LEFT JOIN token_market_data tmd ON tr.token_mint = tmd.mint_address
      GROUP BY tr.first_source_type
      ORDER BY total_tokens DESC
    `);
  }

  /**
   * Clean up old/inactive tokens
   */
  static async cleanupOldTokens(daysOld = 30): Promise<number> {
    const cutoffTime = Math.floor(Date.now() / 1000) - (daysOld * 24 * 60 * 60);
    
    const result = await execute(`
      DELETE FROM token_registry 
      WHERE first_seen_at < ? 
        AND total_trades = 0 
        AND total_mentions < 2
        AND token_mint NOT IN (
          SELECT mint_address FROM token_market_data WHERE volume_24h_usd > 1000
        )
    `, [cutoffTime]);

    saveDatabase();
    return result.changes || 0;
  }
}

// Export a singleton instance for backward compatibility
export const unifiedTokenProvider = UnifiedTokenProvider;
