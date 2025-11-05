/**
 * API routes for Smart Money Tracker
 */

import { Router, Request, Response } from 'express';
import { Connection } from '@solana/web3.js';
import { SmartMoneyTracker } from '../services/SmartMoneyTracker.js';

const router = Router();

// In-memory instance (no persistence)
let trackerInstance: SmartMoneyTracker | null = null;
let connection: Connection | null = null;

/**
 * Initialize tracker
 */
function getTracker(): SmartMoneyTracker {
  if (!trackerInstance) {
    const rpcUrl = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
    connection = new Connection(rpcUrl, 'confirmed');
    trackerInstance = new SmartMoneyTracker(connection);
  }
  return trackerInstance;
}

/**
 * Start tracking
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    await tracker.start();
    
    res.json({ success: true, message: 'Smart Money Tracker started' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Stop tracking
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    tracker.stop();
    
    res.json({ success: true, message: 'Smart Money Tracker stopped' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get all positions
 */
router.get('/positions', (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    const positions = tracker.getPositions();
    
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get active positions only
 */
router.get('/positions/active', (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    const positions = tracker.getActivePositions();
    
    res.json({ positions });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get wallet leaderboard
 */
router.get('/leaderboard/wallets', (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    const leaderboard = tracker.getWalletLeaderboard();
    
    res.json({ leaderboard });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get token leaderboard
 */
router.get('/leaderboard/tokens', (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    const leaderboard = tracker.getTokenLeaderboard();
    
    res.json({ leaderboard });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Clear all data (refresh)
 */
router.post('/clear', (req: Request, res: Response) => {
  try {
    const tracker = getTracker();
    tracker.clear();
    
    res.json({ success: true, message: 'Data cleared' });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

/**
 * Get tracker status
 */
router.get('/status', (req: Request, res: Response) => {
  try {
    const hasTracker = trackerInstance !== null;
    const positions = hasTracker ? trackerInstance!.getPositions().length : 0;
    const activePositions = hasTracker ? trackerInstance!.getActivePositions().length : 0;
    
    res.json({ 
      running: hasTracker,
      totalPositions: positions,
      activePositions
    });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

export { router as smartMoneyTrackerRouter, getTracker };
