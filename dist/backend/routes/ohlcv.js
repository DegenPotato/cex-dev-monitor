import { Router } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { ohlcvCollectorV3 } from '../services/OHLCVCollectorV3.js';
import { queryAll, queryOne } from '../database/helpers.js';
const router = Router();
const authService = new SecureAuthService();
/**
 * Start OHLCV collector V2
 */
router.post('/api/ohlcv/v2/start', authService.requireSecureAuth(), async (_req, res) => {
    try {
        await ohlcvCollectorV3.start();
        res.json({ success: true, message: 'OHLCV Collector V3 started' });
    }
    catch (error) {
        console.error('Error starting OHLCV collector:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * Stop OHLCV collector V2
 */
router.post('/api/ohlcv/v2/stop', authService.requireSecureAuth(), async (_req, res) => {
    try {
        ohlcvCollectorV3.stop();
        res.json({ success: true, message: 'OHLCV Collector V3 stopped' });
    }
    catch (error) {
        console.error('Error stopping OHLCV collector:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * Get OHLCV collector status
 */
router.get('/api/ohlcv/v2/status', authService.requireSecureAuth(), async (_req, res) => {
    try {
        // Get overall progress stats
        const stats = await queryOne(`
      SELECT 
        (SELECT COUNT(DISTINCT mint_address) FROM token_mints) as total_tokens,
        (SELECT COUNT(DISTINCT mint_address) FROM ohlcv_backfill_progress) as tokens_with_data,
        (SELECT COUNT(*) FROM ohlcv_data) as total_candles,
        (SELECT COUNT(*) FROM ohlcv_backfill_progress WHERE backfill_complete = 0) as incomplete_backfills
    `);
        // Get recent activity
        const recentProgress = await queryAll(`
      SELECT mint_address, pool_address, timeframe, backfill_complete, last_fetch_at
      FROM ohlcv_backfill_progress
      ORDER BY last_fetch_at DESC
      LIMIT 10
    `);
        res.json({
            success: true,
            stats,
            recentProgress
        });
    }
    catch (error) {
        console.error('Error getting OHLCV status:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
/**
 * Get OHLCV data for a specific token
 */
router.get('/api/ohlcv/:mintAddress', authService.requireSecureAuth(), async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { timeframe = '1m', limit = 100, poolAddress } = req.query;
        let query = `
      SELECT * FROM ohlcv_data 
      WHERE mint_address = ? 
      AND timeframe = ?
    `;
        const params = [mintAddress, timeframe];
        if (poolAddress) {
            query += ' AND pool_address = ?';
            params.push(poolAddress);
        }
        query += ' ORDER BY timestamp DESC LIMIT ?';
        params.push(parseInt(limit) || 100);
        const candles = await queryAll(query, params);
        // Filter out candles with null or invalid values
        const validCandles = candles.filter((candle) => {
            return candle &&
                candle.timestamp != null &&
                candle.open != null &&
                candle.high != null &&
                candle.low != null &&
                candle.close != null &&
                !isNaN(candle.open) &&
                !isNaN(candle.high) &&
                !isNaN(candle.low) &&
                !isNaN(candle.close) &&
                candle.open > 0 &&
                candle.high > 0 &&
                candle.low > 0 &&
                candle.close > 0;
        });
        res.json({
            success: true,
            count: validCandles.length,
            candles: validCandles
        });
    }
    catch (error) {
        console.error('Error fetching OHLCV data:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});
export default router;
