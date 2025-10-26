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
  const [tooltip, setTooltip] = useState<{
    visible: boolean;
    time: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
    x: number;
    y: number;
  } | null>(null);

  // Dynamic price formatter based on magnitude
  const formatPrice = (price: number): string => {
    if (!price || price === 0) return '0.00';
    
    // For extremely small prices, use scientific notation
    if (price < 0.000000000001) {
      return price.toExponential(4);
    }
    
    // Dynamic precision based on price magnitude
    if (price < 0.0000001) return price.toFixed(12);
    if (price < 0.000001) return price.toFixed(10);
    if (price < 0.00001) return price.toFixed(8);
    if (price < 0.0001) return price.toFixed(7);
    if (price < 0.001) return price.toFixed(6);
    if (price < 0.01) return price.toFixed(5);
    if (price < 0.1) return price.toFixed(4);
    if (price < 1) return price.toFixed(3);
    return price.toFixed(2);
  };

  // Validate and clean data
  useEffect(() => {
    if (!data || data.length === 0) {
      setValidData([]);
      return;
    }

    const cleaned = data
      .filter((candle): candle is OHLCVData => {
        if (!candle || !candle.timestamp) return false;
        
        // Check for null/undefined BEFORE conversion
        if (candle.open == null || candle.high == null || candle.low == null || candle.close == null) return false;
        
        const o = Number(candle.open);
        const h = Number(candle.high);
        const l = Number(candle.low);
        const c = Number(candle.close);
        
        // Must have valid numbers (catches NaN, Infinity, etc.)
        if (!isFinite(o) || !isFinite(h) || !isFinite(l) || !isFinite(c)) return false;
        if (o <= 0 || h <= 0 || l <= 0 || c <= 0) return false;
        
        // Logical checks
        if (h < l) return false; // High must be >= Low
        if (h < o || h < c) return false; // High must be highest
        if (l > o || l > c) return false; // Low must be lowest
        
        return true;
      })
      .map(candle => ({
        timestamp: Number(candle.timestamp), // Keep in milliseconds internally
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume || 0),
        pool_address: candle.pool_address
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

      // Calculate precision based on price range
      const prices = validData.map(d => d.close).filter(p => p > 0);
      const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
      
      let precision = 2;
      let minMove = 0.01;
      
      if (minPrice < 0.0000001) {
        precision = 12;
        minMove = 0.000000000001;
      } else if (minPrice < 0.000001) {
        precision = 10;
        minMove = 0.0000000001;
      } else if (minPrice < 0.00001) {
        precision = 8;
        minMove = 0.00000001;
      } else if (minPrice < 0.0001) {
        precision = 7;
        minMove = 0.0000001;
      } else if (minPrice < 0.001) {
        precision = 6;
        minMove = 0.000001;
      } else if (minPrice < 0.01) {
        precision = 5;
        minMove = 0.00001;
      } else if (minPrice < 0.1) {
        precision = 4;
        minMove = 0.0001;
      } else if (minPrice < 1) {
        precision = 3;
        minMove = 0.001;
      }

      // Add candlestick series with dynamic precision
      const candleSeries = chart.addCandlestickSeries({
        upColor: '#10b981',
        downColor: '#ef4444',
        borderUpColor: '#10b981',
        borderDownColor: '#ef4444',
        wickUpColor: '#10b981',
        wickDownColor: '#ef4444',
        priceFormat: {
          type: 'price',
          precision: precision,
          minMove: minMove,
        },
      });

      // Add volume series (don't set default color, use per-bar colors)
      const volumeSeries = chart.addHistogramSeries({
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

      // Set data - timestamps from OHLCV are already in seconds (Unix timestamp)
      const candleData = validData.map(candle => ({
        time: Math.floor(candle.timestamp) as any, // Already in seconds from GeckoTerminal
        open: candle.open || 0,
        high: candle.high || 0,
        low: candle.low || 0,
        close: candle.close || 0,
      })).filter(candle => 
        // Final safety check - ensure no zeros or invalid values
        candle.open > 0 && candle.high > 0 && candle.low > 0 && candle.close > 0
      );

      const volumeData = validData.map(candle => {
        const vol = candle.volume || 0;
        // Ensure volume is a valid number and not null/undefined/NaN
        const safeVolume = (typeof vol === 'number' && !isNaN(vol) && isFinite(vol)) ? vol : 0;
        
        return {
          time: Math.floor(candle.timestamp) as any,
          value: safeVolume,
          color: candle.close >= candle.open 
            ? 'rgba(16, 185, 129, 0.3)' 
            : 'rgba(239, 68, 68, 0.3)',
        };
      });

      // Debug: Log first and last candles
      if (candleData.length > 0) {
        console.log(`[RobustChart] First candle:`, candleData[0], new Date(candleData[0].time * 1000).toISOString());
        console.log(`[RobustChart] Last candle:`, candleData[candleData.length - 1], new Date(candleData[candleData.length - 1].time * 1000).toISOString());
        console.log(`[RobustChart] First volume:`, volumeData[0]);
        console.log(`[RobustChart] Last volume:`, volumeData[volumeData.length - 1]);
      }

      // Try to set candle data first to catch specific errors
      try {
        candleSeries.setData(candleData);
        console.log(`[RobustChart] ✅ Candlestick data set successfully`);
      } catch (err) {
        console.error(`[RobustChart] ❌ Error setting candlestick data:`, err);
        console.error(`[RobustChart] Problem candles:`, candleData);
        throw err;
      }
      
      try {
        volumeSeries.setData(volumeData);
        console.log(`[RobustChart] ✅ Volume data set successfully`);
      } catch (err) {
        console.error(`[RobustChart] ❌ Error setting volume data:`, err);
        console.error(`[RobustChart] Problem volumes:`, volumeData);
        throw err;
      }

      // Fit content
      chart.timeScale().fitContent();

      // Add crosshair move handler for tooltip
      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.time) {
          setTooltip(null);
          return;
        }

        const candleDataPoint = param.seriesData.get(candleSeries);
        const volumeDataPoint = param.seriesData.get(volumeSeries);
        
        if (candleDataPoint && 'open' in candleDataPoint) {
          const candle = candleDataPoint as any;
          const volume = volumeDataPoint && 'value' in volumeDataPoint ? (volumeDataPoint as any).value : 0;
          
          // Get mouse coordinates relative to chart
          const x = param.point?.x ?? 100;
          const y = param.point?.y ?? 100;

          console.log('[RobustChart] Tooltip update:', { x, y, time: param.time });

          setTooltip({
            visible: true,
            time: new Date((param.time as number) * 1000).toLocaleString(),
            open: formatPrice(candle.open),
            high: formatPrice(candle.high),
            low: formatPrice(candle.low),
            close: formatPrice(candle.close),
            volume: volume.toFixed(2),
            x: x,
            y: y,
          });
        } else {
          setTooltip(null);
        }
      });

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
            <span className="text-white font-mono">${formatPrice(stats.latest.close)}</span>{' '}
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
      
      {/* Tooltip - positioned relative to chart container */}
      {tooltip && tooltip.visible && (
        <div 
          className="absolute z-50 pointer-events-none"
          style={{ 
            left: `${tooltip.x + 15}px`, 
            top: `${tooltip.y + 60}px`, // Offset for stats bar at top
            transform: tooltip.x > 400 ? 'translateX(-110%)' : undefined
          }}
        >
          <div className="bg-black/98 backdrop-blur-md border-2 border-cyan-500/60 rounded-xl p-4 shadow-2xl shadow-cyan-500/30 text-sm min-w-[200px]">
            <div className="text-cyan-400 font-semibold mb-3 border-b border-cyan-500/30 pb-2 text-center">
              {tooltip.time}
            </div>
            <div className="space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-400">Open:</span>
                <span className="text-white font-mono font-semibold">${tooltip.open}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-400">High:</span>
                <span className="text-green-400 font-mono font-semibold">${tooltip.high}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-red-400">Low:</span>
                <span className="text-red-400 font-mono font-semibold">${tooltip.low}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Close:</span>
                <span className="text-white font-mono font-semibold">${tooltip.close}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-cyan-500/30 flex justify-between">
              <span className="text-cyan-400">Volume:</span>
              <span className="text-white font-mono font-semibold">${tooltip.volume}</span>
            </div>
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
