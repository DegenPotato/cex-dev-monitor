import { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Activity, AlertCircle, RefreshCw } from 'lucide-react';
import { apiUrl } from '../config';

interface TechnicalIndicator {
  timestamp: number;
  rsi_2: number | null;
  rsi_14: number | null;
  ema_21: number | null;
  ema_50: number | null;
  ema_100: number | null;
  ema_200: number | null;
  macd_line: number | null;
  macd_signal: number | null;
  macd_histogram: number | null;
  bb_upper: number | null;
  bb_middle: number | null;
  bb_lower: number | null;
  bb_width: number | null;
  volume_sma_20: number | null;
  volume_ratio: number | null;
  close: number;
  volume: number;
}

interface TechnicalIndicatorsPanelProps {
  mintAddress: string;
  currentPrice?: number;
}

export function TechnicalIndicatorsPanel({ mintAddress, currentPrice }: TechnicalIndicatorsPanelProps) {
  const [indicators, setIndicators] = useState<TechnicalIndicator | null>(null);
  const [historicalData, setHistoricalData] = useState<TechnicalIndicator[]>([]);
  const [timeframe, setTimeframe] = useState<string>('1m');
  const [loading, setLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  useEffect(() => {
    fetchIndicators();
    const interval = setInterval(fetchIndicators, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, [mintAddress, timeframe]);

  const fetchIndicators = async () => {
    setLoading(true);
    try {
      // Fetch latest indicators
      console.log(`[TechnicalIndicators] Fetching for ${mintAddress}, timeframe: ${timeframe}`);
      const latestResponse = await fetch(
        apiUrl(`/api/indicators/${mintAddress}/latest?timeframe=${timeframe}`)
      );
      const latest = await latestResponse.json();
      console.log('[TechnicalIndicators] Latest indicators:', latest);
      setIndicators(latest);

      // Fetch historical indicators
      const historyResponse = await fetch(
        apiUrl(`/api/indicators/${mintAddress}?timeframe=${timeframe}&limit=20`)
      );
      const history = await historyResponse.json();
      console.log('[TechnicalIndicators] Historical data count:', history?.length || 0);
      setHistoricalData(history);
    } catch (error) {
      console.error('Error fetching indicators:', error);
    } finally {
      setLoading(false);
    }
  };

  const getRSIColor = (value: number | null) => {
    if (!value) return 'text-gray-400';
    if (value > 70) return 'text-red-400';  // Overbought
    if (value < 30) return 'text-green-400';  // Oversold
    return 'text-yellow-400';  // Neutral
  };

  const getMACDSignal = () => {
    if (!indicators?.macd_line || !indicators?.macd_signal) return null;
    const bullish = indicators.macd_line > indicators.macd_signal;
    return {
      bullish,
      strength: Math.abs(indicators.macd_histogram || 0)
    };
  };

  const getBollingerPosition = () => {
    if (!indicators?.bb_upper || !indicators?.bb_lower || !currentPrice) return null;
    const range = indicators.bb_upper - indicators.bb_lower;
    const position = ((currentPrice - indicators.bb_lower) / range) * 100;
    return position;
  };

  const getEMATrend = () => {
    if (!indicators || !currentPrice) return null;
    const emas = [
      { period: 21, value: indicators.ema_21 },
      { period: 50, value: indicators.ema_50 },
      { period: 100, value: indicators.ema_100 },
      { period: 200, value: indicators.ema_200 }
    ].filter(e => e.value !== null);

    const above = emas.filter(e => e.value && currentPrice > e.value).length;
    const below = emas.filter(e => e.value && currentPrice < e.value).length;

    return { above, below, total: emas.length };
  };

  const formatValue = (value: number | null, decimals: number = 2) => {
    if (value === null || value === undefined) return 'N/A';
    if (value < 0.01) return value.toFixed(8);
    return value.toFixed(decimals);
  };

  if (loading) {
    return (
      <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 p-6">
        <div className="text-center py-8">
          <div className="animate-pulse text-cyan-400">Loading technical indicators...</div>
        </div>
      </div>
    );
  }

  if (!indicators) {
    return (
      <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 text-yellow-400 mx-auto mb-3" />
          <div className="text-gray-400">No technical indicators available</div>
          <div className="text-sm text-gray-500 mt-2">
            Make sure OHLCV collector and metrics calculator are running
          </div>
        </div>
      </div>
    );
  }

  const macdSignal = getMACDSignal();
  const bbPosition = getBollingerPosition();
  const emaTrend = getEMATrend();

  return (
    <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-white flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          Technical Indicators
        </h3>
        <div className="flex items-center gap-2">
          <select
            value={timeframe}
            onChange={(e) => setTimeframe(e.target.value)}
            className="bg-black/40 text-white px-3 py-1 rounded-lg border border-cyan-500/20 text-sm"
          >
            <option value="1m">1m</option>
            <option value="15m">15m</option>
            <option value="1h">1h</option>
            <option value="4h">4h</option>
            <option value="1d">1d</option>
          </select>
          <button
            onClick={fetchIndicators}
            className="p-1.5 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* RSI Indicators */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
          <div className="text-sm text-gray-400 mb-1">RSI-2 (Scalping)</div>
          <div className={`text-2xl font-bold ${getRSIColor(indicators.rsi_2)}`}>
            {formatValue(indicators.rsi_2, 1)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {indicators.rsi_2 && indicators.rsi_2 > 70 ? 'Overbought' : 
             indicators.rsi_2 && indicators.rsi_2 < 30 ? 'Oversold' : 'Neutral'}
          </div>
        </div>

        <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
          <div className="text-sm text-gray-400 mb-1">RSI-14 (Standard)</div>
          <div className={`text-2xl font-bold ${getRSIColor(indicators.rsi_14)}`}>
            {formatValue(indicators.rsi_14, 1)}
          </div>
          <div className="text-xs text-gray-500 mt-1">
            {indicators.rsi_14 && indicators.rsi_14 > 70 ? 'Overbought' : 
             indicators.rsi_14 && indicators.rsi_14 < 30 ? 'Oversold' : 'Neutral'}
          </div>
        </div>
      </div>

      {/* EMA Levels */}
      <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
        <div className="text-sm text-gray-400 mb-3">Exponential Moving Averages</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          {[
            { label: 'EMA21', value: indicators.ema_21, color: 'text-blue-400' },
            { label: 'EMA50', value: indicators.ema_50, color: 'text-green-400' },
            { label: 'EMA100', value: indicators.ema_100, color: 'text-yellow-400' },
            { label: 'EMA200', value: indicators.ema_200, color: 'text-purple-400' }
          ].map(ema => (
            <div key={ema.label}>
              <div className="text-gray-500 text-xs">{ema.label}</div>
              <div className={`font-mono ${ema.color}`}>
                ${formatValue(ema.value, 8)}
              </div>
              {currentPrice && ema.value && (
                <div className="text-xs mt-1">
                  {currentPrice > ema.value ? (
                    <span className="text-green-400">Above ↑</span>
                  ) : (
                    <span className="text-red-400">Below ↓</span>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        {emaTrend && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="text-xs text-gray-400">
              Price above {emaTrend.above}/{emaTrend.total} EMAs
              {emaTrend.above > emaTrend.below ? (
                <span className="text-green-400 ml-2">Bullish Trend</span>
              ) : (
                <span className="text-red-400 ml-2">Bearish Trend</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MACD */}
      <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
        <div className="text-sm text-gray-400 mb-3">MACD (12-26-9)</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500">MACD Line</div>
            <div className="text-white font-mono">
              {formatValue(indicators.macd_line, 8)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Signal Line</div>
            <div className="text-white font-mono">
              {formatValue(indicators.macd_signal, 8)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Histogram</div>
            <div className={`font-mono ${
              (indicators.macd_histogram || 0) > 0 ? 'text-green-400' : 'text-red-400'
            }`}>
              {formatValue(indicators.macd_histogram, 8)}
            </div>
          </div>
        </div>
        {macdSignal && (
          <div className="mt-3 pt-3 border-t border-gray-800">
            <div className="flex items-center gap-2">
              {macdSignal.bullish ? (
                <>
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-green-400 text-sm">Bullish Crossover</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <span className="text-red-400 text-sm">Bearish Crossover</span>
                </>
              )}
              <span className="text-xs text-gray-500">
                Strength: {macdSignal.strength.toFixed(8)}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Bollinger Bands */}
      <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
        <div className="text-sm text-gray-400 mb-3">Bollinger Bands (20, 2)</div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="text-xs text-gray-500">Upper Band</div>
            <div className="text-red-400 font-mono">
              ${formatValue(indicators.bb_upper, 8)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Middle (SMA)</div>
            <div className="text-yellow-400 font-mono">
              ${formatValue(indicators.bb_middle, 8)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Lower Band</div>
            <div className="text-green-400 font-mono">
              ${formatValue(indicators.bb_lower, 8)}
            </div>
          </div>
        </div>
        {bbPosition !== null && (
          <div className="mt-3">
            <div className="text-xs text-gray-500 mb-1">Price Position</div>
            <div className="bg-black/60 rounded-lg h-2 relative overflow-hidden">
              <div className="absolute inset-0 bg-gradient-to-r from-green-600 via-yellow-600 to-red-600 opacity-30" />
              <div 
                className="absolute top-0 bottom-0 w-0.5 bg-white"
                style={{ left: `${Math.max(0, Math.min(100, bbPosition))}%` }}
              />
            </div>
            <div className="text-xs text-gray-400 mt-1">
              {bbPosition > 80 ? 'Near upper band (overbought)' :
               bbPosition < 20 ? 'Near lower band (oversold)' :
               'Within bands (neutral)'}
            </div>
          </div>
        )}
      </div>

      {/* Volume Analysis */}
      <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4">
        <div className="text-sm text-gray-400 mb-3">Volume Analysis</div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-500">Current Volume</div>
            <div className="text-white font-mono">
              {formatValue(indicators.volume, 0)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500">Volume Ratio</div>
            <div className={`font-mono ${
              (indicators.volume_ratio || 0) > 1.5 ? 'text-green-400' :
              (indicators.volume_ratio || 0) < 0.5 ? 'text-red-400' :
              'text-yellow-400'
            }`}>
              {formatValue(indicators.volume_ratio, 2)}x
            </div>
            <div className="text-xs text-gray-500 mt-1">
              vs 20-period avg
            </div>
          </div>
        </div>
      </div>

      {/* Historical View Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="w-full py-2 rounded-lg bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-400 text-sm font-medium transition-colors"
      >
        {showHistory ? 'Hide' : 'Show'} Historical Data
      </button>

      {/* Historical Data Table */}
      {showHistory && historicalData.length > 0 && (
        <div className="bg-black/40 rounded-lg border border-cyan-500/10 p-4 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-gray-400 border-b border-gray-800">
                <th className="text-left pb-2">Time</th>
                <th className="text-right pb-2">RSI-14</th>
                <th className="text-right pb-2">MACD</th>
                <th className="text-right pb-2">EMA21</th>
                <th className="text-right pb-2">BB Width</th>
                <th className="text-right pb-2">Volume</th>
              </tr>
            </thead>
            <tbody>
              {historicalData.map((data, idx) => (
                <tr key={idx} className="border-b border-gray-900 hover:bg-black/40">
                  <td className="py-1">
                    {new Date(data.timestamp * 1000).toLocaleTimeString()}
                  </td>
                  <td className={`text-right ${getRSIColor(data.rsi_14)}`}>
                    {formatValue(data.rsi_14, 1)}
                  </td>
                  <td className={`text-right ${
                    (data.macd_histogram || 0) > 0 ? 'text-green-400' : 'text-red-400'
                  }`}>
                    {formatValue(data.macd_histogram, 6)}
                  </td>
                  <td className="text-right text-blue-400">
                    {formatValue(data.ema_21, 6)}
                  </td>
                  <td className="text-right text-yellow-400">
                    {formatValue(data.bb_width, 6)}
                  </td>
                  <td className="text-right text-gray-300">
                    {formatValue(data.volume, 0)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Last Updated */}
      {indicators && (
        <div className="text-xs text-gray-500 text-center">
          Last updated: {new Date(indicators.timestamp * 1000).toLocaleString()}
        </div>
      )}
    </div>
  );
}
