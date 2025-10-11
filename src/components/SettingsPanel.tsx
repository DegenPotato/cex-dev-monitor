import { useState, useEffect } from 'react';
import { Save, RefreshCw } from 'lucide-react';
import { apiUrl } from '../config';
import { MonitoringControls } from './MonitoringControls';

interface SettingsPanelProps {
  onUpdate: () => void;
}

export function SettingsPanel({ onUpdate }: SettingsPanelProps) {
  const [cexWallet, setCexWallet] = useState('');
  const [threshold, setThreshold] = useState('1');
  const [maxThreshold, setMaxThreshold] = useState('6.9');
  const [rateLimitMaxRequests, setRateLimitMaxRequests] = useState('90');
  const [rateLimitMaxConcurrent, setRateLimitMaxConcurrent] = useState('35');
  const [rateLimitMinDelay, setRateLimitMinDelay] = useState('105');
  const [requestPacingDelay, setRequestPacingDelay] = useState('15');
  const [loading, setLoading] = useState(false);

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
      
      // Fetch request pacing config
      const pacingResponse = await fetch(apiUrl('/api/request-pacing/config'));
      const pacingConfig = await pacingResponse.json();
      if (pacingConfig.requestDelayMs) {
        setRequestPacingDelay(pacingConfig.requestDelayMs.toString());
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
        body: JSON.stringify({ key: 'cex_wallet', value: cexWallet })
      });
      
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'threshold_sol', value: threshold })
      });
      
      await fetch(apiUrl('/api/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'max_threshold_sol', value: maxThreshold })
      });
      
      // Save rate limiter config
      await fetch(apiUrl('/api/ratelimiter/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          maxRequestsPer10s: parseInt(rateLimitMaxRequests),
          maxConcurrentConnections: parseInt(rateLimitMaxConcurrent),
          minDelayMs: parseInt(rateLimitMinDelay)
        })
      });
      
      // Save request pacing config
      await fetch(apiUrl('/api/request-pacing/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestDelayMs: parseInt(requestPacingDelay)
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

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-6">Settings</h2>
        
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

          {/* Rate Limiter Settings (Active when proxies disabled) */}
          <div className="border-t border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">Rate Limiter Settings (Proxies Disabled)</h3>
            <p className="text-sm text-gray-400 mb-4">
              These settings apply when proxies are disabled to prevent hitting Solana RPC rate limits.
            </p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Requests per 10s
                </label>
                <input
                  type="number"
                  step="1"
                  min="10"
                  max="100"
                  value={rateLimitMaxRequests}
                  onChange={(e) => setRateLimitMaxRequests(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Solana limit: 100</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Max Concurrent Connections
                </label>
                <input
                  type="number"
                  step="1"
                  min="5"
                  max="40"
                  value={rateLimitMaxConcurrent}
                  onChange={(e) => setRateLimitMaxConcurrent(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Solana limit: 40</p>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Min Delay Between Requests (ms)
                </label>
                <input
                  type="number"
                  step="5"
                  min="50"
                  max="500"
                  value={rateLimitMinDelay}
                  onChange={(e) => setRateLimitMinDelay(e.target.value)}
                  className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">Lower = faster, higher = safer</p>
              </div>
            </div>
          </div>

          {/* Request Pacing Settings */}
          <div className="border-t border-gray-700 pt-6 mt-6">
            <h3 className="text-lg font-semibold text-white mb-4">⚡ Request Pacing</h3>
            <p className="text-sm text-gray-400 mb-4">
              Controls the delay between requests to prevent rate limit bursts. Works with both proxies and RPC rotation.
            </p>
            
            <div className="max-w-sm">
              <label className="block text-sm font-medium text-gray-300 mb-2">
                Request Delay (ms)
              </label>
              <input
                type="number"
                step="1"
                min="5"
                max="100"
                value={requestPacingDelay}
                onChange={(e) => setRequestPacingDelay(e.target.value)}
                className="w-full bg-slate-700 text-white rounded-lg px-4 py-2 border border-purple-500/20 focus:border-purple-500/50 focus:outline-none"
              />
              <p className="text-xs text-gray-400 mt-1">
                15ms = ~66 req/sec (recommended) • Lower = faster but riskier • Higher = slower but safer
              </p>
              <div className="mt-2 space-y-1 text-xs text-gray-500">
                <div>• 10ms = ~100 req/sec (fast, may hit limits)</div>
                <div>• 15ms = ~66 req/sec (balanced ✓)</div>
                <div>• 20ms = ~50 req/sec (safe)</div>
                <div>• 25ms = ~40 req/sec (very safe)</div>
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

      {/* Monitoring Controls */}
      <MonitoringControls />
    </div>
  );
}
