import React, { useState, useEffect } from 'react';
import {
  Wallet, Plus, Import, Download, Key, Shield, Zap,
  ArrowUpRight, ArrowDownLeft, Send, Settings, 
  DollarSign, TrendingUp, AlertTriangle, CheckCircle,
  Copy, ExternalLink, RefreshCw, Eye, EyeOff, 
  Activity, Target, ChevronDown, ChevronRight
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { config } from '../config';

interface TradingWallet {
  id: number;
  walletAddress: string;
  walletName: string;
  isDefault: boolean;
  isActive: boolean;
  solBalance: number;
  lastUsedAt?: number;
  createdAt: number;
}

interface Transaction {
  id: number;
  signature: string;
  txType: 'buy' | 'sell' | 'transfer';
  status: string;
  tokenMint: string;
  tokenSymbol?: string;
  amountIn: number;
  amountOut: number;
  totalFeeSol: number;
  createdAt: number;
  confirmedAt?: number;
  errorMessage?: string;
}

const FetcherTab: React.FC = () => {
  const { isAuthenticated } = useAuth();
  const [wallets, setWallets] = useState<TradingWallet[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<TradingWallet | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeView, setActiveView] = useState<'wallets' | 'trade' | 'history'>('wallets');
  const [loading, setLoading] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const [privateKey, setPrivateKey] = useState('');
  const [walletName, setWalletName] = useState('');
  const [importKey, setImportKey] = useState('');

  // Trade form state
  const [tradeAction, setTradeAction] = useState<'buy' | 'sell'>('buy');
  const [tokenAddress, setTokenAddress] = useState('');
  const [tradeAmount, setTradeAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [priorityFee, setPriorityFee] = useState<'medium' | 'high' | 'turbo'>('medium');
  const [jitoTip, setJitoTip] = useState('0');

  useEffect(() => {
    if (isAuthenticated) {
      loadWallets();
      loadTransactions();
    }
  }, [isAuthenticated]);

  const loadWallets = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setWallets(data.wallets || []);
        
        // Select default wallet
        const defaultWallet = data.wallets?.find((w: TradingWallet) => w.isDefault);
        if (defaultWallet) {
          setSelectedWallet(defaultWallet);
        }
      }
    } catch (error) {
      console.error('Failed to load wallets:', error);
    }
  };

  const loadTransactions = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/transactions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setTransactions(data.transactions || []);
      }
    } catch (error) {
      console.error('Failed to load transactions:', error);
    }
  };

  const createWallet = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ walletName: walletName || undefined })
      });

      if (response.ok) {
        const data = await response.json();
        await loadWallets();
        setWalletName('');
        alert(`✅ Wallet created: ${data.wallet.walletAddress}`);
      } else {
        alert('Failed to create wallet');
      }
    } catch (error) {
      console.error('Error creating wallet:', error);
      alert('Error creating wallet');
    } finally {
      setLoading(false);
    }
  };

  const importWallet = async () => {
    if (!importKey) {
      alert('Please enter a private key');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets/import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          privateKey: importKey,
          walletName: walletName || undefined 
        })
      });

      if (response.ok) {
        const data = await response.json();
        await loadWallets();
        setShowImportModal(false);
        setImportKey('');
        setWalletName('');
        alert(`✅ Wallet imported: ${data.wallet.walletAddress}`);
      } else {
        const error = await response.json();
        alert(`Failed to import wallet: ${error.error}`);
      }
    } catch (error) {
      console.error('Error importing wallet:', error);
      alert('Error importing wallet');
    } finally {
      setLoading(false);
    }
  };

  const exportWallet = async (wallet: TradingWallet) => {
    if (!confirm('⚠️ WARNING: This will reveal your private key. Make sure no one is watching. Continue?')) {
      return;
    }

    try {
      const response = await fetch(
        `${config.apiUrl}/api/trading/wallets/${wallet.walletAddress}/export`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        setPrivateKey(data.privateKey);
        setShowPrivateKey(true);
      } else {
        alert('Failed to export wallet');
      }
    } catch (error) {
      console.error('Error exporting wallet:', error);
      alert('Error exporting wallet');
    }
  };

  const setDefaultWallet = async (walletId: number) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/trading/wallets/${walletId}/default`,
        { 
          method: 'POST',
          credentials: 'include' 
        }
      );

      if (response.ok) {
        await loadWallets();
      }
    } catch (error) {
      console.error('Error setting default wallet:', error);
    }
  };

  const refreshBalance = async (wallet: TradingWallet) => {
    try {
      const response = await fetch(
        `${config.apiUrl}/api/trading/wallets/${wallet.id}/balance`,
        { credentials: 'include' }
      );

      if (response.ok) {
        await loadWallets();
      }
    } catch (error) {
      console.error('Error refreshing balance:', error);
    }
  };

  const executeTrade = async () => {
    if (!selectedWallet) {
      alert('Please select a wallet');
      return;
    }

    if (!tokenAddress || !tradeAmount) {
      alert('Please fill in all required fields');
      return;
    }

    setLoading(true);
    try {
      const endpoint = tradeAction === 'buy' ? 'buy' : 'sell';
      const response = await fetch(`${config.apiUrl}/api/trading/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          walletAddress: selectedWallet.walletAddress,
          tokenMint: tokenAddress,
          amount: parseFloat(tradeAmount),
          slippageBps: parseFloat(slippage) * 100,
          priorityLevel: priorityFee,
          jitoTip: parseFloat(jitoTip) || undefined
        })
      });

      if (response.ok) {
        const data = await response.json();
        alert(`✅ ${tradeAction === 'buy' ? 'Buy' : 'Sell'} successful!\nSignature: ${data.signature}`);
        await loadTransactions();
        await loadWallets();
        
        // Clear form
        setTokenAddress('');
        setTradeAmount('');
      } else {
        const error = await response.json();
        alert(`Trade failed: ${error.error}`);
      }
    } catch (error) {
      console.error('Trade error:', error);
      alert('Trade failed');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('Copied to clipboard');
  };

  const WalletCard: React.FC<{ wallet: TradingWallet }> = ({ wallet }) => (
    <div className={`bg-black/40 backdrop-blur-sm border rounded-xl p-4 ${
      wallet.isDefault ? 'border-cyan-400' : 'border-cyan-500/20'
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <Wallet className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-bold text-cyan-300 flex items-center gap-2">
              {wallet.walletName}
              {wallet.isDefault && (
                <span className="text-xs px-2 py-0.5 bg-cyan-500/20 rounded-full text-cyan-400">
                  DEFAULT
                </span>
              )}
            </div>
            <div className="text-xs text-gray-400 font-mono">
              {wallet.walletAddress.slice(0, 8)}...{wallet.walletAddress.slice(-6)}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-bold text-green-400">
            {wallet.solBalance.toFixed(4)} SOL
          </div>
          <button
            onClick={() => refreshBalance(wallet)}
            className="text-xs text-gray-400 hover:text-cyan-400 transition-colors"
          >
            <RefreshCw className="w-3 h-3 inline mr-1" />
            Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => {
            setSelectedWallet(wallet);
            setActiveView('trade');
          }}
          className="flex-1 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 text-sm font-medium transition-all"
        >
          Trade
        </button>
        <button
          onClick={() => exportWallet(wallet)}
          className="px-3 py-2 bg-purple-500/20 hover:bg-purple-500/30 rounded-lg text-purple-400 transition-all"
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          onClick={() => copyToClipboard(wallet.walletAddress)}
          className="px-3 py-2 bg-gray-500/20 hover:bg-gray-500/30 rounded-lg text-gray-400 transition-all"
        >
          <Copy className="w-4 h-4" />
        </button>
        {!wallet.isDefault && (
          <button
            onClick={() => setDefaultWallet(wallet.id)}
            className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 transition-all"
          >
            <CheckCircle className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-black/40 backdrop-blur-sm border-b border-cyan-500/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Zap className="w-8 h-8 text-cyan-400" />
            <div>
              <h2 className="text-2xl font-bold text-cyan-300">Fetcher - Universal Trading Bot</h2>
              <p className="text-sm text-gray-400">Secure wallet management & MEV-protected trading</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveView('wallets')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeView === 'wallets' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Wallet className="w-4 h-4 inline mr-2" />
              Wallets
            </button>
            <button
              onClick={() => setActiveView('trade')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeView === 'trade' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
              disabled={!selectedWallet}
            >
              <TrendingUp className="w-4 h-4 inline mr-2" />
              Trade
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-4 py-2 rounded-lg transition-all ${
                activeView === 'history' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4 inline mr-2" />
              History
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeView === 'wallets' && (
          <div className="space-y-6">
            {/* Wallet Actions */}
            <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
              <h3 className="text-lg font-bold text-cyan-300 mb-4">Wallet Management</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Create Wallet */}
                <div className="space-y-3">
                  <input
                    type="text"
                    placeholder="Wallet name (optional)"
                    value={walletName}
                    onChange={(e) => setWalletName(e.target.value)}
                    className="w-full px-4 py-2 bg-black/40 border border-cyan-500/20 rounded-lg text-gray-300 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    onClick={createWallet}
                    disabled={loading}
                    className="w-full py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-bold text-white transition-all disabled:opacity-50"
                  >
                    <Plus className="w-4 h-4 inline mr-2" />
                    Create New Wallet
                  </button>
                </div>

                {/* Import Wallet */}
                <div className="space-y-3">
                  <button
                    onClick={() => setShowImportModal(true)}
                    className="w-full py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 rounded-lg font-bold text-white transition-all"
                  >
                    <Import className="w-4 h-4 inline mr-2" />
                    Import Existing Wallet
                  </button>
                  <p className="text-xs text-gray-400 text-center">
                    Import using private key (Base58 or array format)
                  </p>
                </div>
              </div>
            </div>

            {/* Wallet List */}
            <div className="space-y-4">
              <h3 className="text-lg font-bold text-cyan-300">Your Wallets ({wallets.length})</h3>
              
              {wallets.length === 0 ? (
                <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-12 text-center">
                  <Wallet className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400 mb-6">No wallets yet. Create or import one to start trading.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {wallets.map(wallet => (
                    <WalletCard key={wallet.id} wallet={wallet} />
                  ))}
                </div>
              )}
            </div>

            {/* Security Notice */}
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Shield className="w-5 h-5 text-yellow-400 mt-0.5" />
                <div>
                  <p className="text-yellow-400 font-medium">Security Notice</p>
                  <p className="text-sm text-gray-300 mt-1">
                    Private keys are encrypted with AES-256 and stored securely. Never share your private keys with anyone.
                    We recommend using separate wallets for trading and storage.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Import Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-cyan-500/30 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Import Wallet</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Wallet Name (optional)</label>
                <input
                  type="text"
                  placeholder="My Trading Wallet"
                  value={walletName}
                  onChange={(e) => setWalletName(e.target.value)}
                  className="w-full px-4 py-2 bg-black/40 border border-cyan-500/20 rounded-lg text-gray-300 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Private Key</label>
                <textarea
                  placeholder="Enter your private key (Base58 or array format)"
                  value={importKey}
                  onChange={(e) => setImportKey(e.target.value)}
                  rows={3}
                  className="w-full px-4 py-2 bg-black/40 border border-cyan-500/20 rounded-lg text-gray-300 font-mono text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={importWallet}
                disabled={loading || !importKey}
                className="flex-1 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 rounded-lg font-bold text-white transition-all disabled:opacity-50"
              >
                {loading ? 'Importing...' : 'Import Wallet'}
              </button>
              <button
                onClick={() => {
                  setShowImportModal(false);
                  setImportKey('');
                  setWalletName('');
                }}
                className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-all"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Private Key Display Modal */}
      {showPrivateKey && privateKey && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 rounded-2xl border border-cyan-500/30 max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-red-400 mb-4">⚠️ Private Key</h3>
            
            <div className="bg-black/60 rounded-lg p-4 mb-4">
              <p className="text-xs text-gray-400 mb-2">Your private key (keep this secret!):</p>
              <p className="font-mono text-xs text-gray-300 break-all">{privateKey}</p>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => copyToClipboard(privateKey)}
                className="flex-1 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 rounded-lg text-cyan-400 font-medium transition-all"
              >
                <Copy className="w-4 h-4 inline mr-2" />
                Copy to Clipboard
              </button>
              <button
                onClick={() => {
                  setShowPrivateKey(false);
                  setPrivateKey('');
                }}
                className="px-6 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-lg text-red-400 font-medium transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FetcherTab;
