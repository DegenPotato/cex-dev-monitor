import React, { useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Zap, AlertCircle, DollarSign, Percent, Activity, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingStore } from '../../stores/tradingStore';
import { toast } from 'react-hot-toast';

export const TradingPanel: React.FC = () => {
  const { wallets, executeTrade, loading, fetchWallets } = useTradingStore();
  const [selectedWallet, setSelectedWallet] = useState('');
  const [tradeType, setTradeType] = useState<'buy' | 'sell'>('buy');
  const [tokenInputMode, setTokenInputMode] = useState<'manual' | 'from_wallet'>('manual');
  const [tokenAddress, setTokenAddress] = useState('');
  const [selectedTokenFromWallet, setSelectedTokenFromWallet] = useState('');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState('1');
  const [skipTax, setSkipTax] = useState(false);
  const [priorityFee, setPriorityFee] = useState('0.0001');
  const [estimatedOutput, setEstimatedOutput] = useState<number | null>(null);
  
  const TAX_BPS = 87; // 0.87% tax

  useEffect(() => {
    fetchWallets();
  }, []);

  // Get available tokens from selected wallet (only those with liquidity and value)
  const availableTokens = React.useMemo(() => {
    if (!selectedWallet) return [];
    const wallet = wallets.find(w => w.id === selectedWallet);
    if (!wallet?.tokens) return [];
    
    return wallet.tokens.filter(token => 
      // Has value (indicates liquidity and not honeypot)
      (token.valueUSD && token.valueUSD > 0) &&
      // Has balance
      token.uiAmount > 0
    );
  }, [selectedWallet, wallets]);

  // Update token address when selecting from wallet
  useEffect(() => {
    if (tokenInputMode === 'from_wallet' && selectedTokenFromWallet) {
      setTokenAddress(selectedTokenFromWallet);
    }
  }, [tokenInputMode, selectedTokenFromWallet]);

  useEffect(() => {
    // Calculate estimated output with tax
    if (amount && !skipTax) {
      const amountNum = parseFloat(amount);
      const taxAmount = (amountNum * TAX_BPS) / 10000;
      setEstimatedOutput(amountNum - taxAmount);
    } else if (amount) {
      setEstimatedOutput(parseFloat(amount));
    } else {
      setEstimatedOutput(null);
    }
  }, [amount, skipTax]);

  const handleTrade = async () => {
    if (!selectedWallet) {
      toast.error('Please select a wallet');
      return;
    }
    if (!tokenAddress) {
      toast.error('Please enter a token address');
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      toast.error('Please enter a valid amount');
      return;
    }

    try {
      const result = await executeTrade({
        walletId: selectedWallet,
        type: tradeType,
        tokenAddress,
        amount: parseFloat(amount),
        slippage: parseFloat(slippage),
        skipTax,
        priorityFee: parseFloat(priorityFee)
      });

      if (result.success) {
        toast.success(
          <div>
            <div>Trade executed successfully!</div>
            <div className="text-sm opacity-80">
              Tx: {result.signature?.slice(0, 8)}...
            </div>
          </div>
        );
        // Reset form
        setAmount('');
        setTokenAddress('');
      } else {
        toast.error(result.error || 'Trade failed');
      }
    } catch (error) {
      toast.error('Failed to execute trade');
    }
  };

  const quickAmounts = ['0.1', '0.5', '1', '5', '10'];
  const quickSlippages = ['0.5', '1', '3', '5', '10'];

  return (
    <div className="w-full max-w-4xl mx-auto p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-900/50 border border-cyan-500/30 rounded-xl p-6"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
            <Zap className="w-6 h-6" />
            Quick Trade
          </h2>
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-green-400 animate-pulse" />
            <span className="text-sm text-gray-400">Live Trading</span>
          </div>
        </div>

        {/* Trade Type Selector */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <button
            onClick={() => setTradeType('buy')}
            className={`py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-all
              ${tradeType === 'buy' 
                ? 'bg-green-500/20 border-2 border-green-500 text-green-400' 
                : 'bg-gray-800/50 border-2 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <TrendingUp className="w-5 h-5" />
            Buy Token
          </button>
          <button
            onClick={() => setTradeType('sell')}
            className={`py-3 rounded-lg flex items-center justify-center gap-2 font-medium transition-all
              ${tradeType === 'sell' 
                ? 'bg-red-500/20 border-2 border-red-500 text-red-400' 
                : 'bg-gray-800/50 border-2 border-gray-700 text-gray-400 hover:border-gray-600'}`}
          >
            <TrendingDown className="w-5 h-5" />
            Sell Token
          </button>
        </div>

        {/* Wallet Selector */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Select Wallet</label>
          <select
            value={selectedWallet}
            onChange={(e) => setSelectedWallet(e.target.value)}
            className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                     focus:outline-none focus:border-cyan-500 transition-colors"
          >
            <option value="">Choose a wallet...</option>
            {wallets.map(wallet => (
              <option key={wallet.id} value={wallet.id}>
                {wallet.name} - {wallet.balance?.toFixed(4) || '0.0000'} SOL
              </option>
            ))}
          </select>
        </div>

        {/* Token Input Mode Toggle */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Token Selection</label>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setTokenInputMode('manual');
                setSelectedTokenFromWallet('');
                if (tokenInputMode === 'from_wallet') setTokenAddress('');
              }}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tokenInputMode === 'manual'
                  ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                  : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent text-gray-400'
              }`}
            >
              Manual CA
            </button>
            <button
              onClick={() => {
                setTokenInputMode('from_wallet');
                setTokenAddress('');
              }}
              disabled={!selectedWallet || availableTokens.length === 0}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                tokenInputMode === 'from_wallet'
                  ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                  : availableTokens.length === 0
                  ? 'bg-gray-800 border border-transparent text-gray-600 cursor-not-allowed'
                  : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent text-gray-400'
              }`}
            >
              From Wallet ({availableTokens.length})
            </button>
          </div>
        </div>

        {/* Token Address Input or Dropdown */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            {tokenInputMode === 'manual' ? 'Token Address' : 'Select Token'}
          </label>
          
          {tokenInputMode === 'manual' ? (
            <input
              type="text"
              value={tokenAddress}
              onChange={(e) => setTokenAddress(e.target.value)}
              placeholder={tradeType === 'buy' ? 'Token to buy (e.g., pump...pump)' : 'Token to sell'}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                       focus:outline-none focus:border-cyan-500 transition-colors"
            />
          ) : (
            <select
              value={selectedTokenFromWallet}
              onChange={(e) => setSelectedTokenFromWallet(e.target.value)}
              className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                       focus:outline-none focus:border-cyan-500 transition-colors"
            >
              <option value="">Select a token from your wallet...</option>
              {availableTokens.map(token => (
                <option key={token.mint} value={token.mint}>
                  {token.symbol || token.name || token.mint.slice(0, 8)}
                  {' '}
                  ({token.uiAmount.toFixed(4)} • ${(token.valueUSD || 0).toFixed(2)})
                </option>
              ))}
            </select>
          )}
          
          {tokenInputMode === 'from_wallet' && availableTokens.length === 0 && selectedWallet && (
            <p className="text-xs text-yellow-400 mt-2">
              ⚠️ No tokens with liquidity found in this wallet
            </p>
          )}
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">
            Amount ({tradeType === 'buy' ? 'SOL' : 'Tokens'})
          </label>
          <div className="relative">
            <DollarSign className="absolute left-3 top-3.5 w-5 h-5 text-gray-500" />
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              step="0.01"
              className="w-full pl-10 pr-4 py-3 bg-gray-800 border border-gray-700 rounded-lg
                       focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>
          <div className="flex gap-2 mt-2">
            {quickAmounts.map(amt => (
              <button
                key={amt}
                onClick={() => setAmount(amt)}
                className="flex-1 py-1 bg-gray-700/50 hover:bg-gray-700 rounded text-sm transition-colors"
              >
                {amt}
              </button>
            ))}
          </div>
        </div>

        {/* Advanced Settings */}
        <div className="space-y-4 mb-6">
          {/* Slippage */}
          <div>
            <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
              <Percent className="w-4 h-4" />
              Slippage Tolerance
            </label>
            <div className="flex gap-2">
              {quickSlippages.map(slip => (
                <button
                  key={slip}
                  onClick={() => setSlippage(slip)}
                  className={`flex-1 py-2 rounded-lg text-sm transition-all
                    ${slippage === slip
                      ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                      : 'bg-gray-700/50 hover:bg-gray-700 border border-transparent'}`}
                >
                  {slip}%
                </button>
              ))}
            </div>
          </div>

          {/* Priority Fee */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Priority Fee (SOL)</label>
            <input
              type="number"
              value={priorityFee}
              onChange={(e) => setPriorityFee(e.target.value)}
              step="0.0001"
              className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg
                       focus:outline-none focus:border-cyan-500 transition-colors text-sm"
            />
          </div>

          {/* Tax Toggle */}
          <div className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-yellow-400" />
              <span className="text-sm">Platform Tax (0.87%)</span>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={!skipTax}
                onChange={(e) => setSkipTax(!e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-700 rounded-full peer-checked:bg-cyan-500 
                            peer-checked:after:translate-x-full after:content-[''] 
                            after:absolute after:top-[2px] after:left-[2px] 
                            after:bg-white after:rounded-full after:h-5 after:w-5 
                            after:transition-all"></div>
            </label>
          </div>
        </div>

        {/* Summary */}
        {estimatedOutput !== null && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="mb-6 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg"
          >
            <div className="flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-cyan-400 mt-0.5" />
              <div className="flex-1 text-sm">
                <div className="text-cyan-400 font-medium mb-2">Trade Summary</div>
                <div className="space-y-1 text-gray-300">
                  <div className="flex justify-between">
                    <span>Input Amount:</span>
                    <span className="font-mono">{amount} {tradeType === 'buy' ? 'SOL' : 'tokens'}</span>
                  </div>
                  {!skipTax && (
                    <div className="flex justify-between text-yellow-400">
                      <span>Platform Tax:</span>
                      <span className="font-mono">{((parseFloat(amount) * TAX_BPS) / 10000).toFixed(4)}</span>
                    </div>
                  )}
                  <div className="flex justify-between font-medium">
                    <span>Net Amount:</span>
                    <span className="font-mono text-cyan-400">
                      {estimatedOutput.toFixed(4)} {tradeType === 'buy' ? 'SOL' : 'tokens'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Execute Button */}
        <button
          onClick={handleTrade}
          disabled={loading || !selectedWallet || !tokenAddress || !amount}
          className={`w-full py-4 rounded-lg font-bold text-lg transition-all flex items-center justify-center gap-2
            ${loading || !selectedWallet || !tokenAddress || !amount
              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
              : tradeType === 'buy'
                ? 'bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white'
                : 'bg-gradient-to-r from-red-500 to-rose-600 hover:from-red-600 hover:to-rose-700 text-white'}`}
        >
          {loading ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing...
            </>
          ) : (
            <>
              {tradeType === 'buy' ? <TrendingUp className="w-5 h-5" /> : <TrendingDown className="w-5 h-5" />}
              {tradeType === 'buy' ? 'Buy Token' : 'Sell Token'}
            </>
          )}
        </button>

        {/* Security Note */}
        <div className="mt-4 flex items-center justify-center gap-2 text-xs text-gray-500">
          <Shield className="w-3 h-3" />
          <span>Private keys encrypted with AES-256-GCM</span>
        </div>
      </motion.div>
    </div>
  );
};
