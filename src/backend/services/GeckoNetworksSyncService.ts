/**
 * GeckoTerminal Networks & DEXes Sync Service
 * Automatically syncs all supported networks and DEXes from GeckoTerminal
 * Updates daily to capture new networks, DEXes, and changes
 */

import { queryAll, queryOne, execute } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';

interface GeckoNetwork {
  id: string;
  type: string;
  attributes: {
    name: string;
    coingecko_asset_platform_id: string | null;
  };
}

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
  private readonly REQUEST_DELAY = 1000; // 1 second between API calls
  
  private syncTimer: NodeJS.Timeout | null = null;
  private isRunning = false;
  
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
      // Check networks sync status
      const networkStatus = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ?',
        ['networks']
      );
      
      const now = Date.now() / 1000;
      
      if (!networkStatus?.last_sync_at || 
          now - networkStatus.last_sync_at > 86400) { // Sync if older than 24 hours
        console.log('🌐 [GeckoSync] Performing initial networks sync...');
        await this.syncNetworks();
      }
      
      // Check DEXes sync status
      const dexStatus = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ?',
        ['dexes']
      );
      
      if (!dexStatus?.last_sync_at || 
          now - dexStatus.last_sync_at > 86400) {
        console.log('🌐 [GeckoSync] Performing initial DEXes sync...');
        await this.syncAllDexes();
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
      console.log('🌐 [GeckoSync] Starting scheduled sync...');
      await this.syncNetworks();
      await this.syncAllDexes();
    }, this.SYNC_INTERVAL);
  }
  
  /**
   * Sync all networks from GeckoTerminal
   */
  async syncNetworks(): Promise<void> {
    const startTime = Date.now();
    let totalNetworks = 0;
    let newNetworks = 0;
    let updatedNetworks = 0;
    
    try {
      // Update sync status
      await this.updateSyncStatus('networks', 'running');
      
      // Fetch all pages of networks
      let page = 1;
      let hasMorePages = true;
      const allNetworks: GeckoNetwork[] = [];
      
      while (hasMorePages && page <= 10) { // Max 10 pages as safety limit
        const url = `${this.GECKOTERMINAL_API}/networks?page=${page}`;
        console.log(`🌐 [GeckoSync] Fetching networks page ${page}...`);
        
        try {
          const response = await fetch(url);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.data && Array.isArray(data.data)) {
            allNetworks.push(...data.data);
            
            // Check if there's a next page
            hasMorePages = data.links?.next !== null && data.links?.next !== undefined;
            page++;
            
            // Delay between requests
            if (hasMorePages) {
              await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
            }
          } else {
            hasMorePages = false;
          }
          
        } catch (error) {
          console.error(`🌐 [GeckoSync] Error fetching networks page ${page}:`, error);
          hasMorePages = false;
        }
      }
      
      console.log(`🌐 [GeckoSync] Fetched ${allNetworks.length} networks`);
      
      // Process and store networks
      for (const network of allNetworks) {
        try {
          const existing = await queryOne(
            'SELECT * FROM gecko_networks WHERE network_id = ?',
            [network.id]
          );
          
          const isTestnet = network.attributes.name.toLowerCase().includes('testnet') ||
                           network.id.includes('testnet');
          
          // Determine chain type based on network ID or name
          let chainType = 'evm'; // Default to EVM
          if (network.id === 'solana') chainType = 'solana';
          else if (network.id === 'ton') chainType = 'ton';
          else if (network.id.includes('sui')) chainType = 'move';
          else if (network.id.includes('sei') || network.id.includes('cosmos')) chainType = 'cosmos';
          else if (network.id === 'aptos') chainType = 'move';
          
          if (existing) {
            // Update existing network
            await execute(`
              UPDATE gecko_networks SET
                name = ?,
                coingecko_asset_platform_id = ?,
                is_testnet = ?,
                chain_type = ?,
                last_updated = strftime('%s', 'now'),
                last_sync_at = strftime('%s', 'now'),
                raw_data = ?
              WHERE network_id = ?
            `, [
              network.attributes.name,
              network.attributes.coingecko_asset_platform_id,
              isTestnet ? 1 : 0,
              chainType,
              JSON.stringify(network),
              network.id
            ]);
            updatedNetworks++;
          } else {
            // Insert new network
            await execute(`
              INSERT INTO gecko_networks (
                network_id, name, coingecko_asset_platform_id,
                is_testnet, chain_type, raw_data,
                last_sync_at
              ) VALUES (?, ?, ?, ?, ?, ?, strftime('%s', 'now'))
            `, [
              network.id,
              network.attributes.name,
              network.attributes.coingecko_asset_platform_id,
              isTestnet ? 1 : 0,
              chainType,
              JSON.stringify(network)
            ]);
            newNetworks++;
          }
          
          totalNetworks++;
        } catch (error) {
          console.error(`🌐 [GeckoSync] Error processing network ${network.id}:`, error);
        }
      }
      
      // Update sync status
      await this.updateSyncStatus('networks', 'completed', {
        total_items_synced: totalNetworks,
        items_added: newNetworks,
        items_updated: updatedNetworks
      });
      
      const elapsed = Date.now() - startTime;
      console.log(`🌐 [GeckoSync] Networks sync completed in ${elapsed}ms`);
      console.log(`   Total: ${totalNetworks}, New: ${newNetworks}, Updated: ${updatedNetworks}`);
      
      saveDatabase();
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error syncing networks:', error);
      await this.updateSyncStatus('networks', 'failed', {
        last_error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  
  /**
   * Sync DEXes for all networks
   */
  async syncAllDexes(): Promise<void> {
    try {
      // Get all active networks
      const networks = await queryAll<{ network_id: string }>(
        'SELECT network_id FROM gecko_networks WHERE is_active = 1 AND is_testnet = 0'
      );
      
      console.log(`🌐 [GeckoSync] Syncing DEXes for ${networks.length} networks...`);
      
      for (const network of networks) {
        await this.syncDexesForNetwork(network.network_id);
        
        // Delay between network syncs
        await new Promise(resolve => setTimeout(resolve, this.REQUEST_DELAY));
      }
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error syncing all DEXes:', error);
    }
  }
  
  /**
   * Sync DEXes for a specific network
   */
  async syncDexesForNetwork(networkId: string): Promise<void> {
    const startTime = Date.now();
    let totalDexes = 0;
    let newDexes = 0;
    let updatedDexes = 0;
    
    try {
      // Update sync status
      await this.updateSyncStatus('dexes', 'running', { network_id: networkId });
      
      // Fetch all pages of DEXes for this network
      let page = 1;
      let hasMorePages = true;
      const allDexes: GeckoDex[] = [];
      
      while (hasMorePages && page <= 5) { // Max 5 pages per network
        const url = `${this.GECKOTERMINAL_API}/networks/${networkId}/dexes?page=${page}`;
        
        try {
          const response = await fetch(url);
          if (!response.ok) {
            if (response.status === 404) {
              console.log(`🌐 [GeckoSync] No DEXes found for network ${networkId}`);
              hasMorePages = false;
              break;
            }
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const data = await response.json();
          
          if (data.data && Array.isArray(data.data)) {
            allDexes.push(...data.data);
            
            // Check if there's a next page
            hasMorePages = data.links?.next !== null && data.links?.next !== undefined;
            page++;
            
            // Delay between requests
            if (hasMorePages) {
              await new Promise(resolve => setTimeout(resolve, 500)); // Shorter delay for DEXes
            }
          } else {
            hasMorePages = false;
          }
          
        } catch (error) {
          console.error(`🌐 [GeckoSync] Error fetching DEXes for ${networkId} page ${page}:`, error);
          hasMorePages = false;
        }
      }
      
      if (allDexes.length > 0) {
        console.log(`🌐 [GeckoSync] Processing ${allDexes.length} DEXes for ${networkId}`);
      }
      
      // Process and store DEXes
      for (const dex of allDexes) {
        try {
          const existing = await queryOne(
            'SELECT * FROM gecko_dexes WHERE dex_id = ? AND network_id = ?',
            [dex.id, networkId]
          );
          
          // Determine DEX type based on name
          let dexType = 'amm'; // Default
          const name = dex.attributes.name.toLowerCase();
          if (name.includes('clmm') || name.includes('v3')) dexType = 'clmm';
          else if (name.includes('orderbook')) dexType = 'orderbook';
          else if (name.includes('.fun') || name.includes('pump')) dexType = 'launchpad';
          
          if (existing) {
            // Update existing DEX
            await execute(`
              UPDATE gecko_dexes SET
                name = ?,
                dex_type = ?,
                last_updated = strftime('%s', 'now'),
                last_sync_at = strftime('%s', 'now'),
                raw_data = ?
              WHERE dex_id = ? AND network_id = ?
            `, [
              dex.attributes.name,
              dexType,
              JSON.stringify(dex),
              dex.id,
              networkId
            ]);
            updatedDexes++;
          } else {
            // Insert new DEX
            await execute(`
              INSERT INTO gecko_dexes (
                dex_id, network_id, name, dex_type, 
                raw_data, last_sync_at
              ) VALUES (?, ?, ?, ?, ?, strftime('%s', 'now'))
            `, [
              dex.id,
              networkId,
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
      
      // Update network's DEX count
      if (totalDexes > 0) {
        await execute(
          'UPDATE gecko_networks SET total_dexes = ? WHERE network_id = ?',
          [totalDexes, networkId]
        );
      }
      
      // Update sync status
      await this.updateSyncStatus('dexes', 'completed', {
        network_id: networkId,
        total_items_synced: totalDexes,
        items_added: newDexes,
        items_updated: updatedDexes
      });
      
      const elapsed = Date.now() - startTime;
      if (totalDexes > 0) {
        console.log(`🌐 [GeckoSync] ${networkId} DEXes: Total: ${totalDexes}, New: ${newDexes}, Updated: ${updatedDexes} (${elapsed}ms)`);
      }
      
      saveDatabase();
      
    } catch (error) {
      console.error(`🌐 [GeckoSync] Error syncing DEXes for ${networkId}:`, error);
      await this.updateSyncStatus('dexes', 'failed', {
        network_id: networkId,
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
   * Get sync statistics
   */
  async getSyncStats(): Promise<any> {
    try {
      const networks = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM gecko_networks'
      );
      
      const dexes = await queryOne<{ count: number }>(
        'SELECT COUNT(*) as count FROM gecko_dexes'
      );
      
      const lastNetworkSync = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ? ORDER BY last_sync_at DESC LIMIT 1',
        ['networks']
      );
      
      const lastDexSync = await queryOne<SyncStatus>(
        'SELECT * FROM gecko_sync_status WHERE sync_type = ? ORDER BY last_sync_at DESC LIMIT 1',
        ['dexes']
      );
      
      return {
        networks: {
          total: networks?.count || 0,
          lastSync: lastNetworkSync?.last_sync_at,
          nextSync: lastNetworkSync?.next_sync_at,
          status: lastNetworkSync?.status
        },
        dexes: {
          total: dexes?.count || 0,
          lastSync: lastDexSync?.last_sync_at,
          nextSync: lastDexSync?.next_sync_at,
          status: lastDexSync?.status
        }
      };
      
    } catch (error) {
      console.error('🌐 [GeckoSync] Error getting sync stats:', error);
      return null;
    }
  }
  
  /**
   * Force sync for specific network
   */
  async forceSyncNetwork(networkId: string): Promise<void> {
    console.log(`🌐 [GeckoSync] Force syncing DEXes for ${networkId}...`);
    await this.syncDexesForNetwork(networkId);
  }
  
  /**
   * Force sync all
   */
  async forceSyncAll(): Promise<void> {
    console.log('🌐 [GeckoSync] Force syncing all networks and DEXes...');
    await this.syncNetworks();
    await this.syncAllDexes();
  }
}

// Export singleton instance
export const geckoNetworksSyncService = GeckoNetworksSyncService.getInstance();
