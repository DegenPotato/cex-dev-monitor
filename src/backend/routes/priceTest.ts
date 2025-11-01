/**
 * Price Test Routes
 * Real-time price monitoring and alert testing
 */

import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { getTokenPriceMonitor } from '../services/TokenPriceMonitor.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();
const priceMonitor = getTokenPriceMonitor();

// Store io instance
let io: SocketIOServer | null = null;

export function initializePriceTestRoutes(ioInstance: SocketIOServer) {
  io = ioInstance;
  console.log('✅ Price Test routes initialized with Socket.IO');
}

const router = Router();

// Store active price targets per user per token
interface PriceTarget {
  id: string;
  tokenMint: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  hit: boolean;
  createdAt: number;
}

// Map: userId -> tokenMint -> targets[]
const userTargets = new Map<number, Map<string, PriceTarget[]>>();

/**
 * Start price monitoring for a token
 */
router.post('/api/price-test/subscribe', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint required' });
    }

    console.log(`📊 Starting price monitoring for ${tokenMint}`);
    
    // Start monitoring
    const stats = await priceMonitor.startMonitoring(tokenMint);
    
    res.json({ 
      success: true, 
      tokenMint,
      stats,
      message: `Started monitoring ${tokenMint}` 
    });
  } catch (error: any) {
    console.error('❌ Error starting price monitoring:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop price monitoring for a token
 */
router.post('/api/price-test/unsubscribe', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint required' });
    }

    console.log(`📊 Stopping price monitoring for ${tokenMint}`);
    
    priceMonitor.stopMonitoring(tokenMint);
    
    res.json({ 
      success: true, 
      tokenMint,
      message: `Stopped monitoring ${tokenMint}` 
    });
  } catch (error: any) {
    console.error('❌ Error stopping price monitoring:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get current price stats
 */
router.get('/api/price-test/stats/:tokenMint', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    
    const stats = priceMonitor.getStats(tokenMint);
    
    if (!stats) {
      return res.status(404).json({ error: 'Token not found or not being monitored' });
    }
    
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ Error getting price stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset stats for a token
 */
router.post('/api/price-test/reset', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint required' });
    }

    priceMonitor.resetStats(tokenMint);
    
    const stats = priceMonitor.getStats(tokenMint);
    
    res.json({ 
      success: true, 
      tokenMint,
      stats,
      message: `Reset stats for ${tokenMint}` 
    });
  } catch (error: any) {
    console.error('❌ Error resetting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set price targets for a token
 */
router.post('/api/price-test/targets', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tokenMint, targets } = req.body;
    
    if (!tokenMint || !Array.isArray(targets)) {
      return res.status(400).json({ error: 'tokenMint and targets array required' });
    }

    // Create target objects
    const priceTargets: PriceTarget[] = targets.map((t: any) => ({
      id: `${Date.now()}_${Math.random()}`,
      tokenMint,
      targetPrice: t.targetPrice,
      targetPercent: t.targetPercent,
      direction: t.direction,
      hit: false,
      createdAt: Date.now()
    }));

    // Initialize user targets if not exists
    if (!userTargets.has(userId)) {
      userTargets.set(userId, new Map());
    }
    
    // Store targets for this token
    userTargets.get(userId)!.set(tokenMint, priceTargets);
    
    console.log(`🎯 Set ${priceTargets.length} targets for ${tokenMint} (user ${userId})`);
    
    res.json({ 
      success: true, 
      targets: priceTargets 
    });
  } catch (error: any) {
    console.error('❌ Error setting targets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get price targets for a token
 */
router.get('/api/price-test/targets/:tokenMint', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tokenMint } = req.params;
    
    const userTokens = userTargets.get(userId);
    const targets = userTokens?.get(tokenMint) || [];
    
    res.json({ success: true, targets });
  } catch (error: any) {
    console.error('❌ Error getting targets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear targets for a token
 */
router.delete('/api/price-test/targets/:tokenMint', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { tokenMint } = req.params;
    
    const userTokens = userTargets.get(userId);
    if (userTokens) {
      userTokens.delete(tokenMint);
    }
    
    res.json({ success: true, message: 'Targets cleared' });
  } catch (error: any) {
    console.error('❌ Error clearing targets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all monitored tokens
 */
router.get('/api/price-test/monitored', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    const tokens = priceMonitor.getMonitoredTokens();
    
    res.json({ success: true, tokens });
  } catch (error: any) {
    console.error('❌ Error getting monitored tokens:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check targets against price updates
priceMonitor.on('price_update', (update) => {
  // Check all users' targets for this token
  for (const [userId, userTokenTargets] of userTargets.entries()) {
    const targets = userTokenTargets.get(update.tokenMint);
    if (!targets) continue;
    
    for (const target of targets) {
      if (target.hit) continue;
      
      // Check if target is hit (using SOL price)
      const hit = target.direction === 'above' 
        ? update.price >= target.targetPrice
        : update.price <= target.targetPrice;
      
      if (hit) {
        target.hit = true;
        console.log(`🎯 Target HIT for user ${userId}: ${update.tokenMint} ${target.direction} ${target.targetPrice.toFixed(9)} SOL`);
        
        // Emit WebSocket event for notification
        if (io) {
          io.to(`user_${userId}`).emit('price_target_hit', {
            target,
            currentPrice: update.price,
            currentPriceUSD: update.priceUSD,
            timestamp: Date.now()
          });
        }
      }
    }
  }
});

export default router;
