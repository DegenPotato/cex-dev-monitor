import { useState, useEffect } from 'react';
import { 
  Flame, ExternalLink, TrendingUp, TrendingDown,
  BarChart3, Clock, User, RefreshCw, Search,
  Eye, AlertCircle, Activity, MessageCircle, 
  Zap, Trophy, Hash, Globe, Radio
} from 'lucide-react';
import { apiUrl } from '../config';
import { formatDistanceToNow } from 'date-fns';

// Token from registry with comprehensive tracking
interface TokenRegistry {
  id: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  token_decimals: number;
  
  // Discovery info
  first_seen_at: number;
  first_source_type: string;
  first_source_details?: any;
  
  // Telegram-specific
  telegram_chat_id?: string;
  telegram_chat_name?: string;
  telegram_message_id?: number;
  telegram_sender?: string;
  
  // User attribution
  discovered_by_user_id?: number;
  
  // Metadata
  is_verified?: boolean;
  is_scam?: boolean;
  tags?: string[];
  notes?: string;
  
  // Stats
  total_mentions: number;
  total_trades: number;
  first_trade_at?: number;
  
  // Market data
  current_price_usd?: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  price_change_24h?: number;
  
  // Performance
  roi_from_first_mention?: number;
  hours_to_first_trade?: number;
  win_rate?: number;
  
  // OHLCV Settings
  ohlcv_realtime_enabled?: boolean;
}

interface TokenAnalytics {
  total_tokens: number;
  tokens_24h: number;
  tokens_7d: number;
  
  by_source: {
    telegram: number;
    telegram_realtime: number;
    telegram_backlog: number;
    manual: number;
    import: number;
    dex_scan: number;
    wallet_scan: number;
  };
  
  top_telegram_sources: Array<{
    chat_id: string;
    chat_name: string;
    token_count: number;
    avg_roi: number;
    win_rate: number;
  }>;
  
  performance_metrics: {
    avg_roi: number;
    avg_hours_to_trade: number;
    total_trades: number;
    profitable_rate: number;
  };
}

type FilterSource = 'all' | 'telegram' | 'telegram_realtime' | 'telegram_backlog' | 'manual' | 'import' | 'dex_scan';
type SortBy = 'newest' | 'mentions' | 'trades' | 'roi' | 'mcap' | 'volume';

interface TokenIndexTabProps {
  onTokenSelect?: (address: string) => void;
}

