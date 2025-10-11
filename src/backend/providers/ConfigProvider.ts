import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute } from '../database/helpers.js';
import { Config } from '../models/MonitoredWallet.js';

export class ConfigProvider {
  static async get(key: string): Promise<string | undefined> {
    const result = await queryOne<Config>('SELECT value FROM config WHERE key = ?', [key]);
    return result?.value;
  }

  static async set(key: string, value: string): Promise<void> {
    await execute('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)', [key, value]);
    saveDatabase();
  }

  static async getAll(): Promise<Config[]> {
    return await queryAll<Config>('SELECT * FROM config');
  }

  static async delete(key: string): Promise<void> {
    await execute('DELETE FROM config WHERE key = ?', [key]);
    saveDatabase();
  }
}
