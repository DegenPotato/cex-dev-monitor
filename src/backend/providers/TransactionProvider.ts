import { saveDatabase } from '../database/connection.js';
import { queryOne, queryAll, execute, getLastInsertId } from '../database/helpers.js';
import { Transaction } from '../models/MonitoredWallet.js';

export class TransactionProvider {
  static async create(transaction: Transaction): Promise<number> {
    await execute(
      `INSERT INTO transactions (signature, from_address, to_address, amount, timestamp, block_time, status)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        transaction.signature,
        transaction.from_address,
        transaction.to_address,
        transaction.amount,
        transaction.timestamp,
        transaction.block_time,
        transaction.status
      ]
    );
    saveDatabase();
    return await getLastInsertId();
  }

  static async findBySignature(signature: string): Promise<Transaction | undefined> {
    return await queryOne<Transaction>('SELECT * FROM transactions WHERE signature = ?', [signature]);
  }

  static async findByFromAddress(address: string, limit: number = 100): Promise<Transaction[]> {
    return await queryAll<Transaction>(
      'SELECT * FROM transactions WHERE from_address = ? ORDER BY timestamp DESC LIMIT ?',
      [address, limit]
    );
  }

  static async findByToAddress(address: string, limit: number = 100): Promise<Transaction[]> {
    return await queryAll<Transaction>(
      'SELECT * FROM transactions WHERE to_address = ? ORDER BY timestamp DESC LIMIT ?',
      [address, limit]
    );
  }

  static async findRecent(limit: number = 50): Promise<Transaction[]> {
    return await queryAll<Transaction>('SELECT * FROM transactions ORDER BY timestamp DESC LIMIT ?', [limit]);
  }

  static async findAll(): Promise<Transaction[]> {
    return await queryAll<Transaction>('SELECT * FROM transactions ORDER BY timestamp DESC', []);
  }

  static async update(signature: string, updates: Partial<Transaction>): Promise<void> {
    const fields = Object.keys(updates).filter(k => k !== 'signature');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f as keyof Transaction]);
    
    await execute(`UPDATE transactions SET ${setClause} WHERE signature = ?`, [...values, signature]);
    saveDatabase();
  }

  static async delete(signature: string): Promise<void> {
    await execute('DELETE FROM transactions WHERE signature = ?', [signature]);
    saveDatabase();
  }
}
