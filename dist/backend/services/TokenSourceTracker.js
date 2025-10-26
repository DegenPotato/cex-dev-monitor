/**
 * Token Source Tracking Service
 * Tracks how tokens enter the system and their performance by source
 */
import { execute, queryOne, queryAll } from '../database/helpers.js';
import { TokenPriceOracle } from './TokenPriceOracle.js';
const tokenPriceOracle = TokenPriceOracle.getInstance();
class TokenSourceTracker {
    /**
     * Register a new token or update existing with first source
     */
    async registerToken(entry) {
        try {
            // Check if token already exists
            const existing = await queryOne('SELECT id, first_source_type FROM token_registry WHERE token_mint = ?', [entry.tokenMint]);
            if (existing) {
                const existingToken = existing;
                // Token already registered, just log a sighting
                console.log(`   ⏭️  Token already in registry: ${entry.tokenMint.substring(0, 8)}... (originally from ${existingToken.first_source_type})`);
                await this.logSighting({
                    tokenMint: entry.tokenMint,
                    sourceType: entry.firstSourceType,
                    userId: entry.discoveredByUserId,
                    chatId: entry.telegramChatId,
                    chatName: entry.telegramChatName,
                    sender: entry.telegramSender
                });
                return existingToken.id;
            }
            // Insert new token
            await execute(`
        INSERT INTO token_registry (
          token_mint, token_symbol, token_name,
          first_source_type, first_source_details,
          telegram_chat_id, telegram_chat_name, 
          telegram_message_id, telegram_sender,
          discovered_by_user_id, first_seen_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                entry.tokenMint,
                entry.tokenSymbol || null,
                entry.tokenName || null,
                entry.firstSourceType,
                JSON.stringify(entry.firstSourceDetails || {}),
                entry.telegramChatId || null,
                entry.telegramChatName || null,
                entry.telegramMessageId || null,
                entry.telegramSender || null,
                entry.discoveredByUserId,
                Math.floor(Date.now() / 1000)
            ]);
            // Get the inserted ID
            const result = await queryOne('SELECT id FROM token_registry WHERE token_mint = ?', [entry.tokenMint]);
            // Log token discovery (WebSocket notification can be added later)
            console.log(`   🆕 NEW TOKEN REGISTERED: ${entry.tokenMint.substring(0, 8)}... from ${entry.firstSourceType} (${entry.telegramChatName || 'unknown chat'})`);
            // Trigger immediate price fetch for new token
            tokenPriceOracle.fetchNewToken(entry.tokenMint).catch(err => {
                console.error(`❌ [TokenSourceTracker] Failed to trigger price fetch for ${entry.tokenMint.substring(0, 8)}...`, err);
            });
            return result?.id || 0;
        }
        catch (error) {
            console.error('[TokenTracker] Error registering token:', error);
            throw error;
        }
    }
    /**
     * Log a token sighting (subsequent mentions)
     */
    async logSighting(sighting) {
        try {
            await execute(`
        INSERT INTO token_sightings (
          token_mint, source_type, source_id, source_details,
          user_id, chat_id, chat_name, sender, message_text,
          price_usd, market_cap_usd, volume_24h_usd,
          sighted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                sighting.tokenMint,
                sighting.sourceType,
                sighting.sourceId || null,
                JSON.stringify(sighting.sourceDetails || {}),
                sighting.userId,
                sighting.chatId || null,
                sighting.chatName || null,
                sighting.sender || null,
                sighting.messageText || null,
                sighting.priceUsd || null,
                sighting.marketCapUsd || null,
                sighting.volume24hUsd || null,
                Math.floor(Date.now() / 1000)
            ]);
            // Update mention count in registry
            await execute(`
        UPDATE token_registry 
        SET total_mentions = total_mentions + 1,
            updated_at = strftime('%s', 'now')
        WHERE token_mint = ?
      `, [sighting.tokenMint]);
        }
        catch (error) {
            console.error('[TokenTracker] Error logging sighting:', error);
        }
    }
    /**
     * Link a trade to its discovery source
     */
    async linkTradeToSource(attribution) {
        try {
            // Get the original discovery time
            const registry = await queryOne('SELECT first_seen_at FROM token_registry WHERE token_mint = ?', [attribution.tokenMint]);
            let discoveryToTradeSeconds = null;
            if (registry?.first_seen_at) {
                discoveryToTradeSeconds = Math.floor(Date.now() / 1000) - registry.first_seen_at;
            }
            await execute(`
        INSERT INTO trade_source_attribution (
          trade_id, token_mint, source_type, source_id,
          source_chat_id, source_chat_name,
          discovery_to_trade_seconds, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                attribution.tradeId,
                attribution.tokenMint,
                attribution.sourceType,
                attribution.sourceId || null,
                attribution.sourceChatId || null,
                attribution.sourceChatName || null,
                discoveryToTradeSeconds,
                Math.floor(Date.now() / 1000)
            ]);
            // Update trade count in registry
            await execute(`
        UPDATE token_registry 
        SET total_trades = total_trades + 1,
            first_trade_at = COALESCE(first_trade_at, strftime('%s', 'now')),
            updated_at = strftime('%s', 'now')
        WHERE token_mint = ?
      `, [attribution.tokenMint]);
        }
        catch (error) {
            console.error('[TokenTracker] Error linking trade to source:', error);
        }
    }
    /**
     * Update trade outcome for attribution
     */
    async updateTradeOutcome(tradeId, outcome, profitLossPct) {
        try {
            await execute(`
        UPDATE trade_source_attribution
        SET trade_outcome = ?, profit_loss_pct = ?
        WHERE trade_id = ?
      `, [outcome, profitLossPct, tradeId]);
        }
        catch (error) {
            console.error('[TokenTracker] Error updating trade outcome:', error);
        }
    }
    /**
     * Get source performance analytics
     */
    async getSourcePerformance(sourceType, sourceChatId) {
        try {
            let query = `
        SELECT 
          source_type,
          source_chat_id,
          source_chat_name,
          COUNT(DISTINCT token_mint) as unique_tokens,
          COUNT(*) as total_trades,
          SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) as profitable_trades,
          AVG(profit_loss_pct) as avg_profit_loss_pct,
          AVG(discovery_to_trade_seconds) as avg_time_to_trade
        FROM trade_source_attribution
        WHERE 1=1
      `;
            const params = [];
            if (sourceType) {
                query += ' AND source_type = ?';
                params.push(sourceType);
            }
            if (sourceChatId) {
                query += ' AND source_chat_id = ?';
                params.push(sourceChatId);
            }
            query += ' GROUP BY source_type, source_chat_id';
            return await queryAll(query, params);
        }
        catch (error) {
            console.error('[TokenTracker] Error getting source performance:', error);
            return [];
        }
    }
    /**
     * Get token discovery timeline
     */
    async getTokenTimeline(tokenMint) {
        try {
            // Get registry info
            const registry = await queryOne(`
        SELECT * FROM token_registry WHERE token_mint = ?
      `, [tokenMint]);
            // Get all sightings
            const sightings = await queryAll(`
        SELECT * FROM token_sightings 
        WHERE token_mint = ? 
        ORDER BY sighted_at DESC
        LIMIT 100
      `, [tokenMint]);
            // Get trade attributions
            const trades = await queryAll(`
        SELECT * FROM trade_source_attribution
        WHERE token_mint = ?
        ORDER BY created_at DESC
      `, [tokenMint]);
            return {
                registry,
                sightings,
                trades
            };
        }
        catch (error) {
            console.error('[TokenTracker] Error getting token timeline:', error);
            return null;
        }
    }
    /**
     * Get top performing sources
     */
    async getTopSources(limit = 10) {
        try {
            return await queryAll(`
        SELECT 
          source_type,
          source_chat_id,
          source_chat_name,
          COUNT(DISTINCT token_mint) as unique_tokens,
          COUNT(*) as total_trades,
          SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) as profitable_trades,
          CAST(SUM(CASE WHEN trade_outcome = 'profit' THEN 1 ELSE 0 END) AS REAL) / 
            NULLIF(COUNT(*), 0) * 100 as win_rate,
          AVG(profit_loss_pct) as avg_profit_loss_pct,
          AVG(discovery_to_trade_seconds) / 3600.0 as avg_hours_to_trade
        FROM trade_source_attribution
        WHERE trade_outcome IS NOT NULL
        GROUP BY source_type, source_chat_id, source_chat_name
        ORDER BY win_rate DESC, total_trades DESC
        LIMIT ?
      `, [limit]);
        }
        catch (error) {
            console.error('[TokenTracker] Error getting top sources:', error);
            return [];
        }
    }
    /**
     * Track token from Telegram detection
     */
    async trackTelegramToken(data) {
        await this.registerToken({
            tokenMint: data.contractAddress,
            firstSourceType: 'telegram',
            firstSourceDetails: {
                detectionType: data.detectionType,
                originalFormat: data.originalFormat
            },
            telegramChatId: data.chatId,
            telegramChatName: data.chatName,
            telegramMessageId: data.messageId,
            telegramSender: data.senderUsername || data.senderId,
            discoveredByUserId: data.userId
        });
    }
    /**
     * Track token from manual import
     */
    async trackImportedToken(data) {
        await this.registerToken({
            tokenMint: data.tokenMint,
            firstSourceType: 'import',
            firstSourceDetails: {
                importSource: data.source,
                metadata: data.metadata
            },
            discoveredByUserId: data.userId
        });
    }
}
// Export singleton instance
export const tokenSourceTracker = new TokenSourceTracker();
