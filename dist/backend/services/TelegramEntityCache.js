import { queryAll, execute } from '../database/helpers.js';
/**
 * Telegram Entity Cache Service
 * Pre-caches and maintains entity information for forwarding destinations
 * to prevent "Could not find entity" errors
 */
export class TelegramEntityCache {
    constructor() {
        this.entityCache = new Map();
        this.CACHE_DURATION = 30 * 60 * 1000; // 30 minutes
        this.REFRESH_INTERVAL = 20 * 60 * 1000; // 20 minutes
    }
    /**
     * Pre-cache all forwarding destinations on startup
     */
    async initialize() {
        console.log('🔄 [EntityCache] Initializing entity cache...');
        // Load all unique forwarding destinations from rules
        const destinations = await queryAll(`SELECT DISTINCT target_chat_ids FROM telegram_forwarding_rules WHERE is_active = 1`);
        const uniqueTargets = new Set();
        for (const dest of destinations) {
            try {
                const targets = JSON.parse(dest.target_chat_ids || '[]');
                targets.forEach((t) => uniqueTargets.add(t));
            }
            catch (e) {
                // Skip invalid JSON
            }
        }
        console.log(`📋 [EntityCache] Found ${uniqueTargets.size} unique forwarding targets to cache`);
        // Store in database for persistence
        for (const targetId of uniqueTargets) {
            await this.storeEntityInfo(targetId);
        }
        // Start periodic refresh
        this.startPeriodicRefresh();
    }
    /**
     * Store entity information in database
     */
    async storeEntityInfo(entityId) {
        const isUser = /^\d+$/.test(entityId);
        const entityType = isUser ? 'user' : entityId.startsWith('-100') ? 'channel' : 'chat';
        await execute(`INSERT OR REPLACE INTO telegram_entity_cache 
       (entity_id, entity_type, cached_at, last_used) 
       VALUES (?, ?, ?, ?)`, [entityId, entityType, Date.now(), Date.now()]);
    }
    /**
     * Pre-load entities for a specific client before forwarding
     */
    async preloadEntities(client, targetIds) {
        console.log(`🔄 [EntityCache] Pre-loading ${targetIds.length} entities...`);
        for (const targetId of targetIds) {
            const cacheKey = `${client.session.userId}_${targetId}`;
            const cached = this.entityCache.get(cacheKey);
            // Check if cache is still fresh
            if (cached && (Date.now() - cached.cachedAt) < this.CACHE_DURATION) {
                console.log(`✅ [EntityCache] ${targetId} already cached`);
                continue;
            }
            // Try to resolve and cache the entity
            try {
                const isUser = /^\d+$/.test(targetId);
                if (isUser) {
                    // For users, we need to be careful about rate limits
                    console.log(`🔍 [EntityCache] Resolving user ${targetId}...`);
                    // Try different methods
                    try {
                        // Method 1: Get entity directly
                        const entity = await client.getEntity(parseInt(targetId));
                        this.entityCache.set(cacheKey, {
                            entityType: 'user',
                            accessHash: entity.accessHash?.toString(),
                            username: entity.username,
                            cachedAt: Date.now(),
                            lastUsed: Date.now()
                        });
                        console.log(`✅ [EntityCache] Cached user ${targetId}`);
                    }
                    catch (e) {
                        // Method 2: Get through dialogs (batch operation)
                        console.log(`⚠️ [EntityCache] Could not resolve user ${targetId} directly, will retry on forward`);
                    }
                }
                else {
                    // Chats/channels are easier to resolve
                    const entity = await client.getEntity(targetId);
                    this.entityCache.set(cacheKey, {
                        entityType: targetId.startsWith('-100') ? 'channel' : 'chat',
                        title: entity.title,
                        cachedAt: Date.now(),
                        lastUsed: Date.now()
                    });
                    console.log(`✅ [EntityCache] Cached ${targetId}`);
                }
                // Small delay to avoid rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
            catch (error) {
                console.log(`⚠️ [EntityCache] Failed to cache ${targetId}: ${error.message}`);
            }
        }
    }
    /**
     * Get cached entity info
     */
    getCachedEntity(clientUserId, targetId) {
        const cacheKey = `${clientUserId}_${targetId}`;
        const cached = this.entityCache.get(cacheKey);
        if (cached) {
            cached.lastUsed = Date.now();
            return cached;
        }
        return null;
    }
    /**
     * Start periodic refresh of entity cache
     */
    startPeriodicRefresh() {
        this.refreshTimer = setInterval(async () => {
            console.log('🔄 [EntityCache] Refreshing entity cache...');
            // Get all active forwarding destinations
            const destinations = await queryAll(`SELECT DISTINCT target_chat_ids FROM telegram_forwarding_rules WHERE is_active = 1`);
            const targetsToRefresh = new Set();
            for (const dest of destinations) {
                try {
                    const targets = JSON.parse(dest.target_chat_ids || '[]');
                    targets.forEach((t) => targetsToRefresh.add(t));
                }
                catch (e) {
                    // Skip invalid JSON
                }
            }
            // Update database entries
            for (const targetId of targetsToRefresh) {
                await this.storeEntityInfo(targetId);
            }
            // Clear old entries from memory cache
            const now = Date.now();
            for (const [key, value] of this.entityCache.entries()) {
                if (now - value.lastUsed > this.CACHE_DURATION * 2) {
                    this.entityCache.delete(key);
                }
            }
            console.log(`✅ [EntityCache] Refresh complete, ${this.entityCache.size} entities in cache`);
        }, this.REFRESH_INTERVAL);
    }
    /**
     * Stop the cache refresh timer
     */
    stop() {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    }
}
export const telegramEntityCache = new TelegramEntityCache();
