import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';

export interface TokenPool {
  pool_address: string;           // PK
  mint_address: string;            // Maps to token_mint in pool_info
  name?: string;                   // Pool description
  pool_name?: string;              // Display name
  base_token?: string;             // Maps to base_token_address
  base_token_symbol?: string;      // Symbol
  quote_token?: string;            // Maps to quote_token_address
  quote_token_symbol?: string;     // Symbol
  dex?: string;                    // Maps to dex_id
  volume_24h_usd?: number;         // Market data
  liquidity_usd?: number;          // Market data
  price_usd?: number;              // Market data
  is_primary?: number;             // Primary pool flag
  pool_created_at?: number;        // Creation timestamp
  discovered_at?: number;          // When we found it
  last_updated?: number;           // Last update timestamp
  last_verified?: number;          // Last verification timestamp
}

export class TokenPoolProvider {
  static async create(pool: Omit<TokenPool, 'pool_address'> & { pool_address: string }): Promise<void> {
    const sql = `
      INSERT OR REPLACE INTO pool_info (
        pool_address, token_mint, name, pool_name,
        base_token_address, base_token_symbol,
        quote_token_address, quote_token_symbol,
        dex_id, volume_24h_usd, liquidity_usd, price_usd,
        is_primary, pool_created_at, discovered_at, last_updated, last_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    try {
      const now = Date.now();
      await execute(sql, [
        pool.pool_address,
        pool.mint_address,
        pool.name || pool.pool_name || `${pool.dex || 'Unknown'} Pool`,
        pool.pool_name || null,
        pool.base_token || null,
        pool.base_token_symbol || null,
        pool.quote_token || null,
        pool.quote_token_symbol || null,
        pool.dex || null,
        pool.volume_24h_usd || null,
        pool.liquidity_usd || null,
        pool.price_usd || null,
        pool.is_primary || 0,
        pool.pool_created_at || pool.discovered_at || now,
        pool.discovered_at || now,
        pool.last_updated || now,
        pool.last_verified || null
      ]);
      saveDatabase();
      console.log(`✅ [TokenPool] Created pool ${pool.pool_address.slice(0, 8)}... for mint ${pool.mint_address.slice(0, 8)}...`);
    } catch (error: any) {
      console.error('Error creating token pool:', error);
      throw error;
    }
  }

  static async findByMintAddress(mintAddress: string): Promise<TokenPool[]> {
    const sql = `
      SELECT 
        pool_address,
        token_mint as mint_address,
        name,
        pool_name,
        base_token_address as base_token,
        base_token_symbol,
        quote_token_address as quote_token,
        quote_token_symbol,
        dex_id as dex,
        volume_24h_usd,
        liquidity_usd,
        price_usd,
        is_primary,
        pool_created_at,
        discovered_at,
        last_updated,
        last_verified
      FROM pool_info 
      WHERE token_mint = ?
    `;
    return queryAll<TokenPool>(sql, [mintAddress]);
  }

  static async findByPoolAddress(poolAddress: string): Promise<TokenPool | undefined> {
    const sql = `
      SELECT 
        pool_address,
        token_mint as mint_address,
        name,
        pool_name,
        base_token_address as base_token,
        base_token_symbol,
        quote_token_address as quote_token,
        quote_token_symbol,
        dex_id as dex,
        volume_24h_usd,
        liquidity_usd,
        price_usd,
        is_primary,
        pool_created_at,
        discovered_at,
        last_updated,
        last_verified
      FROM pool_info 
      WHERE pool_address = ?
    `;
    return queryOne<TokenPool>(sql, [poolAddress]);
  }

  static async findPrimaryPool(mintAddress: string): Promise<TokenPool | undefined> {
    const sql = `
      SELECT 
        pool_address,
        token_mint as mint_address,
        name,
        pool_name,
        base_token_address as base_token,
        base_token_symbol,
        quote_token_address as quote_token,
        quote_token_symbol,
        dex_id as dex,
        volume_24h_usd,
        liquidity_usd,
        price_usd,
        is_primary,
        pool_created_at,
        discovered_at,
        last_updated,
        last_verified
      FROM pool_info 
      WHERE token_mint = ? AND is_primary = 1
    `;
    return queryOne<TokenPool>(sql, [mintAddress]);
  }

  static async update(poolAddress: string, updates: Partial<TokenPool>): Promise<void> {
    // Map interface fields to actual column names
    const columnMap: Record<string, string> = {
      'mint_address': 'token_mint',
      'dex': 'dex_id',
      'base_token': 'base_token_address',
      'quote_token': 'quote_token_address'
    };
    
    const updateFields = Object.keys(updates)
      .map(key => `${columnMap[key] || key} = ?`)
      .join(', ');
    
    const sql = `UPDATE pool_info SET ${updateFields}, last_updated = ? WHERE pool_address = ?`;
    await execute(sql, [...Object.values(updates), Date.now(), poolAddress]);
    saveDatabase();
  }

  static async markAsPrimary(mintAddress: string, poolAddress: string): Promise<void> {
    // First, unmark all pools for this mint
    await execute('UPDATE pool_info SET is_primary = 0 WHERE token_mint = ?', [mintAddress]);
    
    // Then mark the specified pool as primary
    await execute('UPDATE pool_info SET is_primary = 1 WHERE pool_address = ?', [poolAddress]);
    saveDatabase();
    
    console.log(`✅ [TokenPool] Marked ${poolAddress.slice(0, 8)}... as primary pool for ${mintAddress.slice(0, 8)}...`);
  }

  static async deleteAll(): Promise<void> {
    await execute('DELETE FROM pool_info', []);
    saveDatabase();
  }
}
