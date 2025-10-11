import { useState, useEffect } from 'react';
import { Activity, TrendingUp, Users, Coins, Plus, Edit2, Trash2, Eye, EyeOff, ExternalLink } from 'lucide-react';
import { apiUrl } from '../config';

interface SourceWallet {
  address: string;
  name: string;
  purpose: string;
  is_monitoring: boolean;
  added_at: number;
  total_recipients: number;
  total_sent_sol: number;
  last_activity?: number;
  notes?: string;
  
  // Real-time stats
  active_wallets: number;
  fresh_wallets: number;
  dev_wallets: number;
  total_tokens_deployed: number;
}

interface AddWalletForm {
  address: string;
  name: string;
  purpose: string;
  notes: string;
}

export function SourceWalletsPanel() {
  const [wallets, setWallets] = useState<SourceWallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingWallet, setEditingWallet] = useState<string | null>(null);
  const [formData, setFormData] = useState<AddWalletForm>({
    address: '',
    name: '',
    purpose: 'funding',
    notes: ''
  });

  const fetchWallets = async () => {
    try {
      const response = await fetch(apiUrl('/api/source-wallets'));
      const data = await response.json();
      setWallets(data);
    } catch (error) {
      console.error('Error fetching source wallets:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchWallets();
    const interval = setInterval(fetchWallets, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, []);

  const handleToggleMonitoring = async (address: string) => {
    try {
      await fetch(apiUrl(`/api/source-wallets/${address}/toggle`), {
        method: 'POST'
      });
      fetchWallets();
    } catch (error) {
      console.error('Error toggling monitoring:', error);
      alert('Error toggling monitoring');
    }
  };

  const handleAddWallet = async () => {
    if (!formData.address || !formData.name) {
      alert('Address and name are required');
      return;
    }

    try {
      const response = await fetch(apiUrl('/api/source-wallets'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          is_monitoring: 0 // Start with monitoring OFF by default
        })
      });

      if (response.ok) {
        setShowAddForm(false);
        setFormData({ address: '', name: '', purpose: 'funding', notes: '' });
        fetchWallets();
      } else {
        const error = await response.json();
        alert(`Error: ${error.error}`);
      }
    } catch (error) {
      console.error('Error adding wallet:', error);
      alert('Error adding wallet');
    }
  };

  const handleUpdateWallet = async (address: string) => {
    try {
      await fetch(apiUrl(`/api/source-wallets/${address}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          purpose: formData.purpose,
          notes: formData.notes
        })
      });
      setEditingWallet(null);
      setFormData({ address: '', name: '', purpose: 'funding', notes: '' });
      fetchWallets();
    } catch (error) {
      console.error('Error updating wallet:', error);
      alert('Error updating wallet');
    }
  };

  const handleDeleteWallet = async (address: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) {
      return;
    }

    try {
      await fetch(apiUrl(`/api/source-wallets/${address}`), {
        method: 'DELETE'
      });
      fetchWallets();
    } catch (error) {
      console.error('Error deleting wallet:', error);
      alert('Error deleting wallet');
    }
  };

  const startEdit = (wallet: SourceWallet) => {
    setEditingWallet(wallet.address);
    setFormData({
      address: wallet.address,
      name: wallet.name,
      purpose: wallet.purpose,
      notes: wallet.notes || ''
    });
  };

  const cancelEdit = () => {
    setEditingWallet(null);
    setFormData({ address: '', name: '', purpose: 'funding', notes: '' });
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500 mx-auto"></div>
        <p className="text-gray-400 mt-4">Loading source wallets...</p>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Source Wallets</h2>
          <p className="text-gray-400 mt-1">Manage CEX wallets, funding sources, and monitoring targets</p>
        </div>
        <button
          onClick={() => setShowAddForm(true)}
          className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Wallet
        </button>
      </div>

      {/* Add Wallet Form */}
      {showAddForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
            <h3 className="text-xl font-bold text-white mb-4">Add Source Wallet</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Wallet Address *
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                  placeholder="Enter Solana address"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                  placeholder="e.g., CEX 2, Binance Wallet"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Purpose
                </label>
                <select
                  value={formData.purpose}
                  onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                >
                  <option value="funding">Funding Wallet</option>
                  <option value="cex">CEX Exchange</option>
                  <option value="bridge">Bridge</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                  placeholder="Optional notes about this wallet"
                  rows={3}
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleAddWallet}
                className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
              >
                Add Wallet
              </button>
              <button
                onClick={() => {
                  setShowAddForm(false);
                  setFormData({ address: '', name: '', purpose: 'funding', notes: '' });
                }}
                className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Wallets Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {wallets.map((wallet) => (
          <div
            key={wallet.address}
            className={`bg-slate-800 rounded-lg p-6 border-2 transition-all ${
              wallet.is_monitoring
                ? 'border-green-500/50 shadow-lg shadow-green-500/20'
                : 'border-slate-700'
            }`}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-lg font-bold text-white">{wallet.name}</h3>
                  <span className="text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-300">
                    {wallet.purpose}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-400">
                  <span>{formatAddress(wallet.address)}</span>
                  <a
                    href={`https://solscan.io/account/${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleToggleMonitoring(wallet.address)}
                  className={`p-2 rounded-lg transition-colors ${
                    wallet.is_monitoring
                      ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                      : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                  }`}
                  title={wallet.is_monitoring ? 'Monitoring Active' : 'Monitoring Inactive'}
                >
                  {wallet.is_monitoring ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => startEdit(wallet)}
                  className="p-2 bg-slate-700 hover:bg-slate-600 text-gray-400 rounded-lg transition-colors"
                  title="Edit"
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleDeleteWallet(wallet.address, wallet.name)}
                  className="p-2 bg-slate-700 hover:bg-red-500/20 text-gray-400 hover:text-red-400 rounded-lg transition-colors"
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="w-4 h-4 text-blue-400" />
                  <span className="text-xs text-gray-400">Recipients</span>
                </div>
                <div className="text-xl font-bold text-white">{wallet.total_recipients}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {wallet.active_wallets} active
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <TrendingUp className="w-4 h-4 text-green-400" />
                  <span className="text-xs text-gray-400">Total Sent</span>
                </div>
                <div className="text-xl font-bold text-white">{wallet.total_sent_sol.toFixed(2)} SOL</div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Activity className="w-4 h-4 text-yellow-400" />
                  <span className="text-xs text-gray-400">Fresh Wallets</span>
                </div>
                <div className="text-xl font-bold text-white">{wallet.fresh_wallets}</div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Coins className="w-4 h-4 text-purple-400" />
                  <span className="text-xs text-gray-400">Dev Wallets</span>
                </div>
                <div className="text-xl font-bold text-white">{wallet.dev_wallets}</div>
                <div className="text-xs text-gray-500 mt-1">
                  {wallet.total_tokens_deployed} tokens
                </div>
              </div>
            </div>

            {/* Notes & Activity */}
            {wallet.notes && (
              <div className="text-sm text-gray-400 bg-slate-700/30 rounded p-2 mb-2">
                {wallet.notes}
              </div>
            )}
            
            <div className="text-xs text-gray-500 flex justify-between">
              <span>Added: {formatDate(wallet.added_at)}</span>
              {wallet.last_activity && (
                <span>Last Activity: {formatDate(wallet.last_activity)}</span>
              )}
            </div>

            {/* Edit Form */}
            {editingWallet === wallet.address && (
              <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                <div className="bg-slate-800 rounded-lg p-6 w-full max-w-lg">
                  <h3 className="text-xl font-bold text-white mb-4">Edit {wallet.name}</h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Name</label>
                      <input
                        type="text"
                        value={formData.name}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Purpose</label>
                      <select
                        value={formData.purpose}
                        onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                        className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                      >
                        <option value="funding">Funding Wallet</option>
                        <option value="cex">CEX Exchange</option>
                        <option value="bridge">Bridge</option>
                        <option value="other">Other</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">Notes</label>
                      <textarea
                        value={formData.notes}
                        onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                        className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={() => handleUpdateWallet(wallet.address)}
                      className="flex-1 bg-purple-600 hover:bg-purple-700 text-white py-2 rounded-lg transition-colors"
                    >
                      Save Changes
                    </button>
                    <button
                      onClick={cancelEdit}
                      className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {wallets.length === 0 && (
        <div className="text-center py-12">
          <div className="text-gray-500 text-lg mb-4">No source wallets yet</div>
          <button
            onClick={() => setShowAddForm(true)}
            className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-lg transition-colors"
          >
            <Plus className="w-5 h-5" />
            Add Your First Wallet
          </button>
        </div>
      )}
    </div>
  );
}
