import { useState, useEffect } from 'react';
import { Play, Pause, Trash2, Plus, Eye, Code, Zap, Wallet, Search } from 'lucide-react';
import { apiUrl } from '../config';
import { WalletDetailsModal } from './WalletDetailsModal';

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
  monitoring_state?: 'catching-up' | 'realtime' | 'idle';
}

type TabType = 'dev' | 'fresh';
type SortBy = 'date' | 'activity' | 'tokens' | 'label';

export function WalletMonitoringTabs() {
  const [activeTab, setActiveTab] = useState<TabType>('dev');
  const [wallets, setWallets] = useState<MonitoredWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [selectedWallet, setSelectedWallet] = useState<MonitoredWallet | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showAddWallet, setShowAddWallet] = useState(false);
  const [newWalletAddress, setNewWalletAddress] = useState('');
  const [newWalletLabel, setNewWalletLabel] = useState('');

  useEffect(() => {
    fetchWallets();
    const interval = setInterval(fetchWallets, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchWallets = async () => {
    try {
      const response = await fetch(apiUrl('/api/wallets'), { credentials: 'include' });
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleWalletMonitoring = async (wallet: MonitoredWallet) => {
    try {
      await fetch(apiUrl(`/api/wallets/${wallet.address}/toggle`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ is_active: wallet.is_active === 1 ? 0 : 1 })
      });
      fetchWallets();
    } catch (error) {
      console.error('Error toggling monitoring:', error);
    }
  };

  const deleteWallet = async (address: string) => {
    if (!confirm('Are you sure you want to delete this wallet?')) return;
    
    try {
      await fetch(apiUrl(`/api/wallets/${address}`), {
        method: 'DELETE',
        credentials: 'include'
      });
      fetchWallets();
    } catch (error) {
      console.error('Error deleting wallet:', error);
    }
  };

  const addWallet = async () => {
    try {
      await fetch(apiUrl('/api/wallets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          address: newWalletAddress,
          label: newWalletLabel || undefined,
          source: 'manual',
          monitoring_type: activeTab === 'dev' ? 'pumpfun' : 'trading',
          rate_limit_rps: 1,
          rate_limit_enabled: true
        })
      });
      setShowAddWallet(false);
      setNewWalletAddress('');
      setNewWalletLabel('');
      fetchWallets();
    } catch (error) {
      console.error('Error adding wallet:', error);
    }
  };

  const openWalletDetails = (wallet: MonitoredWallet) => {
    setSelectedWallet(wallet);
    setShowDetailsModal(true);
  };

  const closeModal = () => {
    setShowDetailsModal(false);
    setSelectedWallet(null);
  };

  // Filter wallets based on active tab
  const filteredWallets = wallets.filter(wallet => {
    const matchesTab = activeTab === 'dev' ? wallet.is_dev === 1 : wallet.is_dev !== 1;
    const matchesSearch = !searchQuery || 
      wallet.address.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (wallet.label?.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTab && matchesSearch;
  });

  // Sort wallets
  const sortedWallets = [...filteredWallets].sort((a, b) => {
    switch (sortBy) {
      case 'activity':
        return (b.last_activity || 0) - (a.last_activity || 0);
      case 'tokens':
        return (b.dev_tokens_count || 0) - (a.dev_tokens_count || 0);
      case 'label':
        return (a.label || '').localeCompare(b.label || '');
      default: // date
        return b.first_seen - a.first_seen;
    }
  });

  return (
    <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-6">
      {/* Header with Tabs */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('dev')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'dev'
                ? 'bg-gradient-to-r from-purple-600 to-purple-700 text-white'
                : 'bg-black/40 text-gray-400 hover:bg-purple-600/20 hover:text-purple-300'
            }`}
          >
            <Code className="w-4 h-4" />
            Dev Wallets
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'dev' ? 'bg-white/20' : 'bg-gray-700'
            }`}>
              {wallets.filter(w => w.is_dev === 1).length}
            </span>
          </button>
          
          <button
            onClick={() => setActiveTab('fresh')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
              activeTab === 'fresh'
                ? 'bg-gradient-to-r from-cyan-600 to-cyan-700 text-white'
                : 'bg-black/40 text-gray-400 hover:bg-cyan-600/20 hover:text-cyan-300'
            }`}
          >
            <Zap className="w-4 h-4" />
            Fresh Wallets
            <span className={`px-2 py-0.5 rounded-full text-xs ${
              activeTab === 'fresh' ? 'bg-white/20' : 'bg-gray-700'
            }`}>
              {wallets.filter(w => w.is_dev !== 1).length}
            </span>
          </button>
        </div>

        <button
          onClick={() => setShowAddWallet(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white font-medium transition-all"
        >
          <Plus className="w-4 h-4" />
          Add Wallet
        </button>
      </div>

      {/* Search and Sort Controls */}
      <div className="flex gap-4 mb-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${activeTab} wallets...`}
            className="w-full bg-black/40 text-white pl-10 pr-4 py-2 rounded-lg border border-cyan-500/20 focus:border-cyan-500/40 focus:outline-none"
          />
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as SortBy)}
          className="bg-black/40 text-white px-4 py-2 rounded-lg border border-cyan-500/20 focus:border-cyan-500/40 focus:outline-none"
        >
          <option value="date">Sort by Date</option>
          <option value="activity">Sort by Activity</option>
          <option value="tokens">Sort by Tokens</option>
          <option value="label">Sort by Label</option>
        </select>
      </div>

      {/* Wallet List */}
      <div className="space-y-2">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-pulse text-cyan-400">Loading wallets...</div>
          </div>
        ) : sortedWallets.length === 0 ? (
          <div className="text-center py-8">
            <div className="text-gray-400 mb-4">
              No {activeTab} wallets found
            </div>
            <button
              onClick={() => setShowAddWallet(true)}
              className="text-cyan-400 hover:text-cyan-300 font-medium"
            >
              Add your first {activeTab} wallet →
            </button>
          </div>
        ) : (
          sortedWallets.map(wallet => (
            <div
              key={wallet.address}
              className={`bg-black/40 rounded-lg border ${
                wallet.is_active === 1 
                  ? 'border-green-500/30' 
                  : 'border-gray-700'
              } p-4 hover:bg-black/60 transition-all`}
            >
              <div className="flex items-center justify-between">
                {/* Wallet Info */}
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <Wallet className={`w-5 h-5 ${
                      wallet.is_active === 1 ? 'text-green-400' : 'text-gray-400'
                    }`} />
                    <div>
                      <div className="flex items-center gap-2">
                        {wallet.label && (
                          <span className="text-white font-medium">{wallet.label}</span>
                        )}
                        <code className="text-cyan-400 text-sm">
                          {wallet.address.slice(0, 6)}...{wallet.address.slice(-4)}
                        </code>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-gray-400 mt-1">
                        <span>Source: {wallet.source}</span>
                        {wallet.dev_tokens_count !== undefined && (
                          <span className="text-purple-400">
                            {wallet.dev_tokens_count} tokens launched
                          </span>
                        )}
                        {wallet.last_activity && (
                          <span>
                            Last: {new Date(wallet.last_activity * 1000).toLocaleString()}
                          </span>
                        )}
                        {wallet.monitoring_state && (
                          <span className={`px-2 py-0.5 rounded-full ${
                            wallet.monitoring_state === 'realtime' 
                              ? 'bg-green-500/20 text-green-400'
                              : wallet.monitoring_state === 'catching-up'
                              ? 'bg-yellow-500/20 text-yellow-400'
                              : 'bg-gray-700 text-gray-400'
                          }`}>
                            {wallet.monitoring_state}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => openWalletDetails(wallet)}
                    className="p-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors"
                    title="View details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => toggleWalletMonitoring(wallet)}
                    className={`p-2 rounded-lg transition-colors ${
                      wallet.is_active === 1
                        ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                        : 'bg-green-600 hover:bg-green-700 text-white'
                    }`}
                    title={wallet.is_active === 1 ? 'Pause monitoring' : 'Start monitoring'}
                  >
                    {wallet.is_active === 1 ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                  </button>
                  <button
                    onClick={() => deleteWallet(wallet.address)}
                    className="p-2 rounded-lg bg-red-600 hover:bg-red-700 text-white transition-colors"
                    title="Delete wallet"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Wallet Modal */}
      {showAddWallet && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-black/90 border border-cyan-500/30 rounded-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-cyan-400 mb-4">
              Add {activeTab === 'dev' ? 'Dev' : 'Fresh'} Wallet
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Wallet Address
                </label>
                <input
                  type="text"
                  value={newWalletAddress}
                  onChange={(e) => setNewWalletAddress(e.target.value)}
                  placeholder="Enter Solana wallet address..."
                  className="w-full bg-black/40 text-white px-4 py-2 rounded-lg border border-cyan-500/20 focus:border-cyan-500/40 focus:outline-none"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Label (optional)
                </label>
                <input
                  type="text"
                  value={newWalletLabel}
                  onChange={(e) => setNewWalletLabel(e.target.value)}
                  placeholder="e.g., Main Dev Wallet"
                  className="w-full bg-black/40 text-white px-4 py-2 rounded-lg border border-cyan-500/20 focus:border-cyan-500/40 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddWallet(false)}
                className="flex-1 px-4 py-2 rounded-lg bg-gray-700 hover:bg-gray-600 text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addWallet}
                disabled={!newWalletAddress}
                className="flex-1 px-4 py-2 rounded-lg bg-gradient-to-r from-cyan-600 to-cyan-700 hover:from-cyan-700 hover:to-cyan-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium transition-all"
              >
                Add Wallet
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallet Details Modal */}
      {showDetailsModal && selectedWallet && (
        <WalletDetailsModal
          wallet={selectedWallet}
          walletType={activeTab}
          onClose={closeModal}
        />
      )}
    </div>
  );
}
