import { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, ExternalLink, Clock, DollarSign, BarChart3, Copy, Check } from 'lucide-react';
import { apiUrl, config } from '../config';

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

export function TokenPage() {
  // Extract address from URL path (/dashboard/token/:address)
  const address = window.location.pathname.split('/dashboard/token/')[1] || window.location.pathname.split('/token/')[1];
  const [token, setToken] = useState<TokenData | null>(null);
  const [ohlcv, setOhlcv] = useState<OHLCVCandle[]>([]);
  const [timeframe, setTimeframe] = useState('1h');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch token data
  useEffect(() => {
    if (!address) return;

    const fetchToken = async () => {
      try {
        const response = await fetch(apiUrl(`/api/tokens/recent`));
        const tokens = await response.json();
        const foundToken = tokens.find((t: TokenData) => t.mint_address === address);
        
        if (foundToken) {
          setToken(foundToken);
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
        const response = await fetch(apiUrl(`/api/ohlcv/${address}/${timeframe}`));
        const data = await response.json();
        setOhlcv(data || []);
      } catch (error) {
        console.error('Error fetching OHLCV:', error);
      }
    };

    fetchOHLCV();
  }, [address, timeframe]);

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
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white mb-2">
                {token.name || 'Unknown Token'}
                <span className="text-purple-400 ml-3">${token.symbol || 'N/A'}</span>
              </h1>
              <div className="flex items-center gap-4 text-sm text-gray-400">
                <div className="flex items-center gap-2">
                  <span>Mint:</span>
                  <code className="bg-slate-900/50 px-2 py-1 rounded">{token.mint_address.slice(0, 8)}...{token.mint_address.slice(-4)}</code>
                  <button 
                    onClick={() => copyToClipboard(token.mint_address, 'mint')}
                    className="text-purple-400 hover:text-purple-300"
                  >
                    {copied === 'mint' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a 
                    href={`https://solscan.io/token/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
                <div className="flex items-center gap-2">
                  <span>Creator:</span>
                  <code className="bg-slate-900/50 px-2 py-1 rounded">{token.creator_address.slice(0, 8)}...{token.creator_address.slice(-4)}</code>
                  <button 
                    onClick={() => copyToClipboard(token.creator_address, 'creator')}
                    className="text-purple-400 hover:text-purple-300"
                  >
                    {copied === 'creator' ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </button>
                  <a 
                    href={`https://solscan.io/account/${token.creator_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300"
                  >
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
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-4">
            <div className="text-gray-400 text-sm mb-1 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Market Cap
            </div>
            <div className="text-white text-xl font-bold">{formatMcap(token.current_mcap)}</div>
            <div className="text-gray-500 text-xs">Start: {formatMcap(token.starting_mcap)}</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-4">
            <div className="text-gray-400 text-sm mb-1">ATH Market Cap</div>
            <div className="text-white text-xl font-bold">{formatMcap(token.ath_mcap)}</div>
            <div className="text-gray-500 text-xs">All-time high</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-4">
            <div className="text-gray-400 text-sm mb-1">Price (SOL)</div>
            <div className="text-white text-xl font-bold">
              {token.price_sol ? token.price_sol.toFixed(8) : 'N/A'} SOL
            </div>
            <div className="text-gray-500 text-xs">Solana price</div>
          </div>

          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-4">
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
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
            <h3 className="text-lg font-bold text-white mb-4">🚀 Pump.fun Status</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <div className="text-gray-400 text-sm mb-2">Graduation Progress</div>
                <div className="bg-slate-900/50 rounded-full h-4 overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
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
                    className="inline-flex items-center gap-2 text-purple-400 hover:text-purple-300 font-mono text-sm"
                  >
                    {token.migrated_pool_address.slice(0, 8)}...
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Chart */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-purple-400" />
              Price Chart
            </h3>
            <div className="flex gap-2">
              {['1m', '15m', '1h', '4h', '1d'].map(tf => (
                <button
                  key={tf}
                  onClick={() => setTimeframe(tf)}
                  className={`px-3 py-1 rounded-lg text-sm font-medium transition-all ${
                    timeframe === tf
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-700 text-gray-400 hover:bg-slate-600'
                  }`}
                >
                  {tf}
                </button>
              ))}
            </div>
          </div>
          
          <div className="bg-slate-900/50 rounded-lg">
            {ohlcv.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-700">
                    <tr className="text-gray-400">
                      <th className="px-4 py-3 text-left">Time</th>
                      <th className="px-4 py-3 text-right">Open ($)</th>
                      <th className="px-4 py-3 text-right">High ($)</th>
                      <th className="px-4 py-3 text-right">Low ($)</th>
                      <th className="px-4 py-3 text-right">Close ($)</th>
                      <th className="px-4 py-3 text-right">Volume</th>
                      <th className="px-4 py-3 text-right">MCap (Open)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {ohlcv.slice(-50).reverse().map((candle, i) => {
                      const totalSupply = token?.total_supply ? parseFloat(token.total_supply) : 1_000_000_000;
                      const openMcap = candle.open * totalSupply;
                      const change = ((candle.close - candle.open) / candle.open) * 100;
                      const isGreen = change >= 0;
                      
                      return (
                        <tr key={i} className="hover:bg-slate-800/50">
                          <td className="px-4 py-2 text-gray-300">
                            {new Date(candle.timestamp * 1000).toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-white font-mono">
                            ${candle.open.toFixed(8)}
                          </td>
                          <td className="px-4 py-2 text-right text-green-400 font-mono">
                            ${candle.high.toFixed(8)}
                          </td>
                          <td className="px-4 py-2 text-right text-red-400 font-mono">
                            ${candle.low.toFixed(8)}
                          </td>
                          <td className={`px-4 py-2 text-right font-mono ${isGreen ? 'text-green-400' : 'text-red-400'}`}>
                            ${candle.close.toFixed(8)}
                          </td>
                          <td className="px-4 py-2 text-right text-gray-400 font-mono">
                            ${candle.volume.toLocaleString()}
                          </td>
                          <td className="px-4 py-2 text-right text-blue-400 font-mono">
                            ${openMcap.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="px-4 py-3 text-center text-gray-500 text-xs border-t border-slate-800">
                  Showing last 50 of {ohlcv.length} candles • First candle: {new Date(ohlcv[0]?.timestamp * 1000).toLocaleString()}
                </div>
              </div>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-400">
                No OHLCV data available. Start OHLCV Collector in Settings.
              </div>
            )}
          </div>
        </div>

        {/* Transaction Link */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-gray-400 text-sm mb-1">Creation Transaction</div>
              <code className="text-white font-mono text-sm">{token.signature?.slice(0, 16)}...</code>
            </div>
            <a
              href={`https://solscan.io/tx/${token.signature}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg transition-all"
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
