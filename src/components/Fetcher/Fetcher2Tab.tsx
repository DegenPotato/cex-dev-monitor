import React, { useState, useEffect, useRef } from 'react';
import { BarChart2, Play, Pause } from 'lucide-react';
import { motion } from 'framer-motion';
import { toast } from 'react-hot-toast';
import { config } from '../../config';

// Timeframe definitions
const TIMEFRAMES = [
  { key: '1s', label: '1S', seconds: 1 },
  { key: '5s', label: '5S', seconds: 5 },
  { key: '15s', label: '15S', seconds: 15 },
  { key: '1m', label: '1M', seconds: 60 },
  { key: '3m', label: '3M', seconds: 180 },
  { key: '5m', label: '5M', seconds: 300 },
  { key: '15m', label: '15M', seconds: 900 },
  { key: '1h', label: '1H', seconds: 3600 },
  { key: '2h', label: '2H', seconds: 7200 },
  { key: '4h', label: '4H', seconds: 14400 },
  { key: '12h', label: '12H', seconds: 43200 },
  { key: '1d', label: '1D', seconds: 86400 }
];

interface SwapEvent {
  signature: string;
  timestamp: number;
  program: 'pumpfun' | 'pumpswap';
  tokenMint: string;
  tokenSymbol?: string;
  side: 'buy' | 'sell';
  amountIn: number;
  amountOut: number;
  price: number;
  priceUsd?: number;
  trader: string;
  pool?: string;
}

interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  trades: number;
}

interface TokenData {
  mint: string;
  symbol?: string;
  name?: string;
  lastPrice: number;
  priceChange24h?: number;
  volume24h: number;
  trades24h: number;
  candles: { [timeframe: string]: Candle[] };
  swaps: SwapEvent[];
}

