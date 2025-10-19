import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, Clock, DollarSign, BarChart3, Copy, Check, Play, Trash2 } from 'lucide-react';
import { apiUrl, config } from '../config';
import RobustChart from './RobustChart';

interface TokenData {
  mint_address: string;
  creator_address: string;
  name: string;
  symbol: string;
  timestamp: number;
  platform: string;
  signature: string;
  starting_mcap: number;
  current_mcap: number;
  ath_mcap: number;
  price_usd: number;
  price_sol: number;
  graduation_percentage: number;
  launchpad_completed: number;
  launchpad_completed_at: number | null;
  migrated_pool_address: string | null;
  total_supply?: string;
  market_cap_usd?: number;
  coingecko_coin_id?: string;
  gt_score?: number;
  description?: string;
  last_updated: number;
  metadata: string;
}

interface OHLCVCandle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface TokenPageProps {
  address?: string;
}

export function TokenPage({ address: propAddress }: TokenPageProps = {}) {
  // Use prop address if provided, otherwise extract from URL (for backward compatibility)
  const address = propAddress || window.location.pathname.split('/dashboard/token/')[1] || window.location.pathname.split('/token/')[1];
  const [token, setToken] = useState<TokenData | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVCandle[]>([]);
  const [migration, setMigration] = useState<{ completed_at: number | null; raydium_pool: string | null } | null>(null);
  const [timeframe, setTimeframe] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const wsRef = useRef<WebSocket | null>(null);
  
  // OHLCV Test state
  const [testRunning, setTestRunning] = useState(false);
  const [showTestPanel, setShowTestPanel] = useState(false);
  const [testTimeframe, setTestTimeframe] = useState('15m');
  const [testResults, setTestResults] = useState<any>(null);

  // Fetch token data
  useEffect(() => {
    if (!address) return;

    const fetchToken = async () => {
      try {
        const response = await fetch(apiUrl(`/api/tokens/${address}`));
        if (response.ok) {
          const token = await response.json();
          setToken(token);
        } else {
          console.error('Token not found in database');
        }
        setLoading(false);
      } catch (error) {
        console.error('Error fetching token:', error);
        setLoading(false);
      }
    };

    fetchToken();
  }, [address]);

  // Fetch OHLCV data
  useEffect(() => {
    if (!address) return;

    const fetchOHLCV = async () => {
      try {
        const response = await fetch(apiUrl(`/api/ohlcv/${address}/${timeframe}`), {
          credentials: 'include'
        });
        const data = await response.json();
        
        // New format includes candles, migration info, and pools
        if (data.candles) {
          setOhlcv(data.candles);
          setMigration(data.migration);
        } else {
          // Fallback for old format (just array of candles)
          setOhlcv(data || []);
          setMigration(null);
        }
      } catch (error) {
        console.error('Error fetching OHLCV:', error);
      }
    };

    fetchOHLCV();
  }, [address, timeframe]);

  // Fetch test status

  // Run OHLCV test - Fetch candles without saving
  const runTest = async () => {
    if (!address) return;
    
    setTestRunning(true);
    setTestResults(null);
    
    try {
      const response = await fetch(apiUrl(`/api/ohlcv/fetch-test/${address}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          timeframe: testTimeframe,
          limit: 1000
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('[TokenPage] Test results:', data);
        setTestResults(data);
      } else {
        const error = await response.json();
        alert(`Error: ${error.error || 'Failed to fetch candles'}`);
      }
    } catch (error) {
      console.error('Error running test:', error);
      alert('Failed to run test. Check console for details.');
    } finally {
      setTestRunning(false);
    }
  };


  // WebSocket for live updates
  useEffect(() => {
    if (!address) return;

    const ws = new WebSocket(`${config.wsUrl}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('WebSocket connected');
      // Subscribe to token updates
      ws.send(JSON.stringify({ 
        type: 'subscribe_token', 
        mint_address: address 
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'token_update' && data.mint_address === address) {
          // Update token data
          setToken(prev => prev ? { ...prev, ...data.updates } : null);
        }
        
        if (data.type === 'ohlcv_update' && data.mint_address === address && data.timeframe === timeframe) {
          // Add new candle
          setOhlcv(prev => [...prev, data.candle]);
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket disconnected');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'unsubscribe_token', 
          mint_address: address 
        }));
      }
      ws.close();
    };
  }, [address, timeframe]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(''), 2000);
  };

  const formatMcap = (mcap: number | null | undefined) => {
    if (!mcap) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(2)}K`;
    return `$${mcap.toFixed(2)}`;
  };

  const formatPrice = (price: number | null | undefined) => {
    if (!price) return 'N/A';
    if (price < 0.01) return `$${price.toFixed(6)}`;
    return `$${price.toFixed(4)}`;
  };

  const calculatePriceChange = () => {
    if (!token || !token.starting_mcap || !token.current_mcap) return null;
    const change = ((token.current_mcap - token.starting_mcap) / token.starting_mcap) * 100;
    return change;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Loading token data...</div>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white text-xl">Token not found</div>
      </div>
    );
  }

  const priceChange = calculatePriceChange();
  const isPositive = priceChange !== null && priceChange >= 0;

  return (
    <div className="bg-black/40 backdrop-blur-xl rounded-2xl p-6">
      <div className="space-y-6">
        
        {/* Header */}
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 p-6 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
          <div className="flex items-center justify-between relative z-10">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {token.name || 'Unknown Token'}
                <span className="text-cyan-400 ml-3">${token.symbol || 'N/A'}</span>
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span>Mint:</span>
                  <code className="bg-slate-900/50 px-2 py-1 rounded">{token.mint_address.slice(0, 8)}...{token.mint_address.slice(-4)}</code>
                  <button 
                    onClick={() => copyToClipboard(token.mint_address, 'mint')}
                    className="text-cyan-400 hover:text-cyan-300">
                    {copied === 'mint' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a 
                    href={`https://solscan.io/token/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span>Creator:</span>
                  <code className="bg-slate-900/50 px-2 py-1 rounded">{token.creator_address.slice(0, 8)}...{token.creator_address.slice(-4)}</code>
                  <button 
                    onClick={() => copyToClipboard(token.creator_address, 'creator')}
                    className="text-cyan-400 hover:text-cyan-300">
                    {copied === 'creator' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a 
                    href={`https://solscan.io/account/${token.creator_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300">
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-4xl font-bold text-white mb-1">
                {formatPrice(token.price_usd)}
              </div>
              {priceChange !== null && (
                <div className={`flex items-center justify-end gap-1 text-lg font-semibold ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                  {isPositive ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)}%
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-4">
            <div className="text-gray-400 text-sm mb-1 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Market Cap
            </div>
            <div className="text-white text-xl font-bold">{formatMcap(token.current_mcap)}</div>
            <div className="text-gray-500 text-xs">Start: {formatMcap(token.starting_mcap)}</div>
          </div>

          <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-4">
            <div className="text-gray-400 text-sm mb-1">ATH Market Cap</div>
            <div className="text-white text-xl font-bold">{formatMcap(token.ath_mcap)}</div>
            <div className="text-gray-500 text-xs">All-time high</div>
          </div>

          <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-4">
            <div className="text-gray-400 text-sm mb-1">Price (SOL)</div>
            <div className="text-white text-xl font-bold">
              {token.price_sol ? token.price_sol.toFixed(8) : 'N/A'} SOL
            </div>
            <div className="text-gray-500 text-xs">Solana price</div>
          </div>

          <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-4">
            <div className="text-gray-400 text-sm mb-1 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Launch Time
            </div>
            <div className="text-white text-xl font-bold">
              {new Date(token.timestamp).toLocaleDateString()}
            </div>
            <div className="text-gray-500 text-xs">
              {new Date(token.timestamp).toLocaleTimeString()}
            </div>
          </div>
        </div>

        {/* Pump.fun Status */}
        {token.platform === 'pumpfun' && (
          <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-6">
            <h3 className="text-lg font-bold text-white mb-4">🚀 Pump.fun Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-gray-400 text-sm mb-2">Graduation Progress</div>
                <div className="bg-black/50 rounded-full h-4 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-500"
                    style={{ width: `${token.graduation_percentage || 0}%` }}
                  />
                </div>
                <div className="text-white font-semibold mt-1">{(token.graduation_percentage || 0).toFixed(2)}%</div>
              </div>
              
              <div>
                <div className="text-gray-400 text-sm mb-2">Launchpad Status</div>
                <div className={`inline-flex px-3 py-1 rounded-full text-sm font-semibold ${
                  token.launchpad_completed ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {token.launchpad_completed ? '✅ Graduated' : '⏳ In Progress'}
                </div>
              </div>
              
              {token.migrated_pool_address && (
                <div>
                  <div className="text-gray-400 text-sm mb-2">Migrated Pool</div>
                  <a 
                    href={`https://raydium.io/swap/?inputMint=sol&outputMint=${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-cyan-400 hover:text-cyan-300 font-mono text-sm"
                  >
                    {token.migrated_pool_address.slice(0, 8)}...
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* OHLCV Test Panel */}
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-purple-500/20 shadow-lg shadow-purple-500/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              🧪 OHLCV Data Collection Test
            </h3>
            <button
              onClick={() => setShowTestPanel(!showTestPanel)}
              className="text-purple-400 hover:text-purple-300 transition-colors"
            >
              {showTestPanel ? 'Hide' : 'Show'} Controls
            </button>
          </div>

          {showTestPanel && (
            <div className="space-y-4">
              {/* Timeframe Selector */}
              <div className="flex items-center gap-4">
                <label className="text-sm font-medium text-gray-400">Timeframe:</label>
                <div className="flex gap-2">
                  {['1m', '5m', '15m', '1h', '4h', '1d'].map((tf) => (
                    <button
                      key={tf}
                      onClick={() => setTestTimeframe(tf)}
                      className={`px-3 py-1.5 rounded-lg font-mono text-sm transition-all ${
                        testTimeframe === tf
                          ? 'bg-cyan-500/30 border-cyan-400 text-cyan-300'
                          : 'bg-black/40 border-gray-600 text-gray-400 hover:border-cyan-500/50'
                      } border`}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-500 ml-2">
                  Will fetch up to 1000 candles
                </span>
              </div>

              {/* Control Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={runTest}
                  disabled={testRunning}
                  className="flex items-center gap-2 px-4 py-2 bg-green-600/20 hover:bg-green-600/30 border border-green-500/40 text-green-400 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed relative"
                >
                  {testRunning ? (
                    <>
                      <div className="w-4 h-4 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
                      <span>Fetching Candles...</span>
                      <span className="absolute -top-1 -right-1 flex h-3 w-3">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                      </span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>Fetch Test Data</span>
                    </>
                  )}
                </button>
                
                <button
                  onClick={() => setTestResults(null)}
                  disabled={!testResults}
                  className="flex items-center gap-2 px-4 py-2 bg-gray-600/20 hover:bg-gray-600/30 border border-gray-500/40 text-gray-400 rounded-lg font-medium transition-all disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4" />
                  Clear Results
                </button>
              </div>

              {/* Test Results Display */}
              {testResults && (
                <div className="space-y-4">
                  {/* Summary Stats */}
                  <div className="bg-black/40 rounded-lg p-4 border border-cyan-500/20">
                    <div className="text-cyan-400 text-sm font-bold mb-3">📊 Fetch Results</div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400 block mb-1">Pool:</span>
                        <span className="text-white font-mono text-xs">{testResults.pool?.address?.slice(0, 8)}...</span>
                        <span className="text-cyan-400 text-xs ml-1">({testResults.pool?.dex})</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-1">Timeframe:</span>
                        <span className="text-white font-mono">{testResults.timeframe}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-1">Candles Fetched:</span>
                        <span className="text-green-400 font-bold font-mono">{testResults.count}</span>
                      </div>
                      <div>
                        <span className="text-gray-400 block mb-1">Status:</span>
                        <span className="text-green-400">✓ Success</span>
                      </div>
                    </div>
                  </div>

                  {/* Candle Data Preview */}
                  <div className="bg-black/40 rounded-lg p-4 border border-purple-500/20">
                    <div className="text-purple-400 text-sm font-bold mb-3">🕯️ Sample Candles (First 10)</div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr className="text-gray-400 border-b border-gray-700">
                            <th className="text-left py-2 px-2">Timestamp</th>
                            <th className="text-right py-2 px-2">Open</th>
                            <th className="text-right py-2 px-2">High</th>
                            <th className="text-right py-2 px-2">Low</th>
                            <th className="text-right py-2 px-2">Close</th>
                            <th className="text-right py-2 px-2">Volume</th>
                          </tr>
                        </thead>
                        <tbody>
                          {testResults.candles?.slice(0, 10).map((candle: any, i: number) => (
                            <tr key={i} className="border-b border-gray-800 hover:bg-gray-800/50">
                              <td className="py-2 px-2 text-gray-300">
                                {new Date(candle.timestamp * 1000).toLocaleString()}
                              </td>
                              <td className="text-right py-2 px-2 text-white">{candle.open.toFixed(8)}</td>
                              <td className="text-right py-2 px-2 text-green-400">{candle.high.toFixed(8)}</td>
                              <td className="text-right py-2 px-2 text-red-400">{candle.low.toFixed(8)}</td>
                              <td className="text-right py-2 px-2 text-white">{candle.close.toFixed(8)}</td>
                              <td className="text-right py-2 px-2 text-cyan-400">{candle.volume.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {testResults.candles?.length > 10 && (
                      <div className="text-center text-gray-500 text-xs mt-3">
                        ... and {testResults.candles.length - 10} more candles
                      </div>
                    )}
                  </div>

                  {/* Raw Response (Collapsible) */}
                  <details className="bg-black/40 rounded-lg border border-gray-700">
                    <summary className="p-4 cursor-pointer text-sm font-bold text-gray-400 hover:text-gray-300">
                      🔍 View Full Raw Response
                    </summary>
                    <pre className="p-4 text-xs text-gray-300 overflow-x-auto max-h-96">
                      {JSON.stringify(testResults, null, 2)}
                    </pre>
                  </details>
                </div>
              )}

              <div className="text-xs text-gray-500 border-t border-purple-500/20 pt-3 mt-4">
                <strong>Note:</strong> This test fetches candles directly from GeckoTerminal API without saving to database. 
                Use this to verify data availability and quality before running full collection.
              </div>
            </div>
          )}
        </div>

        {/* Chart */}
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
              Price Chart
              {ohlcv.length > 0 && (
                <span className="text-sm text-green-400 font-normal">
                  ({ohlcv.length} candles loaded)
                </span>
              )}
              {testRunning && (
                <span className="flex items-center gap-1 text-xs text-yellow-400 font-normal">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                  </span>
                  Live collection
                </span>
              )}
            </h3>
            <div className="flex gap-2">
              {['1m', '15m', '1h', '4h', '1d'].map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                    timeframe === tf
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
                      : 'bg-black/40 text-gray-400 hover:bg-cyan-500/10 hover:text-cyan-300 border border-cyan-500/20'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          
          {/* Robust Chart with fallback */}
          <RobustChart 
            data={ohlcv} 
            migration={migration}
            height={400}
          />
        </div>

        {/* Transaction Link */}
        <div className="bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-lg shadow-cyan-500/10 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-400 text-sm mb-1">Creation Transaction</div>
              <code className="text-white font-mono text-sm">{token.signature?.slice(0, 16)}...</code>
            </div>
            <a
              href={`https://solscan.io/tx/${token.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 hover:text-cyan-300 border border-cyan-500/40 hover:border-cyan-500/60 px-4 py-2 rounded-lg transition-all"
            >
              View on Solscan
              <ExternalLink className="w-4 h-4" />
            </a>
          </div>
        </div>

      </div>
    </div>
  );
}
