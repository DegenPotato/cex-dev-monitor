/**
 * Telegram Chat History Service
 * Fetches and caches chat history to avoid repeated API calls
 */

import { execute, queryOne, queryAll } from '../database/helpers.js';
import { apiProviderTracker } from './ApiProviderTracker.js';
import { telegramClientService } from './TelegramClientService.js';

// Contract detection patterns
const SOL_PATTERN = /\b[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
const SOL_PATTERN_WITH_SPECIALS = /[1-9A-HJ-NP-Za-km-z]{8,}[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,}(?:[-_.\s]{1,2}[1-9A-HJ-NP-Za-km-z]{8,})*/g;

export class TelegramHistoryService {
  /**
   * Fetch chat history and store in database
   */
  async fetchAndStoreChatHistory(
    userId: number, 
    chatId: string, 
    limit: number = 1000,
    onProgress?: (fetched: number, total: number) => void
  ): Promise<{ success: boolean; messagesFetched: number; apiCalls: number; error?: string }> {
    try {
      console.log(`📚 [TelegramHistory] Starting history fetch for chat ${chatId} (limit: ${limit})`);
      
      // Get the client
      const client = await telegramClientService.getClient(userId);
      if (!client) {
        return { success: false, messagesFetched: 0, apiCalls: 0, error: 'No active Telegram client' };
      }

      // Normalize chatId format - ensure channels have -100 prefix
      // If it's a numeric ID without prefix and looks like a channel (> 1000000000), add -100
      let normalizedChatId = chatId;
      if (!chatId.startsWith('-') && parseInt(chatId) > 1000000000) {
        normalizedChatId = `-100${chatId}`;
        console.log(`  🔧 Normalized chatId: ${chatId} → ${normalizedChatId}`);
      }

      // Check when we last fetched
      const fetchStatus = await queryOne(
        'SELECT * FROM telegram_chat_fetch_status WHERE user_id = ? AND chat_id = ?',
        [userId, chatId]
      ) as any;

      let messages: any[] = [];
      let offsetId = 0;
      let hasMore = true;
      let apiCalls = 0;
      const batchSize = 100; // Telegram's max per request

      // Import Telegram API
      const { Api } = await import('telegram');

      // Resolve the chat entity first
      let peerEntity;
      try {
        peerEntity = await client.getEntity(normalizedChatId);
        console.log(`  ✅ Resolved chat entity: ${peerEntity.title || peerEntity.username || normalizedChatId}`);
      } catch (error: any) {
        console.error(`  ❌ Failed to resolve chat entity for ${normalizedChatId}:`, error.message);
        return {
          success: false,
          messagesFetched: 0,
          apiCalls: 0,
          error: `Could not find chat: ${error.message}`
        };
      }

      while (hasMore && messages.length < limit) {
        const startTime = Date.now();
        
        try {
          console.log(`  📡 Fetching batch ${apiCalls + 1} (offset: ${offsetId})...`);
          
          // Make the API call with resolved peer entity
          const result = await client.invoke(
            new Api.messages.GetHistory({
              peer: peerEntity,
              limit: Math.min(batchSize, limit - messages.length),
              offsetId: offsetId,
              offsetDate: 0,
              addOffset: 0,
              maxId: 0,
              minId: 0
              // hash parameter is optional
            })
          );

          // Track the API call
          const responseTime = Date.now() - startTime;
          apiProviderTracker.trackCall('telegram', 'getHistory', true, responseTime, 200);
          apiCalls++;

          // Process messages
          if (result.messages && result.messages.length > 0) {
            messages.push(...result.messages);
            offsetId = result.messages[result.messages.length - 1].id;
            
            // Report progress
            if (onProgress) {
              onProgress(messages.length, limit);
            }

            // Check if we got less than requested (means no more messages)
            if (result.messages.length < batchSize) {
              hasMore = false;
            }
          } else {
            hasMore = false;
          }

          // Rate limiting - wait between requests
          if (hasMore) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 200ms between requests
          }

        } catch (error: any) {
          console.error(`  ❌ Error fetching batch:`, error.message);
          
          // Track failed API call
          const responseTime = Date.now() - startTime;
          apiProviderTracker.trackCall('telegram', 'getHistory', false, responseTime, 500, error.message);
          
          // Check for rate limit
          if (error.message?.includes('FLOOD')) {
            console.warn(`  ⚠️ Rate limited! Stopping fetch.`);
            break;
          }
        }
      }

      console.log(`  ✅ Fetched ${messages.length} messages in ${apiCalls} API calls`);

      // Store messages in database
      let storedCount = 0;
      const now = Math.floor(Date.now() / 1000);

      for (const msg of messages) {
        try {
          // Extract contract addresses
          const contracts = this.extractContracts(msg.message || '');
          const hasContract = contracts.length > 0;
          
          // Get sender info
          let senderName = 'Unknown';
          let senderUsername = null;
          if (msg.fromId) {
            try {
              const entity = await client.getEntity(msg.fromId);
              senderName = entity.firstName || entity.title || 'Unknown';
              senderUsername = entity.username || null;
            } catch (e) {
              // Entity not found
            }
          }

          // Store message
          await execute(`
            INSERT OR REPLACE INTO telegram_message_history 
            (user_id, chat_id, message_id, message_text, message_date,
             sender_id, sender_username, sender_name, is_bot,
             is_forwarded, forward_from_chat_id, reply_to_message_id,
             has_media, media_type, has_contract, detected_contracts,
             fetched_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `, [
            userId,
            chatId,
            msg.id,
            msg.message || null,
            msg.date,
            msg.fromId?.toString() || null,
            senderUsername,
            senderName,
            0, // is_bot - TODO: detect bots
            msg.fwdFrom ? 1 : 0,
            msg.fwdFrom?.fromId?.toString() || null,
            msg.replyTo?.replyToMsgId || null,
            msg.media ? 1 : 0,
            msg.media?.className || null,
            hasContract ? 1 : 0,
            hasContract ? JSON.stringify(contracts) : null,
            now,
            now
          ]);

          storedCount++;
        } catch (error: any) {
          console.error(`  ⚠️ Failed to store message ${msg.id}:`, error.message);
        }
      }

      // Update fetch status
      const oldestId = messages.length > 0 ? messages[messages.length - 1].id : 0;
      const newestId = messages.length > 0 ? messages[0].id : 0;

      if (fetchStatus) {
        await execute(`
          UPDATE telegram_chat_fetch_status 
          SET last_fetched_at = ?, oldest_message_id = ?, newest_message_id = ?,
              total_messages_fetched = total_messages_fetched + ?,
              api_calls_made = api_calls_made + ?, updated_at = ?
          WHERE user_id = ? AND chat_id = ?
        `, [now, oldestId, newestId, storedCount, apiCalls, now, userId, chatId]);
      } else {
        await execute(`
          INSERT INTO telegram_chat_fetch_status
          (user_id, chat_id, last_fetched_at, oldest_message_id, newest_message_id,
           total_messages_fetched, api_calls_made, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [userId, chatId, now, oldestId, newestId, storedCount, apiCalls, now, now]);
      }

      console.log(`  💾 Stored ${storedCount} messages in database`);

      return {
        success: true,
        messagesFetched: storedCount,
        apiCalls: apiCalls
      };

    } catch (error: any) {
      console.error('❌ [TelegramHistory] Error:', error);
      return {
        success: false,
        messagesFetched: 0,
        apiCalls: 0,
        error: error.message
      };
    }
  }

  /**
   * Get cached chat history from database
   */
  async getCachedHistory(userId: number, chatId: string, limit: number = 100, offset: number = 0) {
    const messages = await queryAll(`
      SELECT * FROM telegram_message_history 
      WHERE user_id = ? AND chat_id = ?
      ORDER BY message_date DESC
      LIMIT ? OFFSET ?
    `, [userId, chatId, limit, offset]) as any[];

    // Parse detected contracts JSON
    return messages.map(msg => ({
      ...msg,
      detected_contracts: msg.detected_contracts ? JSON.parse(msg.detected_contracts) : []
    }));
  }

  /**
   * Get fetch status for a chat
   */
  async getFetchStatus(userId: number, chatId: string) {
    return await queryOne(
      'SELECT * FROM telegram_chat_fetch_status WHERE user_id = ? AND chat_id = ?',
      [userId, chatId]
    ) as any;
  }

  /**
   * Extract contract addresses from text
   */
  private extractContracts(text: string): string[] {
    const contracts = new Set<string>();
    
    // Standard format
    const standardMatches = text.match(SOL_PATTERN) || [];
    for (const match of standardMatches) {
      if (this.isValidSolanaAddress(match)) {
        contracts.add(match);
      }
    }

    // Obfuscated format
    const obfuscatedMatches = text.match(SOL_PATTERN_WITH_SPECIALS) || [];
    for (const match of obfuscatedMatches) {
      const cleaned = match.replace(/[-_.\s]/g, '');
      if (this.isValidSolanaAddress(cleaned)) {
        contracts.add(cleaned);
      }
    }

    return Array.from(contracts);
  }

  /**
   * Delete cached history for a chat
   */
  async deleteHistory(userId: number, chatId: string): Promise<{ messagesDeleted: number }> {
    try {
      console.log(`🗑️  [TelegramHistory] Deleting history for chat ${chatId} (user ${userId})`);

      // Delete all messages for this chat
      await execute(`
        DELETE FROM telegram_message_history 
        WHERE user_id = ? AND chat_id = ?
      `, [userId, chatId]);

      // Delete fetch status
      await execute(`
        DELETE FROM telegram_chat_fetch_status 
        WHERE user_id = ? AND chat_id = ?
      `, [userId, chatId]);

      console.log(`  ✅ Deleted chat history from database`);

      return { messagesDeleted: 1 }; // Success indicator
    } catch (error: any) {
      console.error('❌ [TelegramHistory] Delete error:', error);
      throw error;
    }
  }

  /**
   * Validate Solana address
   */
  private isValidSolanaAddress(address: string): boolean {
    if (address.length < 32 || address.length > 44) return false;
    const base58Regex = /^[1-9A-HJ-NP-Za-km-z]+$/;
    return base58Regex.test(address);
  }
}

// Export singleton instance
export const telegramHistoryService = new TelegramHistoryService();
