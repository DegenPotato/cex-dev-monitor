import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { PoolSelectionModal } from './Fetcher/PoolSelectionModal';
import { toast } from 'react-hot-toast';
import { config } from '../config';

interface ManualTelegramPositionProps {
  onPositionCreated?: () => void;
}

export const ManualTelegramPosition: React.FC<ManualTelegramPositionProps> = ({ onPositionCreated }) => {
  const [showModal, setShowModal] = useState(false);
  const [tokenMint, setTokenMint] = useState('');
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [poolAddress, setPoolAddress] = useState('');
  const [loading, setLoading] = useState(false);

  const handleStartMonitoring = async () => {
    if (!tokenMint || !poolAddress) {
      toast.error('Please enter token address and select pool');
      return;
    }

    setLoading(true);
    try {
      // Start campaign for manual Telegram position
      const response = await fetch(`${config.apiUrl}/api/telegram/positions/manual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMint, poolAddress })
      });

      if (!response.ok) {
        throw new Error('Failed to start monitoring');
      }

      await response.json();
      toast.success(`Monitoring started for ${tokenMint.slice(0, 8)}...`);
      
      setShowModal(false);
      setTokenMint('');
      setPoolAddress('');
      
      if (onPositionCreated) {
        onPositionCreated();
      }
    } catch (error: any) {
      console.error('Failed to start monitoring:', error);
      toast.error(error.message || 'Failed to start monitoring');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg flex items-center gap-2 transition-colors"
      >
        <Plus className="w-4 h-4" />
        Manual Monitor
      </button>

      {showModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl max-w-lg w-full p-6">
            <h2 className="text-xl font-bold text-white mb-4">Start Manual Monitoring</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Token Address (CA)</label>
                <input
                  type="text"
                  value={tokenMint}
                  onChange={(e) => setTokenMint(e.target.value)}
                  placeholder="Enter Solana token mint address..."
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Pool Selection</label>
                {poolAddress ? (
                  <div className="px-4 py-2 bg-green-900/20 border border-green-600/30 rounded-lg text-green-400 font-mono text-sm">
                    {poolAddress.slice(0, 8)}...{poolAddress.slice(-8)}
                  </div>
                ) : (
                  <button
                    onClick={() => {
                      if (!tokenMint) {
                        toast.error('Please enter token address first');
                        return;
                      }
                      setShowPoolModal(true);
                    }}
                    disabled={!tokenMint}
                    className="w-full px-4 py-2 bg-gray-800 border border-gray-700 hover:border-cyan-500 rounded-lg text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {tokenMint ? 'Select Pool from Available Pools' : 'Enter token address first'}
                  </button>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleStartMonitoring}
                  disabled={loading || !tokenMint || !poolAddress}
                  className="flex-1 px-4 py-2 bg-cyan-600 hover:bg-cyan-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                >
                  {loading ? 'Starting...' : 'Start Monitoring'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PoolSelectionModal
        isOpen={showPoolModal}
        onClose={() => setShowPoolModal(false)}
        tokenMint={tokenMint}
        onSelectPool={(poolAddr) => {
          setPoolAddress(poolAddr);
          setShowPoolModal(false);
          toast.success('Pool selected!');
        }}
      />
    </>
  );
};
