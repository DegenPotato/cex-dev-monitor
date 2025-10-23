import React, { useMemo } from 'react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  ChartData,
  ChartOptions,
  TooltipItem,
} from 'chart.js';
import { Line } from 'react-chartjs-2';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
);

interface IndicatorData {
  timestamp: number;
  rsi_2?: number | null;
  rsi_14?: number | null;
  ema_21?: number | null;
  ema_50?: number | null;
  ema_100?: number | null;
  ema_200?: number | null;
  close?: number;
}

interface TechnicalIndicatorsProps {
  data: IndicatorData[];
  height?: number;
  showRSI?: boolean;
  showEMA?: boolean;
}

// Color configuration matching your requirements
const INDICATOR_COLORS = {
  rsi_2: 'rgb(147, 51, 234)',    // Purple
  rsi_14: 'rgb(59, 130, 246)',   // Blue
  ema_21: 'rgb(255, 255, 255)',  // White
  ema_50: 'rgb(34, 197, 94)',    // Green
  ema_100: 'rgb(239, 68, 68)',   // Red
  ema_200: 'rgb(250, 204, 21)',  // Yellow
  price: 'rgb(59, 130, 246)',    // Blue for price line
};

/**
 * RSI Oscillator Component (Separate panel like TradingView)
 */
