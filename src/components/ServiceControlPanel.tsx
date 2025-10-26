import { useState, useEffect } from 'react';
import { 
  Activity, 
  Filter, 
  RefreshCw, 
  CheckCircle,
  XCircle,
  Database,
  Search,
  Droplet
} from 'lucide-react';
import { apiUrl } from '../config';

interface OracleStatus {
  isRunning: boolean;
  globallyEnabled: boolean;
  pollInterval: number;
  cacheSize: number;
  solPrice: number;
  lastUpdate: number;
  filterBacklogTokens: boolean;
  filterInactiveTokens: boolean;
  filteredTokensCount: number;
}

interface TokenService {
  token_mint: string;
  symbol: string;
  name: string;
  first_source_type: string;
  detection_type: string;
  first_seen_at: number;
  total_mentions: number;
  total_trades: number;
  
  // Service status
  price_oracle_active: number;
  price_oracle_pause_reason: string | null;
  
  // OHLCV
  update_tier: 'REALTIME' | 'NORMAL' | 'DORMANT' | null;
  main_pool_address: string | null;
  ohlcv_last_update: number | null;
  ohlcv_next_update: number | null;
  
  // Pool data
  top_pool_address: string | null;
  market_cap_usd: number | null;
  volume_24h_usd: number | null;
  price_usd: number | null;
  price_change_24h: number | null;
  liquidity_usd: number | null;
  total_supply: number | null;
  fdv_usd: number | null;
  dex_id: string | null;
  pool_reserve: number | null;
  
  // Latest market data
  latest_price_usd: number | null;
  latest_price_sol: number | null;
  latest_market_cap: number | null;
  latest_fdv: number | null;
  latest_volume_24h: number | null;
  latest_price_change_24h: number | null;
  latest_price_change_7d: number | null;
  market_data_updated: number | null;
}

