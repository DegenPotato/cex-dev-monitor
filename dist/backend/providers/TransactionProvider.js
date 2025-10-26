import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute, getLastInsertId } from '../database/helpers.js';
export class TransactionProvider {
    static async create(transaction) {
        await execute(`INSERT INTO transactions (signature, from_address, to_address, amount, timestamp, block_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`, [
            transaction.signature,
            transaction.from_address,
            transaction.to_address,
            transaction.amount,
            transaction.timestamp,
            transaction.block_time,
            transaction.status
        ]);
        saveDatabase();
        return await getLastInsertId();
    }
    static async findBySignature(signature) {
        return await queryOne('SELECT * FROM transactions WHERE signature = ?', [signature]);
    }
    static async findByFromAddress(address, limit = 100) {
        return await queryAll('SELECT * FROM transactions WHERE from_address = ? ORDER BY timestamp DESC LIMIT ?', [address, limit]);
    }
    static async findByToAddress(address, limit = 100) {
        return await queryAll('SELECT * FROM transactions WHERE to_address = ? ORDER BY timestamp DESC LIMIT ?', [address, limit]);
    }
    static async findRecent(limit = 50) {
        return await queryAll('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?', [limit]);
    }
    static async findAll() {
        return await queryAll('SELECT * FROM transactions ORDER BY timestamp DESC', []);
    }
    static async update(signature, updates) {
        const fields = Object.keys(updates).filter(k => k !== 'signature');
        if (fields.length === 0)
            return;
        const setClause = fields.map(f => `${f} = ?`).join(', ');
        const values = fields.map(f => updates[f]);
        await execute(`UPDATE transactions SET ${setClause} WHERE signature = ?`, [...values, signature]);
        saveDatabase();
    }
    static async delete(signature) {
        await execute('DELETE FROM transactions WHERE signature = ?', [signature]);
        saveDatabase();
    }
    static async deleteAll() {
        await execute('DELETE FROM transactions', []);
        saveDatabase();
    }
}
