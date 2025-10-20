import { useState, useEffect } from 'react';
import { Save, Trash2, Zap } from 'lucide-react';
import { apiUrl } from '../config';
import { MonitoringControls } from './MonitoringControls';
import { RequestStatsPanel } from './RequestStatsPanel';

interface SettingsPanelProps {
  onUpdate: () => void;
}

export function SettingsPanel({ onUpdate }: SettingsPanelProps) {
  const [cexWallet, setCexWallet] = useState('');
  const [threshold, setThreshold] = useState('1');
  const [maxThreshold, setMaxThreshold] = useState('6.9');
  const [proxyPacingDelay, setProxyPacingDelay] = useState('2');
  const [rpcPacingDelay, setRpcPacingDelay] = useState('2');
  const [proxyMaxConcurrent, setProxyMaxConcurrent] = useState('20');
  const [rpcMaxConcurrent, setRpcMaxConcurrent] = useState('2');
  const [loading, setLoading] = useState(false);
  const [wipeConfirmation, setWipeConfirmation] = useState('');

  useEffect(() => {
    fetchConfig();
  }, []);

  const fetchConfig = async () => {
    try {
      const response = await fetch(apiUrl('/api/config'));
      const config = await response.json();
      
      const cexWalletConfig = config.find((c: any) => c.key === 'cex_wallet');
      const thresholdConfig = config.find((c: any) => c.key === 'threshold_sol');
      const maxThresholdConfig = config.find((c: any) => c.key === 'max_threshold_sol');
      
      if (cexWalletConfig) setCexWallet(cexWalletConfig.value);
      if (thresholdConfig) setThreshold(thresholdConfig.value);
      if (maxThresholdConfig) setMaxThreshold(maxThresholdConfig.value);
      
      // Fetch request pacing config (proxy and RPC)
      const pacingResponse = await fetch(apiUrl('/api/request-pacing/config'));
      const pacingConfig = await pacingResponse.json();
      if (pacingConfig.proxyDelayMs !== undefined) {
        setProxyPacingDelay(pacingConfig.proxyDelayMs.toString());
      }
      if (pacingConfig.rpcDelayMs !== undefined) {
        setRpcPacingDelay(pacingConfig.rpcDelayMs.toString());
      }
      
      // Fetch concurrency config (proxy and RPC)
      const concurrencyResponse = await fetch(apiUrl('/api/concurrency/config'));
      const concurrencyConfig = await concurrencyResponse.json();
      if (concurrencyConfig.proxyMaxConcurrent !== undefined) {
        setProxyMaxConcurrent(concurrencyConfig.proxyMaxConcurrent.toString());
      }
      if (concurrencyConfig.rpcMaxConcurrent !== undefined) {
        setRpcMaxConcurrent(concurrencyConfig.rpcMaxConcurrent.toString());
      }
    } catch (error) {
      console.error('Error fetching config:', error);
    }
  };

  const saveConfig = async () => {
    setLoading(true);
    try {
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'cex_wallet', value: cexWallet })
      });
      
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'threshold_sol', value: threshold })
      });
      
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ key: 'max_threshold_sol', value: maxThreshold })
      });
      
      // Save request pacing config (proxy and RPC)
      await fetch(apiUrl('/api/request-pacing/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          proxyDelayMs: parseInt(proxyPacingDelay),
          rpcDelayMs: parseInt(rpcPacingDelay)
        })
      });
      
      // Save concurrency config (proxy and RPC)
      await fetch(apiUrl('/api/concurrency/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          proxyMaxConcurrent: parseInt(proxyMaxConcurrent),
          rpcMaxConcurrent: parseInt(rpcMaxConcurrent)
        })
      });
      
      onUpdate();
      alert('Settings saved successfully!');
    } catch (error) {
      console.error('Error saving config:', error);
      alert('Error saving settings');
    } finally {
      setLoading(false);
    }
  };

  const wipeDatabase = async () => {
    if (wipeConfirmation !== 'WIPE DATABASE') {
      alert('Please type "WIPE DATABASE" to confirm');
      return;
    }

    if (!window.confirm('⚠️ WARNING: This will delete ALL wallets, transactions, and tokens. This action cannot be undone. Are you absolutely sure?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/database/wipe'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ confirmation: 'WIPE_DATABASE' })
      });

      const data = await response.json();
      
      if (response.ok) {
        alert('✅ ' + data.message);
        setWipeConfirmation('');
        onUpdate();
      } else {
        alert('❌ Error: ' + data.error);
      }
    } catch (error) {
      console.error('Error wiping database:', error);
      alert('Error wiping database');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 p-6">
      {/* Live Stats & Metrics */}
      <RequestStatsPanel />

      {/* Monitoring Controls */}
      <MonitoringControls />

      {/* Settings Section */}
      <div className="max-w-2xl">
        <h2 className="text-2xl font-bold text-white mb-6">Settings & Configuration</h2>
        
        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              CEX Wallet Address
            </label>
            <input
              type="text"
              value={cexWallet}
              onChange={(e) => setCexWallet(e.target.value)}
              className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Minimum Threshold (SOL)
              </label>
              <input
                type="number"
                step="0.1"
                value={threshold}
                onChange={(e) => setThreshold(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Ignore transactions below this amount</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Maximum Threshold (SOL)
              </label>
              <input
                type="number"
                step="0.1"
                value={maxThreshold}
                onChange={(e) => setMaxThreshold(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">Ignore transactions above this amount</p>
            </div>
          </div>

          {/* Proxy Rotation Rate Limits */}
          <div className="bg-gradient-to-br from-purple-900/30 to-purple-800/20 rounded-lg p-6 border border-purple-500/30">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              🌐 Proxy Rotation Mode
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Settings active when using proxy rotation (10k+ proxies available).
              <span className="text-purple-400 font-medium"> Can handle high concurrency!</span>
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Concurrent Requests
                </label>
                <input
                  type="number"
                  step="10"
                  min="5"
                  max="2000"
                  value={proxyMaxConcurrent}
                  onChange={(e) => setProxyMaxConcurrent(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recommended: 20-500 • Default: 20
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Request Pacing (ms)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={proxyPacingDelay}
                  onChange={(e) => setProxyPacingDelay(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recommended: 0-5ms • Default: 2ms
                </p>
              </div>
            </div>
          </div>

          {/* RPC Rotation Rate Limits */}
          <div className="bg-gradient-to-br from-blue-900/30 to-blue-800/20 rounded-lg p-6 border border-blue-500/30">
            <h3 className="text-lg font-semibold text-white mb-2 flex items-center gap-2">
              <Zap className="w-5 h-5 text-blue-400" />
              🔄 RPC Rotation Mode
            </h3>
            <p className="text-sm text-gray-400 mb-4">
              Settings active when using RPC server rotation (20 servers).
              <span className="text-blue-400 font-medium"> Conservative limits to avoid rate limiting!</span>
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Concurrent Requests
                </label>
                <input
                  type="number"
                  step="1"
                  min="1"
                  max="100"
                  value={rpcMaxConcurrent}
                  onChange={(e) => setRpcMaxConcurrent(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-blue-500/20 focus:border-blue-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recommended: 2-20 • Default: 2
                </p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Request Pacing (ms)
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  max="100"
                  value={rpcPacingDelay}
                  onChange={(e) => setRpcPacingDelay(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-blue-500/20 focus:border-blue-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Recommended: 2-10ms • Default: 2ms
                </p>
              </div>
            </div>
          </div>

          {/* Database Wipe Section */}
          <div className="border-t border-red-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center gap-2">
              <Trash2 className="w-5 h-5" />
              ⚠️ Danger Zone: Database Wipe
            </h3>
            <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-gray-300 mb-4">
                This will permanently delete <strong>ALL</strong> wallets, transactions, and tokens from the database. 
                Configuration settings will be preserved. <strong className="text-red-400">This action cannot be undone!</strong>
              </p>
              
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Type <code className="bg-black/30 px-2 py-1 rounded text-red-400">WIPE DATABASE</code> to confirm
                  </label>
                  <input
                    type="text"
                    value={wipeConfirmation}
                    onChange={(e) => setWipeConfirmation(e.target.value)}
                    placeholder="Type here to enable wipe button..."
                    className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-red-500/20 focus:border-red-500/50 focus:outline-none"
                  />
                </div>
                
                <button
                  onClick={wipeDatabase}
                  disabled={loading || wipeConfirmation !== 'WIPE DATABASE'}
                  className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Trash2 className="w-4 h-4" />
                  Wipe Database
                </button>
              </div>
            </div>
          </div>

          <div className="pt-4">
            <button
              onClick={saveConfig}
              disabled={loading}
              className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium"
            >
              <Save className="w-4 h-4" />
              Save Configuration
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
