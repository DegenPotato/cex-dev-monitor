import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';

export interface TokenPool {
  id?: number;
  mint_address: string;
  pool_address: string;
  pool_name?: string;
  dex?: string;
  base_token?: string;
  quote_token?: string;
  volume_24h_usd?: number;
  liquidity_usd?: number;
  price_usd?: number;
  is_primary?: number;
  discovered_at: number;
  last_verified?: number;
}

export class TokenPoolProvider {
  static async create(pool: Omit<TokenPool, 'id'>): Promise<void> {
    const sql = `
      INSERT INTO token_pools (
        mint_address, pool_address, pool_name, dex, base_token, quote_token,
        volume_24h_usd, liquidity_usd, price_usd, is_primary, discovered_at, last_verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    try {
      await execute(sql, [
        pool.mint_address,
        pool.pool_address,
        pool.pool_name || null,
        pool.dex || null,
        pool.base_token || null,
        pool.quote_token || null,
        pool.volume_24h_usd || null,
        pool.liquidity_usd || null,
        pool.price_usd || null,
        pool.is_primary || 0,
        pool.discovered_at,
        pool.last_verified || null
      ]);
      saveDatabase();
      console.log(`✅ [TokenPool] Created pool ${pool.pool_address.slice(0, 8)}... for mint ${pool.mint_address.slice(0, 8)}...`);
    } catch (error: any) {
      if (!error.message?.includes('UNIQUE constraint failed')) {
        console.error('Error creating token pool:', error);
        throw error;
      }
      // Pool already exists - this is fine
    }
  }

  static async findByMintAddress(mintAddress: string): Promise<TokenPool[]> {
    const sql = 'SELECT * FROM token_pools WHERE mint_address = ?';
    return queryAll<TokenPool>(sql, [mintAddress]);
  }

  static async findByPoolAddress(poolAddress: string): Promise<TokenPool | undefined> {
    const sql = 'SELECT * FROM token_pools WHERE pool_address = ?';
    return queryOne<TokenPool>(sql, [poolAddress]);
  }

  static async findPrimaryPool(mintAddress: string): Promise<TokenPool | undefined> {
    const sql = 'SELECT * FROM token_pools WHERE mint_address = ? AND is_primary = 1';
    return queryOne<TokenPool>(sql, [mintAddress]);
  }

  static async update(poolAddress: string, updates: Partial<TokenPool>): Promise<void> {
    const updateFields = Object.keys(updates)
      .map(key => `${key} = ?`)
      .join(', ');
    
    const sql = `UPDATE token_pools SET ${updateFields} WHERE pool_address = ?`;
    await execute(sql, [...Object.values(updates), poolAddress]);
    saveDatabase();
  }

  static async markAsPrimary(mintAddress: string, poolAddress: string): Promise<void> {
    // First, unmark all pools for this mint
    await execute('UPDATE token_pools SET is_primary = 0 WHERE mint_address = ?', [mintAddress]);
    
    // Then mark the specified pool as primary
    await execute('UPDATE token_pools SET is_primary = 1 WHERE pool_address = ?', [poolAddress]);
    saveDatabase();
    
    console.log(`✅ [TokenPool] Marked ${poolAddress.slice(0, 8)}... as primary pool for ${mintAddress.slice(0, 8)}...`);
  }
}
