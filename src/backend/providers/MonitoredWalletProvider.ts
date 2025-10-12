import { saveDatabase } from '../database/connection.js';
import { execute, queryOne, queryAll, getLastInsertId } from '../database/helpers.js';
import { MonitoredWallet } from '../models/MonitoredWallet.js';

export class MonitoredWalletProvider {
  static async findDevWallets(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE is_dev_wallet = 1 ORDER BY tokens_deployed DESC, first_seen DESC');
  }

  static async findFreshWallets(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE is_fresh = 1 ORDER BY first_seen DESC');
  }
  
  static async findUncheckedDevWallets(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE dev_checked = 0 ORDER BY first_seen DESC');
  }

  static async create(wallet: Partial<MonitoredWallet> & { address: string; first_seen: number }): Promise<number> {
    await execute(
      `INSERT INTO monitored_wallets (address, source, first_seen, last_activity, is_active, is_fresh, wallet_age_days, previous_tx_count, is_dev_wallet, tokens_deployed, dev_checked, label, monitoring_type, rate_limit_rps, rate_limit_enabled, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        wallet.address,
        wallet.source || null,
        wallet.first_seen,
        wallet.last_activity || null,
        wallet.is_active ?? 1,
        wallet.is_fresh ?? 0,
        wallet.wallet_age_days || 0,
        wallet.previous_tx_count ?? 0,
        wallet.is_dev_wallet ?? 0,
        wallet.tokens_deployed ?? 0,
        wallet.dev_checked ?? 0,
        wallet.label || null,
        wallet.monitoring_type || 'pumpfun',
        wallet.rate_limit_rps ?? 1,
        wallet.rate_limit_enabled ?? 1,
        wallet.metadata || null
      ]
    );
    saveDatabase();
    return await getLastInsertId();
  }

  static async findByAddress(address: string, monitoringType?: string): Promise<MonitoredWallet | undefined> {
    if (monitoringType) {
      return await queryOne<MonitoredWallet>(
        'SELECT * FROM monitored_wallets WHERE address = ? AND monitoring_type = ?', 
        [address, monitoringType]
      );
    }
    // If no monitoring_type specified, return first match (backward compatibility)
    return await queryOne<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE address = ? LIMIT 1', [address]);
  }

  static async findAllByAddress(address: string): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE address = ? ORDER BY monitoring_type', [address]);
  }

  static async findAll(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets ORDER BY first_seen DESC');
  }

  static async findActive(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>('SELECT * FROM monitored_wallets WHERE is_active = 1 ORDER BY first_seen DESC');
  }

  static async update(address: string, updates: Partial<MonitoredWallet>, monitoringType?: string): Promise<void> {
    const fields = Object.keys(updates).filter(k => k !== 'address' && k !== 'monitoring_type');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f as keyof MonitoredWallet]);
    
    if (monitoringType) {
      await execute(`UPDATE monitored_wallets SET ${setClause} WHERE address = ? AND monitoring_type = ?`, [...values, address, monitoringType]);
    } else {
      // Update all monitors for this address
      await execute(`UPDATE monitored_wallets SET ${setClause} WHERE address = ?`, [...values, address]);
    }
    saveDatabase();
  }

  static async delete(address: string, monitoringType?: string): Promise<void> {
    if (monitoringType) {
      await execute('DELETE FROM monitored_wallets WHERE address = ? AND monitoring_type = ?', [address, monitoringType]);
    } else {
      // Delete all monitors for this address
      await execute('DELETE FROM monitored_wallets WHERE address = ?', [address]);
    }
    saveDatabase();
  }

  static async setActive(address: string, isActive: boolean, monitoringType?: string): Promise<void> {
    if (monitoringType) {
      await execute('UPDATE monitored_wallets SET is_active = ? WHERE address = ? AND monitoring_type = ?', [isActive ? 1 : 0, address, monitoringType]);
    } else {
      // Update all monitors for this address
      await execute('UPDATE monitored_wallets SET is_active = ? WHERE address = ?', [isActive ? 1 : 0, address]);
    }
    saveDatabase();
  }

  static async markHistoryChecked(address: string): Promise<void> {
    await execute(
      'UPDATE monitored_wallets SET history_checked = 1, last_history_check = ? WHERE address = ?',
      [Date.now(), address]
    );
    saveDatabase();
  }

  static async findUncheckedWallets(): Promise<MonitoredWallet[]> {
    return await queryAll<MonitoredWallet>(
      'SELECT * FROM monitored_wallets WHERE history_checked = 0 OR history_checked IS NULL ORDER BY first_seen ASC'
    );
  }

  static async deleteAll(): Promise<void> {
    await execute('DELETE FROM monitored_wallets', []);
    saveDatabase();
  }
}
