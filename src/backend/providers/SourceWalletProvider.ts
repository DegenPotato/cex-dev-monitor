/**
 * Source Wallet Provider
 * CRUD operations for source wallets (CEX wallets, funding wallets, etc.)
 * Following MVC and CRUD Provider pattern
 */

import { getDb } from '../database/connection.js';
import { saveDatabase } from '../database/connection.js';

export interface SourceWallet {
  id?: number;
  address: string;
  name: string;
  purpose: string;
  is_monitoring: number;
  added_at: number;
  total_recipients?: number;
  total_sent_sol?: number;
  last_activity?: number;
  notes?: string;
  metadata?: string;
}

export interface SourceWalletStats {
  address: string;
  name: string;
  purpose: string;
  is_monitoring: boolean;
  added_at: number;
  total_recipients: number;
  total_sent_sol: number;
  last_activity?: number;
  notes?: string;
  
  // Real-time stats
  active_wallets: number;
  fresh_wallets: number;
  dev_wallets: number;
  total_tokens_deployed: number;
}

export class SourceWalletProvider {
  /**
   * Create a new source wallet
   */
  static async create(wallet: SourceWallet): Promise<number> {
    const db = await getDb();
    
    db.run(`
      INSERT INTO source_wallets (
        address, name, purpose, is_monitoring, added_at, notes, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      wallet.address,
      wallet.name,
      wallet.purpose || 'funding',
      wallet.is_monitoring ?? 1,
      wallet.added_at || Date.now(),
      wallet.notes || null,
      wallet.metadata || null
    ]);
    
    const result = db.exec('SELECT last_insert_rowid() as id');
    saveDatabase();
    
    return result[0].values[0][0] as number;
  }

  /**
   * Find all source wallets
   */
  static async findAll(): Promise<SourceWallet[]> {
    const db = await getDb();
    const result = db.exec(`
      SELECT * FROM source_wallets
      ORDER BY added_at DESC
    `);

    if (result.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map((row: any[]) => {
      const wallet: any = {};
      columns.forEach((col, i) => {
        wallet[col] = row[i];
      });
      return wallet as SourceWallet;
    });
  }

  /**
   * Find source wallets that are actively being monitored
   */
  static async findActive(): Promise<SourceWallet[]> {
    const db = await getDb();
    const result = db.exec(`
      SELECT * FROM source_wallets
      WHERE is_monitoring = 1
      ORDER BY added_at DESC
    `);

    if (result.length === 0) return [];

    const columns = result[0].columns;
    return result[0].values.map((row: any[]) => {
      const wallet: any = {};
      columns.forEach((col, i) => {
        wallet[col] = row[i];
      });
      return wallet as SourceWallet;
    });
  }

  /**
   * Find source wallet by address
   */
  static async findByAddress(address: string): Promise<SourceWallet | null> {
    const db = await getDb();
    const result = db.exec(`
      SELECT * FROM source_wallets
      WHERE address = ?
    `, [address]);

    if (result.length === 0 || result[0].values.length === 0) return null;

    const columns = result[0].columns;
    const row = result[0].values[0];
    const wallet: any = {};
    columns.forEach((col, i) => {
      wallet[col] = row[i];
    });
    return wallet as SourceWallet;
  }

  /**
   * Update source wallet
   */
  static async update(address: string, updates: Partial<SourceWallet>): Promise<void> {
    const db = await getDb();
    const fields: string[] = [];
    const values: any[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.purpose !== undefined) {
      fields.push('purpose = ?');
      values.push(updates.purpose);
    }
    if (updates.is_monitoring !== undefined) {
      fields.push('is_monitoring = ?');
      values.push(updates.is_monitoring);
    }
    if (updates.notes !== undefined) {
      fields.push('notes = ?');
      values.push(updates.notes);
    }
    if (updates.metadata !== undefined) {
      fields.push('metadata = ?');
      values.push(updates.metadata);
    }
    if (updates.total_recipients !== undefined) {
      fields.push('total_recipients = ?');
      values.push(updates.total_recipients);
    }
    if (updates.total_sent_sol !== undefined) {
      fields.push('total_sent_sol = ?');
      values.push(updates.total_sent_sol);
    }
    if (updates.last_activity !== undefined) {
      fields.push('last_activity = ?');
      values.push(updates.last_activity);
    }

    if (fields.length === 0) return;

    values.push(address);

    db.run(`
      UPDATE source_wallets
      SET ${fields.join(', ')}
      WHERE address = ?
    `, values);

    saveDatabase();
  }

  /**
   * Toggle monitoring for a source wallet
   */
  static async toggleMonitoring(address: string, isMonitoring: boolean): Promise<void> {
    const db = await getDb();
    
    db.run(`
      UPDATE source_wallets
      SET is_monitoring = ?
      WHERE address = ?
    `, [isMonitoring ? 1 : 0, address]);

    saveDatabase();
  }

  /**
   * Delete source wallet
   */
  static async delete(address: string): Promise<void> {
    const db = await getDb();
    
    db.run(`
      DELETE FROM source_wallets
      WHERE address = ?
    `, [address]);

    saveDatabase();
  }

  /**
   * Get comprehensive stats for a source wallet
   */
  static async getStats(address: string): Promise<SourceWalletStats | null> {
    const db = await getDb();
    
    // Get wallet info
    const wallet = await this.findByAddress(address);
    if (!wallet) return null;

    // Get monitored wallets stats from this source
    const statsResult = db.exec(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active,
        SUM(CASE WHEN is_fresh = 1 THEN 1 ELSE 0 END) as fresh,
        SUM(CASE WHEN is_dev_wallet = 1 THEN 1 ELSE 0 END) as devs,
        SUM(tokens_deployed) as total_tokens
      FROM monitored_wallets
      WHERE source = ?
    `, [address]);

    const stats = statsResult.length > 0 && statsResult[0].values.length > 0
      ? statsResult[0].values[0]
      : [0, 0, 0, 0, 0];

    return {
      address: wallet.address,
      name: wallet.name,
      purpose: wallet.purpose,
      is_monitoring: wallet.is_monitoring === 1,
      added_at: wallet.added_at,
      total_recipients: wallet.total_recipients || 0,
      total_sent_sol: wallet.total_sent_sol || 0,
      last_activity: wallet.last_activity,
      notes: wallet.notes,
      
      // Real-time stats
      active_wallets: stats[1] as number,
      fresh_wallets: stats[2] as number,
      dev_wallets: stats[3] as number,
      total_tokens_deployed: stats[4] as number
    };
  }

  /**
   * Get stats for all source wallets
   */
  static async getAllStats(): Promise<SourceWalletStats[]> {
    const wallets = await this.findAll();
    const statsPromises = wallets.map(w => this.getStats(w.address));
    const stats = await Promise.all(statsPromises);
    return stats.filter(s => s !== null) as SourceWalletStats[];
  }

  /**
   * Update stats for a source wallet (called after new transaction)
   */
  static async incrementStats(address: string, solAmount: number): Promise<void> {
    const db = await getDb();
    
    db.run(`
      UPDATE source_wallets
      SET 
        total_recipients = total_recipients + 1,
        total_sent_sol = total_sent_sol + ?,
        last_activity = ?
      WHERE address = ?
    `, [solAmount, Date.now(), address]);

    saveDatabase();
  }
}
