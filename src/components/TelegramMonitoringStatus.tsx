import React, { useState, useEffect } from 'react';
import {
  Activity,
  AlertCircle,
  CheckCircle,
  Database,
  Zap,
  Clock,
  Server,
  Wifi,
  WifiOff
} from 'lucide-react';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';

interface MonitoringStats {
  active_positions: number;
  monitoring_campaigns: number;
  batch_efficiency: number; // Positions per API call
  api_calls_per_minute: number;
  last_batch_update: number;
  websocket_connected: boolean;
  price_updates_per_second: number;
  alerts_pending: number;
  alerts_triggered_today: number;
}

interface SystemHealth {
  price_monitor: 'healthy' | 'degraded' | 'down';
  websocket: 'connected' | 'disconnected';
  database: 'healthy' | 'slow' | 'down';
  api_rate_limit: number; // Percentage used
}

export const TelegramMonitoringStatus: React.FC = () => {
  const [stats, setStats] = useState<MonitoringStats>({
    active_positions: 0,
    monitoring_campaigns: 0,
    batch_efficiency: 0,
    api_calls_per_minute: 0,
    last_batch_update: Date.now(),
    websocket_connected: false,
    price_updates_per_second: 0,
    alerts_pending: 0,
    alerts_triggered_today: 0
  });

  const [health, setHealth] = useState<SystemHealth>({
    price_monitor: 'healthy',
    websocket: 'disconnected',
    database: 'healthy',
    api_rate_limit: 0
  });

  const [recentUpdates, setRecentUpdates] = useState<any[]>([]);

  // WebSocket subscription
  const { subscribe, isConnected } = useWebSocket(`${config.wsUrl}/ws`);

  useEffect(() => {
    // Fetch initial stats
    fetchMonitoringStats();
    
    // Set up interval for periodic updates
    const interval = setInterval(fetchMonitoringStats, 5000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Subscribe to monitoring events
    const subscriptions = [
      subscribe('monitoring_stats_update', handleStatsUpdate),
      subscribe('telegram_position_price_update', handlePriceUpdate),
      subscribe('system_health_update', handleHealthUpdate)
    ];

    // Update WebSocket status
    setHealth(prev => ({ ...prev, websocket: isConnected ? 'connected' : 'disconnected' }));
    setStats(prev => ({ ...prev, websocket_connected: isConnected }));

    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, [isConnected]);

  const fetchMonitoringStats = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/monitoring/stats`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setStats(data);
        
        // Calculate health metrics
        const healthUpdate: Partial<SystemHealth> = {};
        
        if (data.api_calls_per_minute > 50) {
          healthUpdate.api_rate_limit = (data.api_calls_per_minute / 60) * 100;
        }
        
        if (data.batch_efficiency < 10 && data.active_positions > 10) {
          healthUpdate.price_monitor = 'degraded';
        } else if (data.batch_efficiency === 0 && data.active_positions > 0) {
          healthUpdate.price_monitor = 'down';
        } else {
          healthUpdate.price_monitor = 'healthy';
        }
        
        setHealth(prev => ({ ...prev, ...healthUpdate }));
      }
    } catch (error) {
      console.error('Failed to fetch monitoring stats:', error);
      setHealth(prev => ({ ...prev, database: 'down' }));
    }
  };

  const handleStatsUpdate = (data: Partial<MonitoringStats>) => {
    setStats(prev => ({ ...prev, ...data }));
  };

  const handlePriceUpdate = (data: any) => {
    // Add to recent updates
    setRecentUpdates(prev => [
      {
        timestamp: Date.now(),
        token: data.token_symbol || data.token_mint?.slice(0, 8),
        change: data.change_percent,
        price: data.new_price
      },
      ...prev.slice(0, 9) // Keep last 10 updates
    ]);
    
    // Update price updates per second metric
    setStats(prev => ({
      ...prev,
      price_updates_per_second: prev.price_updates_per_second + 0.1 // Rolling average
    }));
  };

  const handleHealthUpdate = (data: Partial<SystemHealth>) => {
    setHealth(prev => ({ ...prev, ...data }));
  };

  const getHealthColor = (status: string) => {
    switch (status) {
      case 'healthy':
      case 'connected':
        return 'text-green-400';
      case 'degraded':
      case 'slow':
        return 'text-yellow-400';
      case 'down':
      case 'disconnected':
        return 'text-red-400';
      default:
        return 'text-gray-400';
    }
  };

  const formatTimestamp = (timestamp: number) => {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    return `${Math.floor(seconds / 3600)}h ago`;
  };

  return (
    <div className="space-y-6">
      {/* System Health Overview */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Activity className="w-5 h-5 text-cyan-400" />
          System Health
        </h2>
        
        <div className="grid grid-cols-4 gap-4">
          <div className="flex items-center gap-3">
            <Server className={`w-5 h-5 ${getHealthColor(health.price_monitor)}`} />
            <div>
              <p className="text-xs text-gray-400">Price Monitor</p>
              <p className={`font-semibold ${getHealthColor(health.price_monitor)}`}>
                {health.price_monitor.toUpperCase()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {health.websocket === 'connected' ? (
              <Wifi className="w-5 h-5 text-green-400" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-400" />
            )}
            <div>
              <p className="text-xs text-gray-400">WebSocket</p>
              <p className={`font-semibold ${getHealthColor(health.websocket)}`}>
                {health.websocket.toUpperCase()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Database className={`w-5 h-5 ${getHealthColor(health.database)}`} />
            <div>
              <p className="text-xs text-gray-400">Database</p>
              <p className={`font-semibold ${getHealthColor(health.database)}`}>
                {health.database.toUpperCase()}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <AlertCircle className={`w-5 h-5 ${health.api_rate_limit > 80 ? 'text-red-400' : 'text-green-400'}`} />
            <div>
              <p className="text-xs text-gray-400">API Rate</p>
              <p className={`font-semibold ${health.api_rate_limit > 80 ? 'text-red-400' : 'text-green-400'}`}>
                {health.api_rate_limit.toFixed(0)}% Used
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Monitoring Efficiency Stats */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Monitoring Efficiency
        </h2>
        
        <div className="grid grid-cols-3 gap-6">
          <div>
            <p className="text-gray-400 text-sm mb-2">Active Positions</p>
            <p className="text-3xl font-bold text-white">{stats.active_positions}</p>
            <p className="text-xs text-gray-500 mt-1">Being monitored</p>
          </div>
          
          <div>
            <p className="text-gray-400 text-sm mb-2">Batch Efficiency</p>
            <p className="text-3xl font-bold text-cyan-400">
              {stats.batch_efficiency.toFixed(1)}:1
            </p>
            <p className="text-xs text-gray-500 mt-1">Positions per API call</p>
          </div>
          
          <div>
            <p className="text-gray-400 text-sm mb-2">API Calls</p>
            <p className="text-3xl font-bold text-green-400">
              {stats.api_calls_per_minute.toFixed(0)}/min
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Target: {Math.ceil(stats.active_positions / 50) * 30}/min
            </p>
          </div>
        </div>
        
        {/* Efficiency Bar */}
        <div className="mt-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Batch Utilization</span>
            <span className="text-xs text-cyan-400">
              {stats.active_positions} / {Math.ceil(stats.active_positions / 50) * 50} slots
            </span>
          </div>
          <div className="w-full bg-black/40 rounded-full h-2">
            <div 
              className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all"
              style={{ width: `${Math.min((stats.active_positions % 50) * 2, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 mt-1">
            {stats.active_positions <= 50 
              ? `All positions in 1 batch (max 50)` 
              : `Using ${Math.ceil(stats.active_positions / 50)} batches`}
          </p>
        </div>
      </div>

      {/* Real-time Activity Feed */}
      <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-6">
        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-purple-400" />
          Recent Price Updates
        </h2>
        
        <div className="space-y-2">
          {recentUpdates.length === 0 ? (
            <p className="text-gray-400 text-sm">No recent updates</p>
          ) : (
            recentUpdates.map((update, idx) => (
              <div 
                key={`${update.timestamp}-${idx}`}
                className="flex items-center justify-between py-2 px-3 bg-black/40 rounded-lg animate-fadeIn"
              >
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-white">
                    {update.token}
                  </span>
                  {update.change !== undefined && (
                    <span className={`text-sm ${update.change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {update.change >= 0 ? '+' : ''}{update.change.toFixed(2)}%
                    </span>
                  )}
                </div>
                <span className="text-xs text-gray-500">
                  {formatTimestamp(update.timestamp)}
                </span>
              </div>
            ))
          )}
        </div>
        
        {/* Update frequency indicator */}
        <div className="mt-4 flex items-center justify-between">
          <span className="text-xs text-gray-400">Update frequency</span>
          <span className="text-xs text-cyan-400">
            ~{stats.price_updates_per_second.toFixed(1)} updates/sec
          </span>
        </div>
      </div>

      {/* Alerts Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <AlertCircle className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-gray-400">Pending</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.alerts_pending}</p>
          <p className="text-xs text-gray-500 mt-1">Alerts waiting to trigger</p>
        </div>
        
        <div className="bg-gradient-to-br from-gray-900 to-black border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <CheckCircle className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400">Today</span>
          </div>
          <p className="text-2xl font-bold text-white">{stats.alerts_triggered_today}</p>
          <p className="text-xs text-gray-500 mt-1">Alerts triggered</p>
        </div>
      </div>
    </div>
  );
};
