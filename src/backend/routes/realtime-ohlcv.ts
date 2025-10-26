import { Router, Request, Response } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { queryOne, queryAll } from '../database/helpers.js';
import { realtimeOHLCVService } from '../services/RealtimeOHLCVService.js';

const router = Router();
const authService = new SecureAuthService();

/**
 * Get current user's active real-time subscription
 */
router.get('/api/realtime-ohlcv/subscription', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    
    // Check in-memory subscription
    const activeSubscription = realtimeOHLCVService.getSubscription(userId);
    
    if (activeSubscription) {
      res.json({
        success: true,
        isActive: true,
        subscription: {
          mintAddress: activeSubscription.mintAddress,
          poolAddress: activeSubscription.poolAddress,
          lastUpdate: activeSubscription.lastUpdate
        }
      });
    } else {
      // Check database for recent subscriptions
      const dbSubscription = await queryOne(`
        SELECT * FROM realtime_ohlcv_subscriptions
        WHERE user_id = ? AND is_active = 1
        ORDER BY started_at DESC
        LIMIT 1
      `, [userId]);
      
      res.json({
        success: true,
        isActive: false,
        subscription: dbSubscription || null
      });
    }
  } catch (error: any) {
    console.error('Error fetching subscription:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get all active real-time subscriptions (admin only)
 */
router.get('/api/realtime-ohlcv/active', authService.requireSuperAdmin(), async (_req: Request, res: Response) => {
  try {
    // Get from service
    const activeSubscriptions = realtimeOHLCVService.getAllSubscriptions();
    
    // Also get from database
    const dbSubscriptions = await queryAll(`
      SELECT 
        ars.*,
        u.username,
        u.wallet_address
      FROM active_realtime_subscriptions ars
      JOIN users u ON ars.user_id = u.id
    `);
    
    res.json({
      success: true,
      memorySubscriptions: activeSubscriptions.map(sub => ({
        userId: sub.userId,
        mintAddress: sub.mintAddress,
        poolAddress: sub.poolAddress,
        lastUpdate: sub.lastUpdate,
        isActive: sub.isActive
      })),
      databaseSubscriptions: dbSubscriptions,
      totalActive: activeSubscriptions.length
    });
  } catch (error: any) {
    console.error('Error fetching active subscriptions:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

/**
 * Get subscription history for current user
 */
router.get('/api/realtime-ohlcv/history', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { limit = 20 } = req.query;
    
    const history = await queryAll(`
      SELECT 
        ros.*,
        tr.token_name,
        tr.token_symbol
      FROM realtime_ohlcv_subscriptions ros
      LEFT JOIN token_registry tr ON ros.mint_address = tr.token_mint
      WHERE ros.user_id = ?
      ORDER BY ros.started_at DESC
      LIMIT ?
    `, [userId, parseInt(limit as string)]);
    
    res.json({
      success: true,
      history,
      count: history.length
    });
  } catch (error: any) {
    console.error('Error fetching subscription history:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

export default router;
