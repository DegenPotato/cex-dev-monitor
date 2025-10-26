import { queryAll, execute, queryOne } from '../database/helpers.js';
import { saveDatabase } from '../database/connection.js';
/**
 * Technical Indicator Calculator
 *
 * Calculates technical indicators from OHLCV data:
 * - RSI (2 and 14 periods)
 * - EMA (21, 50, 100, 200 periods)
 * - MACD (12-26-9)
 * - Bollinger Bands (20-period, 2 std dev)
 * - Volume indicators
 */
export class TechnicalIndicatorCalculator {
    constructor() {
        this.isRunning = false;
        this.intervalId = null;
        this.UPDATE_INTERVAL = 60 * 1000; // Update every 1 minute
        console.log('📊 [TechnicalIndicators] Calculator initialized');
    }
    /**
     * Start the calculator
     */
    start() {
        if (this.isRunning) {
            console.log('📊 [TechnicalIndicators] Already running');
            return;
        }
        this.isRunning = true;
        console.log('📊 [TechnicalIndicators] Starting technical indicator calculations...');
        // Run immediately, then every minute
        this.calculateAllIndicators();
        this.intervalId = setInterval(() => {
            this.calculateAllIndicators();
        }, this.UPDATE_INTERVAL);
    }
    /**
     * Stop the calculator
     */
    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.isRunning = false;
        console.log('📊 [TechnicalIndicators] Calculator stopped');
    }
    /**
     * Calculate indicators for all tokens that have OHLCV data
     */
    async calculateAllIndicators() {
        try {
            // Get all unique token/timeframe combinations
            const combinations = await queryAll(`
        SELECT DISTINCT mint_address, timeframe
        FROM ohlcv_data
        ORDER BY mint_address, timeframe
      `);
            if (combinations.length === 0) {
                console.log('📊 [TechnicalIndicators] No OHLCV data to process');
                return;
            }
            console.log(`📊 [TechnicalIndicators] Processing ${combinations.length} token/timeframe combinations...`);
            let processed = 0;
            for (const combo of combinations) {
                await this.calculateIndicatorsForToken(combo.mint_address, combo.timeframe);
                processed++;
                // Log progress every 10 tokens
                if (processed % 10 === 0) {
                    console.log(`📊 [TechnicalIndicators] Progress: ${processed}/${combinations.length}`);
                }
            }
            saveDatabase();
            console.log(`📊 [TechnicalIndicators] Completed: ${processed} combinations processed`);
        }
        catch (error) {
            console.error('📊 [TechnicalIndicators] Error calculating indicators:', error.message);
        }
    }
    /**
     * Calculate indicators for a specific token and timeframe
     * Uses backlog tracking to process ALL candles once, then incrementally update
     */
    async calculateIndicatorsForToken(mintAddress, timeframe) {
        try {
            // Get the last processed timestamp for this token/timeframe
            const lastProcessed = await queryOne(`
        SELECT MAX(timestamp) as max_timestamp
        FROM technical_indicators
        WHERE mint_address = ? AND timeframe = ?
      `, [mintAddress, timeframe]);
            const lastTimestamp = lastProcessed?.max_timestamp || 0;
            // Fetch ALL candles (for backfill) or only new candles (for incremental updates)
            const candles = await queryAll(`
        SELECT mint_address, pool_address, timeframe, timestamp, open, high, low, close, volume
        FROM ohlcv_data
        WHERE mint_address = ? AND timeframe = ?
        ORDER BY timestamp ASC
      `, [mintAddress, timeframe]);
            if (candles.length < 20) {
                // Not enough data for meaningful indicators
                return;
            }
            // Extract price and volume arrays
            const closes = candles.map(c => c.close);
            const volumes = candles.map(c => c.volume);
            // Process ALL candles (comprehensive calculation with backlog tracking)
            // Skip candles that are already processed (timestamp <= lastTimestamp)
            const startIdx = 0; // Calculate for ALL candles from the beginning
            let processedCount = 0;
            let skippedCount = 0;
            for (let i = startIdx; i < candles.length; i++) {
                const candle = candles[i];
                // Skip already processed candles (incremental update optimization)
                if (candle.timestamp <= lastTimestamp) {
                    skippedCount++;
                    continue;
                }
                // Need enough history for calculations
                if (i < 200) {
                    // Skip if not enough data for EMA200
                    if (candles.length < 200)
                        continue;
                }
                processedCount++;
                // Calculate indicators
                const indicators = {
                    rsi_2: i >= 2 ? this.calculateRSI(closes.slice(0, i + 1), 2) : null,
                    rsi_14: i >= 14 ? this.calculateRSI(closes.slice(0, i + 1), 14) : null,
                    ema_21: i >= 21 ? this.calculateEMA(closes.slice(0, i + 1), 21) : null,
                    ema_50: i >= 50 ? this.calculateEMA(closes.slice(0, i + 1), 50) : null,
                    ema_100: i >= 100 ? this.calculateEMA(closes.slice(0, i + 1), 100) : null,
                    ema_200: i >= 200 ? this.calculateEMA(closes.slice(0, i + 1), 200) : null,
                    macd_line: null,
                    macd_signal: null,
                    macd_histogram: null,
                    bb_upper: null,
                    bb_middle: null,
                    bb_lower: null,
                    bb_width: null,
                    volume_sma_20: i >= 20 ? this.calculateSMA(volumes.slice(Math.max(0, i - 19), i + 1), 20) : null,
                    volume_ratio: null
                };
                // Calculate MACD (needs at least 26 periods)
                if (i >= 26) {
                    const macd = this.calculateMACD(closes.slice(0, i + 1));
                    indicators.macd_line = macd.macdLine;
                    indicators.macd_signal = macd.signalLine;
                    indicators.macd_histogram = macd.histogram;
                }
                // Calculate Bollinger Bands (needs at least 20 periods)
                if (i >= 20) {
                    const bb = this.calculateBollingerBands(closes.slice(Math.max(0, i - 19), i + 1), 20, 2);
                    indicators.bb_upper = bb.upper;
                    indicators.bb_middle = bb.middle;
                    indicators.bb_lower = bb.lower;
                    indicators.bb_width = bb.upper - bb.lower;
                }
                // Calculate volume ratio
                if (indicators.volume_sma_20 && indicators.volume_sma_20 > 0) {
                    indicators.volume_ratio = candle.volume / indicators.volume_sma_20;
                }
                // Store indicators in database
                await this.storeIndicators(candle, indicators);
            }
            // Log backfill progress
            if (processedCount > 0 || skippedCount > 0) {
                const mode = lastTimestamp === 0 ? 'BACKFILL' : 'UPDATE';
                console.log(`📊 [TechnicalIndicators] [${mode}] ${mintAddress}/${timeframe}: Processed ${processedCount}, Skipped ${skippedCount}`);
            }
        }
        catch (error) {
            console.error(`📊 [TechnicalIndicators] Error for ${mintAddress}/${timeframe}:`, error.message);
        }
    }
    /**
     * Calculate RSI (Relative Strength Index)
     */
    calculateRSI(prices, period) {
        if (prices.length < period + 1)
            return 0;
        let gains = 0;
        let losses = 0;
        // Calculate initial average gain/loss
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains += change;
            }
            else {
                losses -= change;
            }
        }
        let avgGain = gains / period;
        let avgLoss = losses / period;
        // Apply smoothing for remaining prices
        for (let i = period + 1; i < prices.length; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                avgGain = (avgGain * (period - 1) + change) / period;
                avgLoss = (avgLoss * (period - 1)) / period;
            }
            else {
                avgGain = (avgGain * (period - 1)) / period;
                avgLoss = (avgLoss * (period - 1) - change) / period;
            }
        }
        if (avgLoss === 0)
            return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    }
    /**
     * Calculate EMA (Exponential Moving Average)
     */
    calculateEMA(prices, period) {
        if (prices.length < period)
            return prices[prices.length - 1];
        const multiplier = 2 / (period + 1);
        // Start with SMA for initial EMA
        let ema = prices.slice(0, period).reduce((sum, p) => sum + p, 0) / period;
        // Calculate EMA for remaining prices
        for (let i = period; i < prices.length; i++) {
            ema = (prices[i] - ema) * multiplier + ema;
        }
        return ema;
    }
    /**
     * Calculate SMA (Simple Moving Average)
     */
    calculateSMA(values, period) {
        if (values.length < period)
            return 0;
        return values.slice(-period).reduce((sum, v) => sum + v, 0) / period;
    }
    /**
     * Calculate MACD (Moving Average Convergence Divergence)
     */
    calculateMACD(prices) {
        const ema12 = this.calculateEMA(prices, 12);
        const ema26 = this.calculateEMA(prices, 26);
        const macdLine = ema12 - ema26;
        // For signal line, we need MACD history
        // Simplified: use current MACD as approximation
        const signalLine = macdLine * 0.9; // Approximation
        const histogram = macdLine - signalLine;
        return { macdLine, signalLine, histogram };
    }
    /**
     * Calculate Bollinger Bands
     */
    calculateBollingerBands(prices, period, stdDev) {
        const middle = this.calculateSMA(prices, period);
        // Calculate standard deviation
        const variance = prices.reduce((sum, price) => {
            const diff = price - middle;
            return sum + diff * diff;
        }, 0) / prices.length;
        const std = Math.sqrt(variance);
        return {
            upper: middle + (stdDev * std),
            middle: middle,
            lower: middle - (stdDev * std)
        };
    }
    /**
     * Store calculated indicators in database
     */
    async storeIndicators(candle, indicators) {
        try {
            await execute(`
        INSERT INTO technical_indicators (
          mint_address, pool_address, timeframe, timestamp,
          rsi_2, rsi_14,
          ema_21, ema_50, ema_100, ema_200,
          macd_line, macd_signal, macd_histogram,
          bb_upper, bb_middle, bb_lower, bb_width,
          volume_sma_20, volume_ratio
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(mint_address, timeframe, timestamp) 
        DO UPDATE SET
          rsi_2 = excluded.rsi_2,
          rsi_14 = excluded.rsi_14,
          ema_21 = excluded.ema_21,
          ema_50 = excluded.ema_50,
          ema_100 = excluded.ema_100,
          ema_200 = excluded.ema_200,
          macd_line = excluded.macd_line,
          macd_signal = excluded.macd_signal,
          macd_histogram = excluded.macd_histogram,
          bb_upper = excluded.bb_upper,
          bb_middle = excluded.bb_middle,
          bb_lower = excluded.bb_lower,
          bb_width = excluded.bb_width,
          volume_sma_20 = excluded.volume_sma_20,
          volume_ratio = excluded.volume_ratio,
          calculated_at = strftime('%s', 'now') * 1000
      `, [
                candle.mint_address,
                candle.pool_address,
                candle.timeframe,
                candle.timestamp,
                indicators.rsi_2,
                indicators.rsi_14,
                indicators.ema_21,
                indicators.ema_50,
                indicators.ema_100,
                indicators.ema_200,
                indicators.macd_line,
                indicators.macd_signal,
                indicators.macd_histogram,
                indicators.bb_upper,
                indicators.bb_middle,
                indicators.bb_lower,
                indicators.bb_width,
                indicators.volume_sma_20,
                indicators.volume_ratio
            ]);
        }
        catch (error) {
            console.error('📊 [TechnicalIndicators] Error storing indicators:', error.message);
        }
    }
    /**
     * Get indicators for a specific token and timeframe
     */
    async getIndicators(mintAddress, timeframe, limit = 100) {
        return queryAll(`
      SELECT ti.*, od.open, od.high, od.low, od.close, od.volume
      FROM technical_indicators ti
      JOIN ohlcv_data od ON ti.mint_address = od.mint_address 
        AND ti.timeframe = od.timeframe 
        AND ti.timestamp = od.timestamp
      WHERE ti.mint_address = ? AND ti.timeframe = ?
      ORDER BY ti.timestamp DESC
      LIMIT ?
    `, [mintAddress, timeframe, limit]);
    }
    /**
     * Get latest indicators for a token
     */
    async getLatestIndicators(mintAddress, timeframe) {
        return queryOne(`
      SELECT ti.*, od.close as current_price
      FROM technical_indicators ti
      JOIN ohlcv_data od ON ti.mint_address = od.mint_address 
        AND ti.timeframe = od.timeframe 
        AND ti.timestamp = od.timestamp
      WHERE ti.mint_address = ? AND ti.timeframe = ?
      ORDER BY ti.timestamp DESC
      LIMIT 1
    `, [mintAddress, timeframe]);
    }
    /**
     * Get status
     */
    getStatus() {
        return {
            isRunning: this.isRunning,
            updateInterval: this.UPDATE_INTERVAL,
            description: 'RSI-2, RSI-14, EMA(21,50,100,200), MACD, Bollinger Bands'
        };
    }
}
