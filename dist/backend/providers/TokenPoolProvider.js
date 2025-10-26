import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
export class TokenPoolProvider {
    static async create(pool) {
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
        }
        catch (error) {
            if (!error.message?.includes('UNIQUE constraint failed')) {
                console.error('Error creating token pool:', error);
                throw error;
            }
            // Pool already exists - this is fine
        }
    }
    static async findByMintAddress(mintAddress) {
        const sql = 'SELECT * FROM token_pools WHERE mint_address = ?';
        return queryAll(sql, [mintAddress]);
    }
    static async findByPoolAddress(poolAddress) {
        const sql = 'SELECT * FROM token_pools WHERE pool_address = ?';
        return queryOne(sql, [poolAddress]);
    }
    static async findPrimaryPool(mintAddress) {
        const sql = 'SELECT * FROM token_pools WHERE mint_address = ? AND is_primary = 1';
        return queryOne(sql, [mintAddress]);
    }
    static async update(poolAddress, updates) {
        const updateFields = Object.keys(updates)
            .map(key => `${key} = ?`)
            .join(', ');
        const sql = `UPDATE token_pools SET ${updateFields} WHERE pool_address = ?`;
        await execute(sql, [...Object.values(updates), poolAddress]);
        saveDatabase();
    }
    static async markAsPrimary(mintAddress, poolAddress) {
        // First, unmark all pools for this mint
        await execute('UPDATE token_pools SET is_primary = 0 WHERE mint_address = ?', [mintAddress]);
        // Then mark the specified pool as primary
        await execute('UPDATE token_pools SET is_primary = 1 WHERE pool_address = ?', [poolAddress]);
        saveDatabase();
        console.log(`✅ [TokenPool] Marked ${poolAddress.slice(0, 8)}... as primary pool for ${mintAddress.slice(0, 8)}...`);
    }
    static async deleteAll() {
        await execute('DELETE FROM token_pools', []);
        saveDatabase();
    }
}