export function TokenIndexTab({ onTokenSelect }: TokenIndexTabProps) {
  const [tokens, setTokens] = useState<TokenRegistry[]>([]);
  const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [filterSource, setFilterSource] = useState<FilterSource>('all');
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [showOnlyVerified, setShowOnlyVerified] = useState(false);
  const [showOnlyTraded, setShowOnlyTraded] = useState(false);
  const [selectedTimeframe, setSelectedTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('24h');

  useEffect(() => {
    fetchTokens();
    fetchAnalytics();
    
    // Set up WebSocket for real-time updates
    const ws = new WebSocket(`${apiUrl('/ws').replace('http', 'ws')}`);
    
    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'token_registered') {
        fetchTokens(); // Refresh tokens when new one is registered
      }
    };
    
    // Periodic refresh
    const interval = setInterval(() => {
      fetchTokens();
      fetchAnalytics();
    }, 30000); // Every 30s
    
    return () => {
      ws.close();
      clearInterval(interval);
    };
  }, [filterSource, sortBy, selectedTimeframe]);

  const fetchTokens = async () => {
    try {
      const params = new URLSearchParams({
        source: filterSource,
        sort: sortBy,
        timeframe: selectedTimeframe,
        verified: showOnlyVerified.toString(),
        traded: showOnlyTraded.toString()
      });
      
      const response = await fetch(apiUrl(`/api/token-registry?${params}`), { 
        credentials: 'include' 
      });
      
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

  const fetchAnalytics = async () => {
    try {
      const response = await fetch(apiUrl(`/api/token-registry/analytics/overview?timeframe=${selectedTimeframe}`), { 
        credentials: 'include' 
      });
      
      if (response.ok) {
        const data = await response.json();
        setAnalytics(data);
      }
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const toggleRealtimeOHLCV = async (mintAddress: string, currentState: boolean, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent token selection
    
    try {
      const response = await fetch(apiUrl(`/api/ohlcv/toggle-realtime/${mintAddress}`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ enabled: !currentState })
      });
      
      if (response.ok) {
        // Update the token in the list
        setTokens(prev => prev.map(token => 
          token.token_mint === mintAddress 
            ? { ...token, ohlcv_realtime_enabled: !currentState }
            : token
        ));
      } else {
        console.error('Failed to toggle real-time OHLCV');
      }
    } catch (error) {
      console.error('Error toggling real-time OHLCV:', error);
    }
  };

  const filteredTokens = tokens.filter(token => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      token.token_mint.toLowerCase().includes(query) ||
      token.token_symbol?.toLowerCase().includes(query) ||
      token.token_name?.toLowerCase().includes(query) ||
      token.telegram_chat_name?.toLowerCase().includes(query)
    );
  });

  const getSourceBadge = (sourceType: string, sourceDetails?: any) => {
    const isBacklog = sourceDetails?.isBacklog || sourceDetails?.detectionType === 'telegram_backlog';
    const isRealtime = sourceDetails?.detectionType === 'telegram_realtime';
    
    if (sourceType === 'telegram') {
      if (isBacklog) {
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Backlog
          </span>
        );
      }
      if (isRealtime) {
        return (
          <span className="px-2 py-0.5 text-xs rounded-full bg-green-500/20 text-green-400 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Realtime
          </span>
        );
      }
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-blue-500/20 text-blue-400 flex items-center gap-1">
          <MessageCircle className="w-3 h-3" />
          Telegram
        </span>
      );
    }
    
    const badges: Record<string, JSX.Element> = {
      manual: (
        <span className="px-2 py-0.5 text-xs rounded-full bg-purple-500/20 text-purple-400">
          <User className="w-3 h-3 inline mr-1" />Manual
        </span>
      ),
      import: (
        <span className="px-2 py-0.5 text-xs rounded-full bg-indigo-500/20 text-indigo-400">
          <Globe className="w-3 h-3 inline mr-1" />Import
        </span>
      ),
      dex_scan: (
        <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500/20 text-orange-400">
          <Activity className="w-3 h-3 inline mr-1" />DEX Scan
        </span>
      ),
      wallet_scan: (
        <span className="px-2 py-0.5 text-xs rounded-full bg-pink-500/20 text-pink-400">
          <Eye className="w-3 h-3 inline mr-1" />Wallet
        </span>
      )
    };
    
    return badges[sourceType] || null;
  };

  const formatROI = (roi?: number) => {
    if (!roi) return '-';
    const sign = roi >= 0 ? '+' : '';
    const color = roi >= 0 ? 'text-green-400' : 'text-red-400';
    return <span className={color}>{sign}{roi.toFixed(2)}%</span>;
  };

  return (
    <div className="bg-gray-800 rounded-lg h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-700">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-400" />
            <h2 className="text-lg font-semibold">Token Index</h2>
            <span className="text-xs text-gray-400">
              {tokens.length} tokens tracked
            </span>
          </div>
          
          {/* Timeframe Selector */}
          <div className="flex items-center gap-2">
            {(['24h', '7d', '30d', 'all'] as const).map(tf => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf)}
                className={`px-3 py-1 text-xs rounded transition-colors ${
                  selectedTimeframe === tf
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                }`}
              >
                {tf === 'all' ? 'All Time' : tf}
              </button>
            ))}
          </div>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <div className="grid grid-cols-5 gap-4 mb-4">
            <div className="bg-gray-900 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Total Tokens</span>
                <Hash className="w-4 h-4 text-gray-600" />
              </div>
              <div className="text-xl font-bold">{analytics.total_tokens}</div>
              <div className="text-xs text-gray-500">
                +{analytics.tokens_24h} today
              </div>
            </div>

            <div className="bg-gray-900 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Telegram</span>
                <MessageCircle className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold">
                {analytics.by_source.telegram + analytics.by_source.telegram_realtime + analytics.by_source.telegram_backlog}
              </div>
              <div className="flex gap-2 text-xs">
                <span className="text-green-400">{analytics.by_source.telegram_realtime} RT</span>
                <span className="text-yellow-400">{analytics.by_source.telegram_backlog} BL</span>
              </div>
            </div>

            <div className="bg-gray-900 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Avg ROI</span>
                <TrendingUp className="w-4 h-4 text-green-400" />
              </div>
              <div className="text-xl font-bold">
                {formatROI(analytics.performance_metrics.avg_roi)}
              </div>
              <div className="text-xs text-gray-500">
                {analytics.performance_metrics.profitable_rate.toFixed(1)}% win rate
              </div>
            </div>

            <div className="bg-gray-900 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Total Trades</span>
                <Activity className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold">{analytics.performance_metrics.total_trades}</div>
              <div className="text-xs text-gray-500">
                ~{analytics.performance_metrics.avg_hours_to_trade.toFixed(1)}h avg
              </div>
            </div>

            <div className="bg-gray-900 rounded p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-400">Top Source</span>
                <Trophy className="w-4 h-4 text-yellow-400" />
              </div>
              {analytics.top_telegram_sources[0] && (
                <>
                  <div className="text-sm font-bold truncate">
                    {analytics.top_telegram_sources[0].chat_name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {analytics.top_telegram_sources[0].token_count} tokens
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-2">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search by token, symbol, or source..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          {/* Source Filter */}
          <select
            value={filterSource}
            onChange={(e) => setFilterSource(e.target.value as FilterSource)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="all">All Sources</option>
            <option value="telegram">Telegram (All)</option>
            <option value="telegram_realtime">Telegram Realtime</option>
            <option value="telegram_backlog">Telegram Backlog</option>
            <option value="manual">Manual</option>
            <option value="import">Import</option>
            <option value="dex_scan">DEX Scan</option>
          </select>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm focus:outline-none focus:border-blue-500"
          >
            <option value="newest">Newest First</option>
            <option value="mentions">Most Mentions</option>
            <option value="trades">Most Traded</option>
            <option value="roi">Best ROI</option>
            <option value="mcap">Market Cap</option>
            <option value="volume">Volume</option>
          </select>

          {/* Toggle Filters */}
          <button
            onClick={() => setShowOnlyVerified(!showOnlyVerified)}
            className={`px-3 py-2 text-sm rounded transition-colors flex items-center gap-1 ${
              showOnlyVerified
                ? 'bg-blue-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <AlertCircle className="w-4 h-4" />
            Verified
          </button>

          <button
            onClick={() => setShowOnlyTraded(!showOnlyTraded)}
            className={`px-3 py-2 text-sm rounded transition-colors flex items-center gap-1 ${
              showOnlyTraded
                ? 'bg-purple-500 text-white'
                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
            }`}
          >
            <Activity className="w-4 h-4" />
            Traded
          </button>

          <button
            onClick={fetchTokens}
            className="px-3 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Token List */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">Loading tokens...</div>
          </div>
        ) : filteredTokens.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-400">No tokens found</div>
          </div>
        ) : (
          <div className="divide-y divide-gray-700">
            {filteredTokens.map((token) => (
              <div
                key={token.token_mint}
                className="p-4 hover:bg-gray-700/30 transition-colors cursor-pointer"
                onClick={() => onTokenSelect?.(token.token_mint)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-sm text-blue-400">
                        {token.token_symbol || token.token_mint.slice(0, 8)}...
                      </span>
                      {token.token_name && (
                        <span className="text-xs text-gray-400">
                          {token.token_name}
                        </span>
                      )}
                      {token.is_verified && (
                        <span title="Verified">
                          <AlertCircle className="w-4 h-4 text-green-400" />
                        </span>
                      )}
                      {token.is_scam && (
                        <span title="Scam Warning">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-400">
                      <span className="font-mono">
                        {token.token_mint.slice(0, 6)}...{token.token_mint.slice(-4)}
                      </span>
                      
                      {/* Source Badge */}
                      {getSourceBadge(token.first_source_type, token.first_source_details)}
                      
                      {/* Telegram Source */}
                      {token.telegram_chat_name && (
                        <span className="flex items-center gap-1">
                          <MessageCircle className="w-3 h-3" />
                          {token.telegram_chat_name}
                        </span>
                      )}
                      
                      {/* First Seen */}
                      <span className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatDistanceToNow(new Date(token.first_seen_at * 1000), { addSuffix: true })}
                      </span>
                      
                      {/* Mentions */}
                      <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3" />
                        {token.total_mentions} mentions
                      </span>
                      
                      {/* Trades */}
                      {token.total_trades > 0 && (
                        <span className="flex items-center gap-1 text-purple-400">
                          <Activity className="w-3 h-3" />
                          {token.total_trades} trades
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    {/* Market Cap */}
                    {token.market_cap_usd && (
                      <div className="text-sm font-medium">
                        ${(token.market_cap_usd / 1000000).toFixed(2)}M
                      </div>
                    )}
                    
                    {/* Price Change */}
                    {token.price_change_24h !== undefined && (
                      <div className={`text-xs flex items-center gap-1 ${
                        token.price_change_24h >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {token.price_change_24h >= 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                        {Math.abs(token.price_change_24h).toFixed(2)}%
                      </div>
                    )}
                    
                    {/* ROI from first mention */}
                    {token.roi_from_first_mention !== undefined && (
                      <div className="text-xs">
                        ROI: {formatROI(token.roi_from_first_mention)}
                      </div>
                    )}
                    
                    {/* External Links & Controls */}
                    <div className="flex items-center gap-1 mt-1">
                      <button
                        onClick={(e) => toggleRealtimeOHLCV(token.token_mint, token.ohlcv_realtime_enabled || false, e)}
                        className={`transition-colors ${
                          token.ohlcv_realtime_enabled 
                            ? 'text-green-400 hover:text-green-300' 
                            : 'text-gray-400 hover:text-gray-300'
                        }`}
                        title={token.ohlcv_realtime_enabled ? 'Real-time OHLCV Active (1 min)' : 'Enable Real-time OHLCV'}
                      >
                        <Radio className="w-4 h-4" />
                      </button>
                      <a
                        href={`https://pump.fun/${token.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-blue-400 transition-colors"
                      >
                        <Flame className="w-4 h-4" />
                      </a>
                      <a
                        href={`https://dexscreener.com/solana/${token.token_mint}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-gray-400 hover:text-blue-400 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top Sources Panel (Optional - can be toggled) */}
      {analytics && analytics.top_telegram_sources.length > 0 && (
        <div className="border-t border-gray-700 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-300">Top Telegram Sources</h3>
            <span className="text-xs text-gray-500">By {selectedTimeframe === 'all' ? 'all time' : selectedTimeframe}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {analytics.top_telegram_sources.slice(0, 5).map((source, idx) => (
              <div key={source.chat_id} className="bg-gray-900 rounded p-2">
                <div className="flex items-center gap-1 mb-1">
                  <span className="text-xs font-bold text-yellow-400">#{idx + 1}</span>
                  <span className="text-xs truncate">{source.chat_name}</span>
                </div>
                <div className="text-xs text-gray-400">
                  {source.token_count} tokens • {source.win_rate.toFixed(1)}% win
                </div>
                <div className="text-xs font-medium">
                  ROI: {formatROI(source.avg_roi)}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
