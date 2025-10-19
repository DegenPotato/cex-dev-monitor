import React, { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickData, ColorType } from 'lightweight-charts';

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

interface CandlestickChartProps {
  data: OHLCVData[];
  migration?: MigrationData;
  height?: number;
}

const CandlestickChart: React.FC<CandlestickChartProps> = ({ 
  data, 
  migration, 
  height = 400 
}) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);

  useEffect(() => {
    if (!chartContainerRef.current) return;

    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: 'transparent' },
        textColor: '#94a3b8',
      },
      grid: {
        vertLines: { color: 'rgba(6, 182, 212, 0.1)' },
        horzLines: { color: 'rgba(6, 182, 212, 0.1)' },
      },
      crosshair: {
        vertLine: {
          color: 'rgba(6, 182, 212, 0.5)',
          width: 1,
          style: 2,
        },
        horzLine: {
          color: 'rgba(6, 182, 212, 0.5)',
          width: 1,
          style: 2,
        },
      },
      width: chartContainerRef.current.clientWidth,
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

    candleSeriesRef.current = candleSeries;

    // Add volume series
    const volumeSeries = chart.addHistogramSeries({
      color: 'rgba(6, 182, 212, 0.3)',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: 'volume',
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    volumeSeriesRef.current = volumeSeries;

    // Configure second price scale for volume
    chart.priceScale('volume').applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (chartRef.current) {
        chartRef.current.remove();
      }
    };
  }, [height]);

  useEffect(() => {
    if (!candleSeriesRef.current || !volumeSeriesRef.current) return;

    // Convert data to candlestick format
    const candleData: CandlestickData[] = data
      .map(candle => ({
        time: candle.timestamp as any, // Unix timestamp
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Convert volume data
    const volumeData = data
      .map(candle => ({
        time: candle.timestamp as any,
        value: candle.volume,
        color: candle.close >= candle.open 
          ? 'rgba(16, 185, 129, 0.3)' 
          : 'rgba(239, 68, 68, 0.3)',
      }))
      .sort((a, b) => (a.time as number) - (b.time as number));

    // Set data
    candleSeriesRef.current.setData(candleData);
    volumeSeriesRef.current.setData(volumeData);

    // Add migration marker if available
    if (migration?.completed_at && chartRef.current) {
      const migrationLine = {
        price: 0,
        color: '#fbbf24',
        lineWidth: 2,
        lineStyle: 2, // Dashed
        axisLabelVisible: false,
        title: '🎓 Graduated to Raydium',
      };

      // Find the price at migration time
      const migrationCandle = candleData.find(c => 
        (c.time as number) >= migration.completed_at!
      );

      if (migrationCandle) {
        candleSeriesRef.current.createPriceLine({
          ...migrationLine,
          price: migrationCandle.close,
        });
      }
    }

    // Fit content
    if (chartRef.current && candleData.length > 0) {
      chartRef.current.timeScale().fitContent();
    }
  }, [data, migration]);

  // Show loading or empty state
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-[400px] bg-black/40 rounded-lg border border-cyan-500/20">
        <div className="text-center">
          <div className="text-gray-500 mb-2">No OHLCV data available</div>
          <div className="text-xs text-gray-600">
            Run the OHLCV test above to collect price data
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Migration indicator */}
      {migration?.completed_at && (
        <div className="absolute top-2 right-2 z-10 bg-yellow-500/20 border border-yellow-500/40 rounded-lg px-3 py-1 text-xs text-yellow-400">
          🎓 Token graduated at {new Date(migration.completed_at).toLocaleString()}
        </div>
      )}
      
      {/* Chart container */}
      <div 
        ref={chartContainerRef} 
        className="bg-black/40 rounded-lg border border-cyan-500/20"
      />

      {/* Legend */}
      <div className="flex items-center justify-between mt-2 px-2 text-xs text-gray-500">
        <div className="flex gap-4">
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-sm"></div>
            Bullish
          </span>
          <span className="flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-sm"></div>
            Bearish
          </span>
        </div>
        <div>
          {data.length} candles • {new Date(data[0]?.timestamp * 1000).toLocaleDateString()} - {new Date(data[data.length - 1]?.timestamp * 1000).toLocaleDateString()}
        </div>
      </div>
    </div>
  );
};

export default CandlestickChart;
