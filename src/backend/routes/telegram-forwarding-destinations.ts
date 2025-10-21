import { Router, Request } from 'express';
import { queryAll, execute } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();

// Extend Express Request type
interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    wallet_address: string;
    username: string;
    role: string;
  };
}

export function createForwardDestinationRoutes() {
  const router = Router();

  /**
   * Get all available forward targets (chats you can forward TO)
   */
  router.get('/available-targets', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      
      // Get all chats from telegram_chat_metadata that can be forwarded to
      const targets = await queryAll(`
        SELECT 
          chat_id,
          title as chat_name,
          username,
          chat_type,
          invite_link,
          member_count,
          updated_at
        FROM telegram_chat_metadata
        WHERE user_id = ?
          AND chat_type IN ('user', 'group', 'supergroup', 'channel', 'bot', 'private')
        ORDER BY title
      `, [userId]);
      
      res.json(targets || []);
    } catch (error: any) {
      console.error('[Telegram] Error fetching available targets:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Get forward destinations for a specific chat
   */
  router.get('/destinations/:sourceChatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { sourceChatId } = req.params;
      
      const destinations = await queryAll(`
        SELECT 
          tfd.id,
          tfd.target_chat_id,
          tfd.target_chat_name,
          tfd.forward_account_id,
          tfd.is_active,
          tcm.username,
          tcm.chat_type,
          tcm.invite_link
        FROM telegram_forward_destinations tfd
        LEFT JOIN telegram_chat_metadata tcm 
          ON tfd.target_chat_id = tcm.chat_id 
          AND tcm.user_id = ?
        WHERE tfd.user_id = ? 
          AND tfd.source_chat_id = ?
        ORDER BY tfd.created_at DESC
      `, [userId, userId, sourceChatId]);
      
      res.json(destinations || []);
    } catch (error: any) {
      console.error('[Telegram] Error fetching destinations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Add forward destinations (bulk operation)
   */
  router.post('/destinations/:sourceChatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { sourceChatId } = req.params;
      const { destinations } = req.body; // Array of { targetChatId, targetChatName, forwardAccountId }
      
      if (!Array.isArray(destinations)) {
        return res.status(400).json({ error: 'destinations must be an array' });
      }
      
      const now = Math.floor(Date.now() / 1000);
      const added = [];
      
      for (const dest of destinations) {
        try {
          // Insert or update destination
          await execute(`
            INSERT OR REPLACE INTO telegram_forward_destinations (
              user_id, source_chat_id, target_chat_id, target_chat_name, 
              forward_account_id, is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, 1, 
              COALESCE((SELECT created_at FROM telegram_forward_destinations 
                WHERE user_id = ? AND source_chat_id = ? AND target_chat_id = ?), ?),
              ?
            )
          `, [
            userId, sourceChatId, dest.targetChatId, 
            dest.targetChatName || dest.targetChatId,
            dest.forwardAccountId || null,
            userId, sourceChatId, dest.targetChatId, now,
            now
          ]);
          
          added.push(dest.targetChatId);
        } catch (error: any) {
          console.error(`Failed to add destination ${dest.targetChatId}:`, error);
        }
      }
      
      res.json({ 
        success: true, 
        added: added.length,
        destinations: added
      });
    } catch (error: any) {
      console.error('[Telegram] Error adding destinations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Remove forward destination
   */
  router.delete('/destinations/:sourceChatId/:targetChatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { sourceChatId, targetChatId } = req.params;
      
      await execute(`
        DELETE FROM telegram_forward_destinations
        WHERE user_id = ? AND source_chat_id = ? AND target_chat_id = ?
      `, [userId, sourceChatId, targetChatId]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Telegram] Error removing destination:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Toggle destination active status
   */
  router.patch('/destinations/:sourceChatId/:targetChatId/toggle', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { sourceChatId, targetChatId } = req.params;
      
      await execute(`
        UPDATE telegram_forward_destinations
        SET is_active = NOT is_active,
            updated_at = ?
        WHERE user_id = ? AND source_chat_id = ? AND target_chat_id = ?
      `, [Math.floor(Date.now() / 1000), userId, sourceChatId, targetChatId]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Telegram] Error toggling destination:', error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Clear all destinations for a chat
   */
  router.delete('/destinations/:sourceChatId', authService.requireSecureAuth(), async (req, res) => {
    try {
      const userId = (req as AuthenticatedRequest).user!.id;
      const { sourceChatId } = req.params;
      
      await execute(`
        DELETE FROM telegram_forward_destinations
        WHERE user_id = ? AND source_chat_id = ?
      `, [userId, sourceChatId]);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error('[Telegram] Error clearing destinations:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createForwardDestinationRoutes();
