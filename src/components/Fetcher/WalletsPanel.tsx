import React, { useState, useEffect } from 'react';
import { Wallet, Plus, Key, Copy, Trash2, Eye, EyeOff, Shield, CheckCircle, DollarSign, Download } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingStore } from '../../stores/tradingStore';
import { toast } from 'react-hot-toast';
import { config } from '../../config';

export const WalletsPanel: React.FC = () => {
  const { wallets, fetchWallets, createWallet, importWallet, deleteWallet, loading } = useTradingStore();
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importKey, setImportKey] = useState('');
  const [walletName, setWalletName] = useState('');
  const [selectedWallet, setSelectedWallet] = useState<string | null>(null);
  const [showKeys, setShowKeys] = useState<{ [key: string]: boolean }>({});

  useEffect(() => {
    fetchWallets();
  }, []);

  const handleCreateWallet = async () => {
    if (!walletName.trim()) {
      toast.error('Please enter a wallet name');
      return;
    }

    try {
      await createWallet(walletName);
      toast.success('Wallet created successfully');
      setShowCreateModal(false);
      setWalletName('');
    } catch (error) {
      toast.error('Failed to create wallet');
    }
  };

  const handleImportWallet = async () => {
    if (!walletName.trim() || !importKey.trim()) {
      toast.error('Please fill all fields');
      return;
    }

    try {
      await importWallet(walletName, importKey);
      toast.success('Wallet imported successfully');
      setShowImportModal(false);
      setWalletName('');
      setImportKey('');
    } catch (error) {
      toast.error('Failed to import wallet');
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied to clipboard`);
  };

  const toggleShowKey = (walletId: string) => {
    setShowKeys(prev => ({ ...prev, [walletId]: !prev[walletId] }));
  };

  const handleExportWallet = async (walletId: string, walletName: string) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets/${walletId}/export`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to export wallet');
      }
      
      const data = await response.json();
      
      // Create a text file with the keys
      const content = `Wallet: ${walletName}\nPublic Key: ${data.publicKey}\nPrivate Key: ${data.privateKey}\n\nWARNING: Keep this private key secure!`;
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `wallet_${walletName.replace(/\s+/g, '_')}_keys.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Wallet keys exported successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to export wallet');
    }
  };

  const handleWithdraw = async (walletId: string, walletName: string, balance: number) => {
    const amount = prompt(`Withdraw SOL from ${walletName}\nBalance: ${balance?.toFixed(4) || '0'} SOL\n\nAmount to withdraw:`);
    
    if (!amount || parseFloat(amount) <= 0) return;
    
    if (parseFloat(amount) > balance) {
      toast.error('Insufficient balance');
      return;
    }
    
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets/${walletId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ amount: parseFloat(amount) })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to withdraw');
      }
      
      const data = await response.json();
      toast.success(`Successfully withdrew ${data.amount} SOL to ${data.recipient.slice(0, 4)}...${data.recipient.slice(-4)}`);
      
      // Refresh wallets to update balance
      await fetchWallets();
    } catch (error: any) {
      toast.error(error.message || 'Failed to process withdrawal');
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Wallet className="w-6 h-6" />
          Trading Wallets
        </h2>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 
                     rounded-lg flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Wallet
          </button>
          <button
            onClick={() => setShowImportModal(true)}
            className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/50 
                     rounded-lg flex items-center gap-2 transition-colors"
          >
            <Key className="w-4 h-4" />
            Import Wallet
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Wallet className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No wallets yet. Create or import one to start trading.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {wallets.map((wallet, index) => (
            <motion.div
              key={wallet.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.1 }}
              className={`p-4 rounded-xl border transition-all cursor-pointer
                ${selectedWallet === wallet.id 
                  ? 'bg-cyan-500/10 border-cyan-500/50' 
                  : 'bg-gray-800/50 border-gray-700/50 hover:border-cyan-500/30'}`}
              onClick={() => setSelectedWallet(wallet.id)}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-5 h-5 text-cyan-400" />
                  <h3 className="font-semibold text-white">{wallet.name}</h3>
                  {wallet.isDefault && (
                    <span className="px-2 py-0.5 text-xs bg-green-500/20 text-green-400 rounded">
                      Default
                    </span>
                  )}
                </div>
                <Shield className="w-4 h-4 text-green-400" />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Address:</span>
                  <div className="flex items-center gap-1">
                    <code className="text-cyan-300 text-xs">
                      {wallet.publicKey ? `${wallet.publicKey.slice(0, 4)}...${wallet.publicKey.slice(-4)}` : 'Loading...'}
                    </code>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (wallet.publicKey) {
                          copyToClipboard(wallet.publicKey, 'Address');
                        }
                      }}
                      className="p-1 hover:bg-gray-700/50 rounded"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-gray-400">Balance:</span>
                  <span className="text-white font-medium">
                    {wallet.balance?.toFixed(4) || '0.0000'} SOL
                  </span>
                </div>

                {wallet.encrypted && (
                  <div className="flex items-center gap-1 text-green-400 text-xs">
                    <CheckCircle className="w-3 h-3" />
                    <span>Encrypted</span>
                  </div>
                )}
              </div>

              <div className="flex gap-2 mt-3">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleShowKey(wallet.id);
                  }}
                  className="px-2 py-1 bg-gray-700/50 hover:bg-gray-700 
                           rounded text-xs flex items-center gap-1"
                >
                  {showKeys[wallet.id] ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                  {showKeys[wallet.id] ? 'Hide' : 'Show'} Key
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleExportWallet(wallet.id, wallet.name);
                  }}
                  className="px-2 py-1 bg-blue-500/20 hover:bg-blue-500/30 
                           rounded text-xs flex items-center gap-1"
                  title="Export wallet keys"
                >
                  <Download className="w-3 h-3" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    await handleWithdraw(wallet.id, wallet.name, wallet.balance || 0);
                  }}
                  className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 
                           rounded text-xs flex items-center gap-1"
                  title="Withdraw to your connected wallet"
                >
                  <DollarSign className="w-3 h-3" />
                </button>
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (confirm('Are you sure you want to delete this wallet?')) {
                      await deleteWallet(wallet.id);
                      toast.success('Wallet deleted');
                    }
                  }}
                  className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 
                           rounded text-xs flex items-center gap-1"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>

              {showKeys[wallet.id] && wallet.privateKey && (
                <div className="mt-3 p-2 bg-gray-900/50 rounded text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-gray-400">Private Key:</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        if (wallet.privateKey) {
                          copyToClipboard(wallet.privateKey, 'Private key');
                        }
                      }}
                      className="p-1 hover:bg-gray-700/50 rounded"
                    >
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                  <code className="text-orange-400 break-all text-xs">
                    {wallet.privateKey ? `${wallet.privateKey.slice(0, 20)}...` : 'Encrypted'}
                  </code>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}

      {/* Create Wallet Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 border border-cyan-500/30 rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-cyan-400 mb-4">Create New Wallet</h3>
            <input
              type="text"
              placeholder="Wallet Name"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-4
                       focus:outline-none focus:border-cyan-500"
            />
            <div className="flex gap-2">
              <button
                onClick={handleCreateWallet}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-cyan-500 hover:bg-cyan-600 rounded-lg
                         font-medium transition-colors disabled:opacity-50"
              >
                Create Wallet
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setWalletName('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Import Wallet Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-gray-900 border border-purple-500/30 rounded-xl p-6 max-w-md w-full mx-4"
          >
            <h3 className="text-xl font-bold text-purple-400 mb-4">Import Wallet</h3>
            <input
              type="text"
              placeholder="Wallet Name"
              value={walletName}
              onChange={(e) => setWalletName(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-3
                       focus:outline-none focus:border-purple-500"
            />
            <textarea
              placeholder="Private Key (Base58 format)"
              value={importKey}
              onChange={(e) => setImportKey(e.target.value)}
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg mb-4
                       focus:outline-none focus:border-purple-500 h-24 resize-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleImportWallet}
                disabled={loading}
                className="flex-1 px-4 py-2 bg-purple-500 hover:bg-purple-600 rounded-lg
                         font-medium transition-colors disabled:opacity-50"
              >
                Import Wallet
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setWalletName('');
                  setImportKey('');
                }}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
};
