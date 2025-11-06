import { Router, Request, Response } from 'express';
import { LiveOHLCVMonitor } from '../services/LiveOHLCVMonitor.js';
import { Connection, PublicKey } from '@solana/web3.js';

const router = Router();

// Store active monitors
const activeMonitors = new Map<string, LiveOHLCVMonitor>();

const RPC_URL = process.env.RPC_URL || 'https://api.mainnet-beta.solana.com';
const connection = new Connection(RPC_URL, 'confirmed');

/**
 * Extract bonding curve from token mint
 */
async function extractBondingCurve(tokenMint: PublicKey): Promise<PublicKey | null> {
  try {
    const sigs = await connection.getSignaturesForAddress(tokenMint, { limit: 10 });
    if (sigs.length === 0) return null;
    
    const tx = await connection.getTransaction(sigs[0].signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx) return null;
    
    const PUMPFUN_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
    const BONDING_CURVE_DISCRIMINATOR = Buffer.from('17b7f83760d8ac60', 'hex');
    
    const message = tx.transaction.message;
    let accountKeys = message.staticAccountKeys || [];
    
    if (message.addressTableLookups && tx.meta?.loadedAddresses) {
      if (tx.meta.loadedAddresses.writable) accountKeys.push(...tx.meta.loadedAddresses.writable);
      if (tx.meta.loadedAddresses.readonly) accountKeys.push(...tx.meta.loadedAddresses.readonly);
    }
    
    for (const account of accountKeys) {
      try {
        const accountInfo = await connection.getAccountInfo(account);
        if (!accountInfo) continue;
        
        if (accountInfo.owner.equals(PUMPFUN_PROGRAM_ID) && 
            accountInfo.data.length >= 120) {
          const discriminator = accountInfo.data.slice(0, 8);
          if (discriminator.equals(BONDING_CURVE_DISCRIMINATOR)) {
            return account;
          }
        }
      } catch (e) {
        continue;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting bonding curve:', error);
    return null;
  }
}

/**
 * POST /api/live-ohlcv/start
 * Start live OHLCV monitoring for a token
 */
router.post('/start', async (req: Request, res: Response) => {
  try {
    const { tokenMint, initialCandles } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint is required' });
    }
    
    // Check if already monitoring
    if (activeMonitors.has(tokenMint)) {
      return res.json({ 
        message: 'Already monitoring', 
        tokenMint 
      });
    }
    
    // Extract bonding curve
    const bondingCurve = await extractBondingCurve(new PublicKey(tokenMint));
    if (!bondingCurve) {
      return res.status(404).json({ error: 'Could not find bonding curve for token' });
    }
    
    // Create and start monitor
    const monitor = new LiveOHLCVMonitor(
      RPC_URL,
      tokenMint,
      bondingCurve.toBase58(),
      initialCandles
    );
    
    // Set up WebSocket broadcasting
    monitor.on('swap', (swap) => {
      // Broadcast to all connected WebSocket clients
      if (req.app.locals.wss) {
        req.app.locals.wss.clients.forEach((client: any) => {
          if (client.readyState === 1) { // OPEN
            client.send(JSON.stringify({
              type: 'ohlcv_swap',
              tokenMint,
              data: swap
            }));
          }
        });
      }
    });
    
    monitor.on('candleUpdated', ({ timeframe, candle }) => {
      // Broadcast candle updates
      if (req.app.locals.wss) {
        req.app.locals.wss.clients.forEach((client: any) => {
          if (client.readyState === 1) {
            client.send(JSON.stringify({
              type: 'ohlcv_candle_update',
              tokenMint,
              timeframe,
              data: candle
            }));
          }
        });
      }
    });
    
    await monitor.start();
    activeMonitors.set(tokenMint, monitor);
    
    res.json({
      success: true,
      tokenMint,
      bondingCurve: bondingCurve.toBase58(),
      message: 'Live OHLCV monitoring started'
    });
    
  } catch (error: any) {
    console.error('Error starting live OHLCV:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * POST /api/live-ohlcv/stop
 * Stop live OHLCV monitoring for a token
 */
router.post('/stop', async (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.body;
    
    if (!tokenMint) {
      return res.status(400).json({ error: 'tokenMint is required' });
    }
    
    const monitor = activeMonitors.get(tokenMint);
    if (!monitor) {
      return res.status(404).json({ error: 'No active monitor for this token' });
    }
    
    await monitor.stop();
    activeMonitors.delete(tokenMint);
    
    res.json({
      success: true,
      tokenMint,
      message: 'Live OHLCV monitoring stopped'
    });
    
  } catch (error: any) {
    console.error('Error stopping live OHLCV:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/live-ohlcv/status/:tokenMint
 * Get current status and candles for a token
 */
router.get('/status/:tokenMint', (req: Request, res: Response) => {
  try {
    const { tokenMint } = req.params;
    const { timeframe } = req.query;
    
    const monitor = activeMonitors.get(tokenMint);
    if (!monitor) {
      return res.json({ 
        isActive: false,
        tokenMint 
      });
    }
    
    const candles = timeframe 
      ? monitor.getCandles(timeframe as string)
      : monitor.getAllCandles();
    
    const recentSwaps = monitor.getRecentSwaps(50);
    
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
 * GET /api/live-ohlcv/active
 * List all active monitors
 */
router.get('/active', (_req: Request, res: Response) => {
  const active = Array.from(activeMonitors.keys());
  res.json({ 
    count: active.length,
    tokens: active 
  });
});

export default router;
