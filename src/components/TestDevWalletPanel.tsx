import { useState } from 'react';
import { FlaskConical, Loader2, CheckCircle, XCircle, Activity, Coins } from 'lucide-react';
import { apiUrl } from '../config';

interface AnalysisResult {
  success: boolean;
  wallet?: any;
  analysis?: {
    isDevWallet: boolean;
    tokensDeployed: number;
    deployments: Array<{
      mintAddress: string;
      signature: string;
      timestamp: number;
    }>;
  };
  error?: string;
}

export function TestDevWalletPanel() {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showDefiAnalysis, setShowDefiAnalysis] = useState(false);
  const [defiProfile, setDefiProfile] = useState<any>(null);
  const [defiLoading, setDefiLoading] = useState(false);

  const handleAnalyze = async () => {
    if (!address) {
      alert('Please enter a wallet address');
      return;
    }

    setLoading(true);
    setResult(null);
    setShowDefiAnalysis(false);
    setDefiProfile(null);

    try {
      const response = await fetch(apiUrl('/api/wallets/test-dev'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, name: name || 'Test Wallet' })
      });

      const data = await response.json();
      setResult(data);

      // Auto-trigger DeFi analysis if it's a dev wallet
      if (data.success && data.analysis?.isDevWallet) {
        setShowDefiAnalysis(true);
        await analyzeDeFi();
      }
    } catch (error: any) {
      setResult({
        success: false,
        error: error.message
      });
    } finally {
      setLoading(false);
    }
  };

  const analyzeDeFi = async () => {
    if (!address) return;

    setDefiLoading(true);
    try {
      const response = await fetch(apiUrl(`/api/wallets/${address}/defi-activities?limit=100`));
      const data = await response.json();
      
      if (data.success) {
        setDefiProfile(data.profile);
      }
    } catch (error) {
      console.error('Error fetching DeFi profile:', error);
    } finally {
      setDefiLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-white flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-purple-400" />
          Test Dev Wallet Analyzer
        </h2>
        <p className="text-gray-400 mt-1">
          Add a wallet to analyze its full DeFi history and detect token deployments
        </p>
      </div>

      {/* Input Form */}
      <div className="bg-slate-800 rounded-lg p-6 border border-purple-500/20">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Wallet Address *
            </label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Enter Solana wallet address"
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none font-mono text-sm"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Name (Optional)
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Serial Dev #1"
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              disabled={loading}
            />
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !address}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <FlaskConical className="w-5 h-5" />
                Analyze Wallet
              </>
            )}
          </button>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className={`bg-slate-800 rounded-lg p-6 border-2 ${
          result.success 
            ? result.analysis?.isDevWallet 
              ? 'border-green-500/50' 
              : 'border-yellow-500/50'
            : 'border-red-500/50'
        }`}>
          {result.success ? (
            <div className="space-y-4">
              {/* Success Header */}
              <div className="flex items-center gap-3">
                {result.analysis?.isDevWallet ? (
                  <>
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <div>
                      <h3 className="text-xl font-bold text-white">✅ Dev Wallet Detected!</h3>
                      <p className="text-gray-400 text-sm">Found {result.analysis.tokensDeployed} token deployments</p>
                    </div>
                  </>
                ) : (
                  <>
                    <Activity className="w-8 h-8 text-yellow-400" />
                    <div>
                      <h3 className="text-xl font-bold text-white">Not a Dev Wallet</h3>
                      <p className="text-gray-400 text-sm">No token deployments found</p>
                    </div>
                  </>
                )}
              </div>

              {/* Wallet Info */}
              <div className="bg-slate-700/50 rounded-lg p-4 space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-400">Address:</span>
                  <span className="text-white font-mono text-sm">{address.slice(0, 8)}...{address.slice(-8)}</span>
                </div>
                {result.analysis && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Tokens Deployed:</span>
                      <span className="text-white font-bold">{result.analysis.tokensDeployed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Status:</span>
                      <span className={result.analysis.isDevWallet ? 'text-green-400' : 'text-gray-400'}>
                        {result.analysis.isDevWallet ? 'Dev Wallet' : 'Regular Wallet'}
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* DeFi Analysis Section */}
              {result.analysis?.isDevWallet && (
                <div className="space-y-3">
                  <button
                    onClick={() => {
                      setShowDefiAnalysis(!showDefiAnalysis);
                      if (!showDefiAnalysis && !defiProfile) {
                        analyzeDeFi();
                      }
                    }}
                    className="w-full bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
                  >
                    <Coins className="w-5 h-5" />
                    {showDefiAnalysis ? 'Hide' : 'View'} Full DeFi Activity Profile
                  </button>

                  {showDefiAnalysis && (
                    <div className="bg-slate-700/50 rounded-lg p-4">
                      {defiLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="w-8 h-8 animate-spin text-purple-400" />
                          <span className="ml-3 text-gray-400">Analyzing DeFi activities...</span>
                        </div>
                      ) : defiProfile ? (
                        <div className="space-y-4">
                          {/* Stats Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <div className="bg-slate-800 rounded p-3">
                              <div className="text-xs text-gray-400 mb-1">Total Activities</div>
                              <div className="text-2xl font-bold text-white">{defiProfile.stats.totalActivities}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-3">
                              <div className="text-xs text-gray-400 mb-1">Swaps</div>
                              <div className="text-2xl font-bold text-blue-400">{defiProfile.stats.swaps}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-3">
                              <div className="text-xs text-gray-400 mb-1">Mints</div>
                              <div className="text-2xl font-bold text-green-400">{defiProfile.stats.mints}</div>
                            </div>
                            <div className="bg-slate-800 rounded p-3">
                              <div className="text-xs text-gray-400 mb-1">LP Ops</div>
                              <div className="text-2xl font-bold text-purple-400">{defiProfile.stats.liquidityOps}</div>
                            </div>
                          </div>

                          {/* Programs Used */}
                          <div>
                            <h4 className="text-sm font-semibold text-white mb-2">Programs Used</h4>
                            <div className="flex flex-wrap gap-2">
                              {Object.entries(defiProfile.stats.programUsage).map(([program, count]: [string, any]) => (
                                <span key={program} className="px-3 py-1 bg-purple-500/20 text-purple-300 rounded-full text-xs">
                                  {program}: {count}
                                </span>
                              ))}
                            </div>
                          </div>

                          {/* Patterns */}
                          {(defiProfile.patterns.isSerialMinter || defiProfile.patterns.hasQuickLPRemoval || defiProfile.patterns.hasBurnActivity) && (
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-2">⚠️ Detected Patterns</h4>
                              <div className="space-y-1">
                                {defiProfile.patterns.isSerialMinter && (
                                  <div className="text-sm text-yellow-400">🚨 Serial Minter (3+ tokens)</div>
                                )}
                                {defiProfile.patterns.hasQuickLPRemoval && (
                                  <div className="text-sm text-red-400">⚡ Quick LP Removal Detected</div>
                                )}
                                {defiProfile.patterns.hasBurnActivity && (
                                  <div className="text-sm text-orange-400">🔥 Burn Activity Present</div>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Activity Timeline */}
                          {defiProfile.activities && defiProfile.activities.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-white mb-3">📜 Activity Timeline ({defiProfile.activities.length} transactions)</h4>
                              <div className="bg-slate-800 rounded-lg overflow-hidden">
                                <div className="max-h-96 overflow-y-auto">
                                  <table className="w-full text-sm">
                                    <thead className="bg-slate-700 sticky top-0">
                                      <tr>
                                        <th className="px-3 py-2 text-left text-gray-300 font-semibold">Type</th>
                                        <th className="px-3 py-2 text-left text-gray-300 font-semibold">Program</th>
                                        <th className="px-3 py-2 text-left text-gray-300 font-semibold">Status</th>
                                        <th className="px-3 py-2 text-left text-gray-300 font-semibold">Time</th>
                                        <th className="px-3 py-2 text-left text-gray-300 font-semibold">Transaction</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {defiProfile.activities.map((activity: any, idx: number) => {
                                        const typeColors: Record<string, string> = {
                                          SWAP: 'text-blue-400',
                                          MINT: 'text-green-400',
                                          BURN: 'text-red-400',
                                          ADD_LIQUIDITY: 'text-purple-400',
                                          REMOVE_LIQUIDITY: 'text-orange-400',
                                          TRANSFER: 'text-gray-400',
                                          UNKNOWN: 'text-gray-500'
                                        };
                                        
                                        const typeEmojis: Record<string, string> = {
                                          SWAP: '💱',
                                          MINT: '🚀',
                                          BURN: '🔥',
                                          ADD_LIQUIDITY: '💧',
                                          REMOVE_LIQUIDITY: '💸',
                                          TRANSFER: '📤',
                                          UNKNOWN: '❓'
                                        };

                                        return (
                                          <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700/50">
                                            <td className="px-3 py-2">
                                              <span className={`font-semibold ${typeColors[activity.type]}`}>
                                                {typeEmojis[activity.type]} {activity.type}
                                              </span>
                                            </td>
                                            <td className="px-3 py-2 text-gray-300">
                                              {activity.programName}
                                            </td>
                                            <td className="px-3 py-2">
                                              {activity.status === 'success' ? (
                                                <span className="text-green-400">✓</span>
                                              ) : (
                                                <span className="text-red-400">✗</span>
                                              )}
                                            </td>
                                            <td className="px-3 py-2 text-gray-400 text-xs">
                                              {new Date(activity.timestamp).toLocaleString()}
                                            </td>
                                            <td className="px-3 py-2">
                                              <a
                                                href={`https://solscan.io/tx/${activity.signature}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-400 hover:text-blue-300 font-mono text-xs underline"
                                              >
                                                {activity.signature.slice(0, 8)}...
                                              </a>
                                            </td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      ) : (
                        <p className="text-gray-400 text-center py-4">Click "View" to analyze DeFi activities</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 text-red-400" />
              <div>
                <h3 className="text-xl font-bold text-white">Analysis Failed</h3>
                <p className="text-red-400 text-sm">{result.error || 'Unknown error'}</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
