/**
 * Telegram Chat Metadata API Routes
 * Fetch comprehensive metadata including user's role/permissions
 */
import { Router } from 'express';
import { queryAll, queryOne } from '../database/helpers.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
const router = Router();
const authService = new SecureAuthService();
/**
 * Fetch and store metadata for a specific chat
 * POST /api/telegram/metadata/:chatId/fetch
 */
router.post('/metadata/:chatId/fetch', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;
        // Get telegram service from global
        const telegramService = global.telegramClientService;
        if (!telegramService) {
            return res.status(503).json({ error: 'Telegram service not available' });
        }
        // Fetch metadata
        const metadata = await telegramService.fetchAndStoreChatMetadata(userId, chatId);
        res.json({
            success: true,
            metadata
        });
    }
    catch (error) {
        console.error('[Telegram] Error fetching metadata:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get stored metadata for a specific chat
 * GET /api/telegram/metadata/:chatId
 */
router.get('/metadata/:chatId', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatId } = req.params;
        const metadata = await queryOne('SELECT * FROM telegram_chat_metadata WHERE user_id = ? AND chat_id = ?', [userId, chatId]);
        if (!metadata) {
            return res.status(404).json({ error: 'Metadata not found for this chat' });
        }
        res.json(metadata);
    }
    catch (error) {
        console.error('[Telegram] Error getting metadata:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get metadata for all monitored chats
 * GET /api/telegram/metadata
 */
router.get('/metadata', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const metadata = await queryAll(`SELECT m.*, c.chat_name as monitored_chat_name, c.is_active
       FROM telegram_chat_metadata m
       LEFT JOIN telegram_monitored_chats c ON m.user_id = c.user_id AND m.chat_id = c.chat_id
       WHERE m.user_id = ?
       ORDER BY m.updated_at DESC`, [userId]);
        res.json(metadata);
    }
    catch (error) {
        console.error('[Telegram] Error getting all metadata:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Bulk fetch metadata for multiple chats
 * POST /api/telegram/metadata/bulk-fetch
 * Body: { chatIds: string[] }
 */
router.post('/metadata/bulk-fetch', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const { chatIds } = req.body;
        if (!Array.isArray(chatIds)) {
            return res.status(400).json({ error: 'chatIds must be an array' });
        }
        const telegramService = global.telegramClientService;
        if (!telegramService) {
            return res.status(503).json({ error: 'Telegram service not available' });
        }
        // Fetch metadata for all chats in parallel
        const results = await Promise.allSettled(chatIds.map(chatId => telegramService.fetchAndStoreChatMetadata(userId, chatId)));
        const successful = results.filter(r => r.status === 'fulfilled').length;
        const failed = results.filter(r => r.status === 'rejected').length;
        res.json({
            success: true,
            total: chatIds.length,
            successful,
            failed,
            results: results.map((r, i) => ({
                chatId: chatIds[i],
                status: r.status,
                data: r.status === 'fulfilled' ? r.value : null,
                error: r.status === 'rejected' ? r.reason.message : null
            }))
        });
    }
    catch (error) {
        console.error('[Telegram] Error bulk fetching metadata:', error);
        res.status(500).json({ error: error.message });
    }
});
/**
 * Get chats where user has admin/creator role
 * GET /api/telegram/metadata/admin-chats
 */
router.get('/metadata/admin-chats', authService.requireSecureAuth(), async (req, res) => {
    try {
        const userId = req.user.id;
        const adminChats = await queryAll(`SELECT * FROM telegram_chat_metadata 
       WHERE user_id = ? AND (is_admin = 1 OR is_creator = 1)
       ORDER BY is_creator DESC, member_count DESC`, [userId]);
        res.json({
            total: adminChats.length,
            chats: adminChats,
            breakdown: {
                creator: adminChats.filter((c) => c.is_creator).length,
                admin: adminChats.filter((c) => c.is_admin && !c.is_creator).length
            }
        });
    }
    catch (error) {
        console.error('[Telegram] Error getting admin chats:', error);
        res.status(500).json({ error: error.message });
    }
});
export default router;
