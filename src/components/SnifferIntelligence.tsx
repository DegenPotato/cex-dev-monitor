import React, { useState, useEffect } from 'react';
import { 
  User, TrendingUp, TrendingDown, Award, AlertTriangle, 
  BarChart3, Clock, DollarSign, Target, Shield, 
  Activity, Users, Hash, ChevronDown, ChevronRight,
  Brain, Eye, Settings, Filter, Calendar, Zap
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import config from '../config.js';

interface CallerProfile {
  id: number;
  telegramUserId: string;
  username: string;
  firstName: string;
  lastName: string;
  isPremium: boolean;
  isVerified: boolean;
  totalCalls: number;
  successfulCalls: number;
  avgPeakMultiplier: number;
  avgTimeToPeak: number;
  totalVolumeGenerated: number;
  winRate: number;
  reputationScore: number;
  trustLevel: 'trusted' | 'neutral' | 'suspicious' | 'scammer';
  lastCallDate: number;
  associatedChannels: string[];
  recentCalls: TokenCall[];
}

interface TokenCall {
  id: number;
  contractAddress: string;
  tokenSymbol: string;
  tokenName: string;
  callTimestamp: number;
  callType: string;
  priceAtCall: number;
  mcapAtCall: number;
  athPrice: number;
  athMultiplier: number;
  currentMultiplier: number;
  timeToAth: number;
  isRugpull: boolean;
  isSuccessful: boolean;
  volume24h: number;
  holderCount: number;
  callMessage: string;
  confidenceScore: number;
}

interface ChannelStats {
  chatId: string;
  chatName: string;
  totalCalls: number;
  successfulCalls: number;
  avgMultiplier: number;
  totalVolume: number;
  channelReputation: number;
  topCallers: CallerProfile[];
  callsToday: number;
  callsThisWeek: number;
}

const SnifferIntelligence: React.FC = () => {
  const [callers, setCallers] = useState<CallerProfile[]>([]);
  const [channels, setChannels] = useState<ChannelStats[]>([]);
  const [selectedCaller, setSelectedCaller] = useState<CallerProfile | null>(null);
  const [selectedChannel, setSelectedChannel] = useState<ChannelStats | null>(null);
  const [activeView, setActiveView] = useState<'callers' | 'channels' | 'campaigns'>('callers');
  const [timeframe, setTimeframe] = useState<'24h' | '7d' | '30d' | 'all'>('7d');
  const [loading, setLoading] = useState(true);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  useEffect(() => {
    loadIntelligenceData();
  }, [timeframe]);

  const loadIntelligenceData = async () => {
    setLoading(true);
    try {
      // Load caller data
      const callersResponse = await fetch(`${config.apiUrl}/api/telegram/callers?timeframe=${timeframe}`, {
        credentials: 'include'
      });
      if (callersResponse.ok) {
        const data = await callersResponse.json();
        setCallers(data.callers || []);
      }

      // Load channel stats
      const channelsResponse = await fetch(`${config.apiUrl}/api/telegram/channel-stats?timeframe=${timeframe}`, {
        credentials: 'include'
      });
      if (channelsResponse.ok) {
        const data = await channelsResponse.json();
        setChannels(data.channels || []);
      }
    } catch (error) {
      console.error('Failed to load intelligence data:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getTrustLevelColor = (level: string) => {
    switch (level) {
      case 'trusted': return 'text-green-400 bg-green-500/10 border-green-500/20';
      case 'neutral': return 'text-gray-400 bg-gray-500/10 border-gray-500/20';
      case 'suspicious': return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20';
      case 'scammer': return 'text-red-400 bg-red-500/10 border-red-500/20';
      default: return 'text-gray-400';
    }
  };

  const getPerformanceColor = (multiplier: number) => {
    if (multiplier >= 10) return 'text-green-400';
    if (multiplier >= 5) return 'text-cyan-400';
    if (multiplier >= 2) return 'text-yellow-400';
    return 'text-red-400';
  };

  const CallerCard: React.FC<{ caller: CallerProfile }> = ({ caller }) => (
    <div 
      className="bg-black/40 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-4 hover:border-cyan-400/40 transition-all cursor-pointer"
      onClick={() => setSelectedCaller(caller)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
            <User className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-cyan-300">
                @{caller.username || 'Unknown'}
              </span>
              {caller.isPremium && <Zap className="w-4 h-4 text-yellow-400" />}
              {caller.isVerified && <Shield className="w-4 h-4 text-blue-400" />}
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full border ${getTrustLevelColor(caller.trustLevel)}`}>
              {caller.trustLevel.toUpperCase()}
            </span>
          </div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-bold text-cyan-400">{caller.winRate.toFixed(1)}%</div>
          <div className="text-xs text-gray-400">Win Rate</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-3">
        <div className="text-center">
          <div className="text-sm font-medium text-gray-300">{caller.totalCalls}</div>
          <div className="text-xs text-gray-500">Total Calls</div>
        </div>
        <div className="text-center">
          <div className={`text-sm font-medium ${getPerformanceColor(caller.avgPeakMultiplier)}`}>
            {caller.avgPeakMultiplier.toFixed(1)}x
          </div>
          <div className="text-xs text-gray-500">Avg Peak</div>
        </div>
        <div className="text-center">
          <div className="text-sm font-medium text-gray-300">{caller.avgTimeToPeak}m</div>
          <div className="text-xs text-gray-500">To Peak</div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-gray-400">
          Volume: ${(caller.totalVolumeGenerated / 1000000).toFixed(2)}M
        </span>
        <span className="text-gray-400">
          Rep: {caller.reputationScore.toFixed(0)}/100
        </span>
      </div>

      {/* Recent Performance Sparkline */}
      <div className="mt-3 pt-3 border-t border-gray-800">
        <div className="text-xs text-gray-400 mb-1">Recent Calls Performance</div>
        <div className="flex items-end gap-1 h-8">
          {caller.recentCalls?.slice(0, 10).map((call, idx) => (
            <div 
              key={idx}
              className={`flex-1 ${call.isSuccessful ? 'bg-green-500' : 'bg-red-500'} opacity-60`}
              style={{ height: `${Math.min(100, call.athMultiplier * 10)}%` }}
              title={`${call.tokenSymbol}: ${call.athMultiplier}x`}
            />
          ))}
        </div>
      </div>
    </div>
  );

  const CallerDetailModal: React.FC<{ caller: CallerProfile }> = ({ caller }) => (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-6">
      <div className="bg-gray-900 rounded-2xl border border-cyan-500/30 max-w-6xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gray-900 border-b border-cyan-500/20 p-6 z-10">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-cyan-500 to-purple-500 flex items-center justify-center">
                <User className="w-8 h-8 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-cyan-300 flex items-center gap-2">
                  @{caller.username}
                  {caller.isPremium && <Zap className="w-5 h-5 text-yellow-400" />}
                  {caller.isVerified && <Shield className="w-5 h-5 text-blue-400" />}
                </h2>
                <div className="flex items-center gap-3 mt-1">
                  <span className={`px-3 py-1 rounded-full text-sm border ${getTrustLevelColor(caller.trustLevel)}`}>
                    {caller.trustLevel.toUpperCase()}
                  </span>
                  <span className="text-gray-400">Rep: {caller.reputationScore}/100</span>
                  <span className="text-gray-400">ID: {caller.telegramUserId}</span>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSelectedCaller(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Performance Overview */}
        <div className="p-6 grid grid-cols-4 gap-4 border-b border-gray-800">
          <div className="bg-black/40 rounded-xl p-4">
            <div className="text-3xl font-bold text-green-400">{caller.winRate.toFixed(1)}%</div>
            <div className="text-sm text-gray-400">Win Rate</div>
            <div className="text-xs text-gray-500 mt-1">{caller.successfulCalls}/{caller.totalCalls} calls</div>
          </div>
          <div className="bg-black/40 rounded-xl p-4">
            <div className="text-3xl font-bold text-cyan-400">{caller.avgPeakMultiplier.toFixed(1)}x</div>
            <div className="text-sm text-gray-400">Avg Peak Multi</div>
            <div className="text-xs text-gray-500 mt-1">{caller.avgTimeToPeak}m to peak</div>
          </div>
          <div className="bg-black/40 rounded-xl p-4">
            <div className="text-3xl font-bold text-purple-400">${(caller.totalVolumeGenerated/1000000).toFixed(2)}M</div>
            <div className="text-sm text-gray-400">Total Volume</div>
            <div className="text-xs text-gray-500 mt-1">Generated</div>
          </div>
          <div className="bg-black/40 rounded-xl p-4">
            <div className="text-3xl font-bold text-yellow-400">{caller.totalCalls}</div>
            <div className="text-sm text-gray-400">Total Calls</div>
            <div className="text-xs text-gray-500 mt-1">Last: {formatDistanceToNow(caller.lastCallDate * 1000)} ago</div>
          </div>
        </div>

        {/* Call History */}
        <div className="p-6">
          <h3 className="text-lg font-bold text-cyan-300 mb-4">Recent Call History</h3>
          <div className="space-y-2">
            {caller.recentCalls?.map((call) => (
              <div key={call.id} className="bg-black/30 rounded-lg p-4 border border-gray-800">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-bold text-cyan-400">{call.tokenSymbol}</span>
                      <span className="text-gray-400">{call.tokenName}</span>
                      <span className={`px-2 py-0.5 rounded text-xs ${call.isSuccessful ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {call.athMultiplier.toFixed(1)}x
                      </span>
                      {call.isRugpull && <AlertTriangle className="w-4 h-4 text-red-400" />}
                    </div>
                    <div className="text-sm text-gray-400 mb-2">
                      "{call.callMessage?.substring(0, 150)}..."
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span>MCap: ${(call.mcapAtCall/1000000).toFixed(2)}M → ${((call.mcapAtCall * call.athMultiplier)/1000000).toFixed(2)}M</span>
                      <span>Time to ATH: {call.timeToAth}m</span>
                      <span>Volume: ${(call.volume24h/1000).toFixed(0)}K</span>
                      <span>Holders: {call.holderCount}</span>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-gray-400">{new Date(call.callTimestamp * 1000).toLocaleString()}</div>
                    <div className="text-sm font-medium mt-1">
                      Confidence: {(call.confidenceScore * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Associated Channels */}
        <div className="p-6 border-t border-gray-800">
          <h3 className="text-lg font-bold text-cyan-300 mb-4">Active In Channels</h3>
          <div className="flex flex-wrap gap-2">
            {caller.associatedChannels?.map((channel) => (
              <span key={channel} className="px-3 py-1 bg-black/40 border border-cyan-500/20 rounded-full text-sm text-gray-300">
                {channel}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="bg-black/40 backdrop-blur-sm border-b border-cyan-500/20 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Brain className="w-8 h-8 text-cyan-400" />
            <div>
              <h2 className="text-2xl font-bold text-cyan-300">Sniffer Intelligence Platform</h2>
              <p className="text-sm text-gray-400">Comprehensive caller & channel analytics</p>
            </div>
          </div>
          
          {/* View Selector */}
          <div className="flex items-center gap-2">
            <div className="bg-black/60 rounded-lg flex">
              <button
                onClick={() => setActiveView('callers')}
                className={`px-4 py-2 rounded-l-lg transition-all ${
                  activeView === 'callers' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4 inline mr-2" />
                Callers
              </button>
              <button
                onClick={() => setActiveView('channels')}
                className={`px-4 py-2 transition-all ${
                  activeView === 'channels' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Hash className="w-4 h-4 inline mr-2" />
                Channels
              </button>
              <button
                onClick={() => setActiveView('campaigns')}
                className={`px-4 py-2 rounded-r-lg transition-all ${
                  activeView === 'campaigns' ? 'bg-cyan-500/20 text-cyan-400' : 'text-gray-400 hover:text-white'
                }`}
              >
                <Target className="w-4 h-4 inline mr-2" />
                Campaigns
              </button>
            </div>

            {/* Timeframe Selector */}
            <select 
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as any)}
              className="bg-black/60 border border-cyan-500/20 rounded-lg px-4 py-2 text-gray-300 focus:outline-none focus:border-cyan-400"
            >
              <option value="24h">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>

            <button className="bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 rounded-lg px-4 py-2 text-cyan-400 transition-all flex items-center gap-2">
              <Settings className="w-4 h-4" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-cyan-400 mx-auto mb-4"></div>
              <p className="text-gray-400">Loading intelligence data...</p>
            </div>
          </div>
        ) : activeView === 'callers' ? (
          <div className="space-y-6">
            {/* Top Performers */}
            <div>
              <div 
                className="flex items-center gap-2 mb-4 cursor-pointer"
                onClick={() => toggleSection('top-performers')}
              >
                {expandedSections.has('top-performers') ? <ChevronDown className="w-5 h-5 text-cyan-400" /> : <ChevronRight className="w-5 h-5 text-cyan-400" />}
                <Award className="w-5 h-5 text-yellow-400" />
                <h3 className="text-lg font-bold text-cyan-300">Top Performing Callers</h3>
                <span className="text-sm text-gray-400">({callers.filter(c => c.winRate > 50).length} with 50%+ win rate)</span>
              </div>
              
              {expandedSections.has('top-performers') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {callers
                    .sort((a, b) => b.winRate - a.winRate)
                    .slice(0, 6)
                    .map(caller => (
                      <CallerCard key={caller.id} caller={caller} />
                    ))}
                </div>
              )}
            </div>

            {/* All Callers */}
            <div>
              <div 
                className="flex items-center gap-2 mb-4 cursor-pointer"
                onClick={() => toggleSection('all-callers')}
              >
                {expandedSections.has('all-callers') ? <ChevronDown className="w-5 h-5 text-cyan-400" /> : <ChevronRight className="w-5 h-5 text-cyan-400" />}
                <Users className="w-5 h-5 text-cyan-400" />
                <h3 className="text-lg font-bold text-cyan-300">All Tracked Callers</h3>
                <span className="text-sm text-gray-400">({callers.length} total)</span>
              </div>
              
              {expandedSections.has('all-callers') && (
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                  {callers.map(caller => (
                    <CallerCard key={caller.id} caller={caller} />
                  ))}
                </div>
              )}
            </div>
          </div>
        ) : activeView === 'channels' ? (
          <div className="space-y-6">
            {/* Channel Analytics */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {channels.map(channel => (
                <div key={channel.chatId} className="bg-black/40 backdrop-blur-sm border border-cyan-500/20 rounded-xl p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <h4 className="text-lg font-bold text-cyan-300">{channel.chatName}</h4>
                      <span className="text-xs text-gray-400">ID: {channel.chatId}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold text-green-400">{channel.channelReputation.toFixed(0)}</div>
                      <div className="text-xs text-gray-400">Reputation</div>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-3 mb-4">
                    <div>
                      <div className="text-sm font-medium text-gray-300">{channel.totalCalls}</div>
                      <div className="text-xs text-gray-500">Total Calls</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-cyan-400">{channel.avgMultiplier.toFixed(1)}x</div>
                      <div className="text-xs text-gray-500">Avg Multi</div>
                    </div>
                    <div>
                      <div className="text-sm font-medium text-gray-300">${(channel.totalVolume/1000000).toFixed(2)}M</div>
                      <div className="text-xs text-gray-500">Volume</div>
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-400 mb-2">Activity</div>
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-1 bg-black/60 rounded">Today: {channel.callsToday}</span>
                    <span className="px-2 py-1 bg-black/60 rounded">Week: {channel.callsThisWeek}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-center py-12">
            <Target className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <p className="text-gray-400">Campaign management coming soon...</p>
          </div>
        )}
      </div>

      {/* Detail Modals */}
      {selectedCaller && <CallerDetailModal caller={selectedCaller} />}
    </div>
  );
};

export default SnifferIntelligence;
