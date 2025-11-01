import React from 'react';
import { Settings, Zap, Clock, Percent, AlertTriangle, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTradingSettingsStore, CommitmentLevel, PriorityLevel } from '../../stores/tradingSettingsStore';
import { toast } from 'react-hot-toast';

export const SettingsPanel: React.FC = () => {
  const {
    commitmentLevel,
    defaultPriorityLevel,
    defaultSlippage,
    setCommitmentLevel,
    setDefaultPriorityLevel,
    setDefaultSlippage,
    resetToDefaults
  } = useTradingSettingsStore();

  const commitmentOptions: { value: CommitmentLevel; label: string; speed: string; safety: string; description: string }[] = [
    {
      value: 'processing',
      label: 'Processing',
      speed: '~400ms',
      safety: 'Low',
      description: 'Fastest - transaction received by node. Can be dropped or reverted.'
    },
    {
      value: 'confirmed',
      label: 'Confirmed',
      speed: '6-10s',
      safety: 'High',
      description: 'Recommended - 2/3 of stake confirmed. Very safe for most use cases.'
    },
    {
      value: 'finalized',
      label: 'Finalized',
      speed: '12-15s',
      safety: 'Maximum',
      description: 'Slowest - fully finalized and immutable. Maximum safety.'
    }
  ];

  const priorityOptions: { value: PriorityLevel; label: string; fee: string; description: string }[] = [
    {
      value: 'low',
      label: 'Low',
      fee: '~$0.0000002',
      description: 'Cheapest - good for manual trading'
    },
    {
      value: 'medium',
      label: 'Medium',
      fee: '~$0.000001',
      description: 'Balanced - reasonable speed and cost'
    },
    {
      value: 'high',
      label: 'High',
      fee: '~$0.000002',
      description: 'Fast - priority over most transactions'
    },
    {
      value: 'turbo',
      label: 'Turbo',
      fee: '~$0.00001',
      description: 'Fastest - for sniping and MEV'
    }
  ];

  const handleResetDefaults = () => {
    resetToDefaults();
    toast.success('Settings reset to defaults');
  };

  return (
    <div className="w-full max-w-5xl mx-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Settings className="w-6 h-6" />
          Trading Settings
        </h2>
        <button
          onClick={handleResetDefaults}
          className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-cyan-400 transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset to Defaults
        </button>
      </div>

      <div className="space-y-6">
        {/* Commitment Level Setting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-900/50 border border-cyan-500/30 rounded-xl p-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <Clock className="w-5 h-5 text-cyan-400 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">Transaction Confirmation Level</h3>
              <p className="text-sm text-gray-400">
                Choose how long to wait for transaction confirmation. Lower levels are faster but riskier.
              </p>
            </div>
          </div>

          <div className="grid gap-3">
            {commitmentOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setCommitmentLevel(option.value);
                  toast.success(`Commitment level set to ${option.label}`);
                }}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  commitmentLevel === option.value
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      commitmentLevel === option.value
                        ? 'border-cyan-500 bg-cyan-500'
                        : 'border-gray-600'
                    }`}>
                      {commitmentLevel === option.value && (
                        <div className="w-2 h-2 bg-white rounded-full" />
                      )}
                    </div>
                    <div>
                      <div className="font-medium text-white">{option.label}</div>
                      <div className="text-xs text-gray-500">{option.description}</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium text-cyan-400">{option.speed}</div>
                    <div className={`text-xs ${
                      option.safety === 'Low' ? 'text-yellow-400' :
                      option.safety === 'High' ? 'text-green-400' :
                      'text-cyan-400'
                    }`}>
                      Safety: {option.safety}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {commitmentLevel === 'processing' && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <strong>Warning:</strong> Processing commitment is fastest but transactions can be dropped or reverted. 
                Only use for sniping/automation where speed is critical.
              </div>
            </div>
          )}
        </motion.div>

        {/* Priority Fee Setting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-gray-900/50 border border-cyan-500/30 rounded-xl p-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <Zap className="w-5 h-5 text-cyan-400 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">Default Priority Fee</h3>
              <p className="text-sm text-gray-400">
                Higher fees get faster block inclusion. Set your default for all trades.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {priorityOptions.map((option) => (
              <button
                key={option.value}
                onClick={() => {
                  setDefaultPriorityLevel(option.value);
                  toast.success(`Priority level set to ${option.label}`);
                }}
                className={`p-4 rounded-lg border-2 transition-all text-left ${
                  defaultPriorityLevel === option.value
                    ? 'border-cyan-500 bg-cyan-500/10'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3 mb-2">
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    defaultPriorityLevel === option.value
                      ? 'border-cyan-500 bg-cyan-500'
                      : 'border-gray-600'
                  }`}>
                    {defaultPriorityLevel === option.value && (
                      <div className="w-2 h-2 bg-white rounded-full" />
                    )}
                  </div>
                  <div className="font-medium text-white">{option.label}</div>
                </div>
                <div className="text-xs text-gray-500 mb-1">{option.description}</div>
                <div className="text-sm font-mono text-cyan-400">{option.fee}</div>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Slippage Setting */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-gray-900/50 border border-cyan-500/30 rounded-xl p-6"
        >
          <div className="flex items-start gap-3 mb-4">
            <Percent className="w-5 h-5 text-cyan-400 mt-1" />
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-1">Default Slippage Tolerance</h3>
              <p className="text-sm text-gray-400">
                Maximum price movement allowed during trade execution. Higher = less likely to fail.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <input
              type="range"
              min="0.1"
              max="20"
              step="0.1"
              value={defaultSlippage}
              onChange={(e) => setDefaultSlippage(parseFloat(e.target.value))}
              className="flex-1 h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="0.1"
                max="20"
                step="0.1"
                value={defaultSlippage}
                onChange={(e) => setDefaultSlippage(parseFloat(e.target.value) || 1)}
                className="w-20 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-center font-mono"
              />
              <span className="text-gray-400">%</span>
            </div>
          </div>

          <div className="flex justify-between mt-3 text-xs text-gray-500">
            <span>0.1% (tight)</span>
            <span>20% (loose)</span>
          </div>

          {defaultSlippage > 5 && (
            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-xs text-yellow-200">
                High slippage tolerance ({defaultSlippage}%) may result in unfavorable prices. Consider lowering for better execution.
              </div>
            </div>
          )}
        </motion.div>

        {/* Info Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4"
        >
          <div className="text-sm text-cyan-200">
            <strong>💡 Pro Tip:</strong> For automation and sniping, use <strong>Processing</strong> commitment 
            with <strong>Turbo</strong> priority for sub-second execution. For manual trading, 
            stick with <strong>Confirmed</strong> + <strong>Low/Medium</strong> priority to save fees.
          </div>
        </motion.div>
      </div>
    </div>
  );
};
