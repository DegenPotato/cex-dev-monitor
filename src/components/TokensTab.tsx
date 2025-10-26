import { useState, useEffect, useRef } from 'react';
import { Flame, ExternalLink, TrendingUp, TrendingDown, DollarSign, BarChart3, Clock, User, ArrowUpDown, RefreshCw, Radio } from 'lucide-react';
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
  first_seen_mcap?: number;
  current_mcap?: number;
  ath_mcap?: number;
  last_updated?: number;
  price_usd?: number;
  price_sol?: number;
  graduation_percentage?: number;
  launchpad_completed?: number;
  launchpad_completed_at?: number;
  migrated_pool_address?: string;
  total_supply?: string;
  decimals?: number;
  market_cap_usd?: number;
  coingecko_coin_id?: string;
  gt_score?: number;
  description?: string;
  metadata?: string;
}

type SortBy = 'newest' | 'mcap' | 'gain' | 'ath';

interface TokensTabProps {
  onTokenSelect?: (address: string) => void;
}

export function TokensTab({ onTokenSelect }: TokensTabProps) {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('newest');
  const [lastUpdate, setLastUpdate] = useState<number>(Date.now());
  const [refreshing, setRefreshing] = useState<Record<string, boolean>>({});
  const [refreshCooldowns, setRefreshCooldowns] = useState<Record<string, number>>({});
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    fetchTokens();
    
    // Set up WebSocket for real-time price updates - NO POLLING
    const wsUrl = apiUrl('/ws').replace('http', 'ws');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log('🚀 Token Sniffer connected to real-time updates');
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
          }>;
          
          setTokens(prevTokens => {
            const updatedTokens = [...prevTokens];
            priceUpdates.forEach(update => {
              const index = updatedTokens.findIndex(t => t.mint_address === update.mintAddress);
              if (index !== -1) {
                updatedTokens[index].price_usd = update.priceUsd;
                updatedTokens[index].price_sol = update.priceSol;
                
                // Calculate market cap from price × supply if backend doesn't provide it
                const decimals = updatedTokens[index].decimals || 9;
                const actualSupply = updatedTokens[index].total_supply
                  ? parseFloat(updatedTokens[index].total_supply || '0') / Math.pow(10, decimals)
                  : null;
                const calculatedMcap = update.priceUsd && actualSupply
                  ? update.priceUsd * actualSupply
                  : null;
                
                updatedTokens[index].current_mcap = update.marketCap || calculatedMcap || undefined;
                updatedTokens[index].last_updated = Date.now();
                
                // Update ATH if current exceeds it
                if (updatedTokens[index].current_mcap && 
                    (!updatedTokens[index].ath_mcap || updatedTokens[index].current_mcap! > updatedTokens[index].ath_mcap!)) {
                  updatedTokens[index].ath_mcap = updatedTokens[index].current_mcap;
                }
              }
            });
            setLastUpdate(Date.now());
            return updatedTokens;
          });
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };
    
    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch(apiUrl('/api/tokens?limit=1000'), { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        // Calculate market cap from price × supply if not provided
        const enrichedData = data.map((token: Token) => {
          // Convert total_supply to actual token amount using decimals
          const decimals = token.decimals || 9;
          const actualSupply = token.total_supply 
            ? parseFloat(token.total_supply) / Math.pow(10, decimals)
            : null;
          
          const calculatedMcap = token.price_usd && actualSupply
            ? token.price_usd * actualSupply
            : null;
          
          return {
            ...token,
            current_mcap: token.current_mcap || calculatedMcap,
            // If we have calculated mcap but no ATH, use current as ATH initially
            ath_mcap: token.ath_mcap || (calculatedMcap && calculatedMcap > 0 ? calculatedMcap : null)
          };
        });
        setTokens(enrichedData);
      } else {
        console.error('Failed to fetch tokens');
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    } finally {
      setLoading(false);
    }
  };


  const formatMarketCap = (mcap?: number) => {
    if (!mcap) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(1)}K`;
    return `$${mcap.toFixed(0)}`;
  };

  const calculateGain = (token: Token) => {
    // Use first_seen_mcap (when YOU discovered it) instead of starting_mcap (absolute launch)
    const baseMcap = token.first_seen_mcap || token.starting_mcap;
    if (!baseMcap || !token.current_mcap) return null;
    return ((token.current_mcap - baseMcap) / baseMcap) * 100;
  };

  const getGainColor = (gain: number | null) => {
    if (gain === null) return 'text-gray-400';
    if (gain > 0) return 'text-green-400';
    if (gain < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  const handleRefreshToken = async (mintAddress: string) => {
    // Check cooldown
    const now = Date.now();
    if (refreshCooldowns[mintAddress] && now - refreshCooldowns[mintAddress] < 60000) {
      const remaining = Math.ceil((60000 - (now - refreshCooldowns[mintAddress])) / 1000);
      alert(`Please wait ${remaining}s before refreshing again`);
      return;
    }

    setRefreshing(prev => ({ ...prev, [mintAddress]: true }));
    try {
      const response = await fetch(apiUrl(`/api/tokens/${mintAddress}/refresh`), {
        method: 'POST'
      });
      
      if (response.ok) {
        await response.json();
        alert(`✅ Token data refreshed!`);
        setRefreshCooldowns(prev => ({ ...prev, [mintAddress]: now }));
        fetchTokens(); // Refresh the list
      } else {
        const error = await response.json();
        alert(`❌ Error: ${error.error || 'Failed to refresh'}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setRefreshing(prev => ({ ...prev, [mintAddress]: false }));
    }
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
          <span className="text-xs text-gray-500">
            Real-time data from Token Price Oracle
          </span>
          {lastUpdate && (
            <span className="text-xs text-gray-400 ml-2">
              <Radio className="inline w-3 h-3 text-green-400 animate-pulse" />
              Live Updates
            </span>
          )}
        </div>
      </div>

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
                    <button 
                      onClick={() => onTokenSelect?.(token.mint_address)}
                      className="text-lg font-bold text-white hover:text-purple-400 transition-colors cursor-pointer text-left"
                    >
                      {token.name || token.symbol || 'Unknown Token'}
                    </button>
                    {token.symbol && token.name && (
                      <button 
                        onClick={() => onTokenSelect?.(token.mint_address)}
                        className="text-purple-400 hover:text-purple-300 font-mono cursor-pointer"
                      >
                        ${token.symbol}
                      </button>
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
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-3">
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
                      <div className="text-xs text-gray-400 mb-1">Price (SOL)</div>
                      <div className="text-sm font-semibold text-purple-400">
                        {token.price_sol ? `◎${token.price_sol.toFixed(6)}` : 'N/A'}
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

                  {/* Bonding Curve / Launchpad Status */}
                  {token.graduation_percentage !== undefined && (
                    <div className="mb-3">
                      {token.launchpad_completed ? (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-2 px-3 py-1.5 bg-green-500/20 border border-green-500/30 rounded-lg">
                            <Flame className="w-4 h-4 text-green-400" />
                            <span className="text-sm font-semibold text-green-400">GRADUATED</span>
                          </div>
                          {token.launchpad_completed_at && (
                            <span className="text-xs text-gray-400">
                              {new Date(token.launchpad_completed_at).toLocaleString()}
                            </span>
                          )}
                          {token.migrated_pool_address && (
                            <a
                              href={`https://gmgn.ai/sol/token/${token.mint_address}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
                            >
                              View Raydium Pool
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs text-gray-400">Bonding Curve Progress</span>
                            <span className="text-xs font-semibold text-orange-400">
                              {token.graduation_percentage?.toFixed(2) || '0.00'}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2 overflow-hidden">
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-green-500 transition-all duration-500"
                              style={{ width: `${Math.min(token.graduation_percentage || 0, 100)}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}

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
                    href={`https://gmgn.ai/sol/token/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                  >
                    <BarChart3 className="w-3 h-3" />
                    GMGN
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
                  <button
                    onClick={() => handleRefreshToken(token.mint_address)}
                    disabled={refreshing[token.mint_address]}
                    className="flex items-center justify-center gap-1.5 px-3 py-1.5 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white text-xs font-medium rounded transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshing[token.mint_address] ? 'animate-spin' : ''}`} />
                    {refreshing[token.mint_address] ? 'Updating...' : 'Refresh Data'}
                  </button>
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
