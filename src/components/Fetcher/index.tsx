import React, { useState } from 'react';
import { Toaster } from 'react-hot-toast';
import { WalletsPanel } from './WalletsPanel';
import { TradingPanel } from './TradingPanel';
import { PortfolioPanel } from './PortfolioPanel';
import { HistoryPanel } from './HistoryPanel';
import { SettingsPanel } from './SettingsPanel';
import { TestLabTab } from './TestLabTab';
import { Wallet, TrendingUp, History, PieChart, Zap, Settings } from 'lucide-react';
import { motion } from 'framer-motion';

type TabType = 'portfolio' | 'wallets' | 'trade' | 'history' | 'settings' | 'test';

export const Fetcher: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('portfolio');

  const tabs = [
    { id: 'portfolio' as TabType, label: 'Portfolio', icon: PieChart },
    { id: 'wallets' as TabType, label: 'Wallets', icon: Wallet },
    { id: 'trade' as TabType, label: 'Trade', icon: TrendingUp },
    { id: 'history' as TabType, label: 'History', icon: History },
    { id: 'test' as TabType, label: 'Test Lab', icon: Zap },
    { id: 'settings' as TabType, label: 'Settings', icon: Settings }
  ];

  return (
    <div className="w-full h-full flex flex-col">
      <Toaster 
        position="top-right"
        toastOptions={{
          style: {
            background: '#1a1a1a',
            color: '#fff',
            border: '1px solid rgba(6, 182, 212, 0.3)'
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#fff'
            }
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#fff'
            }
          }
        }}
      />

      {/* Header with Tabs */}
      <div className="bg-gray-900/50 border-b border-gray-700/50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gradient-to-br from-cyan-500 to-purple-600 rounded-lg">
                <Zap className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Fetcher Trading Bot</h1>
                <p className="text-sm text-gray-400">Secure wallet management & MEV-protected trading</p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
                <span>Live</span>
              </div>
              <span>•</span>
              <span>AES-256-GCM Encryption</span>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex gap-2">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-all
                    ${activeTab === tab.id
                      ? 'bg-cyan-500/20 border border-cyan-500 text-cyan-400'
                      : 'bg-gray-800/50 border border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-300'}`}
                >
                  <Icon className="w-4 h-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-gradient-to-b from-gray-900/50 to-black">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {activeTab === 'portfolio' && <PortfolioPanel />}
          {activeTab === 'wallets' && <WalletsPanel />}
          {activeTab === 'trade' && <TradingPanel />}
          {activeTab === 'history' && <HistoryPanel />}
          {activeTab === 'test' && <TestLabTab />}
          {activeTab === 'settings' && <SettingsPanel />}
        </motion.div>
      </div>
    </div>
  );
};
