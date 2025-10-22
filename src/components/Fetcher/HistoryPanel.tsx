import React, { useState, useEffect } from 'react';
import { History, ExternalLink, TrendingUp, TrendingDown, Check, X, Clock } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingStore } from '../../stores/tradingStore';

export const HistoryPanel: React.FC = () => {
  const { tradeHistory, fetchTradeHistory, loading } = useTradingStore();
  const [filter, setFilter] = useState<'all' | 'buy' | 'sell'>('all');
  const [timeRange, setTimeRange] = useState<'24h' | '7d' | '30d' | 'all'>('7d');

  useEffect(() => {
    fetchTradeHistory();
    // Refresh every 30 seconds
    const interval = setInterval(() => fetchTradeHistory(), 30000);
    return () => clearInterval(interval);
  }, []);

  const filteredTrades = tradeHistory.filter(trade => {
    if (filter !== 'all' && trade.type !== filter) return false;
    
    const now = Date.now();
    const tradeTime = new Date(trade.timestamp).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    
    switch (timeRange) {
      case '24h':
        return now - tradeTime <= dayMs;
      case '7d':
        return now - tradeTime <= 7 * dayMs;
      case '30d':
        return now - tradeTime <= 30 * dayMs;
      default:
        return true;
    }
  });

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <Check className="w-4 h-4 text-green-400" />;
      case 'failed':
        return <X className="w-4 h-4 text-red-400" />;
      default:
        return <Clock className="w-4 h-4 text-yellow-400 animate-pulse" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'success':
        return 'text-green-400 bg-green-500/10';
      case 'failed':
        return 'text-red-400 bg-red-500/10';
      default:
        return 'text-yellow-400 bg-yellow-500/10';
    }
  };

  const formatTime = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - new Date(date).getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    
    return new Date(date).toLocaleDateString();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <History className="w-6 h-6" />
          Trade History
        </h2>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Clock className="w-4 h-4" />
          <span>Auto-refresh: 30s</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded-lg transition-all ${
              filter === 'all'
                ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            All Trades
          </button>
          <button
            onClick={() => setFilter('buy')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
              filter === 'buy'
                ? 'bg-green-500/20 border border-green-500 text-green-400'
                : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            Buys
          </button>
          <button
            onClick={() => setFilter('sell')}
            className={`px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${
              filter === 'sell'
                ? 'bg-red-500/20 border border-red-500 text-red-400'
                : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:border-gray-600'
            }`}
          >
            <TrendingDown className="w-4 h-4" />
            Sells
          </button>
        </div>

        <div className="flex gap-2">
          {(['24h', '7d', '30d', 'all'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`px-3 py-2 rounded-lg transition-all text-sm ${
                timeRange === range
                  ? 'bg-purple-500/20 border border-purple-500 text-purple-400'
                  : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              {range === 'all' ? 'All Time' : `Last ${range}`}
            </button>
          ))}
        </div>
      </div>

      {/* Trade List */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filteredTrades.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <History className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No trades found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredTrades.map((trade, index) => (
            <motion.div
              key={trade.id}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.05 }}
              className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4 hover:border-cyan-500/30 transition-all"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    {trade.type === 'buy' ? (
                      <div className="p-2 bg-green-500/10 rounded-lg">
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      </div>
                    ) : (
                      <div className="p-2 bg-red-500/10 rounded-lg">
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      </div>
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white">
                          {trade.type === 'buy' ? 'Bought' : 'Sold'} {trade.tokenSymbol || 'Token'}
                        </span>
                        <span className={`px-2 py-0.5 rounded text-xs flex items-center gap-1 ${getStatusColor(trade.status)}`}>
                          {getStatusIcon(trade.status)}
                          {trade.status}
                        </span>
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        {formatTime(trade.timestamp)} • Wallet: {trade.walletName}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">Amount</span>
                      <div className="text-white font-medium">
                        {trade.amount.toFixed(4)} {trade.type === 'buy' ? 'SOL' : trade.tokenSymbol || 'tokens'}
                      </div>
                    </div>
                    
                    {trade.taxAmount && (
                      <div>
                        <span className="text-gray-500">Tax</span>
                        <div className="text-yellow-400 font-medium">
                          {trade.taxAmount.toFixed(4)} SOL
                        </div>
                      </div>
                    )}
                    
                    {trade.netAmount && (
                      <div>
                        <span className="text-gray-500">Net Amount</span>
                        <div className="text-cyan-400 font-medium">
                          {trade.netAmount.toFixed(4)}
                        </div>
                      </div>
                    )}

                    <div>
                      <span className="text-gray-500">Token</span>
                      <div className="text-white font-mono text-xs">
                        {trade.tokenAddress.slice(0, 4)}...{trade.tokenAddress.slice(-4)}
                      </div>
                    </div>
                  </div>

                  {trade.signature && (
                    <div className="mt-3 flex items-center gap-2">
                      <span className="text-xs text-gray-500">Transaction:</span>
                      <code className="text-xs text-cyan-400 font-mono">
                        {trade.signature.slice(0, 8)}...{trade.signature.slice(-8)}
                      </code>
                      <a
                        href={`https://solscan.io/tx/${trade.signature}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-cyan-400 hover:text-cyan-300 transition-colors"
                      >
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Stats Summary */}
      {filteredTrades.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-6 p-4 bg-gray-900/50 border border-gray-700/50 rounded-xl"
        >
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Total Trades</span>
              <div className="text-xl font-bold text-white">{filteredTrades.length}</div>
            </div>
            <div>
              <span className="text-gray-500">Successful</span>
              <div className="text-xl font-bold text-green-400">
                {filteredTrades.filter(t => t.status === 'success').length}
              </div>
            </div>
            <div>
              <span className="text-gray-500">Total Volume</span>
              <div className="text-xl font-bold text-cyan-400">
                {filteredTrades.reduce((sum, t) => sum + t.amount, 0).toFixed(2)} SOL
              </div>
            </div>
            <div>
              <span className="text-gray-500">Tax Collected</span>
              <div className="text-xl font-bold text-yellow-400">
                {filteredTrades.reduce((sum, t) => sum + (t.taxAmount || 0), 0).toFixed(4)} SOL
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
};
