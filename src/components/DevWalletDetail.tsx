import { useState, useEffect } from 'react';
import { ArrowLeft, Flame, DollarSign, Coins, Calendar, ExternalLink, Target } from 'lucide-react';
import { TokenMint } from '../types';

interface DevWalletData {
  wallet: any;
  tokens: TokenMint[];
  stats: {
    totalTokens: number;
    totalCurrentMcap: number;
    totalATHMcap: number;
    avgCurrentMcap: number;
    avgATHMcap: number;
    successRate: number;
  };
}

export function DevWalletDetail() {
  // Get address from URL path
  const address = window.location.pathname.split('/dev/')[1];
  const [data, setData] = useState<DevWalletData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!address) return;
      
      try {
        const response = await fetch(`/api/wallets/dev/${address}`);
        if (response.ok) {
          const result = await response.json();
          setData(result);
        } else {
          alert('Dev wallet not found');
          window.close();
        }
      } catch (error) {
        console.error('Error fetching dev wallet:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [address]);

  const formatAddress = (addr: string) => `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  const formatMcap = (mcap?: number) => {
    if (!mcap || mcap === 0) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(2)}K`;
    return `$${mcap.toFixed(2)}`;
  };
  const formatDate = (timestamp: number) => new Date(timestamp).toLocaleString();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-8">
        <div className="text-center text-white">Loading...</div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900/20 to-slate-900 p-8">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <button
          onClick={() => window.close()}
          className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Close
        </button>

        {/* Wallet Info */}
        <div className="bg-gradient-to-br from-orange-500/10 to-red-500/10 border border-orange-500/30 rounded-lg p-8 mb-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <Flame className="w-8 h-8 text-orange-500" />
                <h1 className="text-3xl font-bold text-white">Dev Wallet</h1>
              </div>
              <p className="text-xl font-mono text-gray-300">{address}</p>
            </div>
            <a
              href={`https://solscan.io/account/${address}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-white transition-colors"
            >
              <ExternalLink className="w-6 h-6" />
            </a>
          </div>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-purple-400 mb-2">
                <Coins className="w-4 h-4" />
                <span className="text-sm font-medium">Total Tokens</span>
              </div>
              <div className="text-3xl font-bold text-white">{data.stats.totalTokens}</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-green-400 mb-2">
                <DollarSign className="w-4 h-4" />
                <span className="text-sm font-medium">Total MCap</span>
              </div>
              <div className="text-2xl font-bold text-green-400">{formatMcap(data.stats.totalCurrentMcap)}</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-orange-400 mb-2">
                <Flame className="w-4 h-4" />
                <span className="text-sm font-medium">Total ATH</span>
              </div>
              <div className="text-2xl font-bold text-orange-400">{formatMcap(data.stats.totalATHMcap)}</div>
            </div>

            <div className="bg-slate-900/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-blue-400 mb-2">
                <Target className="w-4 h-4" />
                <span className="text-sm font-medium">Success Rate</span>
              </div>
              <div className="text-2xl font-bold text-blue-400">{data.stats.successRate.toFixed(1)}%</div>
            </div>
          </div>
        </div>

        {/* Token Launch History */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
          <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
            <Calendar className="w-6 h-6 text-purple-400" />
            Token Launch History ({data.tokens.length})
          </h2>

          {data.tokens.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              No tokens found
            </div>
          ) : (
            <div className="space-y-4">
              {data.tokens.map((token) => {
                const roi = token.starting_mcap && token.current_mcap
                  ? ((token.current_mcap - token.starting_mcap) / token.starting_mcap) * 100
                  : null;

                return (
                  <div
                    key={token.mint_address}
                    className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border border-purple-500/30 rounded-lg p-5 hover:border-purple-500/50 transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="text-xl font-bold text-white mb-1">
                          {token.symbol ? `$${token.symbol}` : formatAddress(token.mint_address)}
                        </h3>
                        {token.name && (
                          <p className="text-sm text-gray-300">{token.name}</p>
                        )}
                        <p className="text-xs text-gray-400 mt-2">
                          Launched: {formatDate(token.timestamp)}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <a
                          href={`https://solscan.io/token/${token.mint_address}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-purple-400 hover:text-purple-300"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Launch MCap</div>
                        <div className="text-sm font-semibold text-blue-400">
                          {formatMcap(token.starting_mcap)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">Current MCap</div>
                        <div className="text-sm font-semibold text-green-400">
                          {formatMcap(token.current_mcap)}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-gray-400 mb-1">ATH MCap</div>
                        <div className="text-sm font-semibold text-orange-400">
                          {formatMcap(token.ath_mcap)}
                        </div>
                      </div>
                      {roi !== null && (
                        <div>
                          <div className="text-xs text-gray-400 mb-1">ROI</div>
                          <div className={`text-sm font-semibold ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 flex gap-2">
                      <a
                        href={`https://gmgn.ai/sol/token/${token.mint_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-green-600/50 hover:bg-green-600/70 text-white text-xs font-medium py-2 rounded text-center transition-all"
                      >
                        GMGN
                      </a>
                      <a
                        href={`https://pump.fun/${token.mint_address}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 bg-orange-600/50 hover:bg-orange-600/70 text-white text-xs font-medium py-2 rounded text-center transition-all"
                      >
                        Pump.fun
                      </a>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
