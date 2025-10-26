import { queryAll } from '../database/helpers.js';
/**
 * OHLCV Aggregator
 * Aggregates 1-minute candles into higher timeframes
 */
export class OHLCVAggregator {
    /**
     * Aggregate 1m candles into specified timeframe
     */
    async aggregateCandles(mintAddress, poolAddress, timeframe, limit = 1000) {
        try {
            // Get the aggregation factor
            const aggregationMinutes = this.getAggregationMinutes(timeframe);
            // Fetch 1m candles
            let query = `
        SELECT timestamp, open, high, low, close, volume
        FROM ohlcv_data
        WHERE mint_address = ? AND timeframe = '1m'
      `;
            const params = [mintAddress];
            if (poolAddress) {
                query += ` AND pool_address = ?`;
                params.push(poolAddress);
            }
            query += ` ORDER BY timestamp DESC LIMIT ?`;
            params.push(limit * aggregationMinutes); // Fetch enough 1m candles
            const candles1m = await queryAll(query, params);
            if (!candles1m || candles1m.length === 0) {
                return [];
            }
            // Reverse to chronological order
            candles1m.reverse();
            // Group candles by aggregation period
            const aggregatedCandles = [];
            let currentGroup = [];
            let currentPeriodStart = 0;
            for (const candle of candles1m) {
                const periodStart = Math.floor(candle.timestamp / (aggregationMinutes * 60)) * (aggregationMinutes * 60);
                if (currentPeriodStart === 0) {
                    currentPeriodStart = periodStart;
                }
                if (periodStart !== currentPeriodStart) {
                    // Process current group
                    if (currentGroup.length > 0) {
                        const aggregated = this.aggregateGroup(currentGroup, currentPeriodStart);
                        if (aggregated) {
                            aggregatedCandles.push(aggregated);
                        }
                    }
                    // Start new group
                    currentGroup = [candle];
                    currentPeriodStart = periodStart;
                }
                else {
                    currentGroup.push(candle);
                }
            }
            // Process last group
            if (currentGroup.length > 0) {
                const aggregated = this.aggregateGroup(currentGroup, currentPeriodStart);
                if (aggregated) {
                    aggregatedCandles.push(aggregated);
                }
            }
            // Limit results
            return aggregatedCandles.slice(-limit);
        }
        catch (error) {
            console.error(`Error aggregating candles for ${mintAddress}:`, error);
            return [];
        }
    }
    aggregateGroup(candles, timestamp) {
        if (candles.length === 0)
            return null;
        return {
            timestamp,
            open: candles[0].open,
            high: Math.max(...candles.map(c => c.high)),
            low: Math.min(...candles.map(c => c.low)),
            close: candles[candles.length - 1].close,
            volume: candles.reduce((sum, c) => sum + c.volume, 0)
        };
    }
    getAggregationMinutes(timeframe) {
        switch (timeframe) {
            case '15m': return 15;
            case '1h': return 60;
            case '4h': return 240;
            case '1d': return 1440;
            default: return 1;
        }
    }
}
export const ohlcvAggregator = new OHLCVAggregator();
