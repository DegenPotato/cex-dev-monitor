import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
export class ConfigProvider {
    static async get(key) {
        const result = await queryOne('SELECT value FROM config WHERE key = ?', [key]);
        return result?.value;
    }
    static async set(key, value) {
        await execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
        saveDatabase();
    }
    static async getAll() {
        return await queryAll('SELECT * FROM config');
    }
    static async delete(key) {
        await execute('DELETE FROM config WHERE key = ?', [key]);
        saveDatabase();
    }
}
