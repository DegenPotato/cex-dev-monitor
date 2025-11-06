import { Router, Request, Response } from 'express';
import { UnifiedOHLCVService } from '../services/UnifiedOHLCVService.js';

const router = Router();

// Store active services
const activeServices = new Map<string, UnifiedOHLCVService>();

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';

/**
 * POST /api/ohlcv/start
 * Start unified OHLCV (historical build + live monitoring)
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { tokenMint, lookbackHours = 24 } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint is required' });
    }
    
    // Check if already running
    if (activeServices.has(tokenMint)) {
      return res.json({ 
        message: 'Already running', 
        tokenMint 
      });
    }
    
    // Create service
    const service = new UnifiedOHLCVService(RPC_URL, tokenMint);
    
    // Set up WebSocket broadcasting
    const wss = req.app.locals.wss;
    
    // Progress updates during historical build
    service.on('status', (data) => {
      broadcast(wss, {
        type: 'ohlcv_status',
        tokenMint,
        data
      });
    });
    
    service.on('progress', (data) => {
      broadcast(wss, {
        type: 'ohlcv_progress',
        tokenMint,
        data
      });
    });
    
    service.on('metadata', (metadata) => {
      broadcast(wss, {
        type: 'ohlcv_metadata',
        tokenMint,
        data: metadata
      });
    });
    
    // Historical build complete
    service.on('historicalComplete', (data) => {
      broadcast(wss, {
        type: 'ohlcv_historical_complete',
        tokenMint,
        data
      });
    });
    
    // Live monitoring started
    service.on('liveMonitoringStarted', () => {
      broadcast(wss, {
        type: 'ohlcv_live_started',
        tokenMint
      });
    });
    
    // Service ready (historical + live both running)
    service.on('ready', (data) => {
      broadcast(wss, {
        type: 'ohlcv_ready',
        tokenMint,
        data: {
          candles: data.candles,
          totalSwaps: data.swaps.length
        }
      });
    });
    
    // Real-time swap updates
    service.on('swap', (swap) => {
      broadcast(wss, {
        type: 'ohlcv_swap',
        tokenMint,
        data: swap
      });
    });
    
    // Real-time candle updates
    service.on('candleUpdate', ({ timeframe, candle }) => {
      broadcast(wss, {
        type: 'ohlcv_candle_update',
        tokenMint,
        timeframe,
        data: candle
      });
    });
    
    // Error handling
    service.on('error', (error) => {
      console.error(`❌ [UnifiedOHLCV] Error for ${tokenMint}:`, error);
      broadcast(wss, {
        type: 'ohlcv_error',
        tokenMint,
        error: error.message
      });
      activeServices.delete(tokenMint);
    });
    
    // Start the service (async, don't wait)
    service.start(lookbackHours).catch((error) => {
      console.error('Failed to start service:', error);
      activeServices.delete(tokenMint);
    });
    
    activeServices.set(tokenMint, service);
    
    res.json({
      success: true,
      tokenMint,
      lookbackHours,
      message: 'OHLCV service starting (building historical data...)'
    });
    
  } catch (error: any) {
    console.error('Error starting unified OHLCV:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/ohlcv/stop
 * Stop OHLCV service for a token
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint is required' });
    }
    
    const service = activeServices.get(tokenMint);
    if (!service) {
      return res.status(404).json({ error: 'No active service for this token' });
    }
    
    await service.stop();
    activeServices.delete(tokenMint);
    
    res.json({
      success: true,
      tokenMint,
      message: 'OHLCV service stopped'
    });
    
  } catch (error: any) {
    console.error('Error stopping OHLCV:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ohlcv/status/:tokenMint
 * Get current status and data
 */
router.get('/status/:tokenMint', (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const { timeframe } = req.query;
    
    const service = activeServices.get(tokenMint);
    if (!service) {
      return res.json({ 
        isActive: false,
        tokenMint 
      });
    }
    
    const candles = timeframe 
      ? service.getCandles(timeframe as string)
      : service.getCandles();
    
    const recentSwaps = service.getRecentSwaps(100);
    
    res.json({
      isActive: true,
      tokenMint,
      candles,
      recentSwaps
    });
    
  } catch (error: any) {
    console.error('Error getting OHLCV status:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/ohlcv/active
 * List all active services
 */
router.get('/active', (_req: Request, res: Response) => {
  const active = Array.from(activeServices.keys());
  res.json({ 
    count: active.length,
    tokens: active 
  });
});

/**
 * Helper: Broadcast to all WebSocket clients
 */
function broadcast(wss: any, message: any): void {
  if (!wss) return;
  
  const payload = JSON.stringify(message);
  
  wss.clients.forEach((client: any) => {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  });
}

export default router;
