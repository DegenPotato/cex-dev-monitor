import { useState, useEffect } from 'react';
import { X, TrendingUp, DollarSign, Clock, Target, Activity, ExternalLink, Zap, Award, AlertCircle, BarChart3, Users, Coins, Flame } from 'lucide-react';
import { apiUrl } from '../config';

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

interface TokenLaunch {
  mint_address: string;
  name?: string;
  symbol?: string;
  timestamp: number;
  starting_mcap?: number;
  current_mcap?: number;
  ath_mcap?: number;
  launchpad_completed?: number;
  migration_percentage?: number;
}

interface WalletMetrics {
  totalLaunches: number;
  successfulGraduations: number;
  totalVolume: number;
  averageMcap: number;
  bestPerformer?: TokenLaunch;
  recentLaunches: TokenLaunch[];
  tradingPatterns?: {
    avgHoldTime: number;
    profitRatio: number;
    totalProfit: number;
  };
}

interface WalletDetailsModalProps {
  wallet: MonitoredWallet;
  walletType: 'dev' | 'fresh';
  onClose: () => void;
}

export function WalletDetailsModal({ wallet, walletType, onClose }: WalletDetailsModalProps) {
  const [metrics, setMetrics] = useState<WalletMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'overview' | 'launches' | 'patterns'>('overview');

  useEffect(() => {
    fetchWalletMetrics();
  }, [wallet.address]);

  const fetchWalletMetrics = async () => {
    try {
      // For dev wallets, fetch token launches
      if (walletType === 'dev') {
        const tokensResponse = await fetch(apiUrl(`/api/tokens?creator=${wallet.address}`), { 
          credentials: 'include' 
        });
        const tokens = await tokensResponse.json();

        const successfulGraduations = tokens.filter((t: any) => t.launchpad_completed === 1).length;
        const totalVolume = tokens.reduce((sum: number, t: any) => sum + (t.current_mcap || 0), 0);
        const avgMcap = tokens.length > 0 ? totalVolume / tokens.length : 0;
        const bestPerformer = tokens.sort((a: any, b: any) => 
          (b.ath_mcap || 0) - (a.ath_mcap || 0)
        )[0];

        setMetrics({
          totalLaunches: tokens.length,
          successfulGraduations,
          totalVolume,
          averageMcap: avgMcap,
          bestPerformer,
          recentLaunches: tokens.slice(0, 10)
        });
      } else {
        // For fresh wallets, fetch trading patterns
        // This would need additional API endpoints
        setMetrics({
          totalLaunches: 0,
          successfulGraduations: 0,
          totalVolume: wallet.transaction_count || 0,
          averageMcap: 0,
          recentLaunches: [],
          tradingPatterns: {
            avgHoldTime: 0,
            profitRatio: 0,
            totalProfit: 0
          }
        });
      }
    } catch (error) {
      console.error('Error fetching wallet metrics:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatMcap = (mcap: number | null | undefined) => {
    if (!mcap) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(2)}K`;
    return `$${mcap.toFixed(2)}`;
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div 
        className="bg-black/95 border-2 border-cyan-500/30 rounded-2xl max-w-6xl w-full mx-4 max-h-[90vh] overflow-hidden shadow-2xl shadow-cyan-500/20"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-900/50 to-cyan-900/50 border-b border-cyan-500/30 p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-3 mb-2">
                {walletType === 'dev' ? (
                  <div className="p-2 rounded-lg bg-purple-600/20 border border-purple-500/40">
                    <Award className="w-6 h-6 text-purple-400" />
                  </div>
                ) : (
                  <div className="p-2 rounded-lg bg-cyan-600/20 border border-cyan-500/40">
                    <Zap className="w-6 h-6 text-cyan-400" />
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-bold text-white">
                    {wallet.label || 'Wallet'} Details
                  </h2>
                  <div className="flex items-center gap-3 text-sm text-gray-400 mt-1">
                    <code className="text-cyan-400">
                      {wallet.address.slice(0, 8)}...{wallet.address.slice(-8)}
                    </code>
                    <a
                      href={`https://solscan.io/account/${wallet.address}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-cyan-400 hover:text-cyan-300"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Solscan
                    </a>
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-red-600/20 text-gray-400 hover:text-red-400 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => setActiveView('overview')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeView === 'overview'
                  ? 'bg-cyan-600/30 text-cyan-400 border border-cyan-500/40'
                  : 'bg-black/30 text-gray-400 hover:bg-cyan-600/20 hover:text-cyan-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveView('launches')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeView === 'launches'
                  ? 'bg-cyan-600/30 text-cyan-400 border border-cyan-500/40'
                  : 'bg-black/30 text-gray-400 hover:bg-cyan-600/20 hover:text-cyan-300'
              }`}
            >
              {walletType === 'dev' ? 'Token Launches' : 'Trading History'}
            </button>
            <button
              onClick={() => setActiveView('patterns')}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                activeView === 'patterns'
                  ? 'bg-cyan-600/30 text-cyan-400 border border-cyan-500/40'
                  : 'bg-black/30 text-gray-400 hover:bg-cyan-600/20 hover:text-cyan-300'
              }`}
            >
              Patterns & Analysis
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-pulse text-cyan-400">Loading metrics...</div>
            </div>
          ) : (
            <>
              {/* Overview Tab */}
              {activeView === 'overview' && metrics && (
                <div className="space-y-6">
                  {/* Key Metrics */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Total Launches</span>
                        <Flame className="w-4 h-4 text-orange-400" />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {metrics.totalLaunches}
                      </div>
                      {walletType === 'dev' && (
                        <div className="text-xs text-gray-500 mt-1">
                          {metrics.successfulGraduations} graduated
                        </div>
                      )}
                    </div>

                    <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Success Rate</span>
                        <Target className="w-4 h-4 text-green-400" />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {metrics.totalLaunches > 0 
                          ? `${((metrics.successfulGraduations / metrics.totalLaunches) * 100).toFixed(1)}%`
                          : 'N/A'
                        }
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Graduation ratio
                      </div>
                    </div>

                    <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Total Volume</span>
                        <DollarSign className="w-4 h-4 text-yellow-400" />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {formatMcap(metrics.totalVolume)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Combined market cap
                      </div>
                    </div>

                    <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-gray-400 text-sm">Avg MCap</span>
                        <BarChart3 className="w-4 h-4 text-cyan-400" />
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {formatMcap(metrics.averageMcap)}
                      </div>
                      <div className="text-xs text-gray-500 mt-1">
                        Per token average
                      </div>
                    </div>
                  </div>

                  {/* Best Performer */}
                  {metrics.bestPerformer && (
                    <div className="bg-gradient-to-r from-yellow-900/20 to-orange-900/20 rounded-xl border border-yellow-500/30 p-6">
                      <h3 className="text-lg font-bold text-yellow-400 mb-4 flex items-center gap-2">
                        <Award className="w-5 h-5" />
                        Best Performing Token
                      </h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div>
                          <div className="text-sm text-gray-400">Token</div>
                          <div className="text-white font-medium">
                            {metrics.bestPerformer.symbol || 'Unknown'}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">ATH MCap</div>
                          <div className="text-white font-medium">
                            {formatMcap(metrics.bestPerformer.ath_mcap)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Current MCap</div>
                          <div className="text-white font-medium">
                            {formatMcap(metrics.bestPerformer.current_mcap)}
                          </div>
                        </div>
                        <div>
                          <div className="text-sm text-gray-400">Launched</div>
                          <div className="text-white font-medium">
                            {new Date(metrics.bestPerformer.timestamp * 1000).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Activity Timeline */}
                  <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                    <h3 className="text-lg font-bold text-cyan-400 mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Wallet Activity
                    </h3>
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">First Seen</span>
                        <span className="text-white">
                          {new Date(wallet.first_seen * 1000).toLocaleString()}
                        </span>
                      </div>
                      {wallet.last_activity && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Last Activity</span>
                          <span className="text-white">
                            {new Date(wallet.last_activity * 1000).toLocaleString()}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Total Transactions</span>
                        <span className="text-white">
                          {wallet.transaction_count || 0}
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Monitoring Status</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          wallet.is_active === 1
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-gray-700 text-gray-400'
                        }`}>
                          {wallet.is_active === 1 ? 'Active' : 'Paused'}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Launches Tab */}
              {activeView === 'launches' && metrics && (
                <div className="space-y-4">
                  <h3 className="text-lg font-bold text-cyan-400 mb-4">
                    Recent Token Launches
                  </h3>
                  {metrics.recentLaunches.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No token launches found
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {metrics.recentLaunches.map((token) => (
                        <div
                          key={token.mint_address}
                          className="bg-black/40 rounded-lg border border-cyan-500/20 p-4 hover:bg-black/60 transition-all"
                        >
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-white font-medium">
                                  {token.symbol || 'Unknown'}
                                </span>
                                {token.name && (
                                  <span className="text-gray-400 text-sm">
                                    {token.name}
                                  </span>
                                )}
                                {token.launchpad_completed === 1 && (
                                  <span className="px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 text-xs">
                                    Graduated
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-gray-400">
                                <span>
                                  {new Date(token.timestamp * 1000).toLocaleString()}
                                </span>
                                <span>
                                  MCap: {formatMcap(token.current_mcap)}
                                </span>
                                {token.ath_mcap && (
                                  <span className="text-yellow-400">
                                    ATH: {formatMcap(token.ath_mcap)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <a
                              href={`/tokens/${token.mint_address}`}
                              className="px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white text-sm transition-colors"
                            >
                              View Token
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Patterns Tab */}
              {activeView === 'patterns' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-bold text-cyan-400 mb-4">
                    Behavioral Patterns & Analysis
                  </h3>
                  
                  {walletType === 'dev' ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <Clock className="w-4 h-4 text-cyan-400" />
                          Launch Timing
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Analysis of launch patterns, frequency, and timing preferences
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <TrendingUp className="w-4 h-4 text-green-400" />
                          Success Factors
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Common traits of successful token launches from this wallet
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-400" />
                          Community Building
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Average community size and engagement metrics
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4 text-yellow-400" />
                          Risk Profile
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Risk assessment based on historical performance
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <Coins className="w-4 h-4 text-yellow-400" />
                          Trading Patterns
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Buy/sell patterns, hold times, and profit ratios
                        </div>
                      </div>

                      <div className="bg-black/60 rounded-xl border border-cyan-500/20 p-6">
                        <h4 className="text-white font-medium mb-4 flex items-center gap-2">
                          <Zap className="w-4 h-4 text-cyan-400" />
                          Activity Levels
                        </h4>
                        <div className="text-gray-400 text-sm">
                          Transaction frequency and active trading periods
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-200">
                        Advanced pattern analysis and behavioral insights are coming soon. 
                        This will include ML-based predictions and anomaly detection.
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default WalletDetailsModal;
