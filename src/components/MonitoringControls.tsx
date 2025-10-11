import { useState, useEffect } from 'react';
import { Play, Square, Activity, Shield, ShieldOff, RefreshCw } from 'lucide-react';
import { apiUrl } from '../config';

export function MonitoringControls() {
  const [status, setStatus] = useState<any>(null);
  const [proxyStatus, setProxyStatus] = useState<any>(null);
  const [rpcRotationStatus, setRpcRotationStatus] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/monitoring/status'));
      const data = await response.json();
      setStatus(data);
    } catch (error) {
      console.error('Error fetching status:', error);
    }
  };

  const fetchProxyStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/proxy/status'));
      const data = await response.json();
      setProxyStatus(data);
    } catch (error) {
      console.error('Error fetching proxy status:', error);
    }
  };

  const fetchRpcRotationStatus = async () => {
    try {
      const response = await fetch(apiUrl('/api/rpc-rotation/stats'));
      const data = await response.json();
      setRpcRotationStatus(data);
    } catch (error) {
      console.error('Error fetching RPC rotation status:', error);
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchProxyStatus();
    fetchRpcRotationStatus();
    const interval = setInterval(() => {
      fetchStatus();
      fetchProxyStatus();
      fetchRpcRotationStatus();
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleStart = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/monitoring/start'), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(`✅ Monitoring started!\n\n${data.walletsMonitored} wallets:\n- ${data.breakdown.fresh} fresh\n- ${data.breakdown.dev} dev`);
        fetchStatus();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleStop = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/monitoring/stop'), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert('⏹️ Monitoring stopped!');
        fetchStatus();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleProxy = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/proxy/toggle'), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
        fetchProxyStatus();
        fetchRpcRotationStatus();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRpcRotation = async () => {
    setLoading(true);
    try {
      const response = await fetch(apiUrl('/api/rpc-rotation/toggle'), { method: 'POST' });
      const data = await response.json();
      
      if (data.success) {
        alert(data.message);
        fetchRpcRotationStatus();
      } else {
        alert(`❌ Error: ${data.error}`);
      }
    } catch (error: any) {
      alert(`❌ Error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const isActive = status?.cexMonitor.active || status?.pumpFunMonitor.active;

  return (
    <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
      <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
        <Activity className="w-5 h-5 text-purple-400" />
        Monitoring Controls
      </h3>

      <div className="space-y-4">
        {/* Status */}
        {status && (
          <div className="bg-slate-900/50 rounded-lg p-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <div className="text-gray-400 mb-1">CEX Monitor</div>
                <div className={`font-semibold ${status.cexMonitor.active ? 'text-green-400' : 'text-gray-500'}`}>
                  {status.cexMonitor.active ? '🟢 Active' : '⚫ Stopped'}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Pump.fun Monitor</div>
                <div className={`font-semibold ${status.pumpFunMonitor.active ? 'text-green-400' : 'text-gray-500'}`}>
                  {status.pumpFunMonitor.active ? `🟢 ${status.pumpFunMonitor.monitored} wallets` : '⚫ Stopped'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Controls */}
        <div className="flex gap-3">
          <button
            onClick={handleStart}
            disabled={loading || isActive}
            className="flex-1 flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all"
          >
            <Play className="w-4 h-4" />
            Start Monitoring
          </button>
          <button
            onClick={handleStop}
            disabled={loading || !isActive}
            className="flex-1 flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-gray-600 disabled:cursor-not-allowed text-white font-medium py-3 px-4 rounded-lg transition-all"
          >
            <Square className="w-4 h-4" />
            Stop Monitoring
          </button>
        </div>

        {/* Proxy Controls */}
        {proxyStatus && (
          <div className="bg-slate-900/50 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              {proxyStatus.enabled ? (
                <Shield className="w-4 h-4 text-green-400" />
              ) : (
                <ShieldOff className="w-4 h-4 text-gray-400" />
              )}
              Proxy Rotation
            </h4>
            
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div>
                <div className="text-gray-400 mb-1">Status</div>
                <div className={`font-semibold ${proxyStatus.enabled ? 'text-green-400' : 'text-gray-400'}`}>
                  {proxyStatus.enabled ? '🟢 Enabled' : '⚫ Disabled'}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">Total Proxies</div>
                <div className="font-semibold text-white">
                  {proxyStatus.stats?.totalProxies || 0}
                </div>
              </div>
            </div>

            <button
              onClick={handleToggleProxy}
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 font-medium py-2 px-4 rounded-lg transition-all ${
                proxyStatus.enabled
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              } disabled:bg-gray-600 disabled:cursor-not-allowed`}
            >
              {proxyStatus.enabled ? (
                <>
                  <ShieldOff className="w-4 h-4" />
                  Disable Proxies
                </>
              ) : (
                <>
                  <Shield className="w-4 h-4" />
                  Enable Proxies
                </>
              )}
            </button>
          </div>
        )}

        {/* RPC Server Rotation Controls */}
        {rpcRotationStatus && (
          <div className="bg-slate-900/50 rounded-lg p-4">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              {rpcRotationStatus.enabled ? (
                <RefreshCw className="w-4 h-4 text-purple-400 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4 text-gray-400" />
              )}
              RPC Server Rotation
            </h4>
            
            <div className="grid grid-cols-2 gap-4 text-xs mb-3">
              <div>
                <div className="text-gray-400 mb-1">Status</div>
                <div className={`font-semibold ${rpcRotationStatus.enabled ? 'text-purple-400' : 'text-gray-400'}`}>
                  {rpcRotationStatus.enabled ? '🟢 Enabled' : '⚫ Disabled'}
                </div>
              </div>
              <div>
                <div className="text-gray-400 mb-1">RPC Servers</div>
                <div className="font-semibold text-white">
                  {rpcRotationStatus.totalServers || 0}
                </div>
              </div>
            </div>

            {rpcRotationStatus.enabled && (
              <div className="mb-3 p-2 bg-purple-500/10 rounded border border-purple-500/30">
                <div className="text-xs text-purple-300">
                  <strong>Current:</strong> {rpcRotationStatus.currentServer?.replace('https://', '')}
                </div>
              </div>
            )}

            <button
              onClick={handleToggleRpcRotation}
              disabled={loading}
              className={`w-full flex items-center justify-center gap-2 font-medium py-2 px-4 rounded-lg transition-all ${
                rpcRotationStatus.enabled
                  ? 'bg-orange-600 hover:bg-orange-700 text-white'
                  : 'bg-purple-600 hover:bg-purple-700 text-white'
              } disabled:bg-gray-600 disabled:cursor-not-allowed`}
            >
              {rpcRotationStatus.enabled ? (
                <>
                  <ShieldOff className="w-4 h-4" />
                  Disable Server Rotation
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  Enable Server Rotation
                </>
              )}
            </button>
            
            {rpcRotationStatus.enabled && (
              <div className="mt-2 text-xs text-purple-300 bg-purple-900/20 rounded p-2">
                💡 <strong>Tip:</strong> Server rotation bypasses rate limits without proxies!
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
          <p className="text-sm text-blue-300">
            <strong>Performance Options:</strong><br/>
            • <strong>Proxies:</strong> Hide your IP (requires proxy list)<br/>
            • <strong>Server Rotation:</strong> Bypass limits (free, no proxies needed!)<br/>
            • <strong>Rate Limiting:</strong> Compliance mode (slower)
          </p>
        </div>
      </div>
    </div>
  );
}
