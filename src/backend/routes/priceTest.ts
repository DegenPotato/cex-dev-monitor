/**
 * Price Test Routes
 * Real-time price monitoring and alert testing
 */

import { Router, Request, Response } from 'express';
import { Server as SocketIOServer } from 'socket.io';
import { getPythPriceService } from '../services/PythPriceService.js';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';

const authService = new SecureAuthService();
const pythService = getPythPriceService();

// Initialize Pyth service
pythService.connect();

// Store io instance
let io: SocketIOServer | null = null;

export function initializePriceTestRoutes(ioInstance: SocketIOServer) {
  io = ioInstance;
  console.log('✅ Price Test routes initialized with Socket.IO');
}

const router = Router();

// Store active price targets per user
interface PriceTarget {
  id: string;
  symbol: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  hit: boolean;
  createdAt: number;
}

const userTargets = new Map<number, PriceTarget[]>();

/**
 * Start price monitoring for a symbol
 */
router.post('/api/price-test/subscribe', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { symbol, tokenMint } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol required' });
    }

    console.log(`📊 Starting price monitoring for ${symbol}`);
    
    // Subscribe to price feed
    pythService.subscribe(symbol, tokenMint);
    
    // Get current stats
    const stats = pythService.getStats(symbol);
    
    res.json({ 
      success: true, 
      symbol,
      stats,
      message: `Started monitoring ${symbol}` 
    });
  } catch (error: any) {
    console.error('❌ Error subscribing to price feed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop price monitoring for a symbol
 */
router.post('/api/price-test/unsubscribe', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol required' });
    }

    console.log(`📊 Stopping price monitoring for ${symbol}`);
    
    pythService.unsubscribe(symbol);
    
    res.json({ 
      success: true, 
      symbol,
      message: `Stopped monitoring ${symbol}` 
    });
  } catch (error: any) {
    console.error('❌ Error unsubscribing from price feed:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get current price stats
 */
router.get('/api/price-test/stats/:symbol', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.params;
    
    const stats = pythService.getStats(symbol);
    
    if (!stats) {
      return res.status(404).json({ error: 'Symbol not found or not subscribed' });
    }
    
    res.json({ success: true, stats });
  } catch (error: any) {
    console.error('❌ Error getting price stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Reset stats for a symbol
 */
router.post('/api/price-test/reset', authService.requireSecureAuth(), async (req: Request, res: Response) => {
  try {
    const { symbol } = req.body;
    
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol required' });
    }

    pythService.resetStats(symbol);
    
    const stats = pythService.getStats(symbol);
    
    res.json({ 
      success: true, 
      symbol,
      stats,
      message: `Reset stats for ${symbol}` 
    });
  } catch (error: any) {
    console.error('❌ Error resetting stats:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Set price targets
 */
router.post('/api/price-test/targets', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const { symbol, targets } = req.body;
    
    if (!symbol || !Array.isArray(targets)) {
      return res.status(400).json({ error: 'Symbol and targets array required' });
    }

    // Create target objects
    const priceTargets: PriceTarget[] = targets.map((t: any) => ({
      id: `${Date.now()}_${Math.random()}`,
      symbol,
      targetPrice: t.targetPrice,
      targetPercent: t.targetPercent,
      direction: t.direction,
      hit: false,
      createdAt: Date.now()
    }));

    // Store targets for user
    userTargets.set(userId, priceTargets);
    
    console.log(`🎯 Set ${priceTargets.length} targets for ${symbol} (user ${userId})`);
    
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
 * Get price targets
 */
router.get('/api/price-test/targets', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    const targets = userTargets.get(userId) || [];
    
    res.json({ success: true, targets });
  } catch (error: any) {
    console.error('❌ Error getting targets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear all targets
 */
router.delete('/api/price-test/targets', authService.requireSecureAuth(), async (req: any, res: Response) => {
  try {
    const userId = req.user!.id;
    userTargets.delete(userId);
    
    res.json({ success: true, message: 'Targets cleared' });
  } catch (error: any) {
    console.error('❌ Error clearing targets:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get tracked symbols
 */
router.get('/api/price-test/symbols', authService.requireSecureAuth(), async (_req: Request, res: Response) => {
  try {
    const symbols = pythService.getTrackedSymbols();
    
    res.json({ success: true, symbols });
  } catch (error: any) {
    console.error('❌ Error getting tracked symbols:', error);
    res.status(500).json({ error: error.message });
  }
});

// Check targets against price updates
pythService.on('price', (update) => {
  // Check all users' targets
  for (const [userId, targets] of userTargets.entries()) {
    for (const target of targets) {
      if (target.symbol !== update.symbol || target.hit) continue;
      
      // Check if target is hit
      const hit = target.direction === 'above' 
        ? update.price >= target.targetPrice
        : update.price <= target.targetPrice;
      
      if (hit) {
        target.hit = true;
        console.log(`🎯 Target HIT for user ${userId}: ${target.symbol} ${target.direction} ${target.targetPrice}`);
        
        // Emit WebSocket event for notification
        if (io) {
          io.to(`user_${userId}`).emit('price_target_hit', {
            target,
            currentPrice: update.price,
            timestamp: Date.now()
          });
        }
      }
    }
  }
});

export default router;
