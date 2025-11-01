import React, { useState, useEffect } from 'react';
import { Target, TrendingUp, TrendingDown, Activity, Bell, Plus, X, RefreshCw, Play, Square } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';
import { toast } from 'react-hot-toast';
import io, { Socket } from 'socket.io-client';

interface PriceStats {
  symbol: string;
  startPrice: number;
  currentPrice: number;
  high: number;
  low: number;
  changePercent: number;
  startTime: number;
  lastUpdate: number;
}

interface PriceTarget {
  id: string;
  symbol: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  hit: boolean;
  createdAt: number;
}

export const TestTab: React.FC = () => {
  const [, setSocket] = useState<Socket | null>(null);
  const [symbol, setSymbol] = useState('SOL');
  const [tokenMint, setTokenMint] = useState('');
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [stats, setStats] = useState<PriceStats | null>(null);
  const [targets, setTargets] = useState<PriceTarget[]>([]);
  const [newTargetPercent, setNewTargetPercent] = useState('');
  const [newTargetDirection, setNewTargetDirection] = useState<'above' | 'below'>('above');
  const [loading, setLoading] = useState(false);

  // Connect to WebSocket
  useEffect(() => {
    const newSocket = io(config.apiUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    newSocket.on('connect', () => {
      console.log('✅ Connected to WebSocket for price test');
    });

    newSocket.on('price_update', (update: any) => {
      console.log('📊 Price update:', update);
      // Update stats will come from polling for now
    });

    newSocket.on('price_target_hit', (data: any) => {
      console.log('🎯 Target hit!', data);
      
      // Show notification
      toast.success(
        <div className="flex flex-col gap-1">
          <div className="font-semibold">🎯 Target Hit!</div>
          <div className="text-sm">{data.target.symbol} reached {data.target.direction} {data.target.targetPrice.toFixed(8)}</div>
          <div className="text-sm text-gray-400">Current: ${data.currentPrice.toFixed(8)}</div>
        </div>,
        { duration: 10000 }
      );

      // Mark target as hit
      setTargets(prev => prev.map(t => 
        t.id === data.target.id ? { ...t, hit: true } : t
      ));
    });

    setSocket(newSocket);

    return () => {
      newSocket.close();
    };
  }, []);

  // Poll for stats updates when monitoring
  useEffect(() => {
    if (!isMonitoring || !symbol) return;

    const interval = setInterval(async () => {
      try {
        const response = await fetch(`${config.apiUrl}/api/price-test/stats/${symbol}`, {
          credentials: 'include'
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.stats) {
            setStats(data.stats);
          }
        }
      } catch (error) {
        console.error('Failed to fetch stats:', error);
      }
    }, 1000); // Update every second

    return () => clearInterval(interval);
  }, [isMonitoring, symbol]);

  const startMonitoring = async () => {
    if (!symbol) {
      toast.error('Please enter a symbol');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/price-test/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol, tokenMint: tokenMint || undefined })
      });

      const data = await response.json();
      
      if (data.success) {
        setIsMonitoring(true);
        setStats(data.stats);
        toast.success(`Started monitoring ${symbol}`);
      } else {
        throw new Error(data.error || 'Failed to start monitoring');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const stopMonitoring = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/price-test/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol })
      });

      const data = await response.json();
      
      if (data.success) {
        setIsMonitoring(false);
        setStats(null);
        setTargets([]);
        toast.success(`Stopped monitoring ${symbol}`);
      } else {
        throw new Error(data.error || 'Failed to stop monitoring');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  const resetStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/price-test/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol })
      });

      const data = await response.json();
      
      if (data.success) {
        setStats(data.stats);
        setTargets([]);
        toast.success('Stats reset');
      } else {
        throw new Error(data.error || 'Failed to reset stats');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const addTarget = async () => {
    if (!newTargetPercent || !stats) {
      toast.error('Please enter a target percentage');
      return;
    }

    const percent = parseFloat(newTargetPercent);
    if (isNaN(percent)) {
      toast.error('Invalid percentage');
      return;
    }

    const targetPrice = newTargetDirection === 'above'
      ? stats.startPrice * (1 + percent / 100)
      : stats.startPrice * (1 - Math.abs(percent) / 100);

    const newTarget = {
      targetPercent: percent,
      targetPrice,
      direction: newTargetDirection
    };

    try {
      const response = await fetch(`${config.apiUrl}/api/price-test/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          symbol, 
          targets: [...targets.filter(t => !t.hit), newTarget]
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setTargets(data.targets);
        setNewTargetPercent('');
        toast.success('Target added');
      } else {
        throw new Error(data.error || 'Failed to add target');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const removeTarget = async (targetId: string) => {
    const updatedTargets = targets.filter(t => t.id !== targetId);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/price-test/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ symbol, targets: updatedTargets })
      });

      const data = await response.json();
      
      if (data.success) {
        setTargets(data.targets);
      } else {
        throw new Error(data.error || 'Failed to remove target');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Activity className="w-6 h-6" />
          Price Alert Test Lab
        </h2>
        <div className="text-sm text-gray-400">
          Real-time price monitoring with Pyth Network
        </div>
      </div>

      {/* Control Panel */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 border border-gray-700 rounded-xl p-6"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Symbol</label>
              <input
                type="text"
                value={symbol}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
                disabled={isMonitoring}
                placeholder="SOL, BTC, ETH..."
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Token Mint (Optional)</label>
              <input
                type="text"
                value={tokenMint}
                onChange={(e) => setTokenMint(e.target.value)}
                disabled={isMonitoring}
                placeholder="Token address..."
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white disabled:opacity-50"
              />
            </div>
            <div className="flex items-end gap-2">
              {!isMonitoring ? (
                <button
                  onClick={startMonitoring}
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                >
                  <Play className="w-4 h-4" />
                  Start Monitoring
                </button>
              ) : (
                <>
                  <button
                    onClick={stopMonitoring}
                    disabled={loading}
                    className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <Square className="w-4 h-4" />
                    Stop
                  </button>
                  <button
                    onClick={resetStats}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Reset
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </motion.div>

      {/* Price Stats */}
      {stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 md:grid-cols-5 gap-4"
        >
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Start Price</div>
            <div className="text-xl font-bold text-white">${stats.startPrice.toFixed(8)}</div>
            <div className="text-xs text-gray-500 mt-1">{formatTime(stats.startTime)} ago</div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Current Price</div>
            <div className="text-xl font-bold text-cyan-400">${stats.currentPrice.toFixed(8)}</div>
            <div className="text-xs text-gray-500 mt-1">Live</div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">High</div>
            <div className="text-xl font-bold text-green-400">${stats.high.toFixed(8)}</div>
            <div className="text-xs text-gray-500 mt-1">+{(((stats.high - stats.startPrice) / stats.startPrice) * 100).toFixed(2)}%</div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Low</div>
            <div className="text-xl font-bold text-red-400">${stats.low.toFixed(8)}</div>
            <div className="text-xs text-gray-500 mt-1">{(((stats.low - stats.startPrice) / stats.startPrice) * 100).toFixed(2)}%</div>
          </div>
          
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
            <div className="text-sm text-gray-400 mb-1">Change</div>
            <div className={`text-xl font-bold flex items-center gap-1 ${stats.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {stats.changePercent >= 0 ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {stats.changePercent.toFixed(2)}%
            </div>
            <div className="text-xs text-gray-500 mt-1">${(stats.currentPrice - stats.startPrice).toFixed(8)}</div>
          </div>
        </motion.div>
      )}

      {/* Target Management */}
      {isMonitoring && stats && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Target className="w-5 h-5 text-yellow-400" />
              Price Targets
            </h3>
            <Bell className="w-5 h-5 text-gray-400" />
          </div>

          {/* Add Target */}
          <div className="flex gap-2 mb-4">
            <select
              value={newTargetDirection}
              onChange={(e) => setNewTargetDirection(e.target.value as 'above' | 'below')}
              className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
            >
              <option value="above">Above (+)</option>
              <option value="below">Below (-)</option>
            </select>
            <input
              type="number"
              value={newTargetPercent}
              onChange={(e) => setNewTargetPercent(e.target.value)}
              placeholder="% change..."
              step="0.1"
              className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
            />
            <button
              onClick={addTarget}
              className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Target
            </button>
          </div>

          {/* Target List */}
          <div className="space-y-2">
            <AnimatePresence>
              {targets.map((target) => (
                <motion.div
                  key={target.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    target.hit
                      ? 'bg-green-900/20 border-green-600'
                      : 'bg-gray-900 border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {target.hit ? (
                      <Bell className="w-5 h-5 text-green-400" />
                    ) : target.direction === 'above' ? (
                      <TrendingUp className="w-5 h-5 text-green-400" />
                    ) : (
                      <TrendingDown className="w-5 h-5 text-red-400" />
                    )}
                    <div>
                      <div className="font-medium text-white">
                        {target.direction === 'above' ? '+' : ''}{target.targetPercent.toFixed(2)}%
                      </div>
                      <div className="text-sm text-gray-400">
                        ${target.targetPrice.toFixed(8)}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {target.hit && (
                      <span className="px-2 py-1 bg-green-600 text-white text-xs rounded">
                        HIT ✓
                      </span>
                    )}
                    <button
                      onClick={() => removeTarget(target.id)}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      <X className="w-4 h-4 text-gray-400" />
                    </button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            
            {targets.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No targets set. Add targets to receive alerts when price reaches them.
              </div>
            )}
          </div>
        </motion.div>
      )}

      {/* Info */}
      {!isMonitoring && (
        <div className="bg-blue-900/20 border border-blue-600 rounded-xl p-4 text-sm text-blue-300">
          <strong>How it works:</strong> Enter a symbol (SOL, BTC, ETH, etc.) and start monitoring. 
          Set percentage-based price targets to receive real-time notifications when prices hit your levels. 
          Perfect for testing stop-loss and take-profit strategies without risking actual trades.
        </div>
      )}
    </div>
  );
};
