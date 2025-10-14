import { useEffect, useState } from 'react';
import { BarChart3, Clock, TrendingUp, Activity, CheckCircle, XCircle } from 'lucide-react';
import { apiUrl } from '../config';

export function RequestStatsPanel() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    const interval = setInterval(fetchStats, 2000); // Update every 2 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchStats = async () => {
    try {
      const statsRes = await fetch(apiUrl('/api/stats/requests'));
      const statsData = await statsRes.json();
      
      setStats(statsData);
      setLoading(false);
    } catch (error) {
      console.error('Error fetching request stats:', error);
      setLoading(false);
    }
  };

  if (loading || !stats) {
    return (
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
        <h3 className="text-lg font-bold text-white mb-4">Loading statistics...</h3>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-slate-800/50 backdrop-blur-sm rounded-lg border border-purple-500/20 p-6">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-purple-400" />
          Real-Time Request Statistics
        </h3>

        {/* Overview Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-gray-400">Total Requests</span>
            </div>
            <div className="text-2xl font-bold text-white">{stats.overview.totalRequests.toLocaleString()}</div>
          </div>

          <div className="bg-gradient-to-br from-green-500/10 to-green-600/10 border border-green-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-400" />
              <span className="text-xs text-gray-400">Requests/Min</span>
            </div>
            <div className="text-2xl font-bold text-green-400">{stats.overview.requestsPerMinute}</div>
          </div>

          <div className="bg-gradient-to-br from-purple-500/10 to-purple-600/10 border border-purple-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Clock className="w-4 h-4 text-purple-400" />
              <span className="text-xs text-gray-400">Avg Response</span>
            </div>
            <div className="text-2xl font-bold text-purple-400">{stats.overview.avgResponseTime}ms</div>
          </div>

          <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/10 border border-orange-500/30 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-gray-400">Eventual Success</span>
            </div>
            <div className="text-2xl font-bold text-orange-400">{stats.overview.eventualSuccessRate || stats.overview.successRate}%</div>
          </div>
        </div>

        {/* Retry & Rate Limit Stats */}
        {stats.retryStats && (stats.retryStats.totalRetries > 0 || stats.retryStats.rateLimitErrors > 0) && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-400" />
              ⚠️ Retry & Rate Limit Analysis
            </h4>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-xs text-gray-400 mb-1">Total Retries</div>
                <div className="text-lg font-bold text-yellow-400">
                  {stats.retryStats.totalRetries.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Rate Limit (429)</div>
                <div className="text-lg font-bold text-red-400">
                  {stats.retryStats.rateLimitErrors.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Eventual Success</div>
                <div className="text-lg font-bold text-green-400">
                  {stats.retryStats.eventualSuccesses.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Final Failures</div>
                <div className="text-lg font-bold text-red-400">
                  {stats.retryStats.actualFailures.toLocaleString()}
                </div>
              </div>
              <div>
                <div className="text-xs text-gray-400 mb-1">Avg Retries/Req</div>
                <div className="text-lg font-bold text-orange-400">
                  {stats.retryStats.avgRetriesPerRequest}x
                </div>
              </div>
            </div>
            {stats.retryStats.rateLimitErrors > 0 && (
              <div className="mt-3 text-sm text-red-300 bg-red-900/20 rounded p-2">
                🚨 <strong>Rate limit detected!</strong> {stats.retryStats.rateLimitErrors} requests hit 429 errors. 
                {stats.proxyUsage.proxyPercentage < 100 && ' The rate limiter is now active to prevent further 429s.'}
              </div>
            )}
          </div>
        )}

        {/* Per-Endpoint Breakdown */}
        {stats.byEndpoint && Object.keys(stats.byEndpoint).length > 0 && (
          <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
            <h4 className="text-white font-semibold mb-3">🌐 Endpoint Traffic (Requests/Min)</h4>
            <div className="space-y-2">
              {Object.entries(stats.endpointRates || {})
                .sort((a: any, b: any) => b[1] - a[1]) // Sort by rate (highest first)
                .map(([endpoint, rate]: [string, any]) => {
                  // Shorten endpoint for display
                  const displayEndpoint = endpoint.includes('http') 
                    ? new URL(endpoint).hostname 
                    : endpoint;
                  
                  return (
                    <div key={endpoint} className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                          rate > 0 ? 'bg-blue-400' : 'bg-gray-400'
                        }`}></div>
                        <span className="text-sm text-gray-300 truncate" title={endpoint}>
                          {displayEndpoint}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 flex-shrink-0">
                        <span className="text-xs text-gray-400">
                          Total: {stats.byEndpoint[endpoint]?.toLocaleString() || 0}
                        </span>
                        <span className={`text-sm font-semibold ${
                          rate > 0 ? 'text-blue-400' : 'text-gray-400'
                        }`}>
                          {rate}/min
                        </span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Per-Service Breakdown */}
        <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
          <h4 className="text-white font-semibold mb-3">Service Breakdown (Requests/Min)</h4>
          <div className="space-y-2">
            {Object.entries(stats.serviceRates).map(([service, rate]: [string, any]) => (
              <div key={service} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${
                    rate > 0 ? 'bg-green-400' : 'bg-gray-400'
                  }`}></div>
                  <span className="text-sm text-gray-300">{service}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400">
                    Total: {stats.byService[service]?.toLocaleString() || 0}
                  </span>
                  <span className={`text-sm font-semibold ${
                    rate > 0 ? 'text-green-400' : 'text-gray-400'
                  }`}>
                    {rate}/min
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Proxy Usage */}
        <div className="bg-slate-900/50 rounded-lg p-4 mb-4">
          <h4 className="text-white font-semibold mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4 text-purple-400" />
            Proxy Usage
          </h4>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-xs text-gray-400 mb-1">Proxy Requests</div>
              <div className="text-lg font-bold text-purple-400">
                {stats.proxyUsage.proxyRequests.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Direct Requests</div>
              <div className="text-lg font-bold text-blue-400">
                {stats.proxyUsage.directRequests.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-400 mb-1">Proxy %</div>
              <div className="text-lg font-bold text-green-400">
                {stats.proxyUsage.proxyPercentage}%
              </div>
            </div>
          </div>
        </div>

        {/* Performance Metrics */}
        <div className="bg-slate-900/50 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-3">Performance Metrics</h4>
          <div className="grid grid-cols-3 gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle className="w-3 h-3 text-green-400" />
                <span className="text-xs text-gray-400">Successful</span>
              </div>
              <div className="text-lg font-bold text-green-400">
                {stats.performance.successCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <XCircle className="w-3 h-3 text-red-400" />
                <span className="text-xs text-gray-400">Failed</span>
              </div>
              <div className="text-lg font-bold text-red-400">
                {stats.performance.failureCount.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-3 h-3 text-blue-400" />
                <span className="text-xs text-gray-400">Uptime</span>
              </div>
              <div className="text-lg font-bold text-blue-400">
                {Math.floor(stats.overview.uptime / 60)}m
              </div>
            </div>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="mt-4 bg-slate-900/50 rounded-lg p-4">
          <h4 className="text-white font-semibold mb-3">Live Activity (Last 20)</h4>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {stats.recentActivity.slice(0, 20).map((activity: any, idx: number) => {
              // Shorten endpoint for display
              const displayEndpoint = activity.endpoint 
                ? (activity.endpoint.includes('http') 
                    ? new URL(activity.endpoint).hostname 
                    : activity.endpoint)
                : null;
              
              return (
                <div key={idx} className="text-xs flex items-center justify-between py-1 border-b border-slate-700/50">
                  <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                    <span className="text-gray-400">{activity.service}</span>
                    {displayEndpoint && (
                      <span className="text-gray-600 text-[10px] truncate" title={activity.endpoint}>
                        → {displayEndpoint}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-gray-500">
                      {new Date(activity.timestamp).toLocaleTimeString()}
                    </span>
                    {activity.success ? (
                      <CheckCircle className="w-3 h-3 text-green-400" />
                    ) : (
                      <XCircle className="w-3 h-3 text-red-400" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
