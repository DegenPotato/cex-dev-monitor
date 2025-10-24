import { useState, useEffect, useRef } from 'react';
import { 
  Flame, ExternalLink, TrendingUp, TrendingDown,
  BarChart3, Clock, User, RefreshCw, Search,
  Eye, AlertCircle, Activity, MessageCircle, 
  Zap, Trophy, Hash, Globe, Radio, DollarSign
} from 'lucide-react';
import { apiUrl } from '../config';
import { formatDistanceToNow } from 'date-fns';

// Token with comprehensive pricing and metrics from Token Price Oracle
interface TokenWithPricing {
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  token_decimals: number;
  first_seen_at: number;
  first_source_type: string;
  
  // Real-time pricing from Token Price Oracle
  price_usd?: number;
  price_sol?: number;
  price_change_24h?: number;
  market_cap_usd?: number;
  volume_24h_usd?: number;
  fdv_usd?: number;
  liquidity_usd?: number;
  
  // Launch metrics (calculated from internal data)
  first_seen_price_usd?: number;
  launch_price_usd?: number;
  launch_mcap_usd?: number;
  ath_price_usd?: number;
  ath_mcap_usd?: number;
  gain_from_first_seen?: number;
  gain_from_launch?: number;
  
  // Metadata
  last_price_update?: number;
  ohlcv_realtime_enabled?: boolean;
}

interface TokenAnalytics {
  total_tokens: number;
  tokens_24h: number;
  tokens_7d: number;
  by_source: Record<string, number>;
}

type SortBy = 'newest' | 'gain_first_seen' | 'gain_launch' | 'mcap' | 'volume' | 'price';

interface TokenIndexTabProps {
  onTokenSelect?: (address: string) => void;
}

