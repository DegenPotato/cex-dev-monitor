import React, { useEffect, useRef, useState } from 'react';
import { createChart, ColorType, IChartApi } from 'lightweight-charts';
import { BarChart3, TrendingUp, TrendingDown } from 'lucide-react';

interface OHLCVData {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  pool_address?: string;
}

interface MigrationData {
  completed_at: number | null;
  raydium_pool: string | null;
}

interface RobustChartProps {
  data: OHLCVData[];
  migration?: MigrationData | null;
  height?: number;
  symbol?: string;
  interval?: string;
}

const RobustChart: React.FC<RobustChartProps> = ({ 
  data, 
  migration, 
  height = 400
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const [validData, setValidData] = useState<OHLCVData[]>([]);

  // Validate and clean data
  useEffect(() => {
    if (!data || data.length === 0) {
      setValidData([]);
      return;
    }

    const cleaned = data
      .filter(candle => {
        // Check all required fields exist and are valid numbers
        if (!candle || !candle.timestamp) return false;
        
        const o = Number(candle.open);
        const h = Number(candle.high);
        const l = Number(candle.low);
        const c = Number(candle.close);
        
        // Check for valid numbers
        if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) return false;
        if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return false;
        
        // Logical checks
        if (h < l) return false; // High must be >= Low
        if (h < o || h < c) return false; // High must be highest
        if (l > o || l > c) return false; // Low must be lowest
        
        return true;
      })
      .map(candle => ({
        ...candle,
        timestamp: Math.floor(candle.timestamp),
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume || 0)
      }))
      .sort((a, b) => a.timestamp - b.timestamp);

    setValidData(cleaned);
    console.log(`[RobustChart] Cleaned ${data.length} candles to ${cleaned.length} valid candles`);
  }, [data]);

  // Create chart
  useEffect(() => {
    if (!containerRef.current || validData.length === 0) return;

    try {
      setChartError(null);

      // Create chart
      const chart = createChart(containerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: 'transparent' },
          textColor: '#94a3b8',
        },
        grid: {
          vertLines: { color: 'rgba(6, 182, 212, 0.1)' },
          horzLines: { color: 'rgba(6, 182, 212, 0.1)' },
        },
        width: containerRef.current.clientWidth,
        height: height,
        timeScale: {
          borderColor: 'rgba(6, 182, 212, 0.2)',
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: 'rgba(6, 182, 212, 0.2)',
        },
      });

      chartRef.current = chart;

      // Add candlestick series
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
      });

      // Add volume series
      const volumeSeries = chart.addHistogramSeries({
        color: 'rgba(6, 182, 212, 0.3)',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: 'volume',
      });

      // Configure volume scale
      chart.priceScale('volume').applyOptions({
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      });

      // Set data
      const candleData = validData.map(candle => ({
        time: candle.timestamp as any,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }));

      const volumeData = validData.map(candle => ({
        time: candle.timestamp as any,
        value: candle.volume,
        color: candle.close >= candle.open 
          ? 'rgba(16, 185, 129, 0.3)' 
          : 'rgba(239, 68, 68, 0.3)',
      }));

      candleSeries.setData(candleData);
      volumeSeries.setData(volumeData);

      // Fit content
      chart.timeScale().fitContent();

      // Handle resize
      const handleResize = () => {
        if (containerRef.current && chart) {
          chart.applyOptions({ 
            width: containerRef.current.clientWidth 
          });
        }
      };

      window.addEventListener('resize', handleResize);

      return () => {
        window.removeEventListener('resize', handleResize);
        chart.remove();
      };
    } catch (error) {
      console.error('[RobustChart] Error creating chart:', error);
      setChartError('Failed to create chart. Using fallback view.');
    }
  }, [validData, height]);

  // Calculate stats for fallback view
  const stats = React.useMemo(() => {
    if (validData.length === 0) return null;
    
    const latest = validData[validData.length - 1];
    const first = validData[0];
    const priceChange = ((latest.close - first.open) / first.open) * 100;
    const highPrice = Math.max(...validData.map(c => c.high));
    const lowPrice = Math.min(...validData.map(c => c.low));
    const totalVolume = validData.reduce((sum, c) => sum + c.volume, 0);
    
    return {
      latest,
      priceChange,
      highPrice,
      lowPrice,
      totalVolume,
      candleCount: validData.length
    };
  }, [validData]);

  // No data view
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-black/40 rounded-lg border border-cyan-500/20">
        <div className="text-center">
          <BarChart3 className="w-12 h-12 text-gray-600 mx-auto mb-3" />
          <div className="text-gray-500 mb-2">No OHLCV data available</div>
          <div className="text-xs text-gray-600">
            Run the OHLCV test above to collect price data
          </div>
        </div>
      </div>
    );
  }

  // No valid data after cleaning
  if (validData.length === 0) {
    return (
      <div className="bg-black/40 rounded-lg border border-yellow-500/20 p-6" style={{ height: `${height}px` }}>
        <div className="text-center">
          <div className="text-yellow-500 mb-3">⚠️ Data Quality Issue</div>
          <div className="text-gray-400 mb-2">
            {data.length} candles received but all contain invalid values
          </div>
          <div className="text-xs text-gray-500">
            This usually means the data source has incomplete or corrupted data.
            Try running the OHLCV test again or check a different timeframe.
          </div>
        </div>
      </div>
    );
  }

  // Chart error - show fallback stats view
  if (chartError && stats) {
    return (
      <div className="bg-black/40 rounded-lg border border-cyan-500/20 p-6" style={{ height: `${height}px` }}>
        <div className="mb-4">
          <div className="text-yellow-400 text-sm mb-2">⚠️ Using fallback view</div>
          <div className="text-xs text-gray-500">{chartError}</div>
        </div>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-black/60 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Latest Price</div>
            <div className="text-lg font-bold text-white">
              ${stats.latest.close.toFixed(8)}
            </div>
            <div className={`text-xs flex items-center gap-1 mt-1 ${stats.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.priceChange >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
              {Math.abs(stats.priceChange).toFixed(2)}%
            </div>
          </div>
          
          <div className="bg-black/60 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">High</div>
            <div className="text-lg font-bold text-green-400">
              ${stats.highPrice.toFixed(8)}
            </div>
          </div>
          
          <div className="bg-black/60 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Low</div>
            <div className="text-lg font-bold text-red-400">
              ${stats.lowPrice.toFixed(8)}
            </div>
          </div>
          
          <div className="bg-black/60 rounded-lg p-3">
            <div className="text-xs text-gray-400 mb-1">Volume</div>
            <div className="text-lg font-bold text-cyan-400">
              ${stats.totalVolume.toLocaleString()}
            </div>
          </div>
        </div>
        
        <div className="mt-4 text-xs text-gray-500">
          Showing stats from {stats.candleCount} valid candles
        </div>
      </div>
    );
  }

  // Regular chart view
  return (
    <div className="relative">
      {/* Migration indicator */}
      {migration?.completed_at && (
        <div className="absolute top-2 right-2 z-10 bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-3 py-1 text-xs text-yellow-400">
          🎓 Token graduated at {new Date(migration.completed_at).toLocaleString()}
        </div>
      )}
      
      {/* Stats bar */}
      {stats && (
        <div className="absolute top-2 left-2 z-10 flex gap-3 text-xs">
          <div className="bg-black/80 rounded px-2 py-1">
            <span className="text-gray-400">Price:</span>{' '}
            <span className="text-white font-mono">${stats.latest.close.toFixed(8)}</span>{' '}
            <span className={stats.priceChange >= 0 ? 'text-green-400' : 'text-red-400'}>
              ({stats.priceChange >= 0 ? '+' : ''}{stats.priceChange.toFixed(2)}%)
            </span>
          </div>
          <div className="bg-black/80 rounded px-2 py-1">
            <span className="text-gray-400">Candles:</span>{' '}
            <span className="text-cyan-400">{stats.candleCount}</span>
          </div>
        </div>
      )}
      
      {/* Chart container */}
      <div 
        ref={containerRef} 
        className="bg-black/40 rounded-lg border border-cyan-500/20"
        style={{ minHeight: `${height}px` }}
      />
    </div>
  );
};

export default RobustChart;
