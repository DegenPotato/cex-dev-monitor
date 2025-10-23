import { useEffect, useState } from 'react';
import { ExternalLink, Clock, User, Rocket, Activity } from 'lucide-react';
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
  total_supply?: string;
  market_cap_usd?: number;
  coingecko_coin_id?: string;
  gt_score?: number;
  description?: string;
  metadata?: string;
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
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Rocket className="w-6 h-6 text-cyan-400 animate-pulse" />
          <h2 className="text-2xl font-bold text-cyan-400">Token Sniffer</h2>
        </div>
        <div className="text-cyan-300/60 text-center py-8 flex items-center justify-center gap-2">
          <Activity className="w-5 h-5 animate-spin" />
          <span>Scanning blockchain...</span>
        </div>
      </div>
    );
  }

  if (tokens.length === 0) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Rocket className="w-6 h-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-cyan-400">Token Sniffer</h2>
        </div>
        <div className="text-cyan-300/60 text-center py-8 bg-black/20 rounded-lg border border-cyan-500/10">
          No tokens detected yet. Add monitored wallets to start tracking.
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Rocket className="w-6 h-6 text-cyan-400" />
          <h2 className="text-2xl font-bold text-cyan-400">Token Sniffer</h2>
          <div className="h-[1px] w-16 bg-gradient-to-r from-cyan-400 to-transparent" />
        </div>
        <span className="text-sm text-cyan-300/60 bg-black/30 backdrop-blur-sm px-3 py-1 rounded-full border border-cyan-500/20">{tokens.length} tokens</span>
      </div>

      <div className="space-y-3">
        {tokens.map((token) => (
          <div
            key={token.id}
            className="bg-black/30 backdrop-blur-xl rounded-lg p-4 border border-cyan-500/10 hover:border-cyan-500/30 transition-all hover:bg-cyan-500/5 shadow-lg shadow-cyan-500/5 hover:shadow-cyan-500/10 relative overflow-hidden group"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-purple-500/5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
            <div className="flex items-start justify-between gap-4 relative z-10">
              {/* Token Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-white font-semibold">
                    {token.name || token.symbol || 'Unknown Token'}
                  </h3>
                  {token.symbol && token.name && (
                    <span className="text-cyan-400 text-sm bg-cyan-500/10 px-2 py-0.5 rounded">${token.symbol}</span>
                  )}
                </div>
                
                <div className="flex items-center gap-4 text-sm text-cyan-200/60">
                  <div className="flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-cyan-400/60" />
                    <span className="font-mono">{formatAddress(token.creator_address)}</span>
                  </div>
                  <div className="flex items-center gap-1.5" title={formatTimestamp(token.launch_time)}>
                    <Clock className="w-3.5 h-3.5 text-cyan-400/60" />
                    <span>{getTimeAgo(token.launch_time)}</span>
                  </div>
                </div>
                <div className="text-xs text-cyan-300/40 mt-1">
                  {formatTimestamp(token.launch_time)}
                </div>
              </div>

              {/* Links */}
              <div className="flex flex-col gap-2">
                <a
                  href={`https://solscan.io/token/${token.mint_address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 text-xs font-medium rounded transition-all hover:shadow-lg hover:shadow-cyan-500/20 backdrop-blur-sm"
                  title="View on Solscan"
                >
                  <span>Token</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
                <a
                  href={`https://solscan.io/tx/${token.signature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-400 border border-purple-500/40 text-xs font-medium rounded transition-all hover:shadow-lg hover:shadow-purple-500/20 backdrop-blur-sm"
                  title="View Transaction"
                >
                  <span>TX</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Mint Address */}
            <div className="mt-2 pt-2 border-t border-cyan-500/10 relative z-10">
              <div className="flex items-center gap-2 text-xs">
                <span className="text-cyan-300/40">Mint:</span>
                <code className="text-cyan-200/60 font-mono bg-black/20 px-2 py-0.5 rounded">{token.mint_address}</code>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
