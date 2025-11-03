import { Router, Request } from 'express';
import { TelegramUserService } from '../services/TelegramUserService.js';
import { telegramClientService } from '../services/TelegramClientService.js';
import { telegramRateLimiter } from '../services/TelegramRateLimiter.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { execute, queryOne, queryAll } from '../database/helpers.js';

const authService = new SecureAuthService();

// Extend Express Request type to include user property from auth middleware
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username: string;
    role: string;
  };
}

export function createTelegramRoutes() {
  const router = Router();
  const telegramService = new TelegramUserService();

  /**
   * Get all connected Telegram accounts for the user
   */
  router.get('/accounts', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Get telegram user accounts from database
      const accounts = await queryAll(
        'SELECT id, phone_number, username, first_name, last_name, is_verified, last_connected_at FROM telegram_user_accounts WHERE user_id = ?',
        [userId]
      );
      
      res.json({ accounts });
    } catch (error: any) {
      console.error('Failed to get accounts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get chats for a specific Telegram account
   */
  router.get('/chats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { accountId } = req.query;
      
      if (!accountId) {
        return res.status(400).json({ error: 'accountId query parameter required' });
      }
      
      // Verify account belongs to user
      const account = await queryOne(
        'SELECT id FROM telegram_user_accounts WHERE id = ? AND user_id = ?',
        [accountId, userId]
      );
      
      if (!account) {
        return res.status(403).json({ error: 'Account not found or access denied' });
      }
      
      // Get all chats for this user (not filtering by is_active)
      // Note: Chats may be stored with user_id instead of telegram_account_id
      // So we filter by user_id to get all chats for this user
      const chats = await queryAll(
        `SELECT DISTINCT 
          chat_id as id, 
          chat_name as title, 
          username,
          chat_type as type
        FROM telegram_monitored_chats 
        WHERE user_id = ?
        ORDER BY chat_name`,
        [userId]
      );
      
      res.json({ chats });
    } catch (error: any) {
      console.error('Failed to get chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get users from a specific chat (using existing Telegram client)
   */
  router.get('/chat-users', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { accountId, chatId } = req.query;
      
      if (!accountId || !chatId) {
        return res.status(400).json({ error: 'accountId and chatId query parameters required' });
      }
      
      // Verify account belongs to user
      const account = await queryOne(
        'SELECT id FROM telegram_user_accounts WHERE id = ? AND user_id = ?',
        [accountId, userId]
      );
      
      if (!account) {
        return res.status(403).json({ error: 'Account not found or access denied' });
      }
      
      // Use existing TelegramClientService to get chat participants
      const client = await telegramClientService.getClient(userId);
      if (!client) {
        return res.status(400).json({ error: 'Telegram client not connected. Please connect your account first.' });
      }
      
      // Get participants from the chat using existing fetchChatParticipants method
      const participants = await telegramClientService.fetchChatParticipants(userId, chatId as string, 1000);
      
      // Format users for frontend
      const users = participants.map((p: any) => ({
        id: p.userId?.toString() || p.id?.toString(), // userId is the correct field
        username: p.username,
        first_name: p.firstName,
        last_name: p.lastName,
        phone: p.phone,
        is_bot: p.isBot || false
      }));
      
      res.json({ users });
    } catch (error: any) {
      console.error('Failed to get chat users:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get account status (user account, bot account, monitored chats)
   */
  router.get('/status', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const status = await telegramService.getAccountStatus(userId);
      res.json(status);
    } catch (error: any) {
      console.error('[Telegram] Error getting status:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Save user account credentials
   */
  router.post('/user-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { apiId, apiHash, phoneNumber } = req.body;

      if (!apiId || !apiHash || !phoneNumber) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const result = await telegramService.saveUserAccount(userId, {
        apiId,
        apiHash,
        phoneNumber
      });

      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error saving user account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get user account credentials (returns masked sensitive data)
   */
  router.get('/user-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const account = await telegramService.getUserAccount(userId);

      if (!account) {
        return res.json({ configured: false });
      }

      // Return masked credentials for display
      res.json({
        configured: true,
        apiId: account.apiId,
        apiHash: '***' + account.apiHash.slice(-8),
        phoneNumber: account.phoneNumber,
        isVerified: account.isVerified,
        lastConnectedAt: account.lastConnectedAt
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting user account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Start authentication - sends verification code to phone
   */
  router.post('/user-account/start-auth', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Get credentials from database
      const account = await telegramService.getUserAccount(userId);
      if (!account) {
        return res.status(400).json({ error: 'Please save your credentials first' });
      }

      // Start authentication flow with GramJS
      const result = await telegramClientService.startAuth(
        userId,
        account.apiId,
        account.apiHash,
        account.phoneNumber
      );

      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error starting auth:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Verify the code sent to phone
   */
  router.post('/user-account/verify-code', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { code } = req.body;

      if (!code) {
        return res.status(400).json({ error: 'Verification code is required' });
      }

      const result = await telegramClientService.verifyCode(userId, code);
      
      // Update verification status (won't touch session_string since not provided)
      if (result.success && result.status === 'connected') {
        await telegramService.updateUserAccountVerification(userId, true);
      }

      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error verifying code:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Verify 2FA password
   */
  router.post('/user-account/verify-2fa', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { password } = req.body;

      if (!password) {
        return res.status(400).json({ error: '2FA password is required' });
      }

      const result = await telegramClientService.verify2FA(userId, password);
      
      // Update verification status (won't touch session_string since not provided)
      if (result.success && result.status === 'connected') {
        await telegramService.updateUserAccountVerification(userId, true);
      }

      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error verifying 2FA:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Save bot account credentials
   */
  router.post('/bot-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { botToken } = req.body;

      if (!botToken) {
        return res.status(400).json({ error: 'Bot token is required' });
      }

      const result = await telegramService.saveBotAccount(userId, { botToken });
      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error saving bot account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get bot account credentials (returns masked token)
   */
  router.get('/bot-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const account = await telegramService.getBotAccount(userId);

      if (!account) {
        return res.json({ configured: false });
      }

      res.json({
        configured: true,
        botToken: '***' + account.botToken.slice(-10),
        botUsername: account.botUsername,
        isVerified: account.isVerified,
        lastConnectedAt: account.lastConnectedAt
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting bot account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Verify bot account (test connection to Telegram Bot API)
   */
  router.post('/bot-account/verify', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const account = await telegramService.getBotAccount(userId);

      if (!account) {
        return res.status(404).json({ error: 'Bot account not configured' });
      }

      // Test bot connection using Telegram Bot API
      const response = await fetch(`https://api.telegram.org/bot${account.botToken}/getMe`);
      const data = await response.json();

      if (data.ok) {
        // Update verified status AND username
        await telegramService.updateBotAccountVerified(userId, true, data.result.username);
        
        res.json({
          success: true,
          verified: true,
          botInfo: data.result,
          botUsername: data.result.username,
          botName: data.result.first_name
        });
      } else {
        res.json({
          success: false,
          verified: false,
          error: data.description || 'Invalid bot token'
        });
      }
    } catch (error: any) {
      console.error('[Telegram] Error verifying bot account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Fetch user's chats from Telegram
   */
  router.post('/fetch-chats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const account = await telegramService.getUserAccount(userId);

      if (!account || !account.isVerified) {
        return res.status(400).json({ 
          error: 'User account not configured or not verified' 
        });
      }

      // Return immediately - process in background
      res.json({
        success: true,
        message: 'Chat fetching started in background. Check monitored chats for updates.',
        status: 'processing'
      });

      // Process chats in background (don't await)
      (async () => {
        try {
          console.log(`📥 [Telegram] Starting background chat fetch for user ${userId}...`);
          
          // Emit start event
          telegramClientService.emit('chat_fetch_started', { userId, timestamp: Date.now() });
          
          // Fetch chats from Telegram using active client
          const chats = await telegramClientService.getUserChatsComprehensive(userId);
          
          // Emit fetched event
          telegramClientService.emit('chat_fetch_fetched', { userId, totalChats: chats.length, timestamp: Date.now() });
          
          // Save/update chats in database (BATCH OPERATION for efficiency)
          console.log(`💾 [Telegram] Saving ${chats.length} chats to database (batch operation)...`);
          
          // Use efficient batch operation: 1 query instead of 1,672!
          const result = await telegramService.saveMonitoredChatsBatch(userId, chats.map((chat: any) => ({
            chatId: chat.chatId,
            chatName: chat.chatName,
            chatType: chat.chatType,
            username: chat.username,
            inviteLink: chat.inviteLink || undefined,
            isActive: false // Inactive by default, user must configure and activate
          })));
          
          console.log(`✅ [Telegram] Completed: Saved ${result.savedCount}/${chats.length} chats for user ${userId}`);
          
          // Emit completion event
          telegramClientService.emit('chat_fetch_complete', { 
            userId, 
            savedCount: result.savedCount, 
            totalChats: chats.length,
            timestamp: Date.now()
          });

          // Start background metadata fetching with rate limiting
          console.log(`📊 [Telegram] Starting background metadata fetch for ${chats.length} chats (rate limited)...`);
          (async () => {
            let successCount = 0;
            let failCount = 0;
            const delayMs = 1000; // 1 second delay between each chat (safe rate limit)
            
            for (let i = 0; i < chats.length; i++) {
              const chat = chats[i];
              try {
                // Only fetch metadata for groups/channels (not private chats)
                if (chat.chatType === 'group' || chat.chatType === 'supergroup' || chat.chatType === 'channel') {
                  await telegramClientService.fetchAndStoreChatMetadata(userId, chat.chatId);
                  successCount++;
                  
                  // Log progress every 10 chats
                  if ((i + 1) % 10 === 0) {
                    console.log(`   📊 Metadata progress: ${i + 1}/${chats.length} (${successCount} success, ${failCount} failed)`);
                  }
                }
              } catch (err) {
                failCount++;
                console.error(`   ⚠️  Failed to fetch metadata for ${chat.chatId}:`, (err as Error).message);
              }
              
              // Rate limit: wait between requests (except for the last one)
              if (i < chats.length - 1) {
                await new Promise(resolve => setTimeout(resolve, delayMs));
              }
            }
            
            console.log(`✅ [Telegram] Metadata fetch complete: ${successCount} success, ${failCount} failed`);
            
            // Emit metadata fetch completion
            telegramClientService.emit('metadata_fetch_complete', {
              userId,
              successCount,
              failCount,
              totalChats: chats.length,
              timestamp: Date.now()
            });
          })().catch(err => {
            console.error('[Telegram] Background metadata fetch error:', err);
          });

        } catch (error: any) {
          console.error('[Telegram] Background chat fetch error:', error);
          telegramClientService.emit('chat_fetch_error', { 
            userId, 
            error: error.message,
            timestamp: Date.now()
          });
        }
      })();
      
    } catch (error: any) {
      console.error('[Telegram] Error starting chat fetch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get ALL chats (active and inactive) for Available Chats section
   */
  router.get('/all-chats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Get chats from database (these were saved during fetch)
      const chats = await telegramService.getMonitoredChats(userId, true); // true = include inactive
      
      // Get additional metadata if available
      const storedMetadata = await telegramService.getChatMetadata(userId) as any[];
      
      // Enrich chats with metadata
      const enrichedChats = chats.map((chat: any) => {
        const stored = storedMetadata?.find((m: any) => m.chat_id === chat.chatId);
        if (stored) {
          return {
            ...chat,
            photoUrl: stored.photo_url,
            memberCount: stored.member_count || chat.participantsCount,
            onlineCount: stored.online_count,
            adminCount: stored.admin_count,
            botPercentage: stored.bot_percentage,
            avgMessagesPerDay: stored.avg_messages_per_day,
            peakActivityHour: stored.peak_activity_hour,
            lastMessageDate: stored.last_message_date,
            lastMessageText: stored.last_message_text,
            contractsDetected30d: stored.contracts_detected_30d,
            isMember: stored.is_member === 1,
            isAdmin: stored.is_admin === 1,
            isCreator: stored.is_creator === 1,
            hasLeft: stored.has_left === 1,
            joinDate: stored.join_date
          };
        }
        return chat;
      });
      
      console.log(`[Telegram] Returning ${enrichedChats.length} chats for user ${userId}`);
      res.json(enrichedChats);
    } catch (error: any) {
      console.error('[Telegram] Error getting all chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get monitored chats (active only)
   */
  router.get('/monitored-chats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const chats = await telegramService.getMonitoredChats(userId);
      res.json(chats);
    } catch (error: any) {
      console.error('[Telegram] Error getting monitored chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Add/Update monitored chat
   */
  router.post('/monitored-chats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId, chatName, chatType, forwardToChatId, monitoredUserIds, monitoredKeywords, initialHistoryLimit } = req.body;

      if (!chatId) {
        return res.status(400).json({ error: 'Chat ID is required' });
      }

      const result = await telegramService.saveMonitoredChat(userId, {
        chatId,
        chatName,
        chatType,
        forwardToChatId,
        monitoredUserIds,
        monitoredKeywords
      });

      // If initialHistoryLimit is provided, fetch history in background
      if (initialHistoryLimit && initialHistoryLimit > 0) {
        const { telegramHistoryService } = await import('../services/TelegramHistoryService.js');
        
        // Start fetching in background (don't wait for it)
        telegramHistoryService.fetchAndStoreChatHistory(userId, chatId, initialHistoryLimit, (fetched, total) => {
          telegramClientService.emit('history_fetch_progress', {
            userId,
            chatId,
            fetched,
            total
          });
        }).then(fetchResult => {
          telegramClientService.emit('history_fetch_complete', {
            userId,
            chatId,
            ...fetchResult
          });
        }).catch(error => {
          telegramClientService.emit('history_fetch_error', {
            userId,
            chatId,
            error: error.message
          });
        });

        console.log(`📚 [Telegram] Started fetching ${initialHistoryLimit} messages for chat ${chatId}`);
      }

      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error saving monitored chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Toggle monitored chat active status
   */
  router.patch('/monitored-chats/:chatId/toggle', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      const { isActive } = req.body;

      const result = await telegramService.toggleMonitoredChat(userId, chatId, isActive);
      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error toggling monitored chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete monitored chat
   */
  router.delete('/monitored-chats/:chatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;

      const result = await telegramService.deleteMonitoredChat(userId, chatId);
      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error deleting monitored chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Bulk delete monitored chats
   */
  router.post('/monitored-chats/bulk-delete', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatIds } = req.body; // Array of chat IDs or 'all'

      if (chatIds === 'all') {
        // Delete all chats for this user
        await telegramService.deleteAllMonitoredChats(userId);
        res.json({ success: true, message: 'All chats deleted' });
      } else if (Array.isArray(chatIds) && chatIds.length > 0) {
        // Delete specific chats
        for (const chatId of chatIds) {
          await telegramService.deleteMonitoredChat(userId, chatId);
        }
        res.json({ success: true, message: `Deleted ${chatIds.length} chats` });
      } else {
        res.status(400).json({ error: 'Invalid chatIds parameter' });
      }
    } catch (error: any) {
      console.error('[Telegram] Error bulk deleting chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Leave a chat from Telegram (not just database)
   */
  router.post('/leave-chat-telegram', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.body;

      if (!chatId) {
        return res.status(400).json({ error: 'Chat ID is required' });
      }

      const result = await telegramClientService.leaveChatFromTelegram(userId, chatId);
      
      if (result.success) {
        // Also remove from our database
        await telegramService.deleteMonitoredChat(userId, chatId);
        res.json({ success: true, message: result.message });
      } else {
        res.status(400).json({ error: result.message });
      }
    } catch (error: any) {
      console.error('[Telegram] Error leaving chat from Telegram:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Bulk leave chats from Telegram
   */
  router.post('/bulk-leave-telegram', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatIds } = req.body;

      if (!Array.isArray(chatIds) || chatIds.length === 0) {
        return res.status(400).json({ error: 'Chat IDs array is required' });
      }

      console.log(`🚪 [Telegram] Bulk leaving ${chatIds.length} chats from Telegram...`);
      
      const result = await telegramClientService.bulkLeaveChatsTelegram(userId, chatIds);
      
      // Remove successful ones from database too
      for (const chatId of result.successful) {
        try {
          await telegramService.deleteMonitoredChat(userId, chatId);
        } catch (e) {
          console.error(`Failed to delete ${chatId} from database:`, e);
        }
      }
      
      res.json({
        success: true,
        message: `Left ${result.successful.length} chats, ${result.failed.length} failed`,
        successful: result.successful,
        failed: result.failed
      });
    } catch (error: any) {
      console.error('[Telegram] Error bulk leaving chats from Telegram:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get detected contracts
   */
  router.get('/detected-contracts', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const contracts = await telegramService.getDetectedContracts(userId, limit);
      res.json(contracts);
    } catch (error: any) {
      console.error('[Telegram] Error getting detected contracts:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete/disconnect user account
   */
  router.delete('/user-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Disconnect active client if exists
      await telegramClientService.disconnectAndCleanup(userId);
      
      // Delete from database
      const result = await telegramService.deleteUserAccount(userId);
      
      res.json({
        success: true,
        message: 'User account disconnected and removed',
        result
      });
    } catch (error: any) {
      console.error('[Telegram] Error deleting user account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete bot account
   */
  router.delete('/bot-account', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Disconnect bot client if exists
      await telegramClientService.disconnectAndCleanup(userId);
      
      const result = await telegramService.deleteBotAccount(userId);
      
      res.json({
        success: true,
        message: 'Bot account removed',
        result
      });
    } catch (error: any) {
      console.error('[Telegram] Error deleting bot account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete ALL Telegram data for the user
   */
  router.delete('/delete-all-data', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const includeAccounts = req.query.includeAccounts === 'true';
      
      console.log(`⚠️  [Telegram] User ${userId} requested to DELETE ALL TELEGRAM DATA (includeAccounts: ${includeAccounts})`);
      
      // CRITICAL: Disconnect Telegram client BEFORE deleting data
      await telegramClientService.disconnectAndCleanup(userId);
      
      const result = await telegramService.deleteAllTelegramData(userId, includeAccounts);
      
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('[Telegram] Error deleting all data:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Toggle monitoring for a specific chat
   */
  router.post('/monitored-chats/:chatId/toggle', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      const { isActive } = req.body;

      await telegramService.toggleChatMonitoring(userId, chatId, isActive);
      
      res.json({
        success: true,
        isActive,
        message: isActive ? 'Monitoring started' : 'Monitoring stopped'
      });
    } catch (error: any) {
      console.error('[Telegram] Error toggling chat monitoring:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get topic performance analytics
   */
  router.get('/topics/analytics', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { telegramTopicService } = await import('../services/TelegramTopicService.js');
      
      const bestTopics = await telegramTopicService.getBestPerformingTopics(userId, 20);
      
      res.json({
        success: true,
        bestPerformingTopics: bestTopics
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting topic analytics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update topic-specific user filter
   */
  router.post('/chats/:chatId/topics/:topicId/user-filter', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId, topicId } = req.params;
      const { monitoredUserIds, excludedUserIds } = req.body;
      
      const { telegramTopicService } = await import('../services/TelegramTopicService.js');
      await telegramTopicService.updateTopicUserFilter(
        userId, 
        chatId, 
        topicId,
        monitoredUserIds,
        excludedUserIds
      );
      
      res.json({ 
        success: true, 
        message: 'Topic user filter updated'
      });
    } catch (error: any) {
      console.error('[Telegram] Error updating topic user filter:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update monitored topics for a chat
   */
  router.post('/monitored-chats/:chatId/topics', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      const { monitoredTopicIds } = req.body;
      
      // Update monitored topics
      await execute(`
        UPDATE telegram_monitored_chats 
        SET monitored_topic_ids = ?, updated_at = ?
        WHERE user_id = ? AND chat_id = ?
      `, [
        monitoredTopicIds && monitoredTopicIds.length > 0 ? JSON.stringify(monitoredTopicIds) : null,
        Math.floor(Date.now() / 1000),
        userId,
        chatId
      ]);
      
      res.json({ 
        success: true, 
        message: 'Topics configuration updated',
        monitoredTopicIds
      });
    } catch (error: any) {
      console.error('[Telegram] Error updating monitored topics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Configure monitoring for a specific chat (keywords, users, forwarding)
   */
  router.post('/monitored-chats/:chatId/configure', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      const { 
        monitoredKeywords, 
        monitoredUserIds, 
        forwardToChatId, 
        forwardAccountId, 
        isActive, 
        initialHistoryLimit, 
        processBotMessages, 
        monitoredTopicIds,
        action_on_detection,
        auto_buy_enabled,
        auto_buy_amount_sol,
        auto_buy_wallet_id,
        auto_buy_slippage_bps,
        auto_buy_priority_level,
        auto_sell_enabled,
        stop_loss_percent,
        take_profit_percent,
        trailing_stop_enabled,
        trailing_stop_percent,
        auto_monitor_enabled,
        monitor_duration_hours,
        alert_price_changes
      } = req.body;

      // Update monitoring configuration only (preserves chat metadata like name, type, etc.)
      await telegramService.updateChatConfiguration(userId, chatId, {
        monitoredKeywords,
        monitoredUserIds,
        forwardToChatId,
        forwardAccountId,
        isActive,
        processBotMessages,
        monitoredTopicIds,
        action_on_detection,
        auto_buy_enabled,
        auto_buy_amount_sol,
        auto_buy_wallet_id,
        auto_buy_slippage_bps,
        auto_buy_priority_level,
        auto_sell_enabled,
        stop_loss_percent,
        take_profit_percent,
        trailing_stop_enabled,
        trailing_stop_percent,
        auto_monitor_enabled,
        monitor_duration_hours,
        alert_price_changes
      });

      // If initialHistoryLimit is provided, fetch history in background
      if (initialHistoryLimit && initialHistoryLimit > 0) {
        const { telegramHistoryService } = await import('../services/TelegramHistoryService.js');
        
        // Start fetching in background (don't wait for it)
        telegramHistoryService.fetchAndStoreChatHistory(userId, chatId, initialHistoryLimit, (fetched: number, total: number) => {
          telegramClientService.emit('history_fetch_progress', {
            userId,
            chatId,
            fetched,
            total
          });
        }).then((fetchResult: any) => {
          telegramClientService.emit('history_fetch_complete', {
            userId,
            chatId,
            ...fetchResult
          });
        }).catch((error: any) => {
          telegramClientService.emit('history_fetch_error', {
            userId,
            chatId,
            error: error.message
          });
        });

        console.log(`📚 [Telegram] Started fetching ${initialHistoryLimit} messages for chat ${chatId}`);
      }

      res.json({
        success: true,
        message: 'Configuration saved successfully'
      });
    } catch (error: any) {
      console.error('[Telegram] Error configuring chat:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Fetch and cache chat history
   */
  router.post('/chats/:chatId/fetch-history', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      let { chatId } = req.params;
      const { limit = 1000 } = req.body;

      // Decode URI component (handles URL encoding)
      chatId = decodeURIComponent(chatId);
      
      console.log(`📚 [History] Fetch request for chat: ${chatId} (user ${userId})`);

      // Import the history service
      const { telegramHistoryService } = await import('../services/TelegramHistoryService.js');

      // Start fetching in background
      res.json({
        success: true,
        message: 'History fetch started. Progress will be sent via WebSocket.'
      });

      // Fetch history asynchronously
      telegramHistoryService.fetchAndStoreChatHistory(userId, chatId, limit, (fetched, total) => {
        // Emit progress via WebSocket
        telegramClientService.emit('history_fetch_progress', {
          userId,
          chatId,
          fetched,
          total
        });
      }).then(result => {
        telegramClientService.emit('history_fetch_complete', {
          userId,
          chatId,
          ...result
        });
      }).catch(error => {
        telegramClientService.emit('history_fetch_error', {
          userId,
          chatId,
          error: error.message
        });
      });

    } catch (error: any) {
      console.error('[Telegram] Error starting history fetch:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get cached chat history
   */
  router.get('/chats/:chatId/history', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;

      // Import the history service
      const { telegramHistoryService } = await import('../services/TelegramHistoryService.js');

      const messages = await telegramHistoryService.getCachedHistory(userId, chatId, limit, offset);
      const status = await telegramHistoryService.getFetchStatus(userId, chatId);

      res.json({
        success: true,
        messages,
        fetchStatus: status,
        hasMore: messages.length === limit
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting cached history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Delete cached chat history
   */
  router.delete('/chats/:chatId/history', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      let { chatId } = req.params;

      // Decode URI component
      chatId = decodeURIComponent(chatId);
      
      console.log(`🗑️  [History] Delete request for chat: ${chatId} (user ${userId})`);

      // Import the history service
      const { telegramHistoryService } = await import('../services/TelegramHistoryService.js');

      const result = await telegramHistoryService.deleteHistory(userId, chatId);

      res.json({
        success: true,
        messagesDeleted: result.messagesDeleted,
        message: 'Chat history deleted successfully'
      });
    } catch (error: any) {
      console.error('[Telegram] Error deleting history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get detected contracts
   */
  router.get('/detections', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const limit = parseInt(req.query.limit as string) || 100;
      
      const detections = await telegramService.getDetectedContracts(userId, limit);
      res.json(detections);
    } catch (error: any) {
      console.error('[Telegram] Error getting detections:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get forwarding history
   */
  router.get('/forwarding/history', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const limit = parseInt(req.query.limit as string) || 100;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;
      
      let query = `
        SELECT * FROM telegram_forwarding_history 
        WHERE user_id = ? AND contract_address IS NOT NULL
      `;
      const params: any[] = [userId];
      
      if (status) {
        query += ` AND status = ?`;
        params.push(status);
      }
      
      query += ` ORDER BY forwarded_at DESC LIMIT ? OFFSET ?`;
      params.push(limit, offset);
      
      const { queryAll } = await import('../database/helpers.js');
      const history = await queryAll(query, params);
      
      res.json({
        success: true,
        history,
        limit,
        offset
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting forwarding history:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get forwarding statistics
   */
  router.get('/forwarding/stats', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const days = parseInt(req.query.days as string) || 7;
      
      const { queryAll, queryOne } = await import('../database/helpers.js');
      
      // Get summary stats (only for contract forwards)
      const summary = await queryOne(`
        SELECT 
          COUNT(*) as total_forwards,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'rate_limited' THEN 1 ELSE 0 END) as pending,
          AVG(CASE WHEN status = 'success' THEN response_time_ms ELSE NULL END) as avg_latency_ms,
          MIN(CASE WHEN status = 'success' THEN response_time_ms ELSE NULL END) as min_latency_ms,
          MAX(CASE WHEN status = 'success' THEN response_time_ms ELSE NULL END) as max_latency_ms,
          COUNT(DISTINCT contract_address) as unique_contracts,
          COUNT(DISTINCT source_chat_id) as unique_source_chats,
          COUNT(DISTINCT target_chat_id) as unique_target_chats,
          COUNT(DISTINCT forward_account_id) as unique_forward_accounts
        FROM telegram_forwarding_history 
        WHERE user_id = ? 
        AND contract_address IS NOT NULL
        AND forwarded_at >= ?
      `, [userId, Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60)]) as any;
      
      // Get top forwarded contracts
      const topContracts = await queryAll(`
        SELECT 
          contract_address,
          COUNT(*) as forward_count,
          MAX(forwarded_at) as last_forwarded
        FROM telegram_forwarding_history
        WHERE user_id = ?
        AND contract_address IS NOT NULL
        AND forwarded_at >= ?
        GROUP BY contract_address
        ORDER BY forward_count DESC
        LIMIT 10
      `, [userId, Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60)]);
      
      // Get hourly distribution
      const hourlyStats = await queryAll(`
        SELECT 
          strftime('%H', forwarded_at, 'unixepoch') as hour,
          COUNT(*) as forwards,
          AVG(response_time_ms) as avg_latency
        FROM telegram_forwarding_history
        WHERE user_id = ?
        AND contract_address IS NOT NULL
        AND forwarded_at >= ?
        AND status = 'success'
        GROUP BY hour
        ORDER BY hour
      `, [userId, Math.floor(Date.now() / 1000) - (days * 24 * 60 * 60)]);
      
      res.json({
        success: true,
        period_days: days,
        summary,
        topContracts,
        hourlyDistribution: hourlyStats
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting forwarding stats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Discover topics from Telegram API (fetch fresh from Telegram)
   */
  router.post('/chats/:chatId/topics/discover', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      
      const { telegramTopicService } = await import('../services/TelegramTopicService.js');
      const result = await telegramTopicService.discoverForumTopics(userId, chatId);
      
      res.json(result);
    } catch (error: any) {
      console.error('[Telegram] Error discovering topics:', error);
      res.status(500).json({ 
        success: false, 
        error: error.message 
      });
    }
  });

  /**
   * Get topics in a forum group (from cache or history)
   */
  router.get('/chats/:chatId/topics', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      
      // Get topic statistics from message history
      const topics = await queryAll(`
        SELECT 
          topic_id,
          topic_title,
          COUNT(DISTINCT message_id) as message_count,
          COUNT(DISTINCT sender_id) as unique_senders,
          COUNT(DISTINCT CASE WHEN detected_contracts IS NOT NULL THEN message_id END) as messages_with_contracts,
          MAX(message_timestamp) as last_activity
        FROM telegram_message_history
        WHERE user_id = ? AND chat_id = ? AND topic_id IS NOT NULL
        GROUP BY topic_id, topic_title
        ORDER BY message_count DESC
      `, [userId, chatId]) as any[];
      
      res.json({
        success: true,
        chatId,
        topics: topics.map(t => ({
          topicId: t.topic_id,
          topicTitle: t.topic_title || `Topic ${t.topic_id}`,
          messageCount: t.message_count,
          uniqueSenders: t.unique_senders,
          contractsDetected: t.messages_with_contracts,
          lastActivityTime: t.last_activity
        }))
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting topics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get chat duplicate strategy configuration
   */
  router.get('/chat-config/:chatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { chatId } = req.params;
      
      const config = await queryOne<any>(
        `SELECT * FROM telegram_chat_configs WHERE chat_id = ? AND user_id = ?`,
        [chatId, userId]
      );
      
      if (!config) {
        // Return default config if none exists
        return res.json({
          duplicateStrategy: 'first_only_no_backlog',
          backlogScanDepth: 1000,
          backlogTimeLimit: 86400,
          minTimeBetweenDuplicates: 0
        });
      }
      
      res.json({
        duplicateStrategy: config.duplicate_strategy,
        backlogScanDepth: config.backlog_scan_depth,
        backlogTimeLimit: config.backlog_time_limit,
        minTimeBetweenDuplicates: config.min_time_between_duplicates
      });
    } catch (error: any) {
      console.error('[Telegram] Error getting chat config:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Update chat duplicate strategy configuration
   */
  router.post('/chat-config', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { 
        chatId, 
        duplicateStrategy, 
        backlogScanDepth, 
        backlogTimeLimit,
        minTimeBetweenDuplicates 
      } = req.body;
      
      if (!chatId || !duplicateStrategy) {
        return res.status(400).json({ 
          error: 'chatId and duplicateStrategy are required' 
        });
      }
      
      const now = Math.floor(Date.now() / 1000);
      
      await execute(`
        INSERT OR REPLACE INTO telegram_chat_configs (
          chat_id, user_id, duplicate_strategy, 
          backlog_scan_depth, backlog_time_limit, 
          min_time_between_duplicates, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 
          COALESCE((SELECT created_at FROM telegram_chat_configs WHERE chat_id = ? AND user_id = ?), ?),
          ?
        )
      `, [
        chatId, userId, duplicateStrategy,
        backlogScanDepth || 1000,
        backlogTimeLimit || 86400,
        minTimeBetweenDuplicates || 0,
        chatId, userId, now,
        now
      ]);
      
      // If strategy is first_only_with_backlog, trigger a history scan
      if (duplicateStrategy === 'first_only_with_backlog') {
        // Scan in the background
        telegramClientService.scanChatHistory(userId, chatId, backlogScanDepth || 1000)
          .catch(err => console.error(`Failed to scan history for ${chatId}:`, err));
      }
      
      res.json({ 
        success: true,
        message: 'Chat configuration updated successfully'
      });
    } catch (error: any) {
      console.error('[Telegram] Error updating chat config:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * GET /api/telegram/chats/:chatId/participants
   * Fetch participants/members from a chat for user targeting
   */
  router.get('/chats/:chatId/participants', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as any).user!.id;
      const { chatId } = req.params;
      const limit = parseInt(req.query.limit as string) || 100;

      const participants = await telegramClientService.fetchChatParticipants(userId, chatId, limit);

      res.json({
        success: true,
        chatId,
        participants,
        count: participants.length
      });
    } catch (error: any) {
      console.error('[Telegram] Error fetching participants:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get Telegram API traffic metrics
   */
  router.get('/traffic-metrics', authService.requireSecureAuth(), async (_req, res) => {
    try {
      const metrics = telegramRateLimiter.getMetrics();
      res.json(metrics);
    } catch (error: any) {
      console.error('[Telegram] Error getting traffic metrics:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get detailed traffic report
   */
  router.get('/traffic-report/:minutes?', authService.requireSecureAuth(), async (req, res) => {
    try {
      const minutes = parseInt(req.params.minutes || '60');
      const report = telegramRateLimiter.getTrafficReport(minutes);
      res.json(report);
    } catch (error: any) {
      console.error('[Telegram] Error getting traffic report:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Reset rate limiter delays (after successful period)
   */
  router.post('/reset-rate-limits', authService.requireSecureAuth(), async (_req, res) => {
    try {
      telegramRateLimiter.resetDelays();
      res.json({ success: true, message: 'Rate limiter delays reset to baseline' });
    } catch (error: any) {
      console.error('[Telegram] Error resetting rate limits:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}
