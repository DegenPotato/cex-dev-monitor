/**
 * GeckoTerminal Networks & DEXes Sync Service
 * Automatically syncs all supported networks and DEXes from GeckoTerminal
 * Updates daily to capture new networks, DEXes, and changes
 */

import { queryOne, execute } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';

interface GeckoDex {
  id: string;
  type: string;
  attributes: {
    name: string;
  };
}

interface SyncStatus {
  sync_type: string;
  network_id?: string;
  last_sync_at?: number;
  next_sync_at?: number;
  status: string;
}

export class GeckoNetworksSyncService {
  private static instance: GeckoNetworksSyncService;
  
  private readonly GECKOTERMINAL_API = 'https://api.geckoterminal.com/api/v2';
  private readonly SYNC_INTERVAL = 86400000; // 24 hours in ms
  
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
  // Only sync Solana network
  private readonly SOLANA_NETWORK = 'solana';
  
  private constructor() {}
  
  static getInstance(): GeckoNetworksSyncService {
    if (!GeckoNetworksSyncService.instance) {
      GeckoNetworksSyncService.instance = new GeckoNetworksSyncService();
    }
    return GeckoNetworksSyncService.instance;
  }
  
  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('🌐 [GeckoSync] Service already running');
      return;
    }
    
    this.isRunning = true;
    console.log('🌐 [GeckoSync] Starting Networks & DEXes sync service...');
    
    // Check if initial sync is needed
    await this.checkAndPerformInitialSync();
    
    // Schedule regular syncs
    this.scheduleSyncs();
  }
  
  /**
   * Stop the sync service
   */
  stop(): void {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.isRunning = false;
    console.log('🌐 [GeckoSync] Service stopped');
  }
  
  /**
   * Check and perform initial sync if needed
   */
  private async checkAndPerformInitialSync(): Promise<void> {
    try {
      // Only sync Solana DEXes, skip network syncing entirely
      const dexStatus = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ? AND network_id = ?',
        ['dexes', this.SOLANA_NETWORK]
      );
      
      const now = Date.now() / 1000;
      
      if (!dexStatus?.last_sync_at || 
          now - dexStatus.last_sync_at > 86400) {
        console.log('🌐 [GeckoSync] Performing initial Solana DEXes sync...');
        await this.syncSolanaDexes();
      } else {
        console.log('🌐 [GeckoSync] Solana DEXes already synced within 24 hours');
      }
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error in initial sync:', error);
    }
  }
  
  /**
   * Schedule regular syncs
   */
  private scheduleSyncs(): void {
    // Run sync every 24 hours
    this.syncTimer = setInterval(async () => {
      console.log('🌐 [GeckoSync] Starting scheduled Solana DEXes sync...');
      await this.syncSolanaDexes();
    }, this.SYNC_INTERVAL);
  }
  
  /**
   * Sync Solana DEXes only
   */
  async syncSolanaDexes(): Promise<void> {
    const startTime = Date.now();
    let totalDexes = 0;
    let newDexes = 0;
    let updatedDexes = 0;
    
    try {
      // Update sync status
      await this.updateSyncStatus('dexes', 'running', { network_id: this.SOLANA_NETWORK });
      
      // First, ensure Solana network exists in the database
      await execute(`
        INSERT OR REPLACE INTO gecko_networks (
          network_id, name, chain_type, native_token_symbol, is_active, is_testnet
        ) VALUES (?, ?, ?, ?, ?, ?)
      `, ['solana', 'Solana', 'solana', 'SOL', 1, 0]);
      
      // Fetch Solana DEXes with proper API endpoint
      const url = `${this.GECKOTERMINAL_API}/networks/solana/dexes`;
      console.log('🌐 [GeckoSync] Fetching Solana DEXes...');
      
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const dexes: GeckoDex[] = data.data || [];
        
        console.log(`🌐 [GeckoSync] Processing ${dexes.length} Solana DEXes`);
        
        // Process and store DEXes
        for (const dex of dexes) {
          try {
            const existing = await queryOne(
              'SELECT * FROM gecko_dexes WHERE dex_id = ? AND network_id = ?',
              [dex.id, this.SOLANA_NETWORK]
            );
            
            // Determine DEX type based on name
            let dexType = 'amm'; // Default
            const name = dex.attributes.name.toLowerCase();
            if (name.includes('pump.fun') || name.includes('pump')) dexType = 'launchpad';
            else if (name.includes('clmm') || name.includes('v3')) dexType = 'clmm';
            else if (name.includes('orderbook')) dexType = 'orderbook';
            else if (name.includes('raydium')) dexType = 'amm';
            else if (name.includes('jupiter')) dexType = 'aggregator';
            
            if (existing) {
              // Update existing DEX
              await execute(`
                UPDATE gecko_dexes SET
                  name = ?,
                  dex_type = ?,
                  is_active = 1,
                  last_updated = strftime('%s', 'now'),
                  last_sync_at = strftime('%s', 'now'),
                  raw_data = ?
                WHERE dex_id = ? AND network_id = ?
              `, [
                dex.attributes.name,
                dexType,
                JSON.stringify(dex),
                dex.id,
                this.SOLANA_NETWORK
              ]);
              updatedDexes++;
            } else {
              // Insert new DEX
              await execute(`
                INSERT INTO gecko_dexes (
                  dex_id, network_id, name, dex_type, 
                  is_active, raw_data, last_sync_at
                ) VALUES (?, ?, ?, ?, 1, ?, strftime('%s', 'now'))
              `, [
                dex.id,
                this.SOLANA_NETWORK,
                dex.attributes.name,
                dexType,
                JSON.stringify(dex)
              ]);
              newDexes++;
            }
            
            totalDexes++;
          } catch (error) {
            console.error(`🌐 [GeckoSync] Error processing DEX ${dex.id}:`, error);
          }
        }
        
        // Update Solana network's DEX count
        await execute(
          'UPDATE gecko_networks SET total_dexes = ? WHERE network_id = ?',
          [totalDexes, this.SOLANA_NETWORK]
        );
        
      } catch (error) {
        console.error('🌐 [GeckoSync] Error fetching Solana DEXes:', error);
        throw error;
      }
      
      // Update sync status
      await this.updateSyncStatus('dexes', 'completed', {
        network_id: this.SOLANA_NETWORK,
        total_items_synced: totalDexes,
        items_added: newDexes,
        items_updated: updatedDexes
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`🌐 [GeckoSync] Solana DEXes sync completed in ${elapsed}ms`);
      console.log(`   Total: ${totalDexes}, New: ${newDexes}, Updated: ${updatedDexes}`);
      
      saveDatabase();
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error syncing Solana DEXes:', error);
      await this.updateSyncStatus('dexes', 'failed', {
        network_id: this.SOLANA_NETWORK,
        last_error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  
  /**
   * Update sync status in database
   */
  private async updateSyncStatus(
    syncType: string, 
    status: string, 
    additionalData?: any
  ): Promise<void> {
    try {
      const now = Math.floor(Date.now() / 1000);
      const nextSync = now + 86400; // 24 hours later
      
      const existing = await queryOne(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ? AND network_id IS ?',
        [syncType, additionalData?.network_id || null]
      );
      
      if (existing) {
        await execute(`
          UPDATE gecko_sync_status SET
            status = ?,
            last_sync_at = CASE WHEN ? = 'completed' THEN ? ELSE last_sync_at END,
            next_sync_at = CASE WHEN ? = 'completed' THEN ? ELSE next_sync_at END,
            last_error = ?,
            total_items_synced = COALESCE(?, total_items_synced),
            items_added = COALESCE(?, items_added),
            items_updated = COALESCE(?, items_updated),
            updated_at = ?
          WHERE sync_type = ? AND network_id IS ?
        `, [
          status,
          status, now,
          status, nextSync,
          additionalData?.last_error || null,
          additionalData?.total_items_synced,
          additionalData?.items_added,
          additionalData?.items_updated,
          now,
          syncType,
          additionalData?.network_id || null
        ]);
      } else {
        await execute(`
          INSERT INTO gecko_sync_status (
            sync_type, network_id, status, 
            last_sync_at, next_sync_at, last_error,
            total_items_synced, items_added, items_updated
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [
          syncType,
          additionalData?.network_id || null,
          status,
          status === 'completed' ? now : null,
          status === 'completed' ? nextSync : null,
          additionalData?.last_error || null,
          additionalData?.total_items_synced || 0,
          additionalData?.items_added || 0,
          additionalData?.items_updated || 0
        ]);
      }
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error updating sync status:', error);
    }
  }
  
  /**
   * Get sync statistics for Solana
   */
  async getSyncStats(): Promise<any> {
    try {
      const solanaDexes = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM gecko_dexes WHERE network_id = ?',
        [this.SOLANA_NETWORK]
      );
      
      const lastDexSync = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ? AND network_id = ? ORDER BY last_sync_at DESC LIMIT 1',
        ['dexes', this.SOLANA_NETWORK]
      );
      
      return {
        solana: {
          network: 'Solana',
          dexes: {
            total: solanaDexes?.count || 0,
            lastSync: lastDexSync?.last_sync_at,
            nextSync: lastDexSync?.next_sync_at,
            status: lastDexSync?.status
          }
        }
      };
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error getting sync stats:', error);
      return null;
    }
  }
  
  /**
   * Force sync Solana DEXes
   */
  async forceSync(): Promise<void> {
    console.log('🌐 [GeckoSync] Force syncing Solana DEXes...');
    await this.syncSolanaDexes();
  }
}

// Export singleton instance
export const geckoNetworksSyncService = GeckoNetworksSyncService.getInstance();
