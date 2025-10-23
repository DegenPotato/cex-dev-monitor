import { Router } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { execute, queryOne } from '../database/helpers.js';
import { telegramClientService } from '../services/TelegramClientService.js';

const authService = new SecureAuthService();
const router = Router();

interface AuthenticatedRequest extends Request {
  user?: { id: number; address: string; role?: string };
}

/**
 * Get user's data summary (what will be deleted)
 */
router.get('/api/user/data-summary', authService.requireSecureAuth(), async (req: any, res: any) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    // Count all user data
    const telegramAccounts = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_user_accounts WHERE user_id = ?',
      [userId]
    ) as any;
    
    const telegramBots = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_bot_accounts WHERE user_id = ?',
      [userId]
    ) as any;
    
    const monitoredChats = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_monitored_chats WHERE user_id = ?',
      [userId]
    ) as any;
    
    const detectedContracts = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_detected_contracts WHERE user_id = ?',
      [userId]
    ) as any;
    
    // Get last activity
    const lastActivity = await queryOne(
      'SELECT last_connected_at FROM telegram_user_accounts WHERE user_id = ? ORDER BY last_connected_at DESC LIMIT 1',
      [userId]
    ) as any;
    
    res.json({
      userId,
      summary: {
        telegramUserAccounts: telegramAccounts?.count || 0,
        telegramBotAccounts: telegramBots?.count || 0,
        monitoredChats: monitoredChats?.count || 0,
        detectedContracts: detectedContracts?.count || 0,
        lastActivity: lastActivity?.last_connected_at || null
      }
    });
  } catch (error: any) {
    console.error('Error fetching user data summary:', error);
    res.status(500).json({ error: 'Failed to fetch data summary' });
  }
});

/**
 * Delete specific data type
 */
router.delete('/api/user/data/:type', authService.requireSecureAuth(), async (req: any, res: any) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const dataType = req.params.type;
    
    let deletedCount = 0;
    
    switch (dataType) {
      case 'telegram-user-account':
        await execute('DELETE FROM telegram_user_accounts WHERE user_id = ?', [userId]);
        // Disconnect Telegram session
        await telegramClientService.disconnectAndCleanup(userId);
        deletedCount = 1;
        break;
        
      case 'telegram-bot-account':
        await execute('DELETE FROM telegram_bot_accounts WHERE user_id = ?', [userId]);
        // Disconnect bot session
        await telegramClientService.disconnectAndCleanup(userId);
        deletedCount = 1;
        break;
        
      case 'monitored-chats':
        const result1 = await queryOne(
          'SELECT COUNT(*) as count FROM telegram_monitored_chats WHERE user_id = ?',
          [userId]
        ) as any;
        deletedCount = result1?.count || 0;
        await execute('DELETE FROM telegram_monitored_chats WHERE user_id = ?', [userId]);
        break;
        
      case 'detected-contracts':
        const result2 = await queryOne(
          'SELECT COUNT(*) as count FROM telegram_detected_contracts WHERE user_id = ?',
          [userId]
        ) as any;
        deletedCount = result2?.count || 0;
        await execute('DELETE FROM telegram_detected_contracts WHERE user_id = ?', [userId]);
        break;
        
      default:
        return res.status(400).json({ error: 'Invalid data type' });
    }
    
    console.log(`✅ [User Data] User ${userId} deleted ${deletedCount} ${dataType} record(s)`);
    
    res.json({
      success: true,
      dataType,
      deletedCount,
      message: `Successfully deleted ${deletedCount} ${dataType} record(s)`
    });
    
  } catch (error: any) {
    console.error('Error deleting user data:', error);
    res.status(500).json({ error: 'Failed to delete data' });
  }
});

/**
 * Delete ALL user data (nuclear option)
 */
router.delete('/api/user/data/all', authService.requireSecureAuth(), async (req: any, res: any) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    const confirmCode = req.body.confirmCode;
    
    // Require confirmation code to prevent accidental deletion
    if (confirmCode !== 'DELETE_ALL_MY_DATA') {
      return res.status(400).json({ 
        error: 'Invalid confirmation code. You must send confirmCode: "DELETE_ALL_MY_DATA"' 
      });
    }
    
    // Get counts before deletion
    const summary = {
      telegramAccounts: 0,
      telegramBots: 0,
      monitoredChats: 0,
      detectedContracts: 0
    };
    
    const count1 = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_user_accounts WHERE user_id = ?',
      [userId]
    ) as any;
    summary.telegramAccounts = count1?.count || 0;
    
    const count2 = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_bot_accounts WHERE user_id = ?',
      [userId]
    ) as any;
    summary.telegramBots = count2?.count || 0;
    
    const count3 = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_monitored_chats WHERE user_id = ?',
      [userId]
    ) as any;
    summary.monitoredChats = count3?.count || 0;
    
    const count4 = await queryOne(
      'SELECT COUNT(*) as count FROM telegram_detected_contracts WHERE user_id = ?',
      [userId]
    ) as any;
    summary.detectedContracts = count4?.count || 0;
    
    // Delete all user data
    await execute('DELETE FROM telegram_detected_contracts WHERE user_id = ?', [userId]);
    await execute('DELETE FROM telegram_monitored_chats WHERE user_id = ?', [userId]);
    await execute('DELETE FROM telegram_bot_accounts WHERE user_id = ?', [userId]);
    await execute('DELETE FROM telegram_user_accounts WHERE user_id = ?', [userId]);
    
    // CRITICAL: Disconnect and cleanup Telegram session
    await telegramClientService.disconnectAndCleanup(userId);
    
    console.log(`🗑️  [User Data] User ${userId} deleted ALL data:`, summary);
    
    res.json({
      success: true,
      message: 'All your data has been permanently deleted',
      deletedData: summary,
      totalRecords: Object.values(summary).reduce((a, b) => a + b, 0)
    });
    
  } catch (error: any) {
    console.error('Error deleting all user data:', error);
    res.status(500).json({ error: 'Failed to delete all data' });
  }
});

/**
 * Export user data (GDPR compliance)
 */
router.get('/api/user/data/export', authService.requireSecureAuth(), async (req: any, res: any) => {
  try {
    const userId = (req as AuthenticatedRequest).user!.id;
    
    const { queryAll } = await import('../database/helpers.js');
    
    // Fetch all user data
    const telegramAccounts = await queryAll(
      'SELECT * FROM telegram_user_accounts WHERE user_id = ?',
      [userId]
    );
    
    const telegramBots = await queryAll(
      'SELECT * FROM telegram_bot_accounts WHERE user_id = ?',
      [userId]
    );
    
    const monitoredChats = await queryAll(
      'SELECT * FROM telegram_monitored_chats WHERE user_id = ?',
      [userId]
    );
    
    const detectedContracts = await queryAll(
      'SELECT * FROM telegram_detected_contracts WHERE user_id = ?',
      [userId]
    );
    
    const exportData = {
      exportedAt: new Date().toISOString(),
      userId,
      data: {
        telegramUserAccounts: telegramAccounts,
        telegramBotAccounts: telegramBots,
        monitoredChats: monitoredChats,
        detectedContracts: detectedContracts
      }
    };
    
    // Set headers for download
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="user-data-${userId}-${Date.now()}.json"`);
    
    res.json(exportData);
    
  } catch (error: any) {
    console.error('Error exporting user data:', error);
    res.status(500).json({ error: 'Failed to export data' });
  }
});

export default router;
