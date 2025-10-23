import React, { useEffect, useState, useMemo, useRef } from 'react';
import TechnicalIndicators, { RSIOscillator, EMAOverlay } from './TechnicalIndicators';
import RealtimeChartToggle from './RealtimeChartToggle';
import { Card } from '../ui/card';

interface ChartData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  rsi_2?: number | null;
  rsi_14?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  ema_100?: number | null;
  ema_200?: number | null;
}

interface TradingViewChartProps {
  mintAddress: string;
  poolAddress?: string;
  className?: string;
}

type TimeframeType = '1m' | '15m' | '1h' | '4h' | '1d';
type IndicatorType = 'rsi' | 'ema' | 'both' | 'none';

const TradingViewChart: React.FC<TradingViewChartProps> = ({
  mintAddress,
  poolAddress,
  className = ''
}) => {
  const [data, setData] = useState<ChartData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<TimeframeType>('1m');
  const [indicators, setIndicators] = useState<IndicatorType>('both');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isRealtime, setIsRealtime] = useState(false);
  const intervalRef = useRef<NodeJS.Timeout>();
  const [userId, setUserId] = useState<number | null>(null);

  // Get user ID from auth
  useEffect(() => {
    fetch('/api/auth/status', { credentials: 'include' })
      .then(res => res.json())
      .then(data => {
        if (data.authenticated && data.user) {
          setUserId(data.user.id);
        }
      })
      .catch(console.error);
  }, []);

  // Listen for real-time updates
  useEffect(() => {
    const handleRealtimeUpdate = (event: CustomEvent) => {
      console.log('📊 Real-time update received:', event.detail);
      // Refresh the chart data
      fetchData();
    };

    window.addEventListener('ohlcv:updated', handleRealtimeUpdate as EventListener);
    return () => {
      window.removeEventListener('ohlcv:updated', handleRealtimeUpdate as EventListener);
    };
  }, []);

  // Fetch indicator data
  const fetchData = async () => {
    try {
      const params = new URLSearchParams({
        timeframe,
        limit: timeframe === '1m' ? '500' : timeframe === '15m' ? '200' : '100'
      });
      
      if (poolAddress) {
        params.append('poolAddress', poolAddress);
      }

      const response = await fetch(`/api/indicators/${mintAddress}?${params}`, {
        credentials: 'include'
      });

      if (!response.ok) throw new Error('Failed to fetch indicator data');

      const result = await response.json();
      
      if (result.success && result.data) {
        setData(result.data);
        setError(null);
      } else {
        throw new Error(result.error || 'No data available');
      }
    } catch (err: any) {
      setError(err.message);
      console.error('Error fetching indicators:', err);
    } finally {
      setLoading(false);
    }
  };

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchData();

    // Don't auto-refresh if real-time is active
    if (autoRefresh && !isRealtime) {
      intervalRef.current = setInterval(fetchData, 60000); // Refresh every minute
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [mintAddress, poolAddress, timeframe, autoRefresh, isRealtime]);

  // Calculate current values for display
  const currentValues = useMemo(() => {
    if (!data.length) return null;
    
    const latest = data[data.length - 1];
    const previous = data[data.length - 2];
    
    const priceChange = previous ? ((latest.close - previous.close) / previous.close) * 100 : 0;
    
    return {
      price: latest.close,
      priceChange,
      rsi2: latest.rsi_2,
      rsi14: latest.rsi_14,
      ema21: latest.ema_21,
      ema50: latest.ema_50,
      ema100: latest.ema_100,
      ema200: latest.ema_200,
      volume: latest.volume,
      timestamp: latest.timestamp
    };
  }, [data]);

  // Indicator legend component
  const IndicatorLegend = () => {
    if (!currentValues) return null;

    return (
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: 'rgb(147, 51, 234)' }}></span>
          <span className="text-gray-400">RSI-2:</span>
          <span className="text-white font-mono">
            {currentValues.rsi2?.toFixed(2) || 'N/A'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: 'rgb(59, 130, 246)' }}></span>
          <span className="text-gray-400">RSI-14:</span>
          <span className="text-white font-mono">
            {currentValues.rsi14?.toFixed(2) || 'N/A'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: 'rgb(255, 255, 255)' }}></span>
          <span className="text-gray-400">EMA-21:</span>
          <span className="text-white font-mono">
            ${currentValues.ema21?.toExponential(2) || 'N/A'}
          </span>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="w-3 h-0.5" style={{ backgroundColor: 'rgb(34, 197, 94)' }}></span>
          <span className="text-gray-400">EMA-50:</span>
          <span className="text-white font-mono">
            ${currentValues.ema50?.toExponential(2) || 'N/A'}
          </span>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-96 bg-gray-800 rounded"></div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className="text-center py-8 text-red-500">
          Error loading chart: {error}
        </div>
      </Card>
    );
  }

  return (
    <Card className={`p-4 space-y-4 ${className}`}>
      {/* Header Controls */}
      <div className="flex flex-col gap-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-semibold text-white">Technical Analysis</h3>
          
          <div className="flex items-center gap-2">
            {/* Auto-refresh toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`px-3 py-1 text-xs rounded ${
                autoRefresh 
                  ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
                  : 'bg-gray-700 text-gray-400'
              }`}
            >
              {autoRefresh ? '🔄 Live' : 'Paused'}
            </button>
            
            {/* Refresh button */}
            <button
              onClick={fetchData}
              className="p-1 text-gray-400 hover:text-white transition"
              title="Refresh"
            >
              🔄
            </button>
          </div>
        </div>

        {/* Real-time Toggle - only show if user is authenticated */}
        {userId && (
          <RealtimeChartToggle
            mintAddress={mintAddress}
            poolAddress={poolAddress}
            userId={userId}
            onStatusChange={(active) => {
              setIsRealtime(active);
              // Disable normal auto-refresh when real-time is active
              if (active) {
                setAutoRefresh(false);
              }
            }}
          />
        )}

        {/* Timeframe selector */}
        <div className="flex gap-1">
          {(['1m', '15m', '1h', '4h', '1d'] as TimeframeType[]).map(tf => (
            <button
              key={tf}
              onClick={() => setTimeframe(tf)}
              className={`px-3 py-1 text-xs rounded transition ${
                timeframe === tf
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Indicator selector */}
        <div className="flex gap-1">
          <button
            onClick={() => setIndicators('both')}
            className={`px-3 py-1 text-xs rounded transition ${
              indicators === 'both'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            All Indicators
          </button>
          <button
            onClick={() => setIndicators('ema')}
            className={`px-3 py-1 text-xs rounded transition ${
              indicators === 'ema'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            EMA Only
          </button>
          <button
            onClick={() => setIndicators('rsi')}
            className={`px-3 py-1 text-xs rounded transition ${
              indicators === 'rsi'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            RSI Only
          </button>
          <button
            onClick={() => setIndicators('none')}
            className={`px-3 py-1 text-xs rounded transition ${
              indicators === 'none'
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
            }`}
          >
            Price Only
          </button>
        </div>

        {/* Current values */}
        {currentValues && (
          <div className="border-t border-gray-700 pt-2">
            <div className="flex items-baseline gap-4 mb-2">
              <span className="text-2xl font-bold text-white">
                ${currentValues.price < 0.01 
                  ? currentValues.price.toExponential(4) 
                  : currentValues.price.toFixed(6)}
              </span>
              <span className={`text-sm font-medium ${
                currentValues.priceChange >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {currentValues.priceChange >= 0 ? '+' : ''}{currentValues.priceChange.toFixed(2)}%
              </span>
            </div>
            <IndicatorLegend />
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="space-y-4">
        {indicators === 'both' && (
          <TechnicalIndicators 
            data={data} 
            height={600}
            showRSI={true}
            showEMA={true}
          />
        )}
        
        {indicators === 'ema' && (
          <EMAOverlay data={data} height={400} />
        )}
        
        {indicators === 'rsi' && (
          <RSIOscillator data={data} height={250} />
        )}
        
        {indicators === 'none' && (
          <EMAOverlay data={data.map(d => ({ ...d, ema_21: null, ema_50: null, ema_100: null, ema_200: null }))} height={400} />
        )}
      </div>

      {/* Indicator Key */}
      <div className="border-t border-gray-700 pt-4">
        <h4 className="text-xs font-medium text-gray-400 mb-2">Indicator Colors</h4>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(147, 51, 234)' }}></span>
            <span className="text-gray-500">RSI-2 (Purple)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(59, 130, 246)' }}></span>
            <span className="text-gray-500">RSI-14 (Blue)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(255, 255, 255)' }}></span>
            <span className="text-gray-500">EMA-21 (White)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(34, 197, 94)' }}></span>
            <span className="text-gray-500">EMA-50 (Green)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(239, 68, 68)' }}></span>
            <span className="text-gray-500">EMA-100 (Red)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1" style={{ backgroundColor: 'rgb(250, 204, 21)' }}></span>
            <span className="text-gray-500">EMA-200 (Yellow)</span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default TradingViewChart;
