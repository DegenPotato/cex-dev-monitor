import crypto from 'crypto';
import { queryOne, queryAll, execute } from '../database/helpers.js';
/**
 * Telegram User Service
 * Handles Telegram user account and bot account management
 */
export class TelegramUserService {
    constructor() {
        // In production, use a secure key from environment variables
        this.encryptionKey = process.env.TELEGRAM_ENCRYPTION_KEY || 'default-key-change-in-production';
    }
    /**
     * Encrypt sensitive data
     */
    encrypt(text) {
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
        let encrypted = cipher.update(text);
        encrypted = Buffer.concat([encrypted, cipher.final()]);
        return iv.toString('hex') + ':' + encrypted.toString('hex');
    }
    /**
     * Decrypt sensitive data
     */
    decrypt(text) {
        const parts = text.split(':');
        const iv = Buffer.from(parts.shift(), 'hex');
        const encryptedText = Buffer.from(parts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(this.encryptionKey.padEnd(32, '0').slice(0, 32)), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    }
    /**
     * Save or update Telegram user account credentials
     */
    async saveUserAccount(userId, credentials) {
        const existing = await queryOne('SELECT id FROM telegram_user_accounts WHERE user_id = ?', [userId]);
        const encryptedApiHash = this.encrypt(credentials.apiHash);
        const encryptedSession = credentials.sessionString ? this.encrypt(credentials.sessionString) : null;
        const now = Math.floor(Date.now() / 1000);
        if (existing) {
            await execute(`
        UPDATE telegram_user_accounts 
        SET api_id = ?, api_hash = ?, phone_number = ?, session_string = ?, updated_at = ?
        WHERE user_id = ?
      `, [
                credentials.apiId,
                encryptedApiHash,
                credentials.phoneNumber,
                encryptedSession,
                now,
                userId
            ]);
        }
        else {
            await execute(`
        INSERT INTO telegram_user_accounts (user_id, api_id, api_hash, phone_number, session_string, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
                userId,
                credentials.apiId,
                encryptedApiHash,
                credentials.phoneNumber,
                encryptedSession,
                now,
                now
            ]);
        }
        return { success: true };
    }
    /**
     * Get Telegram user account credentials
     */
    async getUserAccount(userId) {
        const account = await queryOne(`
      SELECT id, api_id, api_hash, phone_number, session_string, is_verified, last_connected_at
      FROM telegram_user_accounts 
      WHERE user_id = ?
    `, [userId]);
        if (!account)
            return null;
        return {
            id: account.id,
            apiId: account.api_id,
            apiHash: this.decrypt(account.api_hash),
            phoneNumber: account.phone_number,
            sessionString: account.session_string ? this.decrypt(account.session_string) : null,
            isVerified: account.is_verified === 1,
            lastConnectedAt: account.last_connected_at
        };
    }
    /**
     * Update user account verification status
     */
    async updateUserAccountVerification(userId, isVerified, sessionString) {
        const now = Math.floor(Date.now() / 1000);
        // Only update session_string if explicitly provided
        if (sessionString !== undefined) {
            const encryptedSession = this.encrypt(sessionString);
            await execute(`
        UPDATE telegram_user_accounts 
        SET is_verified = ?, session_string = ?, last_connected_at = ?, updated_at = ?
        WHERE user_id = ?
      `, [
                isVerified ? 1 : 0,
                encryptedSession,
                now,
                now,
                userId
            ]);
        }
        else {
            // Don't touch session_string, just update verification status
            await execute(`
        UPDATE telegram_user_accounts 
        SET is_verified = ?, last_connected_at = ?, updated_at = ?
        WHERE user_id = ?
      `, [
                isVerified ? 1 : 0,
                now,
                now,
                userId
            ]);
        }
        return { success: true };
    }
    /**
     * Save or update Telegram bot account credentials
     */
    async saveBotAccount(userId, credentials) {
        const existing = await queryOne('SELECT id FROM telegram_bot_accounts WHERE user_id = ?', [userId]);
        const encryptedToken = this.encrypt(credentials.botToken);
        const now = Math.floor(Date.now() / 1000);
        if (existing) {
            await execute(`
        UPDATE telegram_bot_accounts 
        SET bot_token = ?, bot_username = ?, updated_at = ?
        WHERE user_id = ?
      `, [
                encryptedToken,
                credentials.botUsername || null,
                now,
                userId
            ]);
        }
        else {
            await execute(`
        INSERT INTO telegram_bot_accounts (user_id, bot_token, bot_username, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
      `, [
                userId,
                encryptedToken,
                credentials.botUsername || null,
                now,
                now
            ]);
        }
        return { success: true };
    }
    /**
     * Get Telegram bot account credentials
     */
    async getBotAccount(userId) {
        const account = await queryOne(`
      SELECT id, bot_token, bot_username, is_verified, last_connected_at
      FROM telegram_bot_accounts 
      WHERE user_id = ?
    `, [userId]);
        if (!account)
            return null;
        return {
            id: account.id,
            botToken: this.decrypt(account.bot_token),
            botUsername: account.bot_username,
            isVerified: account.is_verified === 1,
            lastConnectedAt: account.last_connected_at
        };
    }
    /**
     * Update bot account verification status
     */
    async updateBotAccountVerification(userId, isVerified, botUsername) {
        const now = Math.floor(Date.now() / 1000);
        await execute(`
      UPDATE telegram_bot_accounts 
      SET is_verified = ?, bot_username = ?, last_connected_at = ?, updated_at = ?
      WHERE user_id = ?
    `, [
            isVerified ? 1 : 0,
            botUsername || null,
            now,
            now,
            userId
        ]);
        return { success: true };
    }
    /**
     * Save monitored chat configuration
     */
    async saveMonitoredChat(userId, chat) {
        const existing = await queryOne('SELECT id FROM telegram_monitored_chats WHERE user_id = ? AND chat_id = ?', [userId, chat.chatId]);
        const monitoredUserIdsJson = chat.monitoredUserIds ? JSON.stringify(chat.monitoredUserIds) : null;
        const monitoredKeywordsJson = chat.monitoredKeywords ? JSON.stringify(chat.monitoredKeywords) : null;
        const now = Math.floor(Date.now() / 1000);
        if (existing) {
            await execute(`
        UPDATE telegram_monitored_chats 
        SET chat_name = ?, chat_type = ?, username = ?, invite_link = ?,
            is_active = ?, forward_to_chat_id = ?, forward_account_id = ?,
            monitored_user_ids = ?, monitored_keywords = ?,
            telegram_account_id = ?, updated_at = ?
        WHERE user_id = ? AND chat_id = ?
      `, [
                chat.chatName || null,
                chat.chatType || null,
                chat.username || null,
                chat.inviteLink || null,
                chat.isActive !== undefined ? (chat.isActive ? 1 : 0) : 1,
                chat.forwardToChatId || null,
                chat.forwardAccountId || null,
                monitoredUserIdsJson,
                monitoredKeywordsJson,
                chat.telegramAccountId || null,
                now,
                userId,
                chat.chatId
            ]);
        }
        else {
            await execute(`
        INSERT INTO telegram_monitored_chats 
        (user_id, chat_id, chat_name, chat_type, username, invite_link, is_active, forward_to_chat_id, forward_account_id, monitored_user_ids, monitored_keywords, telegram_account_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                userId,
                chat.chatId,
                chat.chatName || null,
                chat.chatType || null,
                chat.username || null,
                chat.inviteLink || null,
                chat.isActive !== undefined ? (chat.isActive ? 1 : 0) : 0,
                chat.forwardToChatId || null,
                chat.forwardAccountId || null,
                monitoredUserIdsJson,
                monitoredKeywordsJson,
                chat.telegramAccountId || null,
                now,
                now
            ]);
        }
        return { success: true };
    }
    /**
     * Save multiple monitored chats efficiently (batch operation)
     */
    async saveMonitoredChatsBatch(userId, chats) {
        if (chats.length === 0)
            return { success: true, savedCount: 0 };
        const now = Math.floor(Date.now() / 1000);
        // Use INSERT OR IGNORE for batch operation
        // This only inserts NEW chats and preserves existing configurations
        // For updates to existing chats, use saveMonitoredChat() individually
        const values = chats.map(chat => [
            userId,
            chat.chatId,
            chat.chatName || null,
            chat.chatType || null,
            chat.username || null,
            chat.inviteLink || null,
            chat.isActive !== undefined ? (chat.isActive ? 1 : 0) : 0,
            null, // forward_to_chat_id (only for new chats)
            null, // monitored_user_ids (only for new chats)
            null, // monitored_keywords (only for new chats)
            chat.telegramAccountId || null,
            now, // created_at
            now // updated_at
        ]);
        // Build batch INSERT OR IGNORE statement (won't overwrite existing configs)
        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
        const flatValues = values.flat();
        await execute(`
      INSERT OR IGNORE INTO telegram_monitored_chats 
      (user_id, chat_id, chat_name, chat_type, username, invite_link, is_active, 
       forward_to_chat_id, monitored_user_ids, monitored_keywords, telegram_account_id,
       created_at, updated_at)
      VALUES ${placeholders}
    `, flatValues);
        return { success: true, savedCount: chats.length };
    }
    /**
     * Get all monitored chats for a user
     */
    async getMonitoredChats(userId, includeInactive = false) {
        const query = includeInactive
            ? `SELECT * FROM telegram_monitored_chats WHERE user_id = ? ORDER BY created_at DESC`
            : `SELECT * FROM telegram_monitored_chats WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC`;
        const chats = await queryAll(query, [userId]);
        return chats.map(chat => ({
            id: chat.id,
            chatId: chat.chat_id,
            chatName: chat.chat_name,
            chatType: chat.chat_type,
            username: chat.username,
            inviteLink: chat.invite_link,
            telegramAccountId: chat.telegram_account_id,
            forwardToChatId: chat.forward_to_chat_id,
            forwardAccountId: chat.forward_account_id,
            monitoredUserIds: chat.monitored_user_ids ? JSON.parse(chat.monitored_user_ids) : [],
            monitoredKeywords: chat.monitored_keywords ? JSON.parse(chat.monitored_keywords) : [],
            isActive: chat.is_active === 1,
            processBotMessages: chat.process_bot_messages === 1,
            createdAt: chat.created_at,
            updatedAt: chat.updated_at
        }));
    }
    /**
     * Toggle monitored chat active status
     */
    async toggleMonitoredChat(userId, chatId, isActive) {
        await execute(`
      UPDATE telegram_monitored_chats 
      SET is_active = ?, updated_at = ?
      WHERE user_id = ? AND chat_id = ?
    `, [
            isActive ? 1 : 0,
            Math.floor(Date.now() / 1000),
            userId,
            chatId
        ]);
        return { success: true };
    }
    /**
     * Delete monitored chat
     */
    async deleteMonitoredChat(userId, chatId) {
        await execute(`
      DELETE FROM telegram_monitored_chats 
      WHERE user_id = ? AND chat_id = ?
    `, [userId, chatId]);
        return { success: true };
    }
    /**
     * Delete all monitored chats for a user
     */
    async deleteAllMonitoredChats(userId) {
        await execute(`
      DELETE FROM telegram_monitored_chats 
      WHERE user_id = ?
    `, [userId]);
        return { success: true };
    }
    /**
     * Update chat monitoring configuration (keywords, users, forwarding) without touching chat metadata
     */
    async updateChatConfiguration(userId, chatId, config) {
        const monitoredKeywordsJson = config.monitoredKeywords ? JSON.stringify(config.monitoredKeywords) : null;
        const monitoredUserIdsJson = config.monitoredUserIds ? JSON.stringify(config.monitoredUserIds) : null;
        const monitoredTopicIdsJson = config.monitoredTopicIds ? JSON.stringify(config.monitoredTopicIds) : null;
        const now = Math.floor(Date.now() / 1000);
        await execute(`
      UPDATE telegram_monitored_chats 
      SET monitored_keywords = ?,
          monitored_user_ids = ?,
          forward_to_chat_id = ?,
          forward_account_id = ?,
          is_active = ?,
          process_bot_messages = ?,
          monitored_topic_ids = ?,
          updated_at = ?
      WHERE user_id = ? AND chat_id = ?
    `, [
            monitoredKeywordsJson,
            monitoredUserIdsJson,
            config.forwardToChatId !== undefined ? config.forwardToChatId : null,
            config.forwardAccountId !== undefined ? config.forwardAccountId : null,
            config.isActive !== undefined ? (config.isActive ? 1 : 0) : 1,
            config.processBotMessages !== undefined ? (config.processBotMessages ? 1 : 0) : 0,
            monitoredTopicIdsJson,
            now,
            userId,
            chatId
        ]);
        return { success: true };
    }
    /**
     * Toggle monitoring status for a chat (alias for clearer API)
     */
    async toggleChatMonitoring(userId, chatId, isActive) {
        return this.toggleMonitoredChat(userId, chatId, isActive);
    }
    /**
     * Save detected contract from Telegram
     */
    async saveDetectedContract(data) {
        const now = Math.floor(Date.now() / 1000);
        await execute(`
      INSERT INTO telegram_detected_contracts 
      (user_id, chat_id, message_id, sender_id, sender_username, contract_address, 
       detection_type, original_format, message_text, forwarded, detected_at, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
            data.userId,
            data.chatId,
            data.messageId,
            data.senderId || null,
            data.senderUsername || null,
            data.contractAddress,
            data.detectionType,
            data.originalFormat,
            data.messageText,
            data.forwarded ? 1 : 0,
            now,
            now
        ]);
        return { success: true };
    }
    /**
     * Get detected contracts for a user
     */
    async getDetectedContracts(userId, limit = 100) {
        const contracts = await queryAll(`
      SELECT 
        dc.*,
        mc.chat_name,
        mc.forward_to_chat_id,
        mc.forward_account_id
      FROM telegram_detected_contracts dc
      LEFT JOIN telegram_monitored_chats mc ON dc.chat_id = mc.chat_id AND dc.user_id = mc.user_id
      WHERE dc.user_id = ?
      ORDER BY dc.detected_at DESC
      LIMIT ?
    `, [userId, limit]);
        return contracts.map(contract => ({
            id: contract.id,
            chatId: contract.chat_id,
            chatName: contract.chat_name,
            messageId: contract.message_id,
            senderId: contract.sender_id,
            senderUsername: contract.sender_username,
            contractAddress: contract.contract_address,
            detectionType: contract.detection_type,
            originalFormat: contract.original_format,
            messageText: contract.message_text,
            forwarded: contract.forwarded === 1,
            forwardedTo: contract.forward_to_chat_id,
            detectedAt: contract.detected_at
        }));
    }
    /**
     * Check if contract was already detected (deduplication)
     */
    async isContractDetected(userId, contractAddress, withinDays = 30) {
        const cutoffTime = Math.floor(Date.now() / 1000) - (withinDays * 24 * 60 * 60);
        const result = await queryOne(`
      SELECT COUNT(*) as count FROM telegram_detected_contracts 
      WHERE user_id = ? AND contract_address = ? AND detected_at > ?
    `, [userId, contractAddress, cutoffTime]);
        return result.count > 0;
    }
    /**
     * Update bot account verification status and username
     */
    async updateBotAccountVerified(userId, isVerified, username) {
        let sql = 'UPDATE telegram_bot_accounts SET is_verified = ?, last_connected_at = ?, updated_at = ?';
        const params = [isVerified ? 1 : 0, Date.now(), Date.now()];
        if (username) {
            sql += ', bot_username = ?';
            params.push(username);
        }
        sql += ' WHERE user_id = ?';
        params.push(userId);
        await execute(sql, params);
        return { success: true };
    }
    /**
     * Delete user account
     */
    async deleteUserAccount(userId) {
        await execute('DELETE FROM telegram_user_accounts WHERE user_id = ?', [userId]);
        return { success: true };
    }
    /**
     * Delete bot account
     */
    async deleteBotAccount(userId) {
        await execute('DELETE FROM telegram_bot_accounts WHERE user_id = ?', [userId]);
        return { success: true };
    }
    /**
     * Delete ALL Telegram data for a user from ALL tables
     */
    async deleteAllTelegramData(userId, includeAccounts = true) {
        try {
            // Try to disconnect active client if exists
            if (includeAccounts) {
                try {
                    const { telegramClientService } = await import('./TelegramClientService.js');
                    if (telegramClientService.getConnectionStatus(userId).connected) {
                        // Disconnect if method exists, otherwise just proceed
                        if (typeof telegramClientService.disconnect === 'function') {
                            await telegramClientService.disconnect(userId);
                        }
                    }
                }
                catch (error) {
                    console.log('Could not disconnect client, proceeding with data deletion');
                }
            }
            // Delete from Telegram data tables (always)
            const dataTables = [
                // Core data tables
                'telegram_detected_contracts',
                'telegram_detections',
                'telegram_message_history',
                'telegram_chat_metadata',
                'telegram_monitored_chats',
                'telegram_chat_fetch_status',
                // Forwarding tables
                'telegram_forwarding_rules',
                'telegram_forwarding_history',
                'telegram_forward_destinations',
                'telegram_available_forward_targets',
                // Chat configuration
                'telegram_chat_configs',
                // Caller/KOL tracking (delete token_calls first due to FK)
                'telegram_token_calls',
                'telegram_callers',
                'telegram_channel_stats'
                // NOTE: telegram_entity_cache is NOT deleted as it's a shared cache
                // without user_id - it stores entity access hashes for all users
            ];
            // Delete from account tables (optional)
            const accountTables = [
                'telegram_bot_accounts',
                'telegram_user_accounts'
            ];
            const tables = includeAccounts ? [...dataTables, ...accountTables] : dataTables;
            let deletedCount = 0;
            const deletionResults = [];
            for (const table of tables) {
                try {
                    const result = await execute(`DELETE FROM ${table} WHERE user_id = ?`, [userId]);
                    const count = result?.changes || 0;
                    deletedCount += count;
                    deletionResults.push({ table, deleted: count });
                    console.log(`✓ Cleared ${table} for user ${userId} (${count} rows)`);
                }
                catch (error) {
                    console.log(`⚠️  Table ${table} deletion failed: ${error.message}`);
                    deletionResults.push({ table, deleted: 0, error: error.message });
                }
            }
            return {
                success: true,
                message: includeAccounts
                    ? `All Telegram data and accounts have been deleted (${deletedCount} total rows)`
                    : `All Telegram data has been deleted (${deletedCount} total rows, accounts kept)`,
                deletedTables: tables,
                deletionResults,
                totalRowsDeleted: deletedCount,
                accountsDeleted: includeAccounts
            };
        }
        catch (error) {
            console.error('Error deleting all Telegram data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
    /**
     * Save or update chat metadata
     */
    async saveChatMetadata(userId, metadata) {
        const now = Math.floor(Date.now() / 1000);
        // Check if exists
        const existing = await queryOne('SELECT id FROM telegram_chat_metadata WHERE user_id = ? AND chat_id = ?', [userId, metadata.chatId]);
        if (existing) {
            await execute(`
        UPDATE telegram_chat_metadata 
        SET title = ?, username = ?, chat_type = ?, description = ?,
            photo_url = ?, invite_link = ?, member_count = ?, online_count = ?,
            admin_count = ?, restricted_count = ?, kicked_count = ?,
            is_member = ?, is_admin = ?, is_creator = ?, has_left = ?,
            join_date = ?, message_count = ?, last_message_date = ?,
            last_message_text = ?, avg_messages_per_day = ?, peak_activity_hour = ?,
            bot_percentage = ?, updated_at = ?
        WHERE user_id = ? AND chat_id = ?
      `, [
                metadata.title, metadata.username, metadata.chatType, metadata.description,
                metadata.photoUrl, metadata.inviteLink, metadata.memberCount || 0, metadata.onlineCount || 0,
                metadata.adminCount || 0, metadata.restrictedCount || 0, metadata.kickedCount || 0,
                metadata.isMember ? 1 : 0, metadata.isAdmin ? 1 : 0, metadata.isCreator ? 1 : 0, metadata.hasLeft ? 1 : 0,
                metadata.joinDate, metadata.messageCount || 0, metadata.lastMessageDate,
                metadata.lastMessageText, metadata.avgMessagesPerDay || 0, metadata.peakActivityHour,
                metadata.botPercentage || 0, now,
                userId, metadata.chatId
            ]);
        }
        else {
            await execute(`
        INSERT INTO telegram_chat_metadata 
        (user_id, chat_id, title, username, chat_type, description, photo_url, invite_link,
         member_count, online_count, admin_count, restricted_count, kicked_count,
         is_member, is_admin, is_creator, has_left, join_date,
         message_count, last_message_date, last_message_text, avg_messages_per_day,
         peak_activity_hour, bot_percentage, fetched_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
                userId, metadata.chatId, metadata.title, metadata.username, metadata.chatType,
                metadata.description, metadata.photoUrl, metadata.inviteLink,
                metadata.memberCount || 0, metadata.onlineCount || 0, metadata.adminCount || 0,
                metadata.restrictedCount || 0, metadata.kickedCount || 0,
                metadata.isMember ? 1 : 0, metadata.isAdmin ? 1 : 0, metadata.isCreator ? 1 : 0,
                metadata.hasLeft ? 1 : 0, metadata.joinDate,
                metadata.messageCount || 0, metadata.lastMessageDate, metadata.lastMessageText,
                metadata.avgMessagesPerDay || 0, metadata.peakActivityHour, metadata.botPercentage || 0,
                now, now
            ]);
        }
        return { success: true };
    }
    /**
     * Get chat metadata
     */
    async getChatMetadata(userId, chatId) {
        if (chatId) {
            const metadata = await queryOne(`
        SELECT * FROM telegram_chat_metadata 
        WHERE user_id = ? AND chat_id = ?
      `, [userId, chatId]);
            return metadata;
        }
        else {
            const metadataList = await queryAll(`
        SELECT * FROM telegram_chat_metadata 
        WHERE user_id = ?
        ORDER BY member_count DESC, last_message_date DESC
      `, [userId]);
            return metadataList;
        }
    }
    /**
     * Get account status (user account, bot account, monitored chats)
     */
    async getAccountStatus(userId) {
        const userAccount = await this.getUserAccount(userId);
        const botAccount = await this.getBotAccount(userId);
        const monitoredChats = await this.getMonitoredChats(userId);
        const { telegramClientService } = await import('./TelegramClientService.js');
        const connectionStatus = telegramClientService.getConnectionStatus(userId);
        return {
            userAccount: userAccount ? {
                configured: true,
                verified: userAccount.isVerified,
                connected: connectionStatus.connected, // Live connection status
                phoneNumber: userAccount.phoneNumber,
                lastConnected: userAccount.lastConnectedAt
            } : {
                configured: false,
                verified: false,
                connected: false
            },
            botAccount: botAccount ? {
                configured: true,
                verified: botAccount.isVerified,
                username: botAccount.botUsername,
                lastConnected: botAccount.lastConnectedAt
            } : {
                configured: false,
                verified: false
            },
            monitoredChatsCount: monitoredChats.length
        };
    }
}
