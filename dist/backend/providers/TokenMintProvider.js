import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute, getLastInsertId } from '../database/helpers.js';
export class TokenMintProvider {
    static async create(mint) {
        await execute(`INSERT INTO token_mints (
        mint_address, creator_address, name, symbol, timestamp, platform, signature, 
        starting_mcap, current_mcap, ath_mcap, price_usd, price_sol, 
        graduation_percentage, launchpad_completed, launchpad_completed_at, migrated_pool_address,
        total_supply, market_cap_usd, coingecko_coin_id, gt_score, description,
        last_updated, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
            mint.mint_address,
            mint.creator_address,
            mint.name,
            mint.symbol,
            mint.timestamp,
            mint.platform,
            mint.signature,
            mint.starting_mcap,
            mint.current_mcap,
            mint.ath_mcap,
            mint.price_usd,
            mint.price_sol,
            mint.graduation_percentage,
            mint.launchpad_completed,
            mint.launchpad_completed_at,
            mint.migrated_pool_address,
            mint.total_supply,
            mint.market_cap_usd,
            mint.coingecko_coin_id,
            mint.gt_score,
            mint.description,
            mint.last_updated,
            mint.metadata
        ]);
        saveDatabase();
        return await getLastInsertId();
    }
    static async findByMintAddress(mintAddress) {
        return await queryOne('SELECT * FROM token_mints WHERE mint_address = ?', [mintAddress]);
    }
    static async findByCreator(creatorAddress) {
        return await queryAll('SELECT * FROM token_mints WHERE creator_address = ? ORDER BY timestamp DESC', [creatorAddress]);
    }
    static async findAll() {
        return await queryAll('SELECT * FROM token_mints ORDER BY timestamp DESC');
    }
    static async findRecent(limit = 50) {
        return await queryAll('SELECT * FROM token_mints ORDER BY timestamp DESC LIMIT ?', [limit]);
    }
    static async update(mintAddress, updates) {
        const fields = Object.keys(updates).filter(k => k !== 'mint_address');
        if (fields.length === 0)
            return;
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => updates[f]);
        await execute(`UPDATE token_mints SET ${setClause} WHERE mint_address = ?`, [...values, mintAddress]);
        saveDatabase();
    }
    static async delete(mintAddress) {
        await execute('DELETE FROM token_mints WHERE mint_address = ?', [mintAddress]);
        saveDatabase();
    }
    static async deleteAll() {
        await execute('DELETE FROM token_mints', []);
        saveDatabase();
    }
}
