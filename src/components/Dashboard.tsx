import { useEffect, useState } from 'react';
import { Settings, Circle, Wallet, Flame } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats } from '../types';
import { config, apiUrl } from '../config';
import { SettingsPanel } from './SettingsPanel';
import { WalletMonitoringHub } from './WalletMonitoringHub.tsx';
import { RecentTokenMints } from './RecentTokenMints';
import { TokensTab } from './TokensTab';

type Tab = 'wallets' | 'tokens';

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('wallets');
  
  const { isConnected, subscribe } = useWebSocket(`${config.wsUrl}/ws`);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Listen for monitoring status updates
    const unsubStats = subscribe('stats_update', () => {
      fetchStats();
    });

    return () => {
      unsubStats();
    };
  }, [subscribe]);

  const fetchData = async () => {
    await fetchStats();
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(apiUrl('/api/stats'));
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="w-full max-w-6xl bg-slate-800 rounded-xl border border-purple-500/30 shadow-2xl my-8">
            <div className="flex items-center justify-between p-6 border-b border-purple-500/20">
              <h2 className="text-2xl font-bold text-white">Settings & Configuration</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SettingsPanel onUpdate={fetchData} />
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-5xl font-bold mb-2">
              <span className="bg-gradient-to-r from-purple-400 via-pink-400 to-purple-500 bg-clip-text text-transparent">
                Sniff Agency
              </span>
            </h1>
            <p className="text-lg text-purple-300/80">Wallet Tracking Manager</p>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-sm px-4 py-2 rounded-full border border-purple-500/20">
              <Circle 
                className={`w-2.5 h-2.5 ${isConnected ? 'fill-green-400 text-green-400 animate-pulse' : 'fill-red-400 text-red-400'}`}
              />
              <span className={`text-sm font-medium ${isConnected ? 'text-green-400' : 'text-red-400'}`}>
                {isConnected ? 'Live' : 'Offline'}
              </span>
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-slate-800/50 backdrop-blur-sm hover:bg-slate-700/50 px-4 py-2 rounded-full border border-purple-500/20 transition-all text-gray-300 hover:text-white"
              title="Open Settings"
            >
              <Settings className="w-5 h-5" />
              <span className="font-medium">Settings</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('wallets')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'wallets'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            <Wallet className="w-5 h-5" />
            Wallet Monitoring
          </button>
          <button
            onClick={() => setActiveTab('tokens')}
            className={`flex items-center gap-2 px-6 py-3 rounded-lg font-medium transition-all ${
              activeTab === 'tokens'
                ? 'bg-purple-600 text-white shadow-lg shadow-purple-500/30'
                : 'bg-slate-800/50 text-gray-300 hover:bg-slate-700/50'
            }`}
          >
            <Flame className="w-5 h-5" />
            Token Launch History
          </button>
        </div>

        {/* Main Content */}
        {activeTab === 'wallets' ? (
          <div className="space-y-6">
            {/* Recent Token Mints */}
            <RecentTokenMints />
            
            {/* Wallet Monitoring Hub */}
            <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-purple-500/20 shadow-xl">
              <WalletMonitoringHub stats={stats} onUpdate={fetchData} />
            </div>
          </div>
        ) : (
          <div className="bg-slate-800/30 backdrop-blur-sm rounded-2xl border border-purple-500/20 shadow-xl">
            <TokensTab />
          </div>
        )}
      </div>
    </div>
  );
}
