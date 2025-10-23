import React, { useState, useEffect } from 'react';
import { 
  PieChart, Pie, Cell,
  Tooltip, ResponsiveContainer 
} from 'recharts';
import { TrendingUp, Activity, Database, Clock, Target, Award } from 'lucide-react';
import { config } from '../config';

interface TokenSource {
  chat_id?: string;
  chat_name?: string;
  source_type?: string;
  tokens_discovered: number;
  total_trades: number;
  win_rate: number;
  avg_profit_loss_pct: number;
  avg_hours_to_trade: number;
}

interface Summary {
  stats: {
    total_tokens: number;
    telegram_tokens: number;
    manual_tokens: number;
    trade_tokens: number;
    unique_telegram_sources: number;
    total_trades_tracked: number;
    avg_mentions_per_token: number;
  };
  topChannels: any[];
  recentTokens: any[];
}

export const TokenAnalyticsDashboard: React.FC = () => {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [telegramSources, setTelegramSources] = useState<TokenSource[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);

      // Fetch summary
      const summaryRes = await fetch(`${config.apiUrl}/api/analytics/token-sources/summary`, {
        credentials: 'include'
      });
      const summaryData = await summaryRes.json();
      if (summaryData.success) setSummary(summaryData.summary);

      // Fetch Telegram sources
      const telegramRes = await fetch(`${config.apiUrl}/api/analytics/telegram-sources`, {
        credentials: 'include'
      });
      const telegramData = await telegramRes.json();
      if (telegramData.success) setTelegramSources(telegramData.sources);

      // Note: Top sources can be fetched here if needed for future features

    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSourcePerformance = async (chatId: string) => {
    try {
      const res = await fetch(`${config.apiUrl}/api/analytics/token-sources/performance?sourceChatId=${chatId}`, {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        // Source performance data available here for future features
        console.log('Source performance:', data.performance);
      }
    } catch (error) {
      console.error('Failed to fetch source performance:', error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  const pieData = summary ? [
    { name: 'Telegram', value: summary.stats.telegram_tokens, color: '#00D9FF' },
    { name: 'Manual', value: summary.stats.manual_tokens, color: '#FF6B6B' },
    { name: 'Trade', value: summary.stats.trade_tokens, color: '#4ECDC4' }
  ] : [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Activity className="w-8 h-8 text-cyan-400" />
          Token Source Analytics
        </h1>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/50 
                   rounded-lg transition-colors"
        >
          Refresh
        </button>
      </div>

      {/* Stats Grid */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Total Tokens</p>
                <p className="text-2xl font-bold text-white">{summary.stats.total_tokens}</p>
              </div>
              <Database className="w-8 h-8 text-cyan-400" />
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Telegram Sources</p>
                <p className="text-2xl font-bold text-white">{summary.stats.unique_telegram_sources}</p>
              </div>
              <Target className="w-8 h-8 text-purple-400" />
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Trades Tracked</p>
                <p className="text-2xl font-bold text-white">{summary.stats.total_trades_tracked || 0}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-400" />
            </div>
          </div>

          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-sm">Avg Mentions</p>
                <p className="text-2xl font-bold text-white">
                  {(summary.stats.avg_mentions_per_token || 0).toFixed(1)}
                </p>
              </div>
              <Activity className="w-8 h-8 text-orange-400" />
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Source Distribution Pie Chart */}
        {summary && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Token Source Distribution</h2>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Top Performing Channels */}
        {summary && summary.topChannels.length > 0 && (
          <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
            <h2 className="text-xl font-bold text-white mb-4">Top Performing Channels</h2>
            <div className="space-y-3">
              {summary.topChannels.map((channel, idx) => (
                <div 
                  key={idx} 
                  className="flex items-center justify-between p-3 bg-gray-900/50 rounded-lg
                           hover:bg-gray-900/70 cursor-pointer transition-colors"
                  onClick={() => fetchSourcePerformance(channel.source_chat_id)}
                >
                  <div className="flex items-center gap-3">
                    {idx === 0 && <Award className="w-5 h-5 text-yellow-400" />}
                    {idx === 1 && <Award className="w-5 h-5 text-gray-400" />}
                    {idx === 2 && <Award className="w-5 h-5 text-orange-600" />}
                    <div>
                      <p className="text-white font-medium">
                        {channel.source_chat_name || 'Unknown Channel'}
                      </p>
                      <p className="text-gray-400 text-xs">
                        {channel.unique_tokens} tokens • {channel.total_trades} trades
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      channel.win_rate >= 50 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {(channel.win_rate || 0).toFixed(1)}%
                    </p>
                    <p className="text-gray-400 text-xs">Win Rate</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Telegram Sources Table */}
      {telegramSources.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">All Telegram Sources</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-700">
                  <th className="pb-3 text-gray-400">Source</th>
                  <th className="pb-3 text-gray-400 text-center">Tokens</th>
                  <th className="pb-3 text-gray-400 text-center">Trades</th>
                  <th className="pb-3 text-gray-400 text-center">Win Rate</th>
                  <th className="pb-3 text-gray-400 text-center">Avg P/L</th>
                  <th className="pb-3 text-gray-400 text-center">Avg Time</th>
                </tr>
              </thead>
              <tbody>
                {telegramSources.map((source, idx) => (
                  <tr 
                    key={idx} 
                    className="border-b border-gray-700/50 hover:bg-gray-700/30 cursor-pointer"
                    onClick={() => fetchSourcePerformance(source.chat_id!)}
                  >
                    <td className="py-3">
                      <div>
                        <p className="text-white">{source.chat_name || 'Unknown'}</p>
                        <p className="text-gray-400 text-xs">{source.chat_id}</p>
                      </div>
                    </td>
                    <td className="py-3 text-center text-white">{source.tokens_discovered}</td>
                    <td className="py-3 text-center text-white">{source.total_trades || 0}</td>
                    <td className="py-3 text-center">
                      <span className={`font-medium ${
                        (source.win_rate || 0) >= 50 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {(source.win_rate || 0).toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`font-medium ${
                        (source.avg_profit_loss_pct || 0) >= 0 ? 'text-green-400' : 'text-red-400'
                      }`}>
                        {(source.avg_profit_loss_pct || 0).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-3 text-center text-gray-400">
                      {source.avg_hours_to_trade ? `${source.avg_hours_to_trade.toFixed(1)}h` : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Token Discoveries */}
      {summary && summary.recentTokens.length > 0 && (
        <div className="bg-gray-800/50 backdrop-blur-sm rounded-lg p-6 border border-gray-700">
          <h2 className="text-xl font-bold text-white mb-4">Recent Token Discoveries</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {summary.recentTokens.slice(0, 6).map((token, idx) => (
              <div key={idx} className="p-4 bg-gray-900/50 rounded-lg">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-white font-medium">
                      {token.token_symbol || token.token_mint.slice(0, 8) + '...'}
                    </p>
                    <p className="text-gray-400 text-xs mt-1">
                      via {token.first_source_type}
                      {token.telegram_chat_name && ` - ${token.telegram_chat_name}`}
                    </p>
                  </div>
                  <Clock className="w-4 h-4 text-gray-500" />
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-xs text-gray-500">
                    {new Date(token.first_seen_at * 1000).toLocaleDateString()}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-cyan-400">{token.total_mentions || 0} mentions</span>
                    <span className="text-xs text-purple-400">{token.total_trades || 0} trades</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
