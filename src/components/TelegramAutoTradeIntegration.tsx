/**
 * This file contains the auto-trading configuration section to be integrated into TelegramSnifferTab.tsx
 * Add this component inside the configuration modal, before the Forward Configuration section.
 */

import React from 'react';
import { 
  TrendingUp, 
  Shield, 
  Activity,
  Zap,
  GitBranch,
  ArrowDownCircle,
  ArrowUpCircle
} from 'lucide-react';

interface AutoTradeConfig {
  action_on_detection: string;
  auto_buy_enabled: boolean;
  auto_buy_amount_sol: number;
  auto_buy_wallet_id: number | null;
  auto_buy_slippage_bps: number;
  auto_buy_priority_level: string;
  auto_buy_jito_tip_sol: number;
  auto_buy_skip_tax: boolean;
  auto_sell_enabled: boolean;
  auto_sell_slippage_bps: number;
  stop_loss_percent: number;
  take_profit_percent: number;
  trailing_stop_enabled: boolean;
  trailing_stop_percent: number;
  auto_monitor_enabled: boolean;
  monitor_duration_hours: number;
}

interface TradingWallet {
  id: number;
  wallet_name: string;
  public_key: string;
  sol_balance: number;
}

interface Props {
  config: AutoTradeConfig;
  setConfig: React.Dispatch<React.SetStateAction<AutoTradeConfig>>;
  wallets: TradingWallet[];
}

