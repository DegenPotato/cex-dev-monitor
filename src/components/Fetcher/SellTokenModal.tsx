import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, TrendingDown, AlertCircle, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';

interface Token {
  mint: string;
  symbol: string;
  name: string;
  uiAmount: number;
  decimals: number;
  priceUSD: number;
  valueUSD: number;
  logoUri?: string;
}

interface SellTokenModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletId: number;
  walletTokens?: Token[]; // Optional: pass tokens directly from portfolio
  onSellComplete?: (result: any) => void;
}

export const SellTokenModal: React.FC<SellTokenModalProps> = ({ 
  isOpen, 
  onClose, 
  walletId,
  walletTokens,
  onSellComplete 
}) => {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [selectedToken, setSelectedToken] = useState<Token | null>(null);
  const [percentage, setPercentage] = useState(100);
  const [slippage, setSlippage] = useState(5); // 5% default
  const [loading, setLoading] = useState(false);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any>(null);

  // Use pre-loaded tokens if available, otherwise fetch
  useEffect(() => {
    if (isOpen && walletId) {
      if (walletTokens && walletTokens.length > 0) {
        console.log('[SellTokenModal] Using pre-loaded tokens:', walletTokens.length);
        setTokens(walletTokens);
        setSelectedToken(walletTokens[0]);
      } else {
        fetchTokens();
      }
    }
  }, [isOpen, walletId, walletTokens]);

  const fetchTokens = async () => {
    setLoading(true);
    setError(null);
    try {
      console.log('[SellTokenModal] Fetching tokens for wallet:', walletId);
      
      const response = await fetch(`${config.apiUrl}/api/trading/wallets/${walletId}/tokens`, {
        credentials: 'include'
      });
      
      console.log('[SellTokenModal] Response status:', response.status);
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('[SellTokenModal] API error:', errorData);
        throw new Error(errorData.error || 'Failed to fetch tokens');
      }
      
      const data = await response.json();
      console.log('[SellTokenModal] Received tokens:', data.tokens?.length || 0, 'tokens');
      
      const tokensList = data.tokens || [];
      setTokens(tokensList);
      
      // Auto-select first token if available
      if (tokensList.length > 0) {
        setSelectedToken(tokensList[0]);
      }
    } catch (err: any) {
      console.error('[SellTokenModal] Error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const calculateSellAmount = () => {
    if (!selectedToken) return { tokens: 0, usd: 0 };
    
    const tokenAmount = (selectedToken.uiAmount * percentage) / 100;
    const usdValue = tokenAmount * selectedToken.priceUSD;
    
    return { tokens: tokenAmount, usd: usdValue };
  };

  const handleSell = async () => {
    if (!selectedToken) return;
    
    setSelling(true);
    setError(null);
    setResult(null);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          walletId,
          tokenMint: selectedToken.mint,
          percentage,
          slippageBps: slippage * 100 // Convert to basis points
        })
      });
      
      const data = await response.json();
      
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Sell failed');
      }
      
      setResult(data.result);
      
      // Refresh tokens after successful sell
      setTimeout(() => {
        fetchTokens();
      }, 2000);
      
      if (onSellComplete) {
        onSellComplete(data.result);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSelling(false);
    }
  };

  const sellAmount = calculateSellAmount();

  // Render modal in portal to avoid parent container overflow clipping
  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[9998]"
            onClick={onClose}
          />
          
          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed left-1/2 -translate-x-1/2 w-full max-w-2xl bg-gray-900 border border-gray-700 rounded-xl shadow-2xl z-[9999] my-8"
            style={{ 
              top: '2rem',
              maxHeight: 'calc(100vh - 4rem)'
            }}
          >
            {/* Scrollable Content Wrapper */}
            <div className="overflow-y-auto" style={{ maxHeight: 'calc(100vh - 4rem)' }}>
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-700">
              <div className="flex items-center gap-3">
                <TrendingDown className="w-6 h-6 text-red-400" />
                <h2 className="text-2xl font-bold text-white">Sell Tokens</h2>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-gray-400" />
              </button>
            </div>

            <div className="p-6 space-y-6">
              {/* Loading State */}
              {loading && (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
                </div>
              )}

              {/* No Tokens */}
              {!loading && tokens.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                  <AlertCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No tokens found in this wallet</p>
                </div>
              )}

              {/* Token Selection */}
              {!loading && tokens.length > 0 && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Select Token
                    </label>
                    <div className="grid gap-2 max-h-64 overflow-y-auto">
                      {tokens.map((token) => (
                        <button
                          key={token.mint}
                          onClick={() => setSelectedToken(token)}
                          className={`p-4 rounded-lg border-2 transition-all text-left ${
                            selectedToken?.mint === token.mint
                              ? 'border-cyan-500 bg-cyan-500/10'
                              : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {token.logoUri ? (
                                <img 
                                  src={token.logoUri} 
                                  alt={token.symbol} 
                                  className="w-10 h-10 rounded-full"
                                  onError={(e) => {
                                    e.currentTarget.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPGNpcmNsZSBjeD0iMjAiIGN5PSIyMCIgcj0iMjAiIGZpbGw9IiMzQjgyRjYiLz4KPHBhdGggZD0iTTIwIDEwVjMwIiBzdHJva2U9IndoaXRlIiBzdHJva2Utd2lkdGg9IjMiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIvPgo8cGF0aCBkPSJNMTAgMjBIMzAiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS13aWR0aD0iMyIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIi8+Cjwvc3ZnPg==';
                                  }}
                                />
                              ) : (
                                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center text-white font-bold">
                                  {token.symbol?.slice(0, 2) || '??'}
                                </div>
                              )}
                              <div>
                                <div className="font-medium text-white">{token.symbol}</div>
                                <div className="text-sm text-gray-400">{token.name}</div>
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono text-white">
                                {token.uiAmount.toLocaleString(undefined, { maximumFractionDigits: 4 })}
                              </div>
                              <div className="text-sm text-gray-400">
                                ${token.valueUSD.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                              </div>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Percentage Slider */}
                  {selectedToken && (
                    <>
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="block text-sm font-medium text-gray-300">
                            Sell Amount
                          </label>
                          <span className="text-sm text-cyan-400 font-medium">
                            {percentage}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min="1"
                          max="100"
                          value={percentage}
                          onChange={(e) => setPercentage(parseInt(e.target.value))}
                          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                        />
                        <div className="flex justify-between mt-2 gap-2">
                          {[25, 50, 75, 100].map((pct) => (
                            <button
                              key={pct}
                              onClick={() => setPercentage(pct)}
                              className={`px-3 py-1 rounded text-sm transition-colors ${
                                percentage === pct
                                  ? 'bg-cyan-500 text-white'
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              {pct}%
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Sell Preview */}
                      <div className="bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">You're selling</span>
                          <span className="text-white font-medium">
                            {sellAmount.tokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} {selectedToken.symbol}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Value</span>
                          <span className="text-white font-medium">
                            ${sellAmount.usd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                          </span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Slippage Tolerance</span>
                          <input
                            type="number"
                            value={slippage}
                            onChange={(e) => setSlippage(Math.max(0.1, Math.min(50, parseFloat(e.target.value) || 0)))}
                            className="w-20 px-2 py-1 bg-gray-700 border border-gray-600 rounded text-white text-right"
                            step="0.5"
                            min="0.1"
                            max="50"
                          />
                          <span className="text-white ml-1">%</span>
                        </div>
                      </div>

                      {/* Error Display */}
                      {error && (
                        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                          <div className="text-sm text-red-200">{error}</div>
                        </div>
                      )}

                      {/* Success Result */}
                      {result && (
                        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 space-y-2">
                          <div className="text-green-400 font-medium">✅ Sell Successful!</div>
                          <div className="text-sm text-gray-300 space-y-1">
                            <div>Sold: {result.amountIn?.toFixed(4)} {result.tokenSymbol || selectedToken?.symbol || 'tokens'}</div>
                            <div>Received: {result.amountOut?.toFixed(6)} SOL</div>
                            {result.signature && (
                              <div className="font-mono text-xs break-all">
                                <a
                                  href={`https://solscan.io/tx/${result.signature}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-cyan-400 hover:underline"
                                >
                                  View on Solscan →
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Sell Button */}
                      <button
                        onClick={handleSell}
                        disabled={selling || !selectedToken}
                        className="w-full py-3 bg-red-500 hover:bg-red-600 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
                      >
                        {selling ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Selling...
                          </>
                        ) : (
                          <>
                            <TrendingDown className="w-5 h-5" />
                            Sell {selectedToken.symbol}
                          </>
                        )}
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
