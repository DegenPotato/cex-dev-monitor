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

      toast.success('Configuration saved!');
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
