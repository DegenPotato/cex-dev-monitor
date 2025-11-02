import React, { useState, useEffect } from 'react';
import { Bell, TrendingUp, MessageSquare, Send, X, Plus } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';
import { useTradingSettingsStore } from '../../stores/tradingSettingsStore';

export type AlertAction = 
  | { type: 'notification' }
  | { type: 'buy'; amount: number; slippage: number; priorityFee: number; walletId?: number }
  | { type: 'sell'; amount: number; slippage: number; priorityFee: number; walletId?: number }
  | { type: 'telegram'; chatId: string; message?: string; accountId?: number }
  | { type: 'discord'; webhookUrl: string; message?: string };

interface AlertActionConfigProps {
  actions: AlertAction[];
  onChange: (actions: AlertAction[]) => void;
}

interface TradingWallet {
  id: number;
  wallet_name: string;
  public_key: string;
  sol_balance?: number;
}

interface TelegramAccount {
  id: number;
  phone_number: string;
  account_name?: string;
}

export const AlertActionConfig: React.FC<AlertActionConfigProps> = ({ actions, onChange }) => {
  const { defaultSlippage } = useTradingSettingsStore();
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [tradingWallets, setTradingWallets] = useState<TradingWallet[]>([]);
  const [telegramAccounts, setTelegramAccounts] = useState<TelegramAccount[]>([]);

  // Fetch trading wallets
  useEffect(() => {
    const fetchWallets = async () => {
      try {
        const response = await fetch(`${config.apiUrl}/api/trading/wallets`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTradingWallets(data.wallets || []);
        }
      } catch (error) {
        console.error('Failed to fetch trading wallets:', error);
      }
    };
    fetchWallets();
  }, []);

  // Fetch telegram accounts
  useEffect(() => {
    const fetchTelegramAccounts = async () => {
      try {
        const response = await fetch(`${config.apiUrl}/api/telegram/accounts`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTelegramAccounts(data.accounts || []);
        }
      } catch (error) {
        console.error('Failed to fetch telegram accounts:', error);
      }
    };
    fetchTelegramAccounts();
  }, []);

  const addAction = (type: AlertAction['type']) => {
    let newAction: AlertAction;
    
    switch (type) {
      case 'notification':
        newAction = { type: 'notification' };
        break;
      case 'buy':
        newAction = { type: 'buy', amount: 0.1, slippage: defaultSlippage, priorityFee: 0.0001 };
        break;
      case 'sell':
        newAction = { type: 'sell', amount: 50, slippage: defaultSlippage, priorityFee: 0.0001 };
        break;
      case 'telegram':
        newAction = { type: 'telegram', chatId: '' };
        break;
      case 'discord':
        newAction = { type: 'discord', webhookUrl: '' };
        break;
    }
    
    onChange([...actions, newAction]);
    setShowAddMenu(false);
  };

  const removeAction = (index: number) => {
    onChange(actions.filter((_, i) => i !== index));
  };

  const updateAction = (index: number, updates: Partial<AlertAction>) => {
    const updated = [...actions];
    updated[index] = { ...updated[index], ...updates } as AlertAction;
    onChange(updated);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-gray-300">Alert Actions</label>
        <button
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded-lg flex items-center gap-1 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Add Action
        </button>
      </div>

      {/* Add Action Menu */}
      {showAddMenu && (
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 space-y-2">
          <button onClick={() => addAction('notification')} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors">
            <Bell className="w-4 h-4 text-yellow-400" />
            Notification
          </button>
          <button onClick={() => addAction('buy')} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors">
            <TrendingUp className="w-4 h-4 text-green-400" />
            Auto Buy
          </button>
          <button onClick={() => addAction('sell')} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors">
            <TrendingUp className="w-4 h-4 rotate-180 text-red-400" />
            Auto Sell
          </button>
          <button onClick={() => addAction('telegram')} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors">
            <Send className="w-4 h-4 text-blue-400" />
            Telegram Forward
          </button>
          <button onClick={() => addAction('discord')} className="w-full px-3 py-2 bg-gray-800 hover:bg-gray-700 text-white text-sm rounded-lg flex items-center gap-2 transition-colors">
            <MessageSquare className="w-4 h-4 text-purple-400" />
            Discord Webhook
          </button>
        </div>
      )}

      {/* Action List */}
      <div className="space-y-2">
        <AnimatePresence>
          {actions.map((action, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="bg-gray-900 border border-gray-700 rounded-lg p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  {action.type === 'notification' && (
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-white">Show Notification</span>
                    </div>
                  )}
                  
                  {action.type === 'buy' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-400" />
                        <span className="text-sm text-white font-medium">Auto Buy</span>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Amount (SOL)</label>
                        <input
                          type="number"
                          value={action.amount}
                          onChange={(e) => updateAction(index, { amount: parseFloat(e.target.value) })}
                          placeholder="0.1"
                          step="0.01"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Slippage (%)</label>
                          <input
                            type="number"
                            value={action.slippage}
                            onChange={(e) => updateAction(index, { slippage: parseFloat(e.target.value) })}
                            placeholder="1.0"
                            step="0.1"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Priority Fee (SOL)</label>
                          <input
                            type="number"
                            value={action.priorityFee}
                            onChange={(e) => updateAction(index, { priorityFee: parseFloat(e.target.value) })}
                            placeholder="0.0001"
                            step="0.0001"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Trading Wallet</label>
                        <select
                          value={action.walletId || ''}
                          onChange={(e) => updateAction(index, { walletId: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                        >
                          <option value="">Select wallet...</option>
                          {tradingWallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.wallet_name} - {wallet.sol_balance?.toFixed(4) || '0.0000'} SOL
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {action.type === 'sell' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 rotate-180 text-red-400" />
                        <span className="text-sm text-white font-medium">Auto Sell</span>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Amount (%)</label>
                        <input
                          type="number"
                          value={action.amount}
                          onChange={(e) => updateAction(index, { amount: parseFloat(e.target.value) })}
                          placeholder="100"
                          step="1"
                          min="1"
                          max="100"
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                        />
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Slippage (%)</label>
                          <input
                            type="number"
                            value={action.slippage}
                            onChange={(e) => updateAction(index, { slippage: parseFloat(e.target.value) })}
                            placeholder="1.0"
                            step="0.1"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-400 mb-1 block">Priority Fee (SOL)</label>
                          <input
                            type="number"
                            value={action.priorityFee}
                            onChange={(e) => updateAction(index, { priorityFee: parseFloat(e.target.value) })}
                            placeholder="0.0001"
                            step="0.0001"
                            className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                          />
                        </div>
                      </div>
                      
                      <div>
                        <label className="text-xs text-gray-400 mb-1 block">Trading Wallet</label>
                        <select
                          value={action.walletId || ''}
                          onChange={(e) => updateAction(index, { walletId: e.target.value ? parseInt(e.target.value) : undefined })}
                          className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                        >
                          <option value="">Select wallet...</option>
                          {tradingWallets.map((wallet) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.wallet_name} - {wallet.sol_balance?.toFixed(4) || '0.0000'} SOL
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {action.type === 'telegram' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Send className="w-4 h-4 text-blue-400" />
                        <span className="text-sm text-white">Telegram Forward</span>
                      </div>
                      <select
                        value={action.accountId || ''}
                        onChange={(e) => updateAction(index, { accountId: e.target.value ? parseInt(e.target.value) : undefined })}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      >
                        <option value="">Select Telegram Account</option>
                        {telegramAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            {account.account_name || account.phone_number}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={action.chatId}
                        onChange={(e) => updateAction(index, { chatId: e.target.value })}
                        placeholder="Chat ID"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                      <input
                        type="text"
                        value={action.message || ''}
                        onChange={(e) => updateAction(index, { message: e.target.value })}
                        placeholder="Optional message"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                    </div>
                  )}

                  {action.type === 'discord' && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-purple-400" />
                        <span className="text-sm text-white">Discord Webhook</span>
                      </div>
                      <input
                        type="text"
                        value={action.webhookUrl}
                        onChange={(e) => updateAction(index, { webhookUrl: e.target.value })}
                        placeholder="Webhook URL"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                      <input
                        type="text"
                        value={action.message || ''}
                        onChange={(e) => updateAction(index, { message: e.target.value })}
                        placeholder="Optional message"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                      />
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => removeAction(index)}
                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                >
                  <X className="w-4 h-4 text-gray-400 hover:text-red-400" />
                </button>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {actions.length === 0 && (
        <div className="text-center py-4 text-gray-500 text-sm border border-dashed border-gray-700 rounded-lg">
          No actions configured. Click "Add Action" to set up alert behaviors.
        </div>
      )}
    </div>
  );
};
