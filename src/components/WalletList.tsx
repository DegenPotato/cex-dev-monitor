import { MonitoredWallet } from '../types';
import { ExternalLink, Power, Sparkles, Calendar, Activity } from 'lucide-react';
import { apiUrl } from '../config';

interface WalletListProps {
  wallets: MonitoredWallet[];
  onUpdate: () => void;
}

export function WalletList({ wallets, onUpdate }: WalletListProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  const toggleWallet = async (address: string) => {
    try {
      await fetch(apiUrl(`/api/wallets/${address}/toggle`), { method: 'POST' });
      onUpdate();
    } catch (error) {
      console.error('Error toggling wallet:', error);
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4">Monitored Wallets</h2>
      
      {wallets.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No wallets discovered yet.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {wallets.map((wallet) => (
            <div
              key={wallet.address}
              className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/10 hover:border-purple-500/30 transition-all"
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-1">
                  <button
                    onClick={() => toggleWallet(wallet.address)}
                    className={`p-2 rounded-lg transition-all ${
                      wallet.is_active
                        ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                        : 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
                    }`}
                  >
                    <Power className="w-4 h-4" />
                  </button>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-white">{formatAddress(wallet.address)}</span>
                      {wallet.is_active && (
                        <span className="bg-green-500/20 text-green-400 px-2 py-0.5 rounded text-xs">
                          Active
                        </span>
                      )}
                      {wallet.is_fresh === 1 && (
                        <span className="bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded text-xs flex items-center gap-1">
                          <Sparkles className="w-3 h-3" />
                          Fresh Wallet
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 mt-1">
                      {wallet.source && (
                        <p className="text-xs text-gray-400">
                          From: {formatAddress(wallet.source)}
                        </p>
                      )}
                      {wallet.wallet_age_days !== undefined && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {wallet.wallet_age_days.toFixed(1)}d old
                        </p>
                      )}
                      {wallet.previous_tx_count !== undefined && (
                        <p className="text-xs text-gray-400 flex items-center gap-1">
                          <Activity className="w-3 h-3" />
                          {wallet.previous_tx_count} TXs
                        </p>
                      )}
                    </div>
                  </div>
                </div>
                <a
                  href={`https://solscan.io/account/${wallet.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-purple-400 hover:text-purple-300"
                >
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
              <div className="text-xs text-gray-400">
                First seen: {formatTime(wallet.first_seen)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
