import { useEffect, useState } from 'react';
import { Flame, ExternalLink, Clock, User } from 'lucide-react';
import { apiUrl } from '../config';

interface TokenMint {
  id: number;
  mint_address: string;
  creator_address: string;
  launch_time: number;
  signature: string;
  name?: string;
  symbol?: string;
  uri?: string;
}

export function RecentTokenMints() {
  const [tokens, setTokens] = useState<TokenMint[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTokens();
    const interval = setInterval(fetchTokens, 10000); // Refresh every 10s
    return () => clearInterval(interval);
  }, []);

  const fetchTokens = async () => {
    try {
      const response = await fetch(apiUrl('/api/tokens?limit=20'));
      if (response.ok) {
        const data = await response.json();
        setTokens(data);
      }
    } catch (error) {
      console.error('Error fetching tokens:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getTimeAgo = (timestamp: number) => {
    // Database already stores timestamps in milliseconds
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  const formatTimestamp = (timestamp: number) => {
    // Database already stores timestamps in milliseconds
    return new Date(timestamp).toLocaleString();
  };

  if (loading) {
    return (
      <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-purple-500/20 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Flame className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Recent Token Mints</h2>
        </div>
        <div className="text-gray-400 text-center py-8">Loading...</div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-purple-500/20 shadow-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Flame className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Recent Token Mints</h2>
        </div>
        <div className="text-gray-400 text-center py-8">
          No tokens detected yet. Add monitored wallets to start tracking.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-purple-500/20 shadow-xl p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Flame className="w-6 h-6 text-purple-400" />
          <h2 className="text-2xl font-bold text-white">Recent Token Mints</h2>
        </div>
        <span className="text-sm text-gray-400">{tokens.length} tokens</span>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => (
          <div
            key={token.id}
            className="bg-slate-700/50 rounded-lg p-4 border border-purple-500/10 hover:border-purple-500/30 transition-all"
          >
            <div className="flex items-start justify-between gap-4">
              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-white font-semibold">
                    {token.name || token.symbol || 'Unknown Token'}
                  </h3>
                  {token.symbol && token.name && (
                    <span className="text-purple-400 text-sm">${token.symbol}</span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-sm text-gray-400">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5" />
                    <span className="font-mono">{formatAddress(token.creator_address)}</span>
                  </div>
                  <div className="flex items-center gap-1.5" title={formatTimestamp(token.launch_time)}>
                    <Clock className="w-3.5 h-3.5" />
                    <span>{getTimeAgo(token.launch_time)}</span>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {formatTimestamp(token.launch_time)}
                </div>
              </div>

              {/* Links */}
              <div className="flex flex-col gap-2">
                <a
                  href={`https://solscan.io/token/${token.mint_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium rounded transition-colors"
                  title="View on Solscan"
                >
                  <span>Token</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={`https://solscan.io/tx/${token.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium rounded transition-colors"
                  title="View Transaction"
                >
                  <span>TX</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Mint Address */}
            <div className="mt-2 pt-2 border-t border-slate-600/50">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-gray-500">Mint:</span>
                <code className="text-gray-400 font-mono">{token.mint_address}</code>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