export const Fetcher2Tab: React.FC = () => {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState('1m');
  const [tokens, setTokens] = useState<Map<string, TokenData>>(new Map());
  const [selectedToken, setSelectedToken] = useState<string | null>(null);
  const [stats, setStats] = useState({
    totalSwaps: 0,
    totalVolume: 0,
    activeTokens: 0,
    swapsPerSecond: 0
  });
  const wsRef = useRef<WebSocket | null>(null);
  const candleBuilderRef = useRef<number | null>(null);

  // Start/stop monitoring
  const toggleMonitoring = async () => {
    if (isMonitoring) {
      stopMonitoring();
    } else {
      startMonitoring();
    }
  };

  const startMonitoring = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/fetcher2/start`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setIsMonitoring(true);
        connectWebSocket();
        startCandleBuilder();
        toast.success('Started on-chain monitoring');
      } else {
        toast.error('Failed to start monitoring');
      }
    } catch (error) {
      console.error('Failed to start monitoring:', error);
      toast.error('Failed to start monitoring');
    }
  };

  const stopMonitoring = async () => {
    try {
      await fetch(`${config.apiUrl}/api/fetcher2/stop`, {
        method: 'POST',
        credentials: 'include'
      });

      setIsMonitoring(false);
      disconnectWebSocket();
      stopCandleBuilder();
      toast.success('Stopped monitoring');
    } catch (error) {
      console.error('Failed to stop monitoring:', error);
    }
  };

  // WebSocket connection for real-time updates
  const connectWebSocket = () => {
    const wsUrl = config.apiUrl.replace('http', 'ws') + '/ws';
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'fetcher2' }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'swap') {
          handleSwapEvent(data.swap);
        } else if (data.type === 'stats') {
          setStats(data.stats);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
      wsRef.current = null;
    };
  };

  const disconnectWebSocket = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  // Handle incoming swap events
  const handleSwapEvent = (swap: SwapEvent) => {
    setTokens(prev => {
      const newTokens = new Map(prev);
      
      let tokenData = newTokens.get(swap.tokenMint);
      if (!tokenData) {
        tokenData = {
          mint: swap.tokenMint,
          symbol: swap.tokenSymbol,
          lastPrice: swap.price,
          volume24h: 0,
          trades24h: 0,
          candles: {},
          swaps: []
        };
        
        // Initialize candles for all timeframes
        TIMEFRAMES.forEach(tf => {
          tokenData!.candles[tf.key] = [];
        });
      }

      // Update token data
      tokenData.lastPrice = swap.price;
      tokenData.swaps.unshift(swap); // Add to beginning
      if (tokenData.swaps.length > 1000) {
        tokenData.swaps = tokenData.swaps.slice(0, 1000); // Keep last 1000
      }

      // Update candles
      updateCandles(tokenData, swap);

      // Calculate 24h stats
      const now = Date.now();
      const dayAgo = now - 86400000;
      const recentSwaps = tokenData.swaps.filter(s => s.timestamp > dayAgo);
      tokenData.volume24h = recentSwaps.reduce((sum, s) => sum + (s.amountIn * s.price), 0);
      tokenData.trades24h = recentSwaps.length;

      newTokens.set(swap.tokenMint, tokenData);
      return newTokens;
    });
  };

  // Update candles with new swap data
  const updateCandles = (tokenData: TokenData, swap: SwapEvent) => {
    TIMEFRAMES.forEach(timeframe => {
      const candleTime = Math.floor(swap.timestamp / (timeframe.seconds * 1000)) * (timeframe.seconds * 1000);
      const candles = tokenData.candles[timeframe.key];
      
      let candle = candles.find(c => c.timestamp === candleTime);
      if (!candle) {
        candle = {
          timestamp: candleTime,
          open: swap.price,
          high: swap.price,
          low: swap.price,
          close: swap.price,
          volume: 0,
          trades: 0
        };
        candles.unshift(candle); // Add to beginning
        
        // Keep max 100 candles per timeframe
        if (candles.length > 100) {
          tokenData.candles[timeframe.key] = candles.slice(0, 100);
        }
      } else {
        // Update existing candle
        candle.high = Math.max(candle.high, swap.price);
        candle.low = Math.min(candle.low, swap.price);
        candle.close = swap.price;
      }
      
      candle.volume += (swap.amountIn * swap.price);
      candle.trades += 1;
    });
  };

  // Candle builder timer (updates every second)
  const startCandleBuilder = () => {
    candleBuilderRef.current = setInterval(() => {
      // Force re-render to update candle displays
      setTokens(prev => new Map(prev));
    }, 1000);
  };

  const stopCandleBuilder = () => {
    if (candleBuilderRef.current) {
      clearInterval(candleBuilderRef.current);
      candleBuilderRef.current = null;
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnectWebSocket();
      stopCandleBuilder();
    };
  }, []);

  const selectedTokenData = selectedToken ? tokens.get(selectedToken) : null;

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <BarChart2 className="w-6 h-6" />
            Fetcher 2.0 - Direct On-Chain OHLCV
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Monitoring PumpFun & PumpSwap programs for real-time swap data
          </p>
        </div>
        <button
          onClick={toggleMonitoring}
          className={`px-6 py-2 rounded-lg flex items-center gap-2 transition-colors ${
            isMonitoring 
              ? 'bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50' 
              : 'bg-green-500/20 hover:bg-green-500/30 text-green-400 border border-green-500/50'
          }`}
        >
          {isMonitoring ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          {isMonitoring ? 'Stop Monitoring' : 'Start Monitoring'}
        </button>
      </div>

      {/* Stats Bar */}
      <motion.div 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-4 gap-4"
      >
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Swaps</p>
          <p className="text-2xl font-bold text-white">{stats.totalSwaps.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Volume (24h)</p>
          <p className="text-2xl font-bold text-cyan-400">${stats.totalVolume.toLocaleString()}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Active Tokens</p>
          <p className="text-2xl font-bold text-green-400">{stats.activeTokens}</p>
        </div>
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <p className="text-sm text-gray-400">Swaps/Second</p>
          <p className="text-2xl font-bold text-yellow-400">{stats.swapsPerSecond.toFixed(1)}</p>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-3 gap-6">
        {/* Token List */}
        <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
          <h3 className="text-lg font-bold text-white mb-4">Active Tokens</h3>
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {Array.from(tokens.values())
              .sort((a, b) => b.volume24h - a.volume24h)
              .map(token => (
              <div
                key={token.mint}
                onClick={() => setSelectedToken(token.mint)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedToken === token.mint 
                    ? 'bg-cyan-500/20 border border-cyan-500/50' 
                    : 'bg-gray-900 hover:bg-gray-700 border border-gray-700'
                }`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <p className="font-medium text-white">{token.symbol || 'Unknown'}</p>
                    <p className="text-xs text-gray-400">{token.mint.slice(0, 8)}...</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-mono text-cyan-400">${token.lastPrice.toFixed(6)}</p>
                    <p className="text-xs text-gray-400">{token.trades24h} trades</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Candle Chart Area */}
        <div className="col-span-2 bg-gray-800 border border-gray-700 rounded-xl p-4">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-white">
              {selectedTokenData ? `${selectedTokenData.symbol || selectedTokenData.mint.slice(0, 8)}...` : 'Select a token'}
            </h3>
            {selectedTokenData && (
              <div className="flex gap-1">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf.key}
                    onClick={() => setSelectedTimeframe(tf.key)}
                    className={`px-3 py-1 text-xs rounded ${
                      selectedTimeframe === tf.key
                        ? 'bg-cyan-500 text-white'
                        : 'bg-gray-700 text-gray-400 hover:bg-gray-600'
                    }`}
                  >
                    {tf.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {selectedTokenData ? (
            <div className="space-y-4">
              {/* Price Info */}
              <div className="flex justify-between items-center p-4 bg-gray-900 rounded-lg">
                <div>
                  <p className="text-sm text-gray-400">Current Price</p>
                  <p className="text-2xl font-bold text-cyan-400">${selectedTokenData.lastPrice.toFixed(8)}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-400">24h Volume</p>
                  <p className="text-lg font-bold text-green-400">${selectedTokenData.volume24h.toFixed(2)}</p>
                </div>
              </div>

              {/* Candles Display */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">
                  {selectedTimeframe.toUpperCase()} Candles ({selectedTokenData.candles[selectedTimeframe]?.length || 0})
                </h4>
                <div className="space-y-1 max-h-[400px] overflow-y-auto">
                  {selectedTokenData.candles[selectedTimeframe]?.slice(0, 20).map((candle, idx) => (
                    <div key={candle.timestamp} className="flex justify-between items-center py-1 px-2 hover:bg-gray-800 rounded">
                      <span className="text-xs text-gray-500">
                        {new Date(candle.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`text-xs font-mono ${candle.close >= candle.open ? 'text-green-400' : 'text-red-400'}`}>
                        O: {candle.open.toFixed(8)}
                      </span>
                      <span className="text-xs font-mono text-cyan-400">
                        H: {candle.high.toFixed(8)}
                      </span>
                      <span className="text-xs font-mono text-yellow-400">
                        L: {candle.low.toFixed(8)}
                      </span>
                      <span className={`text-xs font-mono ${candle.close >= candle.open ? 'text-green-400' : 'text-red-400'}`}>
                        C: {candle.close.toFixed(8)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {candle.trades} trades
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Recent Swaps */}
              <div className="bg-gray-900 rounded-lg p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Recent Swaps</h4>
                <div className="space-y-1 max-h-[200px] overflow-y-auto">
                  {selectedTokenData.swaps.slice(0, 20).map((swap, idx) => (
                    <div key={`${swap.signature}-${idx}`} className="flex justify-between items-center py-1 px-2 hover:bg-gray-800 rounded">
                      <span className={`text-xs font-bold ${swap.side === 'buy' ? 'text-green-400' : 'text-red-400'}`}>
                        {swap.side.toUpperCase()}
                      </span>
                      <span className="text-xs font-mono text-cyan-400">
                        ${swap.price.toFixed(8)}
                      </span>
                      <span className="text-xs text-gray-400">
                        {swap.amountIn.toFixed(4)} SOL
                      </span>
                      <span className="text-xs text-gray-500">
                        {new Date(swap.timestamp).toLocaleTimeString()}
                      </span>
                      <span className="text-xs text-gray-600">
                        {swap.program === 'pumpfun' ? 'PF' : 'PS'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[400px] text-gray-500">
              {isMonitoring ? 'Select a token to view OHLCV data' : 'Start monitoring to collect data'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