export const RSIOscillator: React.FC<{ data: IndicatorData[], height?: number }> = ({ 
  data, 
  height = 200 
}) => {
  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = data.map(d => new Date(d.timestamp * 1000).toLocaleTimeString());
    
    return {
      labels,
      datasets: [
        {
          label: 'RSI-2',
          data: data.map(d => d.rsi_2 ?? null),
          borderColor: INDICATOR_COLORS.rsi_2,
          backgroundColor: INDICATOR_COLORS.rsi_2 + '20',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
        },
        {
          label: 'RSI-14',
          data: data.map(d => d.rsi_14 ?? null),
          borderColor: INDICATOR_COLORS.rsi_14,
          backgroundColor: INDICATOR_COLORS.rsi_14 + '20',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: false,
        }
      ]
    };
  }, [data]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#9CA3AF',
          usePointStyle: true,
          font: {
            size: 11
          }
        }
      },
      title: {
        display: true,
        text: 'RSI Oscillator',
        color: '#9CA3AF',
        font: {
          size: 12,
          weight: 'normal'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.8)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 8,
        displayColors: true,
        callbacks: {
          label: (context: TooltipItem<'line'>) => {
            const label = context.dataset.label || '';
            const value = context.raw as number;
            return `${label}: ${value?.toFixed(2) ?? 'N/A'}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#9CA3AF',
          maxRotation: 0,
          autoSkipPadding: 20,
          font: {
            size: 10
          }
        }
      },
      y: {
        display: true,
        min: 0,
        max: 100,
        grid: {
          color: 'rgba(75, 85, 99, 0.2)',
          drawBorder: false,
        },
        ticks: {
          color: '#9CA3AF',
          stepSize: 20,
          font: {
            size: 10
          },
          callback: (value: any) => value
        },
        // Add reference lines
        afterDataLimits: (scale: any) => {
          scale.options.plugins = scale.options.plugins || {};
          scale.options.plugins.annotation = {
            annotations: {
              oversold: {
                type: 'line',
                yMin: 30,
                yMax: 30,
                borderColor: 'rgba(239, 68, 68, 0.5)',
                borderWidth: 1,
                borderDash: [5, 5],
              },
              overbought: {
                type: 'line',
                yMin: 70,
                yMax: 70,
                borderColor: 'rgba(34, 197, 94, 0.5)',
                borderWidth: 1,
                borderDash: [5, 5],
              }
            }
          };
        }
      }
    }
  }), []);

  return (
    <div style={{ height, position: 'relative' }} className="bg-gray-900 rounded-lg p-2">
      <Line data={chartData} options={options} />
      {/* Overbought/Oversold zones */}
      <div className="absolute top-16 right-4 text-xs text-gray-500">
        <div className="flex items-center gap-2">
          <span className="w-8 h-0.5 bg-green-500/50 inline-block"></span>
          <span>Overbought (70)</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="w-8 h-0.5 bg-red-500/50 inline-block"></span>
          <span>Oversold (30)</span>
        </div>
      </div>
    </div>
  );
};

/**
 * EMA Overlay Component (Overlays on main price chart)
 */
export const EMAOverlay: React.FC<{ data: IndicatorData[], height?: number }> = ({ 
  data, 
  height = 400 
}) => {
  const chartData: ChartData<'line'> = useMemo(() => {
    const labels = data.map(d => new Date(d.timestamp * 1000).toLocaleTimeString());
    
    return {
      labels,
      datasets: [
        // Price line
        {
          label: 'Price',
          data: data.map(d => d.close ?? null),
          borderColor: INDICATOR_COLORS.price,
          backgroundColor: INDICATOR_COLORS.price + '10',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          fill: true,
        },
        // EMA lines
        {
          label: 'EMA 21',
          data: data.map(d => d.ema_21 ?? null),
          borderColor: INDICATOR_COLORS.ema_21,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          borderDash: [],
        },
        {
          label: 'EMA 50',
          data: data.map(d => d.ema_50 ?? null),
          borderColor: INDICATOR_COLORS.ema_50,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          borderDash: [],
        },
        {
          label: 'EMA 100',
          data: data.map(d => d.ema_100 ?? null),
          borderColor: INDICATOR_COLORS.ema_100,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          borderDash: [],
        },
        {
          label: 'EMA 200',
          data: data.map(d => d.ema_200 ?? null),
          borderColor: INDICATOR_COLORS.ema_200,
          backgroundColor: 'transparent',
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0,
          fill: false,
          borderDash: [],
        }
      ]
    };
  }, [data]);

  const options: ChartOptions<'line'> = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top' as const,
        labels: {
          color: '#9CA3AF',
          usePointStyle: true,
          boxWidth: 10,
          font: {
            size: 11
          },
          filter: (item: any) => {
            // Only show legend items that have data
            return item.text !== 'Price' || true; // Always show price
          }
        }
      },
      title: {
        display: true,
        text: 'Price with EMA Indicators',
        color: '#9CA3AF',
        font: {
          size: 14,
          weight: 'bold'
        }
      },
      tooltip: {
        backgroundColor: 'rgba(0, 0, 0, 0.9)',
        titleColor: '#fff',
        bodyColor: '#fff',
        borderColor: '#374151',
        borderWidth: 1,
        padding: 10,
        displayColors: true,
        callbacks: {
          label: (context: TooltipItem<'line'>) => {
            const label = context.dataset.label || '';
            const value = context.raw as number;
            if (value === null || value === undefined) return '';
            
            // Format price with more decimals for small values
            const formatted = value < 0.01 
              ? value.toExponential(4)
              : value.toFixed(6);
            
            return `${label}: $${formatted}`;
          }
        }
      }
    },
    scales: {
      x: {
        display: true,
        grid: {
          color: 'rgba(75, 85, 99, 0.1)',
          drawBorder: false,
        },
        ticks: {
          color: '#9CA3AF',
          maxRotation: 0,
          autoSkipPadding: 30,
          font: {
            size: 10
          }
        }
      },
      y: {
        display: true,
        position: 'right' as const,
        grid: {
          color: 'rgba(75, 85, 99, 0.1)',
          drawBorder: false,
        },
        ticks: {
          color: '#9CA3AF',
          font: {
            size: 10
          },
          callback: (value: any) => {
            const num = value as number;
            if (num < 0.01) return num.toExponential(2);
            if (num < 1) return num.toFixed(6);
            return num.toFixed(4);
          }
        }
      }
    }
  }), []);

  return (
    <div style={{ height }} className="bg-gray-900 rounded-lg p-2">
      <Line data={chartData} options={options} />
    </div>
  );
};

/**
 * Combined Technical Indicators Component
 */
const TechnicalIndicators: React.FC<TechnicalIndicatorsProps> = ({ 
  data, 
  height = 600,
  showRSI = true,
  showEMA = true 
}) => {
  // Filter out data points with no values
  const validData = useMemo(() => 
    data.filter(d => d.close !== null && d.close !== undefined),
    [data]
  );

  if (!validData.length) {
    return (
      <div className="bg-gray-900 rounded-lg p-4 text-center text-gray-500">
        No indicator data available
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showEMA && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">Price & Moving Averages</h3>
          <EMAOverlay data={validData} height={height * 0.65} />
        </div>
      )}
      
      {showRSI && (
        <div>
          <h3 className="text-sm font-medium text-gray-400 mb-2">RSI Oscillator</h3>
          <RSIOscillator data={validData} height={height * 0.35} />
        </div>
      )}
    </div>
  );
};

export default TechnicalIndicators;