export function ServiceControlPanel() {
  const [status, setStatus] = useState<OracleStatus | null>(null);
  const [tokens, setTokens] = useState<TokenService[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchStatus();
    fetchTokens();
    const interval = setInterval(() => {
      fetchStatus();
      fetchTokens();
    }, 30000); // Refresh every 30 seconds
    return () => clearInterval(interval);
  }, [search]);

  const fetchStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/price-oracle/status'), {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStatus(data.data);
      }
    } catch (error) {
      console.error('Error fetching oracle status:', error);
    }
  };

  const fetchTokens = async () => {
    try {
      const response = await fetch(apiUrl(`/api/price-oracle/tokens?limit=200&search=${search}`), {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setTokens(data.data);
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    }
  };

  const toggleOracle = async () => {
    if (!status) return;
    
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/toggle'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ isRunning: !status.globallyEnabled })
      });
      
      if (response.ok) {
        await fetchStatus();
      }
    } catch (error) {
      console.error('Error toggling oracle:', error);
    } finally {
      setLoading(false);
    }
  };

  const togglePriceOracle = async (tokenMint: string, currentActive: boolean) => {
    setLoading(true);
    try {
      const endpoint = currentActive ? '/api/price-oracle/pause' : '/api/price-oracle/resume';
      const response = await fetch(apiUrl(endpoint), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMint })
      });
      
      if (response.ok) {
        await fetchTokens();
      }
    } catch (error) {
      console.error('Error toggling price oracle:', error);
    } finally {
      setLoading(false);
    }
  };

  const updateOHLCVTier = async (tokenMint: string, poolAddress: string, newTier: 'REALTIME' | 'NORMAL' | 'DORMANT') => {
    if (!poolAddress) {
      alert('No pool address found for this token');
      return;
    }
    
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/ohlcv/update-tier'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMint, poolAddress, updateTier: newTier })
      });
      
      if (response.ok) {
        await fetchTokens();
      }
    } catch (error) {
      console.error('Error updating OHLCV tier:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (num: number | null) => {
    if (!num) return '-';
    if (num >= 1e9) return `$${(num / 1e9).toFixed(2)}B`;
    if (num >= 1e6) return `$${(num / 1e6).toFixed(2)}M`;
    if (num >= 1e3) return `$${(num / 1e3).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatTimeAgo = (timestamp: number | null) => {
    if (!timestamp) return 'Never';
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const toggleRowExpand = (tokenMint: string) => {
    const newExpanded = new Set(expandedRows);
    if (newExpanded.has(tokenMint)) {
      newExpanded.delete(tokenMint);
    } else {
      newExpanded.add(tokenMint);
    }
    setExpandedRows(newExpanded);
  };

  const getTierColor = (tier: string | null) => {
    if (!tier) return 'bg-gray-500/20 text-gray-400';
    switch (tier) {
      case 'REALTIME': return 'bg-green-500/20 text-green-400';
      case 'NORMAL': return 'bg-blue-500/20 text-blue-400';
      case 'DORMANT': return 'bg-orange-500/20 text-orange-400';
      default: return 'bg-gray-500/20 text-gray-400';
    }
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-4 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-green-400" />
          <h2 className="text-2xl font-bold text-white">Service Control Panel</h2>
          <span className="text-xs text-gray-400">Unified token service management</span>
        </div>
        <button
          onClick={() => { fetchStatus(); fetchTokens(); }}
          disabled={loading}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Global Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            {status.globallyEnabled ? (
              <CheckCircle className="w-4 h-4 text-green-400" />
            ) : (
              <XCircle className="w-4 h-4 text-red-400" />
            )}
            <span className="text-xs text-gray-400">Price Oracle</span>
          </div>
          <div className="text-lg font-bold text-white">
            {status.globallyEnabled ? 'Running' : 'Stopped'}
          </div>
          <button
            onClick={toggleOracle}
            disabled={loading}
            className={`mt-2 w-full px-3 py-1 text-xs rounded transition-colors ${
              status.globallyEnabled
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
            }`}
          >
            {status.globallyEnabled ? 'Stop' : 'Start'}
          </button>
        </div>

        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-400" />
            <span className="text-xs text-gray-400">Cached Tokens</span>
          </div>
          <div className="text-lg font-bold text-white">{status.cacheSize}</div>
          <div className="text-xs text-gray-400 mt-1">
            {formatTimeAgo(Math.floor(status.lastUpdate / 1000))}
          </div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Filter className="w-4 h-4 text-orange-400" />
            <span className="text-xs text-gray-400">Filtered</span>
          </div>
          <div className="text-lg font-bold text-white">{status.filteredTokensCount}</div>
          <div className="text-xs text-gray-400 mt-1">Paused tokens</div>
        </div>

        <div className="bg-white/5 rounded-lg p-4 border border-white/10">
          <div className="flex items-center gap-2 mb-2">
            <Droplet className="w-4 h-4 text-purple-400" />
            <span className="text-xs text-gray-400">SOL Price</span>
          </div>
          <div className="text-lg font-bold text-white">${status.solPrice.toFixed(2)}</div>
          <div className="text-xs text-gray-400 mt-1">USD</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Search by symbol, name, or address..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-400 focus:outline-none focus:border-cyan-500/50"
        />
      </div>

      {/* Tokens Table */}
      <div className="bg-white/5 rounded-lg border border-white/10 overflow-hidden flex-1">
        <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-400px)]">
          <table className="w-full">
            <thead className="bg-white/5 sticky top-0 z-10">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Token</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Price Oracle</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">OHLCV Tier</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Pool / DEX</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">24h Change</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Market Cap</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Volume 24h</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {tokens.map((token) => (
                <tr 
                  key={token.token_mint} 
                  className="hover:bg-white/5 transition-colors cursor-pointer"
                  onClick={() => toggleRowExpand(token.token_mint)}
                >
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm font-semibold text-white">{token.symbol || 'Unknown'}</div>
                      <div className="text-xs text-gray-400 font-mono">{token.token_mint.slice(0, 8)}...</div>
                      {token.detection_type === 'telegram_backlog' && (
                        <span className="text-xs px-1 py-0.5 bg-orange-500/20 text-orange-400 rounded">Backlog</span>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        togglePriceOracle(token.token_mint, token.price_oracle_active === 1);
                      }}
                      disabled={loading}
                      className={`px-3 py-1 text-xs rounded transition-colors ${
                        token.price_oracle_active
                          ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                          : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      }`}
                    >
                      {token.price_oracle_active ? 'Active' : 'Paused'}
                    </button>
                  </td>
                  
                  <td className="px-4 py-3">
                    <select
                      value={token.update_tier || 'NORMAL'}
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => {
                        e.stopPropagation();
                        updateOHLCVTier(
                          token.token_mint, 
                          token.main_pool_address || token.top_pool_address || '', 
                          e.target.value as 'REALTIME' | 'NORMAL' | 'DORMANT'
                        );
                      }}
                      disabled={loading || !token.main_pool_address && !token.top_pool_address}
                      className={`px-2 py-1 text-xs rounded bg-transparent border ${getTierColor(token.update_tier)} cursor-pointer`}
                    >
                      <option value="REALTIME" className="bg-gray-900">REALTIME</option>
                      <option value="NORMAL" className="bg-gray-900">NORMAL</option>
                      <option value="DORMANT" className="bg-gray-900">DORMANT</option>
                    </select>
                  </td>
                  
                  <td className="px-4 py-3">
                    <div className="text-xs">
                      {token.main_pool_address || token.top_pool_address ? (
                        <>
                          <div className="text-gray-300 font-mono">
                            {(token.main_pool_address || token.top_pool_address)?.slice(0, 6)}...
                          </div>
                          {token.dex_id && (
                            <div className="text-gray-400">{token.dex_id}</div>
                          )}
                        </>
                      ) : (
                        <span className="text-gray-500">No pool</span>
                      )}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <div className="text-sm text-white">
                      {token.latest_price_usd ? `$${token.latest_price_usd.toFixed(6)}` : '-'}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <div className={`text-sm font-semibold ${
                      token.latest_price_change_24h && token.latest_price_change_24h > 0 
                        ? 'text-green-400' 
                        : token.latest_price_change_24h && token.latest_price_change_24h < 0
                        ? 'text-red-400'
                        : 'text-gray-400'
                    }`}>
                      {token.latest_price_change_24h ? `${token.latest_price_change_24h > 0 ? '+' : ''}${token.latest_price_change_24h.toFixed(2)}%` : '-'}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-300">
                      {formatNumber(token.latest_market_cap || token.market_cap_usd)}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <div className="text-sm text-gray-300">
                      {formatNumber(token.latest_volume_24h || token.volume_24h_usd)}
                    </div>
                  </td>
                  
                  <td className="px-4 py-3">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleRowExpand(token.token_mint);
                      }}
                      className="px-2 py-1 text-xs bg-cyan-500/20 text-cyan-400 hover:bg-cyan-500/30 rounded transition-colors"
                    >
                      {expandedRows.has(token.token_mint) ? 'Hide' : 'Details'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          {tokens.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              No tokens found
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
