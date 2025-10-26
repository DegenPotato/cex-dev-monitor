import { useState, useEffect } from 'react';
import { 
  Activity, 
  Pause, 
  Play, 
  Filter, 
  RefreshCw, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Clock,
  Database
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

interface FilteredToken {
  id: number;
  token_mint: string;
  filter_reason: string;
  paused_by_user_id: number | null;
  paused_at: number;
  resume_after: number | null;
  notes: string | null;
  symbol: string | null;
  name: string | null;
  detection_type: string | null;
}

export function PriceOracleTab() {
  const [status, setStatus] = useState<OracleStatus | null>(null);
  const [filteredTokens, setFilteredTokens] = useState<FilteredToken[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedTokens, setSelectedTokens] = useState<Set<string>>(new Set());
  const [showFiltered, setShowFiltered] = useState(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (showFiltered) {
      fetchFilteredTokens();
    }
  }, [showFiltered]);

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

  const fetchFilteredTokens = async () => {
    try {
      const response = await fetch(apiUrl('/api/price-oracle/filtered?limit=100'), {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setFilteredTokens(data.data);
      }
    } catch (error) {
      console.error('Error fetching filtered tokens:', error);
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

  const updateConfig = async (updates: { filterBacklogTokens?: boolean; filterInactiveTokens?: boolean }) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/config'), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(updates)
      });
      
      if (response.ok) {
        await fetchStatus();
      }
    } catch (error) {
      console.error('Error updating config:', error);
    } finally {
      setLoading(false);
    }
  };

  const pauseAllBacklog = async () => {
    if (!confirm('Pause all backlog tokens from price updates?')) return;
    
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/pause/backlog'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include'
      });
      
      if (response.ok) {
        await fetchStatus();
        if (showFiltered) await fetchFilteredTokens();
      }
    } catch (error) {
      console.error('Error pausing backlog tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const resumeToken = async (tokenMint: string) => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/resume'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMint })
      });
      
      if (response.ok) {
        await fetchStatus();
        await fetchFilteredTokens();
      }
    } catch (error) {
      console.error('Error resuming token:', error);
    } finally {
      setLoading(false);
    }
  };

  const resumeSelected = async () => {
    if (selectedTokens.size === 0) return;
    
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/price-oracle/resume/bulk'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMints: Array.from(selectedTokens) })
      });
      
      if (response.ok) {
        setSelectedTokens(new Set());
        await fetchStatus();
        await fetchFilteredTokens();
      }
    } catch (error) {
      console.error('Error resuming tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleTokenSelection = (tokenMint: string) => {
    const newSelected = new Set(selectedTokens);
    if (newSelected.has(tokenMint)) {
      newSelected.delete(tokenMint);
    } else {
      newSelected.add(tokenMint);
    }
    setSelectedTokens(newSelected);
  };

  const selectAll = () => {
    setSelectedTokens(new Set(filteredTokens.map(t => t.token_mint)));
  };

  const deselectAll = () => {
    setSelectedTokens(new Set());
  };

  const formatTimeAgo = (timestamp: number) => {
    const seconds = Math.floor(Date.now() / 1000 - timestamp);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  if (!status) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-6 h-6 animate-spin text-green-400" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Activity className="w-6 h-6 text-green-400" />
          <h2 className="text-2xl font-bold text-white">Price Oracle Control</h2>
        </div>
        <button
          onClick={fetchStatus}
          disabled={loading}
          className="p-2 hover:bg-white/5 rounded-lg transition-colors"
        >
          <RefreshCw className={`w-5 h-5 text-gray-400 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Status Card */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Global Status */}
          <div className="flex items-center gap-3">
            {status.globallyEnabled ? (
              <CheckCircle className="w-5 h-5 text-green-400" />
            ) : (
              <XCircle className="w-5 h-5 text-red-400" />
            )}
            <div>
              <div className="text-xs text-gray-400">Global Status</div>
              <div className="text-sm font-semibold text-white">
                {status.globallyEnabled ? 'Running' : 'Stopped'}
              </div>
            </div>
          </div>

          {/* Cache Size */}
          <div className="flex items-center gap-3">
            <Database className="w-5 h-5 text-blue-400" />
            <div>
              <div className="text-xs text-gray-400">Cached Tokens</div>
              <div className="text-sm font-semibold text-white">{status.cacheSize}</div>
            </div>
          </div>

          {/* Filtered Count */}
          <div className="flex items-center gap-3">
            <Filter className="w-5 h-5 text-orange-400" />
            <div>
              <div className="text-xs text-gray-400">Filtered Tokens</div>
              <div className="text-sm font-semibold text-white">{status.filteredTokensCount}</div>
            </div>
          </div>

          {/* Last Update */}
          <div className="flex items-center gap-3">
            <Clock className="w-5 h-5 text-purple-400" />
            <div>
              <div className="text-xs text-gray-400">Last Update</div>
              <div className="text-sm font-semibold text-white">
                {status.lastUpdate ? formatTimeAgo(Math.floor(status.lastUpdate / 1000)) : 'Never'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Start/Stop */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            {status.globallyEnabled ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            Oracle Control
          </h3>
          <button
            onClick={toggleOracle}
            disabled={loading}
            className={`w-full px-6 py-3 rounded-lg font-semibold transition-colors ${
              status.globallyEnabled
                ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border border-red-500/50'
                : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border border-green-500/50'
            } disabled:opacity-50`}
          >
            {loading ? 'Processing...' : status.globallyEnabled ? 'Stop Oracle' : 'Start Oracle'}
          </button>
          <p className="text-xs text-gray-400 mt-2">
            {status.globallyEnabled 
              ? 'Oracle is actively fetching token prices every 60 seconds'
              : 'Oracle is paused. No price updates will occur.'}
          </p>
        </div>

        {/* Filter Settings */}
        <div className="bg-white/5 rounded-xl p-6 border border-white/10">
          <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter Settings
          </h3>
          <div className="space-y-3">
            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-300">Filter Backlog Tokens</span>
              <input
                type="checkbox"
                checked={status.filterBacklogTokens}
                onChange={(e) => updateConfig({ filterBacklogTokens: e.target.checked })}
                disabled={loading}
                className="w-5 h-5 rounded bg-white/10 border-white/20 text-green-500 focus:ring-green-500"
              />
            </label>
            <p className="text-xs text-gray-500">
              Exclude tokens detected from Telegram backlog
            </p>

            <label className="flex items-center justify-between cursor-pointer">
              <span className="text-sm text-gray-300">Filter Inactive Tokens</span>
              <input
                type="checkbox"
                checked={status.filterInactiveTokens}
                onChange={(e) => updateConfig({ filterInactiveTokens: e.target.checked })}
                disabled={loading}
                className="w-5 h-5 rounded bg-white/10 border-white/20 text-green-500 focus:ring-green-500"
              />
            </label>
            <p className="text-xs text-gray-500">
              Exclude tokens with no activity in 7+ days
            </p>
          </div>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="bg-white/5 rounded-xl p-6 border border-white/10">
        <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          Bulk Actions
        </h3>
        <div className="flex gap-3">
          <button
            onClick={pauseAllBacklog}
            disabled={loading}
            className="px-4 py-2 bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 border border-orange-500/50 rounded-lg font-semibold transition-colors disabled:opacity-50"
          >
            Pause All Backlog Tokens
          </button>
          <button
            onClick={() => setShowFiltered(!showFiltered)}
            className="px-4 py-2 bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 border border-blue-500/50 rounded-lg font-semibold transition-colors"
          >
            {showFiltered ? 'Hide' : 'Show'} Filtered Tokens
          </button>
        </div>
      </div>

      {/* Filtered Tokens List */}
      {showFiltered && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">
              Filtered Tokens ({filteredTokens.length})
            </h3>
            {selectedTokens.size > 0 && (
              <div className="flex gap-2">
                <button
                  onClick={deselectAll}
                  className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 text-gray-400 rounded transition-colors"
                >
                  Deselect All
                </button>
                <button
                  onClick={resumeSelected}
                  disabled={loading}
                  className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors disabled:opacity-50"
                >
                  Resume {selectedTokens.size} Selected
                </button>
              </div>
            )}
            {selectedTokens.size === 0 && filteredTokens.length > 0 && (
              <button
                onClick={selectAll}
                className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 text-gray-400 rounded transition-colors"
              >
                Select All
              </button>
            )}
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Select</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Token</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Reason</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Paused</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Notes</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filteredTokens.map((token) => (
                  <tr key={token.id} className="hover:bg-white/5 transition-colors">
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedTokens.has(token.token_mint)}
                        onChange={() => toggleTokenSelection(token.token_mint)}
                        className="w-4 h-4 rounded bg-white/10 border-white/20 text-green-500"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <div className="text-sm text-white font-mono">
                          {token.symbol || token.token_mint.slice(0, 8)}...
                        </div>
                        {token.name && (
                          <div className="text-xs text-gray-400">{token.name}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        token.filter_reason === 'telegram_backlog' ? 'bg-orange-500/20 text-orange-400' :
                        token.filter_reason === 'manual_pause' ? 'bg-blue-500/20 text-blue-400' :
                        token.filter_reason === 'inactive' ? 'bg-gray-500/20 text-gray-400' :
                        'bg-white/10 text-gray-400'
                      }`}>
                        {token.filter_reason.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {formatTimeAgo(token.paused_at)}
                    </td>
                    <td className="px-4 py-3 text-xs text-gray-400">
                      {token.notes || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => resumeToken(token.token_mint)}
                        disabled={loading}
                        className="px-3 py-1 text-xs bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded transition-colors disabled:opacity-50"
                      >
                        Resume
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {filteredTokens.length === 0 && (
              <div className="text-center py-12 text-gray-400">
                No filtered tokens
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
