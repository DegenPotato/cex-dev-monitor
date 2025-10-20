import { Router, Request } from 'express';
import { TelegramUserService } from '../services/TelegramUserService.js';
import { telegramClientService } from '../services/TelegramClientService.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

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
      
      // If connected successfully, update database
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
      
      // If connected successfully, update database
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

      if (!data.ok) {
        return res.status(400).json({ 
          success: false, 
          error: data.description || 'Invalid bot token' 
        });
      }

      // Update verification status and username
      await telegramService.updateBotAccountVerification(userId, true, data.result.username);

      res.json({
        success: true,
        botUsername: data.result.username,
        botName: data.result.first_name
      });
    } catch (error: any) {
      console.error('[Telegram] Error verifying bot account:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Fetch user's chats (would call Python service with Telethon)
   * This is a placeholder - actual implementation requires Python integration
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

      // In real implementation, this would:
      // 1. Send request to Python service
      // 2. Python service uses Telethon to fetch dialogs
      // 3. Returns list of chats with metadata
      // 4. We save them to monitored_chats table

      // Placeholder response
      res.json({
        success: true,
        message: 'This endpoint requires Python Telethon integration',
        note: 'Use the Python script to fetch chats and update database'
      });
    } catch (error: any) {
      console.error('[Telegram] Error fetching chats:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get monitored chats
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
      const { chatId, chatName, chatType, forwardToChatId, monitoredUserIds, monitoredKeywords } = req.body;

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

  return router;
}
