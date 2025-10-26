import { execute, queryAll, queryOne } from '../database/helpers.js';
import { telegramClientService } from './TelegramClientService.js';
export class TelegramTopicService {
    /**
     * Discover and cache forum topics from Telegram
     */
    async discoverForumTopics(userId, chatId) {
        console.log(`🔍 [TopicDiscovery] Starting topic discovery for chat ${chatId}`);
        try {
            // Get the Telegram client
            const client = await telegramClientService.getClient(userId);
            if (!client) {
                throw new Error('No active Telegram client');
            }
            // Get chat entity
            const chat = await client.getEntity(chatId);
            // Check if it's a forum
            if (!chat.forum) {
                console.log(`   ⚠️ Chat ${chatId} is not a forum group`);
                return {
                    success: false,
                    message: 'Chat is not a forum group',
                    topics: []
                };
            }
            console.log(`   ✅ Chat is a forum, fetching topics...`);
            // Fetch forum topics using getForumTopics API
            const { Api } = await import('telegram');
            const result = await client.invoke(new Api.channels.GetForumTopics({
                channel: chat,
                offsetDate: 0,
                offsetId: 0,
                offsetTopic: 0,
                limit: 100
            }));
            const topics = [];
            const now = Math.floor(Date.now() / 1000);
            // Process each topic
            for (const topic of result.topics || []) {
                const topicData = {
                    topicId: topic.id.toString(),
                    topicTitle: topic.title,
                    iconEmoji: topic.iconEmojiId?.toString() || null,
                    iconColor: topic.iconColor || null,
                    isGeneral: topic.id === 1,
                    isClosed: topic.closed || false,
                    creatorId: topic.fromId?.userId?.toString() || null,
                    createdDate: topic.date || null,
                    messageCount: 0 // Will be updated from history
                };
                console.log(`   📌 Discovered topic: ${topicData.topicTitle} (ID: ${topicData.topicId})`);
                // Save to database
                await execute(`
          INSERT INTO telegram_forum_topics (
            user_id, chat_id, topic_id, topic_title, 
            icon_emoji, icon_color, is_general, is_closed,
            creator_id, created_date, discovered_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, chat_id, topic_id) DO UPDATE SET
            topic_title = excluded.topic_title,
            icon_emoji = excluded.icon_emoji,
            icon_color = excluded.icon_color,
            is_closed = excluded.is_closed,
            updated_at = excluded.updated_at
        `, [
                    userId,
                    chatId,
                    topicData.topicId,
                    topicData.topicTitle,
                    topicData.iconEmoji,
                    topicData.iconColor,
                    topicData.isGeneral ? 1 : 0,
                    topicData.isClosed ? 1 : 0,
                    topicData.creatorId,
                    topicData.createdDate,
                    now,
                    now
                ]);
                // Update message count from history
                const stats = await queryOne(`
          SELECT 
            COUNT(*) as message_count,
            MAX(message_timestamp) as last_message
          FROM telegram_message_history
          WHERE user_id = ? AND chat_id = ? AND topic_id = ?
        `, [userId, chatId, topicData.topicId]);
                if (stats && stats.message_count > 0) {
                    await execute(`
            UPDATE telegram_forum_topics 
            SET message_count = ?, last_message_date = ?
            WHERE user_id = ? AND chat_id = ? AND topic_id = ?
          `, [stats.message_count, stats.last_message, userId, chatId, topicData.topicId]);
                    topicData.messageCount = stats.message_count;
                }
                topics.push(topicData);
            }
            // Log the discovery operation
            await this.logTopicOperation(userId, chatId, null, 'discovered', {
                topicCount: topics.length,
                forumTitle: chat.title
            }, 'success');
            console.log(`   ✅ Discovered ${topics.length} topics in ${chat.title}`);
            return {
                success: true,
                chatTitle: chat.title,
                topics,
                message: `Discovered ${topics.length} topics`
            };
        }
        catch (error) {
            console.error(`   ❌ Topic discovery failed:`, error);
            // Log the failure
            await this.logTopicOperation(userId, chatId, null, 'discovered', null, 'failed', error.message);
            throw error;
        }
    }
    /**
     * Get cached topics with analytics
     */
    async getCachedTopicsWithAnalytics(userId, chatId) {
        const topics = await queryAll(`
      SELECT 
        ft.*,
        COALESCE(tp_sum.total_messages, 0) as total_messages_30d,
        COALESCE(tp_sum.contracts_detected, 0) as contracts_detected_30d,
        COALESCE(tp_sum.profitable_contracts, 0) as profitable_contracts_30d,
        COALESCE(tp_sum.profit_ratio, 0) as profit_ratio_30d
      FROM telegram_forum_topics ft
      LEFT JOIN (
        SELECT 
          user_id, chat_id, topic_id,
          SUM(total_messages) as total_messages,
          SUM(messages_with_contracts) as contracts_detected,
          SUM(profitable_contracts) as profitable_contracts,
          CASE 
            WHEN SUM(unique_contracts) > 0 
            THEN CAST(SUM(profitable_contracts) AS REAL) / SUM(unique_contracts)
            ELSE 0 
          END as profit_ratio
        FROM telegram_topic_performance
        WHERE date >= strftime('%s', 'now', '-30 days')
        GROUP BY user_id, chat_id, topic_id
      ) tp_sum ON 
        ft.user_id = tp_sum.user_id AND 
        ft.chat_id = tp_sum.chat_id AND 
        ft.topic_id = tp_sum.topic_id
      WHERE ft.user_id = ? AND ft.chat_id = ?
      ORDER BY ft.is_general DESC, tp_sum.profit_ratio DESC
    `, [userId, chatId]);
        return topics;
    }
    /**
     * Update topic-specific user filters
     */
    async updateTopicUserFilter(userId, chatId, topicId, monitoredUserIds, excludedUserIds) {
        console.log(`🎯 [TopicFilter] Updating user filter for topic ${topicId} in chat ${chatId}`);
        const now = Math.floor(Date.now() / 1000);
        await execute(`
      INSERT INTO telegram_topic_user_filters (
        user_id, chat_id, topic_id, 
        monitored_user_ids, excluded_user_ids,
        is_active, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(user_id, chat_id, topic_id) DO UPDATE SET
        monitored_user_ids = excluded.monitored_user_ids,
        excluded_user_ids = excluded.excluded_user_ids,
        updated_at = excluded.updated_at
    `, [
            userId,
            chatId,
            topicId,
            monitoredUserIds ? JSON.stringify(monitoredUserIds) : null,
            excludedUserIds ? JSON.stringify(excludedUserIds) : null,
            now,
            now
        ]);
        // Log the operation
        await this.logTopicOperation(userId, chatId, topicId, 'filter_updated', {
            monitoredUsers: monitoredUserIds?.length || 0,
            excludedUsers: excludedUserIds?.length || 0
        }, 'success');
        console.log(`   ✅ Filter updated: ${monitoredUserIds?.length || 0} monitored, ${excludedUserIds?.length || 0} excluded`);
    }
    /**
     * Get topic-specific user filter
     */
    async getTopicUserFilter(userId, chatId, topicId) {
        return await queryOne(`
      SELECT * FROM telegram_topic_user_filters
      WHERE user_id = ? AND chat_id = ? AND topic_id = ? AND is_active = 1
    `, [userId, chatId, topicId]);
    }
    /**
     * Track topic performance metrics
     */
    async trackTopicPerformance(userId, chatId, topicId, metrics) {
        const today = Math.floor(new Date().setHours(0, 0, 0, 0) / 1000);
        // Get or create today's performance record
        const existing = await queryOne(`
      SELECT * FROM telegram_topic_performance
      WHERE user_id = ? AND chat_id = ? AND topic_id = ? AND date = ?
    `, [userId, chatId, topicId, today]);
        if (existing) {
            // Update existing record
            await execute(`
        UPDATE telegram_topic_performance SET
          total_messages = total_messages + 1,
          messages_with_contracts = messages_with_contracts + ?,
          contracts_forwarded = contracts_forwarded + ?,
          avg_forward_latency_ms = CASE 
            WHEN ? IS NOT NULL AND contracts_forwarded > 0
            THEN ((avg_forward_latency_ms * contracts_forwarded) + ?) / (contracts_forwarded + 1)
            ELSE avg_forward_latency_ms
          END,
          bot_messages = bot_messages + ?,
          admin_messages = admin_messages + ?,
          updated_at = strftime('%s', 'now')
        WHERE id = ?
      `, [
                metrics.hasContract ? 1 : 0,
                metrics.wasForwarded ? 1 : 0,
                metrics.forwardLatencyMs,
                metrics.forwardLatencyMs || 0,
                metrics.senderIsBot ? 1 : 0,
                metrics.senderIsAdmin ? 1 : 0,
                existing.id
            ]);
        }
        else {
            // Create new record
            await execute(`
        INSERT INTO telegram_topic_performance (
          user_id, chat_id, topic_id, date,
          total_messages, messages_with_contracts, contracts_forwarded,
          avg_forward_latency_ms, bot_messages, admin_messages
        ) VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `, [
                userId,
                chatId,
                topicId,
                today,
                metrics.hasContract ? 1 : 0,
                metrics.wasForwarded ? 1 : 0,
                metrics.forwardLatencyMs || 0,
                metrics.senderIsBot ? 1 : 0,
                metrics.senderIsAdmin ? 1 : 0
            ]);
        }
    }
    /**
     * Log topic operations for debugging and audit
     */
    async logTopicOperation(userId, chatId, topicId, operation, details, status, errorMessage) {
        await execute(`
      INSERT INTO telegram_topic_logs (
        user_id, chat_id, topic_id, operation, 
        details, status, error_message, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            userId,
            chatId,
            topicId,
            operation,
            details ? JSON.stringify(details) : null,
            status,
            errorMessage || null,
            Math.floor(Date.now() / 1000)
        ]);
    }
    /**
     * Get best performing topics
     */
    async getBestPerformingTopics(userId, limit = 10) {
        return await queryAll(`
      SELECT * FROM telegram_best_topics
      WHERE user_id = ? AND profit_ratio > 0
      ORDER BY profit_ratio DESC
      LIMIT ?
    `, [userId, limit]);
    }
}
export const telegramTopicService = new TelegramTopicService();
