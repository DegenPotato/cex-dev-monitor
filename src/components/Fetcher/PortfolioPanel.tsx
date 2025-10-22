import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Wallet, DollarSign, PieChart, Eye, EyeOff, Coins, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingStore } from '../../stores/tradingStore';

export const PortfolioPanel: React.FC = () => {
  const { 
    wallets, 
    portfolioStats, 
    fetchWallets, 
    fetchPortfolioStats, 
    connectWebSocket, 
    disconnectWebSocket,
    connected,
    loading 
  } = useTradingStore();
  const [selectedWallet, setSelectedWallet] = useState<string>('all');
  const [showValues, setShowValues] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    // Initial data fetch
    fetchWallets();
    fetchPortfolioStats();
    
    // Connect to WebSocket for real-time updates
    connectWebSocket();
    
    // Cleanup on unmount
    return () => {
      disconnectWebSocket();
    };
  }, []);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await Promise.all([fetchWallets(), fetchPortfolioStats()]);
    setIsRefreshing(false);
  };

  const getFilteredData = () => {
    if (selectedWallet === 'all') {
      return {
        tokens: wallets.flatMap(w => 
          (w.tokens || []).map(t => ({ ...t, walletName: w.name, walletId: w.id }))
        ),
        totalSOL: wallets.reduce((sum, w) => sum + (w.balance || 0), 0),
        totalValueUSD: wallets.reduce((sum, w) => sum + (w.totalValueUSD || 0), 0)
      };
    } else {
      const wallet = wallets.find(w => w.id === selectedWallet);
      return {
        tokens: (wallet?.tokens || []).map(t => ({ ...t, walletName: wallet?.name, walletId: wallet?.id })),
        totalSOL: wallet?.balance || 0,
        totalValueUSD: wallet?.totalValueUSD || 0
      };
    }
  };

  const data = getFilteredData();
  const sortedTokens = [...data.tokens].sort((a: any, b: any) => (b.valueUSD || 0) - (a.valueUSD || 0));

  const formatValue = (value: number, prefix = '$') => {
    if (!showValues) return '****';
    return `${prefix}${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const formatPercent = (value: number) => {
    const formatted = value.toFixed(2);
    return value >= 0 ? `+${formatted}%` : `${formatted}%`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <PieChart className="w-6 h-6" />
          Portfolio Overview
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowValues(!showValues)}
            className="p-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            {showValues ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
          </button>
          <button
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="p-2 bg-gray-800/50 hover:bg-gray-700/50 rounded-lg transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
          <select
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
            className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg
                     focus:outline-none focus:border-cyan-500"
          >
            <option value="all">All Wallets</option>
            {wallets.map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total Portfolio Value</span>
            <DollarSign className="w-4 h-4 text-green-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {formatValue(data.totalValueUSD)}
          </div>
          {portfolioStats?.dayChangePercent !== undefined && (
            <div className={`text-sm mt-1 ${portfolioStats.dayChangePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {formatPercent(portfolioStats.dayChangePercent)} today
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">SOL Balance</span>
            <Coins className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {showValues ? data.totalSOL.toFixed(4) : '****'} SOL
          </div>
          <div className="text-sm text-gray-500 mt-1">
            ≈ {formatValue(data.totalSOL * 150)} @ $150/SOL
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Total P&L</span>
            {portfolioStats?.totalPnL && portfolioStats.totalPnL >= 0 ? (
              <TrendingUp className="w-4 h-4 text-green-400" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-400" />
            )}
          </div>
          <div className={`text-2xl font-bold ${
            portfolioStats?.totalPnL && portfolioStats.totalPnL >= 0 ? 'text-green-400' : 'text-red-400'
          }`}>
            {formatValue(portfolioStats?.totalPnL || 0)}
          </div>
          {portfolioStats?.totalPnLPercent !== undefined && (
            <div className="text-sm text-gray-400 mt-1">
              {formatPercent(portfolioStats.totalPnLPercent)} all-time
            </div>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-gray-800/50 border border-gray-700/50 rounded-xl p-4"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="text-gray-400 text-sm">Token Holdings</span>
            <Wallet className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {sortedTokens.length}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Across {selectedWallet === 'all' ? wallets.length : 1} wallet(s)
          </div>
        </motion.div>
      </div>

      {/* Token Holdings Table */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-gray-900/50 border border-gray-700/50 rounded-xl overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-gray-700/50">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Coins className="w-5 h-5 text-cyan-400" />
            Token Holdings
          </h3>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sortedTokens.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Coins className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p>No tokens found in {selectedWallet === 'all' ? 'your wallets' : 'this wallet'}</p>
            <p className="text-sm mt-2">SOL balance and tokens will appear here</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-800/50">
                <tr className="text-left text-sm text-gray-400">
                  <th className="px-6 py-3">Token</th>
                  <th className="px-6 py-3">Balance</th>
                  <th className="px-6 py-3">Price</th>
                  <th className="px-6 py-3">Value</th>
                  <th className="px-6 py-3">24h Change</th>
                  {selectedWallet === 'all' && <th className="px-6 py-3">Wallet</th>}
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedTokens.map((token: any, index: number) => (
                  <motion.tr
                    key={`${token.walletId}-${token.mint}`}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="border-t border-gray-700/50 hover:bg-gray-800/30 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {token.logoUri ? (
                          <img 
                            src={token.logoUri} 
                            alt={token.symbol} 
                            className="w-8 h-8 rounded-full"
                            onError={(e) => {
                              e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMzQjgyRjYiLz4KPHBhdGggZD0iTTIwIDEwVjMwIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTAgMjBIMzAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPg==';
                            }}
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold text-xs">
                            {token.symbol?.slice(0, 2) || '??'}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">
                            {token.symbol || 'Unknown'}
                          </div>
                          {token.name && (
                            <div className="text-xs text-gray-500">{token.name}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-white font-mono">
                        {showValues ? token.uiAmount.toLocaleString() : '****'}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-gray-300">
                        {formatValue(token.priceUSD || 0)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-white font-medium">
                        {formatValue(token.valueUSD || 0)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {token.change24h !== undefined ? (
                        <div className={`flex items-center gap-1 ${
                          token.change24h >= 0 ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {token.change24h >= 0 ? (
                            <TrendingUp className="w-4 h-4" />
                          ) : (
                            <TrendingDown className="w-4 h-4" />
                          )}
                          {formatPercent(token.change24h)}
                        </div>
                      ) : (
                        <span className="text-gray-500">-</span>
                      )}
                    </td>
                    {selectedWallet === 'all' && (
                      <td className="px-6 py-4">
                        <span className="text-sm text-gray-400">{token.walletName}</span>
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <button className="text-cyan-400 hover:text-cyan-300 text-sm">
                          Trade
                        </button>
                        <span className="text-gray-600">|</span>
                        <a 
                          href={`https://solscan.io/token/${token.mint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-400 hover:text-gray-300 text-sm"
                        >
                          View
                        </a>
                      </div>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* Top Movers */}
      {portfolioStats?.topGainer && portfolioStats?.topLoser && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-6">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-green-500/10 border border-green-500/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-400" />
              <span className="text-green-400 font-medium">Top Gainer</span>
            </div>
            <div className="text-white font-medium">{portfolioStats.topGainer.symbol}</div>
            <div className="text-green-400 text-2xl font-bold">
              {formatPercent(portfolioStats.topGainer.change24h || 0)}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="bg-red-500/10 border border-red-500/30 rounded-xl p-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <TrendingDown className="w-5 h-5 text-red-400" />
              <span className="text-red-400 font-medium">Top Loser</span>
            </div>
            <div className="text-white font-medium">{portfolioStats.topLoser.symbol}</div>
            <div className="text-red-400 text-2xl font-bold">
              {formatPercent(portfolioStats.topLoser.change24h || 0)}
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
