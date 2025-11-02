import React, { useState, useEffect } from 'react';
import { X, Loader2, TrendingUp, Droplets, Lock } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';

interface Pool {
  address: string;
  name: string;
  dex: string;
  priceUsd: string;
  liquidityUsd: string;
  volume24h: number;
  priceChange24h: number;
  transactions24h: number;
  poolCreatedAt: string;
}

interface PoolSelectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  tokenMint: string;
  onSelectPool: (poolAddress: string) => void;
}

export const PoolSelectionModal: React.FC<PoolSelectionModalProps> = ({
  isOpen,
  onClose,
  tokenMint,
  onSelectPool
}) => {
  const [pools, setPools] = useState<Pool[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && tokenMint) {
      fetchPools();
    }
  }, [isOpen, tokenMint]);

  const fetchPools = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/pools/${tokenMint}`, {
        credentials: 'include'
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch pools');
      }
      
      const data = await response.json();
      setPools(data.pools || []);
      
      if (data.pools.length === 0) {
        setError('No pools found for this token');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch pools');
    } finally {
      setLoading(false);
    }
  };

  const formatLiquidity = (value: string) => {
    const num = parseFloat(value);
    if (num >= 1000000) return `$${(num / 1000000).toFixed(2)}M`;
    if (num >= 1000) return `$${(num / 1000).toFixed(2)}K`;
    return `$${num.toFixed(2)}`;
  };

  const formatVolume = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(2)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(2)}K`;
    return `$${value.toFixed(2)}`;
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-gray-900 border border-gray-700 rounded-xl max-w-4xl w-full max-h-[80vh] overflow-hidden flex flex-col"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-700">
            <div>
              <h2 className="text-xl font-bold text-white">Select Pool</h2>
              <p className="text-sm text-gray-400 mt-1">
                Choose which pool to monitor for {tokenMint.slice(0, 8)}...
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-800 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-400" />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {loading && (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
              </div>
            )}

            {error && (
              <div className="bg-red-900/20 border border-red-600 rounded-lg p-4 text-red-400">
                {error}
              </div>
            )}

            {!loading && !error && pools.length > 0 && (
              <div className="space-y-3">
                {pools.map((pool) => (
                  <motion.div
                    key={pool.address}
                    whileHover={{ scale: 1.01 }}
                    onClick={() => {
                      onSelectPool(pool.address);
                      onClose();
                    }}
                    className="bg-gray-800 border border-gray-700 hover:border-cyan-500 rounded-xl p-4 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-3">
                          <div className="px-2 py-1 bg-cyan-900/30 border border-cyan-500/30 rounded text-xs text-cyan-400 font-medium uppercase">
                            {pool.dex}
                          </div>
                          <span className="text-white font-medium">{pool.name}</span>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                          <div>
                            <div className="text-gray-400 flex items-center gap-1 mb-1">
                              <Droplets className="w-3 h-3" />
                              Liquidity
                            </div>
                            <div className="text-white font-medium">
                              {formatLiquidity(pool.liquidityUsd)}
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-gray-400 mb-1">24h Volume</div>
                            <div className="text-white font-medium">
                              {formatVolume(pool.volume24h)}
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-gray-400 mb-1">24h Change</div>
                            <div className={`font-medium ${pool.priceChange24h >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pool.priceChange24h >= 0 ? '+' : ''}{pool.priceChange24h.toFixed(2)}%
                            </div>
                          </div>
                          
                          <div>
                            <div className="text-gray-400 mb-1">24h Txns</div>
                            <div className="text-white font-medium">
                              {pool.transactions24h}
                            </div>
                          </div>
                        </div>
                        
                        <div className="mt-3 text-xs text-gray-500 font-mono">
                          {pool.address}
                        </div>
                      </div>
                      
                      <div className="flex flex-col items-end gap-2">
                        <div className="px-2 py-1 bg-green-900/20 border border-green-600/30 rounded text-xs text-green-400 flex items-center gap-1">
                          <TrendingUp className="w-3 h-3" />
                          Active
                        </div>
                        {/* TODO: Add actual burn/lock detection */}
                        {parseFloat(pool.liquidityUsd) > 50000 && (
                          <div className="px-2 py-1 bg-blue-900/20 border border-blue-600/30 rounded text-xs text-blue-400 flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            High Liq
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
