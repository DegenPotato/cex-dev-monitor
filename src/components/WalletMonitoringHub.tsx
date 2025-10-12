import { useState, useEffect } from 'react';
import { Play, Pause, Trash2, Plus, Eye, Activity, Clock, Flame, DollarSign, Search, CheckSquare, Square, Filter, ArrowUpDown } from 'lucide-react';
import { apiUrl } from '../config';
import { Stats } from '../types';

interface WalletMonitoringHubProps {
  stats: Stats | null;
  onUpdate: () => void;
}

interface MonitoredWallet {
  address: string;
  label?: string;
  source: string;
  is_active: number;
  first_seen: number;
  last_activity?: number;
  transaction_count?: number;
  is_dev?: number;
  dev_tokens_count?: number;
  monitoring_type?: string;
}

type SortBy = 'date' | 'activity' | 'status' | 'label';
type FilterBy = 'all' | 'active' | 'inactive' | 'dev';

export function WalletMonitoringHub({ stats, onUpdate }: WalletMonitoringHubProps) {
  const [wallets, setWallets] = useState<MonitoredWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWallets, setSelectedWallets] = useState<Set<string>>(new Set());
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');
  const [newWalletMonitoringType, setNewWalletMonitoringType] = useState<'pumpfun' | 'trading'>('pumpfun');
  const [newWalletRateLimitRPS, setNewWalletRateLimitRPS] = useState(1);
  const [newWalletRateLimitEnabled, setNewWalletRateLimitEnabled] = useState(true);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [filterBy, setFilterBy] = useState<FilterBy>('all');

  useEffect(() => {
    fetchWallets();
  }, []);

  const fetchWallets = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/wallets'));
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWalletSelection = (address: string) => {
    const newSelected = new Set(selectedWallets);
    if (newSelected.has(address)) {
      newSelected.delete(address);
    } else {
      newSelected.add(address);
    }
    setSelectedWallets(newSelected);
  };

  const toggleAllSelection = () => {
    if (selectedWallets.size === filteredWallets.length) {
      setSelectedWallets(new Set());
    } else {
      setSelectedWallets(new Set(filteredWallets.map(w => w.address)));
    }
  };

  const toggleMonitoring = async (address: string, currentState: number) => {
    try {
      await fetch(apiUrl(`/api/wallets/${address}/toggle`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: currentState === 1 ? 0 : 1 })
      });
      fetchWallets();
      onUpdate();
    } catch (error) {
      console.error('Error toggling monitoring:', error);
    }
  };

  const bulkToggleMonitoring = async (active: boolean) => {
    if (selectedWallets.size === 0) return;
    
    try {
      await Promise.all(
        Array.from(selectedWallets).map(address =>
          fetch(apiUrl(`/api/wallets/${address}/toggle`), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ is_active: active ? 1 : 0 })
          })
        )
      );
      setSelectedWallets(new Set());
      fetchWallets();
      onUpdate();
    } catch (error) {
      console.error('Error bulk toggling monitoring:', error);
    }
  };

  const deleteWallet = async (address: string) => {
    if (!confirm(`Delete wallet ${address.slice(0, 8)}...?`)) return;
    
    try {
      await fetch(apiUrl(`/api/wallets/${address}`), {
        method: 'DELETE'
      });
      fetchWallets();
      onUpdate();
    } catch (error) {
      console.error('Error deleting wallet:', error);
    }
  };

  const bulkDeleteWallets = async () => {
    if (selectedWallets.size === 0) return;
    if (!confirm(`Delete ${selectedWallets.size} selected wallets?`)) return;
    
    try {
      await Promise.all(
        Array.from(selectedWallets).map(address =>
          fetch(apiUrl(`/api/wallets/${address}`), {
            method: 'DELETE'
          })
        )
      );
      setSelectedWallets(new Set());
      fetchWallets();
      onUpdate();
    } catch (error) {
      console.error('Error bulk deleting wallets:', error);
    }
  };

  const addWallet = async () => {
    if (!newWalletAddress.trim()) return;
    
    try {
      await fetch(apiUrl('/api/wallets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: newWalletAddress.trim(),
          label: newWalletLabel.trim() || null,
          source: 'manual',
          monitoring_type: newWalletMonitoringType,
          rate_limit_rps: newWalletRateLimitRPS,
          rate_limit_enabled: newWalletRateLimitEnabled ? 1 : 0
        })
      });
      setNewWalletAddress('');
      setNewWalletLabel('');
      setNewWalletMonitoringType('pumpfun');
      setNewWalletRateLimitRPS(1);
      setNewWalletRateLimitEnabled(true);
      setShowAddWallet(false);
      fetchWallets();
      onUpdate();
    } catch (error) {
      console.error('Error adding wallet:', error);
      alert('Error adding wallet');
    }
  };

  // Filter and Sort logic
  const filteredWallets = wallets
    .filter(wallet => {
      // Search filter
      const matchesSearch = 
        wallet.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wallet.label?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        wallet.source.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;
      
      // Status filter
      if (filterBy === 'active') return wallet.is_active === 1;
      if (filterBy === 'inactive') return wallet.is_active === 0;
      if (filterBy === 'dev') return wallet.is_dev === 1;
      
      return true; // 'all'
    })
    .sort((a, b) => {
      // Sort logic
      switch (sortBy) {
        case 'date':
          return b.first_seen - a.first_seen; // Newest first
        case 'activity':
          return (b.transaction_count || 0) - (a.transaction_count || 0); // Most active first
        case 'status':
          return b.is_active - a.is_active; // Active first
        case 'label':
          if (!a.label && !b.label) return 0;
          if (!a.label) return 1;
          if (!b.label) return -1;
          return a.label.localeCompare(b.label);
        default:
          return 0;
      }
    });

  const activeCount = wallets.filter(w => w.is_active === 1).length;
  const devCount = wallets.filter(w => w.is_dev === 1).length;

  return (
    <div className="p-6">
      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 border border-purple-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-purple-400" />
            <span className="text-2xl font-bold text-white">{activeCount}/{wallets.length}</span>
          </div>
          <p className="text-sm text-gray-300">Active Monitoring</p>
        </div>
        
        <div className="bg-gradient-to-br from-amber-500/20 to-amber-600/20 border border-amber-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Flame className="w-5 h-5 text-amber-400" />
            <span className="text-2xl font-bold text-white">{devCount}</span>
          </div>
          <p className="text-sm text-gray-300">Dev Wallets</p>
        </div>
        
        <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 border border-green-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-green-400" />
            <span className="text-2xl font-bold text-white">{stats?.transactions_24h || 0}</span>
          </div>
          <p className="text-sm text-gray-300">Transactions (24h)</p>
        </div>
        
        <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-500/30 rounded-lg p-4">
          <div className="flex items-center justify-between mb-2">
            <Clock className="w-5 h-5 text-blue-400" />
            <span className="text-2xl font-bold text-white">{stats?.tokens_24h || 0}</span>
          </div>
          <p className="text-sm text-gray-300">Tokens (24h)</p>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-4 mb-6">
        {/* Search */}
        <div className="flex-1 relative">
          <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search wallets by address, label, or source..."
            className="w-full bg-slate-700 text-white rounded-lg pl-10 pr-4 py-2.5 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none transition-colors"
          />
        </div>

        {/* Filter */}
        <div className="relative">
          <Filter className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={filterBy}
            onChange={(e) => setFilterBy(e.target.value as FilterBy)}
            className="bg-slate-700 text-white rounded-lg pl-9 pr-10 py-2.5 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="all">All Wallets</option>
            <option value="active">Active Only</option>
            <option value="inactive">Inactive Only</option>
            <option value="dev">Dev Wallets</option>
          </select>
        </div>

        {/* Sort */}
        <div className="relative">
          <ArrowUpDown className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="bg-slate-700 text-white rounded-lg pl-9 pr-10 py-2.5 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none transition-colors appearance-none cursor-pointer"
          >
            <option value="date">Newest First</option>
            <option value="activity">Most Active</option>
            <option value="status">Active First</option>
            <option value="label">By Label</option>
          </select>
        </div>

        {/* Add Wallet */}
        <button
          onClick={() => setShowAddWallet(!showAddWallet)}
          className="flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-purple-500/20"
        >
          <Plus className="w-4 h-4" />
          <span>Add Wallet</span>
        </button>
      </div>

      {/* Bulk Actions */}
      {selectedWallets.size > 0 && (
        <div className="bg-purple-900/30 border border-purple-500/30 rounded-lg p-4 mb-6 flex items-center justify-between">
          <span className="text-white font-medium">{selectedWallets.size} wallet(s) selected</span>
          <div className="flex gap-2">
            <button
              onClick={() => bulkToggleMonitoring(true)}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Play className="w-4 h-4" />
              Start All
            </button>
            <button
              onClick={() => bulkToggleMonitoring(false)}
              className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Pause className="w-4 h-4" />
              Stop All
            </button>
            <button
              onClick={bulkDeleteWallets}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      )}

      {/* Add Wallet Form */}
      {showAddWallet && (
        <div className="bg-slate-700/50 border border-purple-500/30 rounded-lg p-6 mb-6">
          <h3 className="text-white font-semibold mb-4 text-lg">Add New Wallet to Monitor</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Wallet Address *
              </label>
              <input
                type="text"
                value={newWalletAddress}
                onChange={(e) => setNewWalletAddress(e.target.value)}
                placeholder="Enter Solana wallet address"
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Label (Optional)
              </label>
              <input
                type="text"
                value={newWalletLabel}
                onChange={(e) => setNewWalletLabel(e.target.value)}
                placeholder="e.g., Whale #1, Dev Wallet"
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              />
            </div>
          </div>

          {/* Monitoring Type Selector */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Monitoring Type *
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Pumpfun Launches */}
              <button
                onClick={() => setNewWalletMonitoringType('pumpfun')}
                className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                  newWalletMonitoringType === 'pumpfun'
                    ? 'border-purple-500 bg-purple-500/20'
                    : 'border-slate-600 bg-slate-700/30 hover:border-purple-500/50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Flame className="w-5 h-5 text-purple-400" />
                    <h4 className="text-white font-semibold">Pumpfun Launches</h4>
                  </div>
                  {newWalletMonitoringType === 'pumpfun' && (
                    <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  Track token deployments/mints on Pumpfun. Ideal for dev wallet detection.
                </p>
                <div className="mt-2 text-xs text-purple-400">
                  ✓ Tested & Working
                </div>
              </button>

              {/* Trading Activity */}
              <button
                onClick={() => setNewWalletMonitoringType('trading')}
                className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                  newWalletMonitoringType === 'trading'
                    ? 'border-blue-500 bg-blue-500/20'
                    : 'border-slate-600 bg-slate-700/30 hover:border-blue-500/50'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-blue-400" />
                    <h4 className="text-white font-semibold">Trading Activity</h4>
                  </div>
                  {newWalletMonitoringType === 'trading' && (
                    <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
                      <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </div>
                <p className="text-sm text-gray-400">
                  Comprehensive buy/sell tracking across all DEXs. Full trading history & PnL analysis.
                </p>
                <div className="mt-2 text-xs text-amber-400">
                  🧪 Testing Phase
                </div>
              </button>
            </div>
          </div>

          {/* Rate Limit Configuration */}
          <div className="mb-6 bg-slate-800/50 border border-slate-600 rounded-lg p-4">
            <label className="block text-sm font-medium text-gray-300 mb-3">
              Rate Limit Configuration
            </label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* RPS Slider */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Requests Per Second: {newWalletRateLimitRPS} RPS
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min="0.1"
                    max="10"
                    step="0.1"
                    value={newWalletRateLimitRPS}
                    onChange={(e) => setNewWalletRateLimitRPS(parseFloat(e.target.value))}
                    className="flex-1 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
                  />
                  <input
                    type="number"
                    min="0.1"
                    max="100"
                    step="0.1"
                    value={newWalletRateLimitRPS}
                    onChange={(e) => setNewWalletRateLimitRPS(parseFloat(e.target.value) || 1)}
                    className="w-20 bg-slate-700 text-white rounded px-2 py-1 text-sm border border-purple-500/20"
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Delay: {Math.floor(1000 / newWalletRateLimitRPS)}ms between requests
                </p>
              </div>

              {/* Enable/Disable Toggle */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">
                  Status
                </label>
                <button
                  onClick={() => setNewWalletRateLimitEnabled(!newWalletRateLimitEnabled)}
                  className={`w-full px-4 py-2 rounded-lg font-medium transition-all ${
                    newWalletRateLimitEnabled
                      ? 'bg-green-600/20 border-2 border-green-500 text-green-400'
                      : 'bg-slate-700 border-2 border-slate-600 text-gray-400'
                  }`}
                >
                  {newWalletRateLimitEnabled ? '✅ Rate Limiting Enabled' : '⏸️ Rate Limiting Disabled'}
                </button>
                <p className="text-xs text-gray-500 mt-1">
                  {newWalletRateLimitEnabled ? 'Requests will be throttled' : 'No throttling applied'}
                </p>
              </div>
            </div>

            <div className="mt-3 text-xs text-gray-400 bg-slate-700/50 rounded p-2">
              💡 <strong>Tip:</strong> Start with 1 RPS (default) for safe testing. Increase for faster backfills if needed. This prevents rate limiting from RPC nodes.
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-3 mb-4">
            <p className="text-xs text-blue-300">
              <strong>Note:</strong> These monitoring types are separate for testing. Eventually, they'll be combined into one efficient listener that tracks everything (minus spam) with historical backfill + real-time updates.
            </p>
          </div>

          <div className="flex gap-2">
            <button
              onClick={addWallet}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Wallet
            </button>
            <button
              onClick={() => {
                setShowAddWallet(false);
                setNewWalletMonitoringType('pumpfun'); // Reset to default
              }}
              className="bg-slate-600 hover:bg-slate-700 text-white px-6 py-2.5 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Wallet List */}
      <div className="bg-slate-900/50 rounded-lg border border-purple-500/20 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-800/50 border-b border-purple-500/20">
              <tr>
                <th className="px-4 py-3 text-left">
                  <button onClick={toggleAllSelection} className="text-gray-400 hover:text-white">
                    {selectedWallets.size === filteredWallets.length && filteredWallets.length > 0 ? 
                      <CheckSquare className="w-5 h-5" /> : 
                      <Square className="w-5 h-5" />
                    }
                  </button>
                </th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Wallet</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Source</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">First Seen</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Activity</th>
                <th className="px-4 py-3 text-left text-sm font-semibold text-gray-300">Status</th>
                <th className="px-4 py-3 text-center text-sm font-semibold text-gray-300">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-purple-500/10">
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    Loading wallets...
                  </td>
                </tr>
              ) : filteredWallets.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                    No wallets found. Add a wallet to start monitoring.
                  </td>
                </tr>
              ) : (
                filteredWallets.map((wallet) => (
                  <tr key={wallet.address} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-4 py-3">
                      <button 
                        onClick={() => toggleWalletSelection(wallet.address)}
                        className="text-gray-400 hover:text-white"
                      >
                        {selectedWallets.has(wallet.address) ? 
                          <CheckSquare className="w-5 h-5 text-purple-400" /> : 
                          <Square className="w-5 h-5" />
                        }
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div>
                        <a
                          href={`https://solscan.io/account/${wallet.address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300 font-mono text-sm"
                        >
                          {wallet.address.slice(0, 8)}...{wallet.address.slice(-6)}
                        </a>
                        {wallet.label && (
                          <div className="text-xs text-gray-400 mt-1">{wallet.label}</div>
                        )}
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {wallet.is_dev === 1 && (
                            <span className="inline-flex items-center gap-1 bg-red-500/20 text-red-400 text-xs px-2 py-0.5 rounded">
                              <Flame className="w-3 h-3" />
                              Dev • {wallet.dev_tokens_count || 0} tokens
                            </span>
                          )}
                          {wallet.monitoring_type && (
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${
                              wallet.monitoring_type === 'pumpfun' 
                                ? 'bg-purple-500/20 text-purple-400' 
                                : 'bg-blue-500/20 text-blue-400'
                            }`}>
                              {wallet.monitoring_type === 'pumpfun' ? (
                                <>
                                  <Flame className="w-3 h-3" />
                                  Pumpfun
                                </>
                              ) : (
                                <>
                                  <Activity className="w-3 h-3" />
                                  Trading
                                </>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 bg-slate-700 text-gray-300 text-xs px-2 py-1 rounded">
                        {wallet.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      <div>
                        {new Date(wallet.first_seen * 1000).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {(() => {
                          const days = Math.floor((Date.now() - wallet.first_seen * 1000) / (1000 * 60 * 60 * 24));
                          return days === 0 ? 'Today' : `${days} day${days !== 1 ? 's' : ''} ago`;
                        })()}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">
                      {wallet.transaction_count || 0} txns
                    </td>
                    <td className="px-4 py-3">
                      {wallet.is_active === 1 ? (
                        <span className="inline-flex items-center gap-1 bg-green-500/20 text-green-400 text-xs px-2 py-1 rounded">
                          <Activity className="w-3 h-3" />
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-gray-500/20 text-gray-400 text-xs px-2 py-1 rounded">
                          <Pause className="w-3 h-3" />
                          Paused
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => toggleMonitoring(wallet.address, wallet.is_active)}
                          className={`p-2 rounded-lg transition-colors ${
                            wallet.is_active === 1
                              ? 'bg-orange-600 hover:bg-orange-700 text-white'
                              : 'bg-green-600 hover:bg-green-700 text-white'
                          }`}
                          title={wallet.is_active === 1 ? 'Stop monitoring' : 'Start monitoring'}
                        >
                          {wallet.is_active === 1 ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <a
                          href={`/dev/${wallet.address}`}
                          className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                          title="View details"
                        >
                          <Eye className="w-4 h-4" />
                        </a>
                        <button
                          onClick={() => deleteWallet(wallet.address)}
                          className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                          title="Delete wallet"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer Info */}
      <div className="mt-6 text-center text-sm text-gray-400">
        Showing {filteredWallets.length} of {wallets.length} wallet(s)
      </div>
    </div>
  );
}
