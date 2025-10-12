import { useState, useEffect } from 'react';
import { Flame, ExternalLink, TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, User, ArrowUpDown } from 'lucide-react';
import { apiUrl } from '../config';

interface Token {
  id: number;
  mint_address: string;
  creator_address: string;
  name?: string;
  symbol?: string;
  timestamp: number;
  platform: string;
  signature?: string;
  starting_mcap?: number;
  current_mcap?: number;
  ath_mcap?: number;
  last_updated?: number;
}

type SortBy = 'newest' | 'mcap' | 'gain' | 'ath';

export function TokensTab() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [marketDataStatus, setMarketDataStatus] = useState<any>(null);

  useEffect(() => {
    fetchTokens();
    fetchMarketDataStatus();
    const interval = setInterval(() => {
      fetchTokens();
      fetchMarketDataStatus();
    }, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch(apiUrl('/api/tokens?limit=1000'));
      if (response.ok) {
        const data = await response.json();
        setTokens(data);
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchMarketDataStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/market-data/status'));
      if (response.ok) {
        const data = await response.json();
        setMarketDataStatus(data);
      }
    } catch (error) {
      console.error('Error fetching market data status:', error);
    }
  };

  const toggleMarketDataTracker = async () => {
    try {
      const endpoint = marketDataStatus?.isRunning ? '/api/market-data/stop' : '/api/market-data/start';
      const response = await fetch(apiUrl(endpoint), { method: 'POST' });
      if (response.ok) {
        const data = await response.json();
        alert(data.message);
        fetchMarketDataStatus();
      }
    } catch (error: any) {
      alert(`Error: ${error.message}`);
    }
  };

  const formatMarketCap = (mcap?: number) => {
    if (!mcap) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(1)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  const calculateGain = (token: Token) => {
    if (!token.starting_mcap || !token.current_mcap) return null;
    return ((token.current_mcap - token.starting_mcap) / token.starting_mcap) * 100;
  };

  const getGainColor = (gain: number | null) => {
    if (gain === null) return 'text-gray-400';
    if (gain > 0) return 'text-green-400';
    if (gain < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const sortedTokens = [...tokens].sort((a, b) => {
    switch (sortBy) {
      case 'newest':
        return b.timestamp - a.timestamp;
      case 'mcap':
        return (b.current_mcap || 0) - (a.current_mcap || 0);
      case 'gain': {
        const gainA = calculateGain(a) || -Infinity;
        const gainB = calculateGain(b) || -Infinity;
        return gainB - gainA;
      }
      case 'ath':
        return (b.ath_mcap || 0) - (a.ath_mcap || 0);
      default:
        return 0;
    }
  });

  if (loading) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-400 py-8">Loading tokens...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Flame className="w-6 h-6 text-purple-400" />
            Token Launch History ({tokens.length})
          </h2>
          <p className="text-sm text-gray-400 mt-1">Comprehensive market data and insights</p>
        </div>

        {/* Market Data Tracker Control */}
        {marketDataStatus && (
          <button
            onClick={toggleMarketDataTracker}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              marketDataStatus.isRunning
                ? 'bg-orange-600 hover:bg-orange-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            {marketDataStatus.isRunning ? 'Stop' : 'Start'} Market Data Tracker
          </button>
        )}
      </div>

      {/* Market Data Status Banner */}
      {marketDataStatus?.isRunning && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-6">
          <div className="flex items-center gap-2 text-green-400 font-medium mb-2">
            <BarChart3 className="w-4 h-4 animate-pulse" />
            Market Data Tracker Active
          </div>
          <div className="text-xs text-gray-400">
            Polling GeckoTerminal every {marketDataStatus.pollInterval / 1000}s • 
            Rate limited to {marketDataStatus.maxCallsPerMinute} calls/minute • 
            {marketDataStatus.delayBetweenCalls}ms delay between calls
          </div>
        </div>
      )}

      {/* Sort Controls */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setSortBy('newest')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            sortBy === 'newest'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          <Clock className="w-4 h-4" />
          Newest First
        </button>
        <button
          onClick={() => setSortBy('mcap')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            sortBy === 'mcap'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          <DollarSign className="w-4 h-4" />
          Highest MCap
        </button>
        <button
          onClick={() => setSortBy('gain')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            sortBy === 'gain'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          Best Gainers
        </button>
        <button
          onClick={() => setSortBy('ath')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
            sortBy === 'ath'
              ? 'bg-purple-600 text-white'
              : 'bg-slate-700 text-gray-300 hover:bg-slate-600'
          }`}
        >
          <ArrowUpDown className="w-4 h-4" />
          Highest ATH
        </button>
      </div>

      {/* Token Cards */}
      <div className="space-y-4">
        {sortedTokens.map((token) => {
          const gain = calculateGain(token);
          const gainColor = getGainColor(gain);

          return (
            <div
              key={token.id}
              className="bg-slate-800/50 rounded-lg border border-purple-500/20 p-4 hover:border-purple-500/40 transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                {/* Token Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-bold text-white">
                      {token.name || token.symbol || 'Unknown Token'}
                    </h3>
                    {token.symbol && token.name && (
                      <span className="text-purple-400 font-mono">${token.symbol}</span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs ${
                      token.platform === 'pumpfun' 
                        ? 'bg-orange-500/20 text-orange-400' 
                        : 'bg-green-500/20 text-green-400'
                    }`}>
                      {token.platform.toUpperCase()}
                    </span>
                  </div>

                  {/* Market Data Grid */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-3">
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Launch MCap</div>
                      <div className="text-sm font-semibold text-white">
                        {formatMarketCap(token.starting_mcap)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Current MCap</div>
                      <div className="text-sm font-semibold text-white">
                        {formatMarketCap(token.current_mcap)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">ATH MCap</div>
                      <div className="text-sm font-semibold text-white">
                        {formatMarketCap(token.ath_mcap)}
                      </div>
                    </div>
                    <div>
                      <div className="text-xs text-gray-400 mb-1">Gain/Loss</div>
                      <div className={`text-sm font-semibold flex items-center gap-1 ${gainColor}`}>
                        {gain !== null ? (
                          <>
                            {gain > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                            {gain > 0 ? '+' : ''}{gain.toFixed(2)}%
                          </>
                        ) : (
                          'N/A'
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Creator & Timestamp */}
                  <div className="flex items-center gap-4 text-xs text-gray-400">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3 h-3" />
                      <span className="font-mono">{token.creator_address.slice(0, 8)}...</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3 h-3" />
                      <span>{new Date(token.timestamp).toLocaleString()}</span>
                    </div>
                    {token.last_updated && (
                      <div className="text-xs text-green-400">
                        Updated {Math.floor((Date.now() - token.last_updated) / 1000)}s ago
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Links */}
                <div className="flex flex-col gap-2">
                  <a
                    href={`https://www.geckoterminal.com/solana/pools/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded transition-colors"
                  >
                    <BarChart3 className="w-3 h-3" />
                    GeckoTerminal
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://dexscreener.com/solana/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                  >
                    <BarChart3 className="w-3 h-3" />
                    DexScreener
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  <a
                    href={`https://solscan.io/token/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                  >
                    Solscan
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Mint Address */}
              <div className="mt-3 pt-3 border-t border-slate-700">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500">Mint:</span>
                  <code className="text-gray-400 font-mono">{token.mint_address}</code>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {tokens.length === 0 && (
        <div className="text-center text-gray-400 py-8">
          No tokens found. Start monitoring wallets to detect new token launches.
        </div>
      )}
    </div>
  );
}
