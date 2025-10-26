import { Router } from 'express';
import SecureAuthService from '../../lib/auth/SecureAuthService.js';
import { queryAll, queryOne } from '../database/helpers.js';
const router = Router();
const authService = new SecureAuthService();
/**
 * Get technical indicators for a token
 */
router.get('/api/indicators/:mintAddress', authService.requireSecureAuth(), async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { timeframe = '1m', limit = 500, poolAddress } = req.query;
        // Build query based on parameters
        let query = `
      SELECT 
        o.timestamp,
        o.open,
        o.high,
        o.low,
        o.close,
        o.volume,
        t.rsi_2,
        t.rsi_14,
        t.ema_21,
        t.ema_50,
        t.ema_100,
        t.ema_200,
        t.macd_line,
        t.macd_signal,
        t.macd_histogram,
        t.bb_upper,
        t.bb_middle,
        t.bb_lower
      FROM ohlcv_data o
      LEFT JOIN technical_indicators t ON 
        o.mint_address = t.mint_address AND 
        o.timestamp = t.timestamp AND 
        o.timeframe = t.timeframe
      WHERE o.mint_address = ? 
        AND o.timeframe = ?
    `;
        const params = [mintAddress, timeframe];
        if (poolAddress) {
            query += ' AND o.pool_address = ?';
            params.push(poolAddress);
        }
        query += ' ORDER BY o.timestamp DESC LIMIT ?';
        params.push(parseInt(limit) || 500);
        const data = await queryAll(query, params);
        // Reverse to get chronological order
        data.reverse();
        res.json({
            success: true,
            mintAddress,
            timeframe,
            count: data.length,
            data
        });
    }
    catch (error) {
        console.error('Error fetching indicators:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
/**
 * Get available timeframes for a token
 */
router.get('/api/indicators/:mintAddress/timeframes', authService.requireSecureAuth(), async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const timeframes = await queryAll(`
      SELECT 
        timeframe,
        COUNT(*) as count
      FROM technical_indicators
      WHERE mint_address = ?
      GROUP BY timeframe
      ORDER BY 
        CASE timeframe
          WHEN '1m' THEN 1
          WHEN '15m' THEN 2
          WHEN '1h' THEN 3
          WHEN '4h' THEN 4
          WHEN '1d' THEN 5
          ELSE 6
        END
    `, [mintAddress]);
        res.json({
            success: true,
            mintAddress,
            timeframes
        });
    }
    catch (error) {
        console.error('Error fetching timeframes:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
/**
 * Get latest indicator values for a token
 */
router.get('/api/indicators/:mintAddress/latest', authService.requireSecureAuth(), async (req, res) => {
    try {
        const { mintAddress } = req.params;
        const { timeframe = '1m' } = req.query;
        const latest = await queryOne(`
      SELECT 
        o.timestamp,
        o.open,
        o.high,
        o.low,
        o.close,
        o.volume,
        t.rsi_2,
        t.rsi_14,
        t.ema_21,
        t.ema_50,
        t.ema_100,
        t.ema_200,
        t.macd_line,
        t.macd_signal,
        t.macd_histogram,
        t.bb_upper,
        t.bb_middle,
        t.bb_lower
      FROM ohlcv_data o
      LEFT JOIN technical_indicators t ON 
        o.mint_address = t.mint_address AND 
        o.timestamp = t.timestamp AND 
        o.timeframe = t.timeframe
      WHERE o.mint_address = ? 
        AND o.timeframe = ?
      ORDER BY o.timestamp DESC
      LIMIT 1
    `, [mintAddress, timeframe]);
        if (!latest) {
            return res.status(404).json({
                success: false,
                error: 'No data found'
            });
        }
        // Calculate indicator signals
        const signals = {
            rsi: {
                rsi_2: latest.rsi_2,
                rsi_14: latest.rsi_14,
                rsi_2_signal: latest.rsi_2 ? (latest.rsi_2 < 30 ? 'oversold' : latest.rsi_2 > 70 ? 'overbought' : 'neutral') : null,
                rsi_14_signal: latest.rsi_14 ? (latest.rsi_14 < 30 ? 'oversold' : latest.rsi_14 > 70 ? 'overbought' : 'neutral') : null,
            },
            ema: {
                ema_21: latest.ema_21,
                ema_50: latest.ema_50,
                ema_100: latest.ema_100,
                ema_200: latest.ema_200,
                trend: determineEMATrend(latest)
            },
            macd: {
                line: latest.macd_line,
                signal: latest.macd_signal,
                histogram: latest.macd_histogram,
                trend: latest.macd_histogram && latest.macd_histogram > 0 ? 'bullish' : 'bearish'
            },
            bollinger: {
                upper: latest.bb_upper,
                middle: latest.bb_middle,
                lower: latest.bb_lower,
                position: determineBollingerPosition(latest)
            }
        };
        res.json({
            success: true,
            mintAddress,
            timeframe,
            timestamp: latest.timestamp,
            price: latest.close,
            indicators: latest,
            signals
        });
    }
    catch (error) {
        console.error('Error fetching latest indicators:', error);
        res.status(500).json({
            success: false,
            error: error.message
        });
    }
});
// Helper functions
function determineEMATrend(data) {
    if (!data.close || !data.ema_21 || !data.ema_50)
        return 'unknown';
    const price = data.close;
    const ema21 = data.ema_21;
    const ema50 = data.ema_50;
    const ema100 = data.ema_100;
    const ema200 = data.ema_200;
    // Strong bullish: price above all EMAs and EMAs in order
    if (price > ema21 && ema21 > ema50 &&
        (!ema100 || ema50 > ema100) &&
        (!ema200 || (ema100 && ema100 > ema200))) {
        return 'strong_bullish';
    }
    // Bullish: price above 21 and 50 EMA
    if (price > ema21 && price > ema50) {
        return 'bullish';
    }
    // Strong bearish: price below all EMAs and EMAs in reverse order
    if (price < ema21 && ema21 < ema50 &&
        (!ema100 || ema50 < ema100) &&
        (!ema200 || (ema100 && ema100 < ema200))) {
        return 'strong_bearish';
    }
    // Bearish: price below 21 and 50 EMA
    if (price < ema21 && price < ema50) {
        return 'bearish';
    }
    return 'neutral';
}
function determineBollingerPosition(data) {
    if (!data.close || !data.bb_upper || !data.bb_middle || !data.bb_lower) {
        return 'unknown';
    }
    const price = data.close;
    const upper = data.bb_upper;
    const middle = data.bb_middle;
    const lower = data.bb_lower;
    if (price > upper)
        return 'above_upper';
    if (price > middle)
        return 'above_middle';
    if (price > lower)
        return 'above_lower';
    return 'below_lower';
}
export default router;
