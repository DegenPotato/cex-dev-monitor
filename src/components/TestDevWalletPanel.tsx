import { useState, useRef, useEffect } from 'react';
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
      decimals?: number;
    }>;
    activities: Array<{
      signature: string;
      timestamp: number;
      type: 'deployment' | 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'burn' | 'swap' | 'other';
      program: string;
      details: any;
      amount?: number;
      token?: string;
    }>;
  };
  error?: string;
}

export function TestDevWalletPanel() {
  const [address, setAddress] = useState('');
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('1000');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [showDefiAnalysis, setShowDefiAnalysis] = useState(false);
  const [defiProfile, setDefiProfile] = useState<any>(null);
  const [defiLoading, setDefiLoading] = useState(false);
  const [showFullActivityLog, setShowFullActivityLog] = useState(false);
  const ws = useRef<WebSocket | null>(null);

  // Setup WebSocket connection for receiving results
  useEffect(() => {
    const wsUrl = apiUrl('/ws').replace('http', 'ws');
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('✅ WebSocket connected for test results');
    };

    ws.current.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        console.log('📡 WebSocket message received:', message.type);
        
        if (message.type === 'test-dev-complete') {
          console.log('📡 Test complete:', message.data);
          setResult(message.data);
          setLoading(false);
        } else if (message.type === 'test-dev-error') {
          console.error('📡 Test error:', message.data);
          setResult({
            success: false,
            error: message.data.error || 'Analysis failed'
          });
          setLoading(false);
        }
      } catch (err) {
        console.error('WebSocket message parse error:', err);
      }
    };

    ws.current.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.current.onclose = () => {
      console.log('❌ WebSocket disconnected');
    };

    return () => {
      ws.current?.close();
    };
  }, []);

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
      // Fire and forget - results come via WebSocket
      const response = await fetch(apiUrl('/api/wallets/test-dev'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          address, 
          name: name || 'Test Wallet',
          limit: parseInt(limit) || 1000
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('✅ Analysis started:', data.message);
      
      // Loading continues until WebSocket delivers results
    } catch (error: any) {
      console.error('Dev wallet analysis error:', error);
      setResult({
        success: false,
        error: error.message || 'Network error - check if backend is running'
      });
      setLoading(false);
    }
  };

  const analyzeDeFi = async () => {
    if (!address) return;

    setDefiLoading(true);
    try {
      const response = await fetch(
        apiUrl(`/api/wallets/${address}/defi-activities?limit=100`)
      );

      const data = await response.json();
      
      if (data.success) {
        setDefiProfile(data.profile);
      } else {
        console.error('DeFi analysis failed:', data.error);
        alert('DeFi analysis failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error('Error fetching DeFi profile:', error);
      alert('Failed to load DeFi profile: ' + error.message);
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

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              Transaction Limit
            </label>
            <input
              type="number"
              value={limit}
              onChange={(e) => setLimit(e.target.value)}
              placeholder="1000"
              min="10"
              max="10000"
              step="100"
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-3 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              disabled={loading}
            />
            <p className="text-xs text-gray-400 mt-1">
              Max transactions to analyze (10-10000). Higher = slower but more complete.
            </p>
          </div>

          <button
            onClick={handleAnalyze}
            disabled={loading || !address}
            className="w-full bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                Analyzing {limit} transactions...
              </>
            ) : (
              <>
                <FlaskConical className="w-5 h-5" />
                Analyze Wallet
              </>
            )}
          </button>
          
          {loading && (
            <div className="mt-3 p-3 bg-blue-900/30 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-300">
                ⏳ Processing {limit} transactions via proxy rotation...
                <br />
                <span className="text-blue-400 font-medium">No timeout - will wait for complete analysis.</span>
              </p>
            </div>
          )}
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
                {result.wallet && (
                  <>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Wallet Age:</span>
                      <span className="text-white">
                        {result.wallet.wallet_age_days 
                          ? `${result.wallet.wallet_age_days.toFixed(1)} days` 
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-400">Total TXs:</span>
                      <span className="text-white font-bold">{result.wallet.previous_tx_count || 0}</span>
                    </div>
                  </>
                )}
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

              {/* Token Deployments Section */}
              {result.analysis?.deployments && result.analysis.deployments.length > 0 && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    🚀 Token Deployments ({result.analysis.deployments.length})
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-600">
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">#</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Token Address</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Created</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.analysis.deployments.map((deployment, idx) => (
                          <tr key={deployment.signature} className="border-b border-gray-700/50 hover:bg-slate-600/30">
                            <td className="py-3 px-2 text-gray-400">{idx + 1}</td>
                            <td className="py-3 px-2">
                              <div className="flex flex-col gap-1">
                                <a
                                  href={`https://solscan.io/token/${deployment.mintAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 font-mono text-xs"
                                >
                                  {deployment.mintAddress}
                                </a>
                                <span className="text-gray-500 text-xs">
                                  Decimals: {deployment.decimals ?? 'N/A'}
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex flex-col gap-1">
                                <span className="text-gray-300 text-xs">
                                  {new Date(deployment.timestamp).toLocaleString()}
                                </span>
                                <span className="text-gray-500 text-xs">
                                  {Math.floor((Date.now() - deployment.timestamp) / (1000 * 60 * 60 * 24))} days ago
                                </span>
                              </div>
                            </td>
                            <td className="py-3 px-2">
                              <div className="flex gap-2">
                                <a
                                  href={`https://solscan.io/tx/${deployment.signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-400 hover:text-blue-300 text-xs underline"
                                >
                                  View TX
                                </a>
                                <a
                                  href={`https://pump.fun/${deployment.mintAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-green-400 hover:text-green-300 text-xs underline"
                                >
                                  Pump.fun
                                </a>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* All Activities Section - EXPERIMENTAL */}
              {result.analysis?.activities && result.analysis.activities.length > 0 && (
                <div className="bg-slate-700/50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-lg font-semibold text-white flex items-center gap-2">
                      📊 Complete On-Chain Activity ({result.analysis.activities.length} transactions)
                      <span className="text-xs bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded">EXPERIMENTAL</span>
                    </h4>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showFullActivityLog}
                        onChange={(e) => setShowFullActivityLog(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-600 bg-slate-700 text-purple-600 focus:ring-purple-500"
                      />
                      <span className="text-sm text-gray-300">Enable Activity Log</span>
                    </label>
                  </div>
                  {showFullActivityLog && (
                  <div className="overflow-x-auto max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-slate-800">
                        <tr className="border-b border-gray-600">
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Time</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Type</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Amount</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Token</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">Program</th>
                          <th className="text-left text-gray-400 font-medium pb-2 px-2">TX</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.analysis.activities.sort((a, b) => b.timestamp - a.timestamp).map((activity) => (
                          <tr key={activity.signature} className="border-b border-gray-700/50 hover:bg-slate-600/30">
                            <td className="py-2 px-2">
                              <span className="text-gray-400 text-xs">
                                {new Date(activity.timestamp).toLocaleString()}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                activity.type === 'deployment' ? 'bg-purple-900/50 text-purple-300' :
                                activity.type === 'buy' ? 'bg-green-900/50 text-green-300' :
                                activity.type === 'sell' ? 'bg-red-900/50 text-red-300' :
                                activity.type === 'swap' ? 'bg-blue-900/50 text-blue-300' :
                                activity.type === 'transfer_in' ? 'bg-cyan-900/50 text-cyan-300' :
                                activity.type === 'transfer_out' ? 'bg-orange-900/50 text-orange-300' :
                                activity.type === 'burn' ? 'bg-red-950/50 text-red-400' :
                                'bg-gray-700 text-gray-400'
                              }`}>
                                {activity.type.replace('_', ' ').toUpperCase()}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <span className="text-white text-xs">
                                {activity.amount ? activity.amount.toFixed(4) : '-'}
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              {activity.token ? (
                                <a
                                  href={`https://solscan.io/token/${activity.token}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 font-mono text-xs"
                                >
                                  {activity.token.slice(0, 6)}...
                                </a>
                              ) : (
                                <span className="text-gray-500 text-xs">-</span>
                              )}
                            </td>
                            <td className="py-2 px-2">
                              <span className="text-gray-400 text-xs font-mono">
                                {activity.program.slice(0, 8)}...
                              </span>
                            </td>
                            <td className="py-2 px-2">
                              <a
                                href={`https://solscan.io/tx/${activity.signature}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-400 hover:text-blue-300 text-xs underline"
                              >
                                View
                              </a>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  )}
                </div>
              )}

              {/* DeFi Analysis Section - COMPLETELY DISABLED */}
              {false && (
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
