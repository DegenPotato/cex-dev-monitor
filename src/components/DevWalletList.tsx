import { Flame, ExternalLink, TrendingUp, Coins, Calendar } from 'lucide-react';
import { MonitoredWallet } from '../types';

interface DevWalletListProps {
  devWallets: MonitoredWallet[];
  onUpdate?: () => void; // Optional since we don't use it
}

export function DevWalletList({ devWallets }: DevWalletListProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 4)}...${address.slice(-4)}`;
  };

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const formatAge = (days: number) => {
    if (days < 1) return '<1 day';
    return `${Math.floor(days)} days`;
  };

  if (devWallets.length === 0) {
    return (
      <div className="text-center py-12">
        <Flame className="w-16 h-16 text-gray-600 mx-auto mb-4" />
        <p className="text-gray-400 text-lg">No dev wallets detected yet</p>
        <p className="text-gray-500 text-sm mt-2">
          Dev wallets will appear here when detected
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-white flex items-center gap-2">
          <Flame className="w-5 h-5 text-orange-500" />
          Dev Wallets ({devWallets.length})
        </h2>
        <p className="text-gray-400 text-sm">
          Wallets that have deployed pump.fun tokens
        </p>
      </div>

      <div className="grid gap-4">
        {devWallets.map((wallet) => (
          <div
            key={wallet.address}
            className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-lg p-6 hover:border-orange-500/50 transition-all"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <Flame className="w-5 h-5 text-orange-500" />
                  <h3 className="text-lg font-bold text-white font-mono">
                    {formatAddress(wallet.address)}
                  </h3>
                  <a
                    href={`https://solscan.io/account/${wallet.address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-orange-400 mb-1">
                      <Coins className="w-4 h-4" />
                      <span className="text-xs font-medium">Tokens Deployed</span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {wallet.tokens_deployed || 0}
                    </p>
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-blue-400 mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-xs font-medium">Wallet Age</span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {wallet.wallet_age_days ? formatAge(wallet.wallet_age_days) : 'N/A'}
                    </p>
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-purple-400 mb-1">
                      <TrendingUp className="w-4 h-4" />
                      <span className="text-xs font-medium">Total TXs</span>
                    </div>
                    <p className="text-2xl font-bold text-white">
                      {wallet.previous_tx_count || 0}
                    </p>
                  </div>

                  <div className="bg-slate-800/50 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-green-400 mb-1">
                      <Calendar className="w-4 h-4" />
                      <span className="text-xs font-medium">Status</span>
                    </div>
                    <p className="text-lg font-bold">
                      {wallet.is_fresh ? (
                        <span className="text-green-400">✨ Fresh</span>
                      ) : (
                        <span className="text-blue-400">📦 Established</span>
                      )}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-orange-500/20">
              <div className="text-sm text-gray-400">
                First seen: {formatDate(wallet.first_seen)}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    // Open dev wallet detail view in new tab
                    window.open(`/dev/${wallet.address}`, '_blank');
                  }}
                  className="px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 rounded-lg transition-colors text-sm font-medium"
                >
                  View History
                </button>
                <button
                  onClick={() => {
                    window.open(`https://solscan.io/account/${wallet.address}#splTransfer`, '_blank');
                  }}
                  className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 text-orange-300 rounded-lg transition-colors text-sm font-medium"
                >
                  Solscan
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
