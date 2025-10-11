import { TokenMint } from '../types';
import { Rocket, TrendingUp, TrendingDown, DollarSign, Flame, Clock } from 'lucide-react';

interface TokenListProps {
  tokens: TokenMint[];
}

export function TokenList({ tokens }: TokenListProps) {
  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const formatMarketCap = (mcap?: number) => {
    if (!mcap || mcap === 0) return 'N/A';
    if (mcap >= 1000000) return `$${(mcap / 1000000).toFixed(2)}M`;
    if (mcap >= 1000) return `$${(mcap / 1000).toFixed(2)}K`;
    return `$${mcap.toFixed(2)}`;
  };

  const calculatePriceChange = (current?: number, ath?: number) => {
    if (!current || !ath || ath === 0) return null;
    const change = ((current - ath) / ath) * 100;
    return change;
  };

  const getTimeAgo = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-2">
        <Rocket className="w-6 h-6 text-purple-400" />
        Pump.fun Token Mints
      </h2>
      
      {tokens.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-gray-400">No tokens detected yet. Monitoring pump.fun...</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3">
          {tokens.map((token) => {
            const priceChange = calculatePriceChange(token.current_mcap, token.ath_mcap);
            const hasMarketData = token.current_mcap && token.current_mcap > 0;
            
            return (
              <div
                key={token.mint_address}
                className="bg-gradient-to-br from-purple-500/20 to-pink-500/20 rounded-lg p-5 border border-purple-500/30 hover:border-purple-500/50 transition-all"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Rocket className="w-5 h-5 text-purple-400" />
                      {token.symbol ? (
                        <h3 className="text-xl font-bold text-white">${token.symbol}</h3>
                      ) : (
                        <h3 className="text-sm font-mono text-white">{formatAddress(token.mint_address)}</h3>
                      )}
                    </div>
                    {token.name && (
                      <p className="text-sm text-gray-300 mt-1">{token.name}</p>
                    )}
                    <div className="flex items-center gap-2 mt-2 text-xs text-gray-400">
                      <Clock className="w-3 h-3" />
                      <span>{getTimeAgo(token.timestamp)}</span>
                    </div>
                  </div>
                </div>

                {/* Market Data */}
                {hasMarketData ? (
                  <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
                    <div className="grid grid-cols-2 gap-3">
                      {/* Current Market Cap */}
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                          <DollarSign className="w-3 h-3" />
                          <span>Current MCap</span>
                        </div>
                        <div className="text-lg font-bold text-green-400">
                          {formatMarketCap(token.current_mcap)}
                        </div>
                      </div>

                      {/* ATH Market Cap */}
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                          <Flame className="w-3 h-3" />
                          <span>ATH MCap</span>
                        </div>
                        <div className="text-lg font-bold text-orange-400">
                          {formatMarketCap(token.ath_mcap)}
                        </div>
                      </div>

                      {/* Launch Market Cap */}
                      <div>
                        <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                          <TrendingUp className="w-3 h-3" />
                          <span>Launch MCap</span>
                        </div>
                        <div className="text-sm font-semibold text-blue-400">
                          {formatMarketCap(token.starting_mcap)}
                        </div>
                      </div>

                      {/* Price Change from ATH */}
                      {priceChange !== null && (
                        <div>
                          <div className="flex items-center gap-1 text-xs text-gray-400 mb-1">
                            {priceChange >= 0 ? (
                              <TrendingUp className="w-3 h-3" />
                            ) : (
                              <TrendingDown className="w-3 h-3" />
                            )}
                            <span>vs ATH</span>
                          </div>
                          <div className={`text-sm font-semibold ${priceChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {priceChange >= 0 ? '+' : ''}{priceChange.toFixed(2)}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-900/50 rounded-lg p-4 mb-4 text-center">
                    <p className="text-xs text-gray-400">Market data loading...</p>
                  </div>
                )}

                {/* Creator Info */}
                <div className="space-y-2 text-xs mb-4">
                  <div>
                    <span className="text-gray-400">Creator: </span>
                    <span className="font-mono text-gray-300">{formatAddress(token.creator_address)}</span>
                  </div>
                  <div>
                    <span className="text-gray-400">Contract: </span>
                    <span className="font-mono text-gray-300">{formatAddress(token.mint_address)}</span>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  <a
                    href={`https://solscan.io/token/${token.mint_address}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 bg-purple-600/50 hover:bg-purple-600/70 text-white text-xs font-medium py-2 rounded text-center transition-all"
                  >
                    Solscan
                  </a>
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
                    PF
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