export function TokenIndexTab({ onTokenSelect }: TokenIndexTabProps) {
  const [tokens, setTokens] = useState<TokenWithPricing[]>([]);
  const [analytics, setAnalytics] = useState<TokenAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchTokens();
    fetchAnalytics();
    
    // Set up WebSocket for real-time price updates
    const wsUrl = apiUrl('/ws').replace('http', 'ws');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('🔌 Connected to price updates WebSocket');
    };
    
    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Handle real-time price updates from Token Price Oracle
        if (message.type === 'token_prices_update') {
          const priceUpdates = message.data as Array<{
            mintAddress: string;
            priceUsd: number;
            priceSol: number;
            priceChange24h: number;
            marketCap: number;
            volume24h: number;
            fdv: number;
            liquidity: number;
            lastUpdated: number;
          }>;
          
          // Update tokens with new prices
          setTokens(prevTokens => {
            const updatedTokens = [...prevTokens];
            priceUpdates.forEach(update => {
              const index = updatedTokens.findIndex(t => t.token_mint === update.mintAddress);
              if (index !== -1) {
                updatedTokens[index] = {
                  ...updatedTokens[index],
                  price_usd: update.priceUsd,
                  price_sol: update.priceSol,
                  price_change_24h: update.priceChange24h,
                  market_cap_usd: update.marketCap,
                  volume_24h_usd: update.volume24h,
                  fdv_usd: update.fdv,
                  liquidity_usd: update.liquidity,
                  last_price_update: update.lastUpdated,
                  // Recalculate gain from first seen
                  gain_from_first_seen: updatedTokens[index].first_seen_price_usd
                    ? ((update.priceUsd - updatedTokens[index].first_seen_price_usd!) / updatedTokens[index].first_seen_price_usd!) * 100
                    : undefined,
                  // Recalculate gain from launch
                  gain_from_launch: updatedTokens[index].launch_price_usd
                    ? ((update.priceUsd - updatedTokens[index].launch_price_usd!) / updatedTokens[index].launch_price_usd!) * 100
                    : undefined
                };
              }
            });
            return updatedTokens;
          });
          
          setLastUpdate(Date.now());
        }
      } catch (error) {
        console.error('Error processing WebSocket message:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
      console.log('🔌 Disconnected from price updates WebSocket');
    };
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const fetchTokens = async () => {
    try {
      setLoading(true);
      const response = await fetch(apiUrl('/api/token-registry/with-pricing?limit=200'), { 
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
      const response = await fetch(apiUrl('/api/token-registry/analytics/overview'), { 
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

  // Filter and sort tokens
  const filteredAndSortedTokens = tokens
    .filter(token => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        token.token_symbol?.toLowerCase().includes(query) ||
        token.token_name?.toLowerCase().includes(query) ||
        token.token_mint.toLowerCase().includes(query)
      );
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return b.first_seen_at - a.first_seen_at;
        case 'gain_first_seen':
          return (b.gain_from_first_seen || -Infinity) - (a.gain_from_first_seen || -Infinity);
        case 'gain_launch':
          return (b.gain_from_launch || -Infinity) - (a.gain_from_launch || -Infinity);
        case 'mcap':
          return (b.market_cap_usd || 0) - (a.market_cap_usd || 0);
        case 'volume':
          return (b.volume_24h_usd || 0) - (a.volume_24h_usd || 0);
        case 'price':
          return (b.price_usd || 0) - (a.price_usd || 0);
        default:
          return 0;
      }
    });

  const formatNumber = (num: number | undefined, decimals: number = 2): string => {
    if (num === undefined || num === null) return 'N/A';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(decimals)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(decimals)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(decimals)}K`;
    return `$${num.toFixed(decimals)}`;
  };

  const formatPercent = (num: number | undefined): string => {
    if (num === undefined || num === null) return 'N/A';
    const sign = num >= 0 ? '+' : '';
    return `${sign}${num.toFixed(2)}%`;
  };

  return (
    <div className="space-y-6">
      {/* Header with Analytics */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Trophy className="w-6 h-6 text-yellow-400" />
            Token Sniffer
            <span className="text-sm text-gray-400 font-normal ml-2">
              Real-time tracking powered by Token Price Oracle
            </span>
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            Last update: {formatDistanceToNow(lastUpdate, { addSuffix: true })}
          </p>
        </div>
        <button
          onClick={() => {
            fetchTokens();
            fetchAnalytics();
          }}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg flex items-center gap-2"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      {/* Analytics Cards */}
      {analytics && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Total Tokens</p>
                <p className="text-2xl font-bold text-white">{analytics.total_tokens}</p>
              </div>
              <Hash className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Last 24h</p>
                <p className="text-2xl font-bold text-green-400">{analytics.tokens_24h}</p>
              </div>
              <Clock className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Last 7 days</p>
                <p className="text-2xl font-bold text-purple-400">{analytics.tokens_7d}</p>
              </div>
              <BarChart3 className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>
      )}

      {/* Filters and Search */}
      <div className="flex flex-col md:flex-row gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by symbol, name, or address..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
          />
        </div>
        
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-blue-500"
        >
          <option value="newest">Newest First</option>
          <option value="gain_first_seen">Gain from Discovery</option>
          <option value="gain_launch">Gain from Launch</option>
          <option value="mcap">Market Cap</option>
          <option value="volume">Volume 24h</option>
          <option value="price">Price</option>
        </select>
      </div>

      {/* Tokens List */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          {filteredAndSortedTokens.map((token) => (
            <div
              key={token.token_mint}
              onClick={() => onTokenSelect?.(token.token_mint)}
              className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 hover:bg-gray-800 cursor-pointer transition-colors"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold text-white">
                      {token.token_symbol || 'Unknown'}
                    </h3>
                    <span className="text-sm text-gray-400">
                      {token.token_name || 'Unknown Token'}
                    </span>
                    <span className="px-2 py-1 bg-blue-500/20 text-blue-400 text-xs rounded">
                      {token.first_source_type}
                    </span>
                    {token.ohlcv_realtime_enabled && (
                      <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded flex items-center gap-1">
                        <Radio className="w-3 h-3" />
                        Real-time
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                    <div>
                      <p className="text-gray-400">Current Price</p>
                      <p className="text-white font-semibold flex items-center gap-1">
                        {formatNumber(token.price_usd, 6)}
                        {token.price_change_24h !== undefined && (
                          <span className={token.price_change_24h >= 0 ? 'text-green-400' : 'text-red-400'}>
                            ({formatPercent(token.price_change_24h)})
                          </span>
                        )}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-gray-400">Gain from Discovery</p>
                      <p className={`font-semibold ${
                        (token.gain_from_first_seen || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {formatPercent(token.gain_from_first_seen)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-gray-400">Market Cap</p>
                      <p className="text-white font-semibold">
                        {formatNumber(token.market_cap_usd)}
                      </p>
                    </div>
                    
                    <div>
                      <p className="text-gray-400">Volume 24h</p>
                      <p className="text-white font-semibold">
                        {formatNumber(token.volume_24h_usd)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="mt-3 flex items-center gap-4 text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Discovered {formatDistanceToNow(token.first_seen_at, { addSuffix: true })}
                    </span>
                    {token.first_seen_price_usd && (
                      <span>
                        Entry: {formatNumber(token.first_seen_price_usd, 6)}
                      </span>
                    )}
                    {token.ath_price_usd && (
                      <span>
                        ATH: {formatNumber(token.ath_price_usd, 6)}
                      </span>
                    )}
                  </div>
                </div>
                
                <a
                  href={`https://dexscreener.com/solana/${token.token_mint}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="text-blue-400 hover:text-blue-300"
                >
                  <ExternalLink className="w-5 h-5" />
                </a>
              </div>
            </div>
          ))}
          
          {filteredAndSortedTokens.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No tokens found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
