import React, { useState } from 'react';
import { 
  Activity,
  Zap,
  GitBranch
} from 'lucide-react';
import { config as appConfig } from '../config';
import { toast } from 'react-hot-toast';

interface AutoTradeConfig {
  action_on_detection: string;
}


interface Props {
  chatId: string;
  currentConfig?: Partial<AutoTradeConfig>;
  onSave: (config: AutoTradeConfig) => void;
  onCancel: () => void;
}

export const TelegramAutoTradeConfig: React.FC<Props> = ({
  chatId,
  currentConfig,
  onSave,
  onCancel
}) => {
  // State for configuration - simplified to just action selection
  const [config, setConfig] = useState<AutoTradeConfig>({
    action_on_detection: currentConfig?.action_on_detection || 'forward_only'
  });

  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
      toast.error('Please select a wallet for trading');
      return;
    }

    setLoading(true);
    try {
      // Save configuration
      const response = await fetch(`${appConfig.apiUrl}/api/telegram/auto-trade/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          chatId,
          config
        })
      });

      if (!response.ok) throw new Error('Failed to save configuration');

      toast.success('Auto-trade configuration saved!');
      onSave(config);
    } catch (error) {
      toast.error('Failed to save configuration');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const actionOptions = [
    { value: 'forward_only', label: 'Forward Only', icon: GitBranch, color: 'blue' },
    { value: 'send_to_test_lab', label: 'Send to Test Lab', icon: Activity, color: 'cyan' },
    { value: 'both', label: 'Forward + Test Lab', icon: Zap, color: 'green' }
  ];

  const priorityLevels = [
    { value: 'low', label: 'Low', tip: 0.0001 },
    { value: 'medium', label: 'Medium', tip: 0.0005 },
    { value: 'high', label: 'High', tip: 0.001 },
    { value: 'turbo', label: 'Turbo', tip: 0.002 }
  ];

  return (
    <div className="space-y-6">
      {/* Action on Detection */}
      <div>
        <label className="block text-sm font-medium text-cyan-300 mb-3">
          Action on Contract Detection
        </label>
        <div className="grid grid-cols-2 gap-3">
          {actionOptions.map(option => {
            const Icon = option.icon;
            const isSelected = config.action_on_detection === option.value;
            return (
              <button
                key={option.value}
                onClick={() => setConfig(prev => ({ ...prev, action_on_detection: option.value }))}
                className={`p-4 rounded-lg border-2 transition-all ${
                  isSelected
                    ? `border-${option.color}-500 bg-${option.color}-500/20`
                    : 'border-gray-700 bg-black/20 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className={`w-5 h-5 text-${option.color}-400`} />
                  <div className="text-left">
                    <div className="font-medium text-white">{option.label}</div>
                    <div className="text-xs text-gray-400">
                      {option.value === 'forward_only' && 'Traditional message forwarding'}
                      {option.value === 'send_to_test_lab' && 'Send to Test Lab for tracking'}
                      {option.value === 'both' && 'Forward messages + Send to Test Lab'}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Action Buttons */}
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-green-300 flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Auto-Buy Configuration
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_buy_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-green-500 focus:ring-green-500"
              />
              <span className="text-sm text-gray-300">Enable Auto-Buy</span>
            </label>
          </div>

          {config.auto_buy_enabled && (
            <div className="space-y-4">
              {/* Wallet Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Trading Wallet
                </label>
                <select
                  value={config.auto_buy_wallet_id || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_wallet_id: Number(e.target.value) }))}
                  className="w-full px-4 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                >
                  <option value="">Select wallet...</option>
                  {wallets.map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.sol_balance.toFixed(4)} SOL)
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Buy Amount (SOL)
                  </label>
                  <input
                    type="number"
                    value={config.auto_buy_amount_sol}
                    onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_amount_sol: Number(e.target.value) }))}
                    min="0.001"
                    step="0.01"
                    className="w-full px-4 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Slippage (%)
                  </label>
                  <input
                    type="number"
                    value={config.auto_buy_slippage_bps / 100}
                    onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_slippage_bps: Number(e.target.value) * 100 }))}
                    min="0.1"
                    step="0.5"
                    className="w-full px-4 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              {/* Priority & Jito */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Priority Level
                  </label>
                  <select
                    value={config.auto_buy_priority_level}
                    onChange={(e) => setConfig(prev => ({ 
                      ...prev, 
                      auto_buy_priority_level: e.target.value,
                      auto_buy_jito_tip_sol: priorityLevels.find(p => p.value === e.target.value)?.tip || 0.001
                    }))}
                    className="w-full px-4 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  >
                    {priorityLevels.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label} ({level.tip} SOL tip)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={config.auto_buy_skip_tax}
                      onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_skip_tax: e.target.checked }))}
                      className="rounded border-gray-600 text-green-500 focus:ring-green-500"
                    />
                    <span className="text-sm text-gray-300">Skip Trading Tax</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-Sell Configuration */}
      {config.auto_buy_enabled && (
        <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-red-300 flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Auto-Sell Configuration
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_sell_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_sell_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-red-500 focus:ring-red-500"
              />
              <span className="text-sm text-gray-300">Enable Auto-Sell</span>
            </label>
          </div>

          {config.auto_sell_enabled && (
            <div className="space-y-4">
              {/* Stop Loss & Take Profit */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <ArrowDownCircle className="inline w-4 h-4 mr-1 text-red-400" />
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    value={config.stop_loss_percent}
                    onChange={(e) => setConfig(prev => ({ ...prev, stop_loss_percent: Number(e.target.value) }))}
                    max="-1"
                    step="5"
                    className="w-full px-4 py-2 bg-black/40 border border-red-500/30 rounded-lg text-white focus:outline-none focus:border-red-500/50"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    <ArrowUpCircle className="inline w-4 h-4 mr-1 text-green-400" />
                    Take Profit (%)
                  </label>
                  <input
                    type="number"
                    value={config.take_profit_percent}
                    onChange={(e) => setConfig(prev => ({ ...prev, take_profit_percent: Number(e.target.value) }))}
                    min="10"
                    step="10"
                    className="w-full px-4 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              {/* Trailing Stop */}
              <div className="border border-orange-500/30 rounded-lg p-3 bg-orange-500/5">
                <label className="flex items-center justify-between">
                  <span className="text-sm font-medium text-orange-300">
                    Enable Trailing Stop
                  </span>
                  <input
                    type="checkbox"
                    checked={config.trailing_stop_enabled}
                    onChange={(e) => setConfig(prev => ({ ...prev, trailing_stop_enabled: e.target.checked }))}
                    className="rounded border-gray-600 text-orange-500 focus:ring-orange-500"
                  />
                </label>
                
                {config.trailing_stop_enabled && (
                  <div className="mt-3">
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Trail Distance (%)
                    </label>
                    <input
                      type="number"
                      value={config.trailing_stop_percent}
                      onChange={(e) => setConfig(prev => ({ ...prev, trailing_stop_percent: Number(e.target.value) }))}
                      min="5"
                      step="5"
                      className="w-full px-4 py-2 bg-black/40 border border-orange-500/30 rounded-lg text-white focus:outline-none focus:border-orange-500/50"
                    />
                    <p className="text-xs text-gray-400 mt-1">
                      Activates after 20% profit, then trails by this percentage
                    </p>
                  </div>
                )}
              </div>

              {/* Sell Slippage */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Sell Slippage (%)
                </label>
                <input
                  type="number"
                  value={config.auto_sell_slippage_bps / 100}
                  onChange={(e) => setConfig(prev => ({ ...prev, auto_sell_slippage_bps: Number(e.target.value) * 100 }))}
                  min="0.5"
                  step="0.5"
                  className="w-full px-4 py-2 bg-black/40 border border-red-500/30 rounded-lg text-white focus:outline-none focus:border-red-500/50"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Monitor Configuration */}
      {(config.action_on_detection.includes('monitor') || config.action_on_detection === 'all') && (
        <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/5">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-purple-300 flex items-center gap-2">
              <Activity className="w-5 h-5" />
              Price Monitoring
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_monitor_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_monitor_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-purple-500 focus:ring-purple-500"
              />
              <span className="text-sm text-gray-300">Enable Monitoring</span>
            </label>
          </div>

          {config.auto_monitor_enabled && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Monitor Duration (hours)
                </label>
                <input
                  type="number"
                  value={config.monitor_duration_hours}
                  onChange={(e) => setConfig(prev => ({ ...prev, monitor_duration_hours: Number(e.target.value) }))}
                  min="1"
                  step="1"
                  className="w-full px-4 py-2 bg-black/40 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Alert on Price Changes (%)
                </label>
                <input
                  type="text"
                  value={config.alert_price_changes || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, alert_price_changes: e.target.value }))}
                  placeholder="[-20, 50, 100]"
                  className="w-full px-4 py-2 bg-black/40 border border-purple-500/30 rounded-lg text-white focus:outline-none focus:border-purple-500/50"
                />
                <p className="text-xs text-gray-400 mt-1">
                  JSON array of percentages (negative for drops, positive for gains)
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex gap-3 pt-4 border-t border-gray-800">
        <button
          onClick={handleSave}
          disabled={loading}
          className="flex-1 px-6 py-3 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 rounded-lg font-semibold text-white transition-all disabled:opacity-50"
        >
          {loading ? 'Saving...' : 'Save Configuration'}
        </button>
        <button
          onClick={onCancel}
          className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-lg font-semibold text-gray-300 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};