export const AutoTradeConfigSection: React.FC<Props> = ({ config, setConfig, wallets }) => {
  const actionOptions = [
    { value: 'forward_only', label: 'Forward Only', icon: GitBranch, color: 'blue', description: 'Traditional forwarding' },
    { value: 'trade_only', label: 'Trade Only', icon: TrendingUp, color: 'green', description: 'Auto-buy without forward' },
    { value: 'monitor_only', label: 'Monitor Only', icon: Activity, color: 'purple', description: 'Track price only' },
    { value: 'forward_and_trade', label: 'Forward + Trade', icon: Zap, color: 'yellow', description: 'Forward + auto-buy' }
  ];

  return (
    <div className="space-y-4">
      {/* Action on Detection Section */}
      <div>
        <label className="block text-sm font-medium text-cyan-300 mb-3">
          Action on Contract Detection
        </label>
        <div className="grid grid-cols-2 gap-2">
          {actionOptions.map(option => {
            const Icon = option.icon;
            const isSelected = config.action_on_detection === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, action_on_detection: option.value }))}
                className={`p-3 rounded-lg border-2 transition-all ${
                  isSelected
                    ? `border-${option.color}-500 bg-${option.color}-500/20`
                    : 'border-gray-700 bg-black/20 hover:border-gray-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 text-${option.color}-400`} />
                  <div className="text-left">
                    <div className="font-medium text-white text-sm">{option.label}</div>
                    <div className="text-xs text-gray-400">{option.description}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Auto-Buy Configuration */}
      {(config.action_on_detection === 'trade_only' || config.action_on_detection === 'forward_and_trade') && (
        <div className="border border-green-500/30 rounded-lg p-4 bg-green-500/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-green-300 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Auto-Buy Settings
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_buy_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-green-500 focus:ring-green-500 w-4 h-4"
              />
              <span className="text-xs text-gray-300">Enable</span>
            </label>
          </div>

          {config.auto_buy_enabled && (
            <div className="space-y-3">
              {/* Wallet Selection */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Trading Wallet</label>
                <select
                  value={config.auto_buy_wallet_id || ''}
                  onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_wallet_id: Number(e.target.value) }))}
                  className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                >
                  <option value="">Select wallet...</option>
                  {wallets.map(wallet => (
                    <option key={wallet.id} value={wallet.id}>
                      {wallet.wallet_name} ({wallet.sol_balance?.toFixed(4) || '0'} SOL)
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount & Slippage */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Amount (SOL)</label>
                  <input
                    type="number"
                    value={config.auto_buy_amount_sol}
                    onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_amount_sol: Number(e.target.value) }))}
                    min="0.001"
                    step="0.01"
                    className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1">Slippage (%)</label>
                  <input
                    type="number"
                    value={config.auto_buy_slippage_bps / 100}
                    onChange={(e) => setConfig(prev => ({ ...prev, auto_buy_slippage_bps: Number(e.target.value) * 100 }))}
                    min="0.1"
                    step="0.5"
                    className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>

              {/* Priority Level */}
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Priority</label>
                <select
                  value={config.auto_buy_priority_level}
                  onChange={(e) => setConfig(prev => ({ 
                    ...prev, 
                    auto_buy_priority_level: e.target.value,
                    auto_buy_jito_tip_sol: e.target.value === 'turbo' ? 0.002 : 
                                          e.target.value === 'high' ? 0.001 : 
                                          e.target.value === 'medium' ? 0.0005 : 0.0001
                  }))}
                  className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                >
                  <option value="low">Low (0.0001 SOL tip)</option>
                  <option value="medium">Medium (0.0005 SOL tip)</option>
                  <option value="high">High (0.001 SOL tip)</option>
                  <option value="turbo">Turbo (0.002 SOL tip)</option>
                </select>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-Sell Configuration */}
      {config.auto_buy_enabled && (
        <div className="border border-red-500/30 rounded-lg p-4 bg-red-500/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-red-300 flex items-center gap-2">
              <Shield className="w-4 h-4" />
              Auto-Sell Settings
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_sell_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_sell_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-red-500 focus:ring-red-500 w-4 h-4"
              />
              <span className="text-xs text-gray-300">Enable</span>
            </label>
          </div>

          {config.auto_sell_enabled && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                    <ArrowDownCircle className="w-3 h-3 text-red-400" />
                    Stop Loss (%)
                  </label>
                  <input
                    type="number"
                    value={config.stop_loss_percent}
                    onChange={(e) => setConfig(prev => ({ ...prev, stop_loss_percent: Number(e.target.value) }))}
                    max="-1"
                    step="5"
                    className="w-full px-3 py-2 bg-black/40 border border-red-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-red-500/50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-300 mb-1 flex items-center gap-1">
                    <ArrowUpCircle className="w-3 h-3 text-green-400" />
                    Take Profit (%)
                  </label>
                  <input
                    type="number"
                    value={config.take_profit_percent}
                    onChange={(e) => setConfig(prev => ({ ...prev, take_profit_percent: Number(e.target.value) }))}
                    min="10"
                    step="10"
                    className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-green-500/50"
                  />
                </div>
              </div>
              
              <div className="p-2 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <label className="flex items-center justify-between">
                  <span className="text-xs font-medium text-orange-300">Trailing Stop (activates after 20% profit)</span>
                  <input
                    type="checkbox"
                    checked={config.trailing_stop_enabled}
                    onChange={(e) => setConfig(prev => ({ ...prev, trailing_stop_enabled: e.target.checked }))}
                    className="rounded border-gray-600 text-orange-500 focus:ring-orange-500 w-4 h-4"
                  />
                </label>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Price Monitoring */}
      {config.action_on_detection === 'monitor_only' && (
        <div className="border border-purple-500/30 rounded-lg p-4 bg-purple-500/5">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-purple-300 flex items-center gap-2">
              <Activity className="w-4 h-4" />
              Price Monitoring
            </h4>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={config.auto_monitor_enabled}
                onChange={(e) => setConfig(prev => ({ ...prev, auto_monitor_enabled: e.target.checked }))}
                className="rounded border-gray-600 text-purple-500 focus:ring-purple-500 w-4 h-4"
              />
              <span className="text-xs text-gray-300">Enable</span>
            </label>
          </div>
          
          {config.auto_monitor_enabled && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Monitor Duration (hours)</label>
              <input
                type="number"
                value={config.monitor_duration_hours}
                onChange={(e) => setConfig(prev => ({ ...prev, monitor_duration_hours: Number(e.target.value) }))}
                min="1"
                step="1"
                className="w-full px-3 py-2 bg-black/40 border border-purple-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-purple-500/50"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
};
