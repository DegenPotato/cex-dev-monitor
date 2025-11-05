/**
 * API routes for Smart Money Tracker
 */

import { Router, Request, Response } from 'express';
import { getSmartMoneyTracker } from '../services/SmartMoneyTracker.js';

const router = Router();

/**
 * Start tracking
 */
router.post('/start', async (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    await tracker.start();
    
    res.json({ success: true, message: 'Smart Money Tracker started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop tracking
 */
router.post('/stop', async (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    tracker.stop();
    
    res.json({ success: true, message: 'Smart Money Tracker stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all positions
 */
router.get('/positions', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const positions = tracker.getPositions();
    
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active positions only
 */
router.get('/positions/active', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const positions = tracker.getActivePositions();
    
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get wallet leaderboard
 */
router.get('/leaderboard/wallets', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const leaderboard = tracker.getWalletLeaderboard();
    
    res.json({ leaderboard });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get token leaderboard
 */
router.get('/leaderboard/tokens', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const leaderboard = tracker.getTokenLeaderboard();
    
    res.json({ leaderboard });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear all data (refresh)
 */
router.post('/clear', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    tracker.clearAllData();
    
    res.json({ success: true, message: 'Data cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get tracker status
 */
router.get('/status', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const status = tracker.getStatus();
    
    res.json(status);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get leaderboards (both wallets and tokens)
 */
router.get('/leaderboards', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const leaderboards = tracker.getLeaderboards();
    
    res.json(leaderboards);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Update configuration
 */
router.post('/config', (req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    tracker.updateConfig(req.body);
    
    res.json({ success: true, config: tracker.getConfig() });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get current configuration
 */
router.get('/config', (_req: Request, res: Response) => {
  try {
    const tracker = getSmartMoneyTracker();
    const config = tracker.getConfig();
    
    res.json(config);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as smartMoneyTrackerRouter };
