import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Bell, Plus, X, RefreshCw, Play, Zap, Copy, ExternalLink, Check, Edit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';
import { toast } from 'react-hot-toast';
import { PoolSelectionModal } from './PoolSelectionModal';
import { AlertActionConfig, AlertAction } from './AlertActionConfig';

const apiUrl = (path: string) => `${config.apiUrl}${path}`;

interface Campaign {
  id: string;
  tokenMint: string;
  poolAddress: string;
  startPrice: number;
  startPriceUSD?: number;
  currentPrice: number;
  currentPriceUSD?: number;
  high: number;
  highUSD?: number;
  low: number;
  lowUSD?: number;
  changePercent: number;
  highestGainPercent: number;  // Highest % gain from start
  lowestDropPercent: number;   // Lowest % drop from start
  startTime: number;
  lastUpdate: number;
  isActive: boolean;
  // Token metadata
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
}

interface Alert {
  id: string;
  campaignId: string;
  targetPrice: number;
  targetPercent: number;
  direction: 'above' | 'below';
  priceType: 'percentage' | 'exact_sol' | 'exact_usd';
  hit: boolean;
  hitAt?: number;
  actions: AlertAction[]; // Each alert has its own specific actions
}

interface HistoryEntry {
  timestamp: string;
  campaignId: string;
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
  priceSOL: number;
  priceUSD?: number;
  changePercent: number;
  high: number;
  highUSD?: number;
  low: number;
  lowUSD?: number;
  type: 'update' | 'alert';
}

interface TriggerHistoryEntry {
  id: string;
  timestamp: number;
  campaignId: string;
  tokenMint: string;
  tokenName?: string;
  tokenSymbol?: string;
  tokenLogo?: string;
  alertId: string;
  alertType: string; // 'percentage' | 'exact_sol' | 'exact_usd'
  direction: 'above' | 'below';
  targetValue: number;
  triggeredAt: number; // price when triggered
  triggeredAtUSD?: number;
  actions: Array<{
    type: string;
    status: 'success' | 'failed' | 'pending';
    details?: string;
    error?: string;
  }>;
}

export const TestLabTab: React.FC = () => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [selectedCampaign, setSelectedCampaign] = useState<Campaign | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [tokenMint, setTokenMint] = useState('');
  const [poolAddress, setPoolAddress] = useState('');
  const [newAlertPercent, setNewAlertPercent] = useState('');
  const [newAlertDirection, setNewAlertDirection] = useState<'above' | 'below'>('above');
  const [newAlertPriceType, setNewAlertPriceType] = useState<'percentage' | 'exact_sol' | 'exact_usd'>('percentage');
  const [newAlertActions, setNewAlertActions] = useState<AlertAction[]>([{ type: 'notification' }]);
  const [editingAlertId, setEditingAlertId] = useState<string | null>(null);
  const [editAlertActions, setEditAlertActions] = useState<AlertAction[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'campaigns' | 'history' | 'triggers'>('campaigns');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [triggerHistory, setTriggerHistory] = useState<TriggerHistoryEntry[]>([]);
  const [showPoolModal, setShowPoolModal] = useState(false);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [chartInterval, setChartInterval] = useState<'1' | '5'>('5');
  const [campaignSource, setCampaignSource] = useState<'manual' | 'telegram' | 'gmgn-test'>('manual');
  const [telegramAccountId, setTelegramAccountId] = useState<number | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramUsername, setTelegramUsername] = useState<string>('');
  const [telegramAccounts, setTelegramAccounts] = useState<any[]>([]);
  const [telegramChats, setTelegramChats] = useState<any[]>([]);
  const [gmgnIndicators, setGmgnIndicators] = useState<{ [key: string]: number | null }>({
    PRICE: null,
    RSI: null,
    EMA_9: null,
    EMA_20: null
  });
  const [gmgnScreenshot, setGmgnScreenshot] = useState<string | null>(null);
  const [gmgnDebugMode, setGmgnDebugMode] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Copy address to clipboard
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success('Address copied!');
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Fetch telegram accounts for source selection
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

  // Fetch chats when account is selected
  useEffect(() => {
    if (!telegramAccountId) {
      setTelegramChats([]);
      return;
    }

    const fetchChats = async () => {
      try {
        const response = await fetch(`${config.apiUrl}/api/telegram/chats?accountId=${telegramAccountId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTelegramChats(data.chats || []);
        }
      } catch (error) {
        console.error('Failed to fetch chats:', error);
      }
    };
    fetchChats();
  }, [telegramAccountId]);

  // Set up WebSocket for real-time updates (like other tabs)
  useEffect(() => {
    fetchCampaigns();

    // Native WebSocket connection at /ws
    const wsUrl = apiUrl('/ws').replace('http', 'ws');
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('✅ Test Lab connected to real-time updates');
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        const timestamp = new Date().toISOString();
        console.log(`📥 [${timestamp}] Received WebSocket message:`, message.type);

        // Handle price updates
        if (message.type === 'test_lab_price_update') {
          const data = message.data;
          console.log(`📊 [${timestamp}] Price update for ${data.id}: ${data.currentPrice} SOL (${data.changePercent.toFixed(2)}%)`);
          console.log(`   Full data received:`, data);
          
          // Force state update with completely new object
          setCampaigns(prev => {
            const updated = prev.map(c => {
              if (c.id === data.id) {
                return {
                  ...c,
                  currentPrice: data.currentPrice,
                  currentPriceUSD: data.currentPriceUSD,
                  high: data.high,
                  highUSD: data.highUSD,
                  low: data.low,
                  lowUSD: data.lowUSD,
                  changePercent: data.changePercent,
                  highestGainPercent: data.highestGainPercent || data.changePercent,
                  lowestDropPercent: data.lowestDropPercent || Math.min(0, data.changePercent),
                  lastUpdate: data.lastUpdate
                };
              }
              return c;
            });
            console.log(`   Updated campaigns:`, updated);
            return updated;
          });

          // Update selected campaign if it matches
          setSelectedCampaign(prev => {
            if (prev && prev.id === data.id) {
              return {
                ...prev,
                currentPrice: data.currentPrice,
                currentPriceUSD: data.currentPriceUSD,
                high: data.high,
                highUSD: data.highUSD,
                low: data.low,
                lowUSD: data.lowUSD,
                changePercent: data.changePercent,
                highestGainPercent: data.highestGainPercent || data.changePercent,
                lowestDropPercent: data.lowestDropPercent || Math.min(0, data.changePercent),
                lastUpdate: data.lastUpdate
              };
            }
            return prev;
          });

          // Add to history (with metadata from campaign)
          const campaign = campaigns.find(c => c.id === data.id);
          setHistory(prev => [{
            timestamp,
            campaignId: data.id,
            tokenMint: data.tokenMint,
            tokenName: campaign?.tokenName,
            tokenSymbol: campaign?.tokenSymbol,
            tokenLogo: campaign?.tokenLogo,
            priceSOL: data.currentPrice,
            priceUSD: data.currentPriceUSD,
            changePercent: data.changePercent,
            high: data.high,
            highUSD: data.highUSD,
            low: data.low,
            lowUSD: data.lowUSD,
            type: 'update' as const
          }, ...prev].slice(0, 100)); // Keep last 100
        }

        // Handle alert triggers
        if (message.type === 'test_lab_alert') {
          const data = message.data;
          console.log(`🚨 [${timestamp}] Alert triggered:`, data);
          
          toast.success(
            <div className="flex flex-col gap-2">
              <div className="font-bold text-base">🎯 Alert Triggered!</div>
              <div className="text-sm">
                <span className="font-medium">{data.tokenMint?.slice(0, 8)}...</span> reached{' '}
                <span className={data.alert.direction === 'above' ? 'text-green-400' : 'text-red-400'}>
                  {data.alert.direction} {data.alert.targetPercent >= 0 ? '+' : ''}{data.alert.targetPercent}%
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-gray-400">Target</div>
                  <div className="font-mono">{data.alert.targetPrice.toFixed(9)} SOL</div>
                </div>
                <div>
                  <div className="text-gray-400">Hit at</div>
                  <div className="font-mono">{data.currentPrice.toFixed(9)} SOL</div>
                </div>
                {data.currentPriceUSD && (
                  <div>
                    <div className="text-gray-400">USD Value</div>
                    <div className="font-mono">${data.currentPriceUSD.toFixed(8)}</div>
                  </div>
                )}
                {data.changePercent !== undefined && (
                  <div>
                    <div className="text-gray-400">Total Change</div>
                    <div className={`font-mono ${data.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
                    </div>
                  </div>
                )}
              </div>
              {data.hitTime && (
                <div className="text-xs text-gray-500 border-t border-gray-600 pt-1">
                  {data.hitTime}
                </div>
              )}
            </div>,
            { duration: 15000 }
          );

          // Add to history
          setHistory(prev => [{
            timestamp,
            campaignId: data.campaignId,
            tokenMint: data.tokenMint || 'Unknown',
            priceSOL: data.currentPrice,
            priceUSD: data.currentPriceUSD,
            changePercent: data.changePercent || 0,
            high: data.currentPrice,
            low: data.currentPrice,
            type: 'alert' as const
          }, ...prev].slice(0, 100));

          // Add to trigger history with detailed action tracking
          const campaign = campaigns.find(c => c.id === data.campaignId);
          setTriggerHistory(prev => [{
            id: `${data.alert.id}_${data.timestamp}`,
            timestamp: data.timestamp,
            campaignId: data.campaignId,
            tokenMint: data.tokenMint,
            tokenName: campaign?.tokenName,
            tokenSymbol: campaign?.tokenSymbol,
            tokenLogo: campaign?.tokenLogo,
            alertId: data.alert.id,
            alertType: data.alert.priceType || 'percentage',
            direction: data.alert.direction,
            targetValue: data.alert.targetPercent,
            triggeredAt: data.currentPrice,
            triggeredAtUSD: data.currentPriceUSD,
            actions: (data.alert.actions || []).map((action: any) => ({
              type: action.type,
              status: 'success' as const, // Will be updated by backend execution results
              details: action.type === 'buy' ? `${action.amount} SOL` :
                       action.type === 'sell' ? `${action.amount}%` :
                       action.type === 'telegram' ? `Chat: ${action.chatId}` :
                       action.type === 'discord' ? 'Webhook' :
                       'Browser notification'
            }))
          }, ...prev].slice(0, 100)); // Keep last 100 triggers

          // Only update alerts if they belong to the currently selected campaign
          if (selectedCampaign && data.campaignId === selectedCampaign.id) {
            setAlerts(prev => prev.map(a =>
              a.id === data.alert.id ? { ...a, hit: true, hitAt: data.timestamp } : a
            ));
          }
        }

        // Handle GMGN indicator updates
        if (message.type === 'gmgn_indicator_update') {
          const data = message.data;
          console.log(`📈 GMGN Indicators for ${data.tokenMint.slice(0, 8)}...`);
          console.log(`   Values:`, data.values);
          
          // Update indicator values
          setGmgnIndicators(data.values);
        }

        // Handle GMGN screenshot updates
        if (message.type === 'gmgn_screenshot') {
          const data = message.data;
          console.log(`📸 Screenshot available for ${data.tokenMint.slice(0, 8)}...`);
          
          // Update screenshot URL
          setGmgnScreenshot(data.url);
        }
      } catch (error) {
        console.error('❌ Error parsing WebSocket message:', error);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('WebSocket connection closed');
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  // Fetch user campaigns
  const fetchCampaigns = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/campaigns`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
        if (data.campaigns.length > 0 && !selectedCampaign) {
          selectCampaign(data.campaigns[0]);
        }
      }
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
    }
  };

  // Select a campaign
  const selectCampaign = async (campaign: Campaign) => {
    setSelectedCampaign(campaign);
    
    // Fetch alerts for this campaign
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/alerts/${campaign.id}`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setAlerts(data.alerts || []);
      }
    } catch (error) {
      console.error('Failed to fetch alerts:', error);
    }
  };

  // Start new campaign
  const startCampaign = async () => {
    if (!tokenMint) {
      toast.error('Please enter token contract address');
      return;
    }
    
    if (!poolAddress) {
      toast.error('Please select a pool to monitor');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/campaign/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ tokenMint, poolAddress })
      });

      const data = await response.json();
      
      if (data.success) {
        setCampaigns(prev => [...prev, data.campaign]);
        setSelectedCampaign(data.campaign);
        setAlerts([]); // Clear alerts for new campaign (it starts with no alerts)
        setTokenMint('');
        setPoolAddress('');
        toast.success('Campaign started');
      } else {
        throw new Error(data.error || 'Failed to start campaign');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Stop campaign
  const stopCampaign = async (campaignId: string) => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/campaign/stop`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ campaignId })
      });

      const data = await response.json();
      
      if (data.success) {
        setCampaigns(prev => prev.filter(c => c.id !== campaignId));
        if (selectedCampaign?.id === campaignId) {
          setSelectedCampaign(null);
          setAlerts([]);
        }
        toast.success('Campaign stopped');
      }
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Reset campaign
  const resetCampaign = async () => {
    if (!selectedCampaign) return;

    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/campaign/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ campaignId: selectedCampaign.id })
      });

      const data = await response.json();
      
      if (data.success) {
        setCampaigns(prev => prev.map(c => 
          c.id === selectedCampaign.id ? data.campaign : c
        ));
        setSelectedCampaign(data.campaign);
        toast.success('Campaign reset - new baseline set');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Add alert with actions
  const addAlert = async () => {
    if (!selectedCampaign || !newAlertPercent) {
      toast.error(newAlertPriceType === 'percentage' ? 'Please enter a percentage' : 'Please enter a price');
      return;
    }

    const value = parseFloat(newAlertPercent);
    if (isNaN(value)) {
      toast.error('Invalid value');
      return;
    }

    // Validate actions
    if (newAlertActions.length === 0) {
      toast.error('Please add at least one action');
      return;
    }

    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/alerts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          campaignId: selectedCampaign.id,
          targetPercent: value,  // Re-use same field for percentage or exact price
          direction: newAlertDirection,
          priceType: newAlertPriceType,
          actions: newAlertActions
        })
      });

      const data = await response.json();
      
      if (data.success) {
        setAlerts(prev => [...prev, data.alert]);
        setNewAlertPercent('');
        setNewAlertActions([{ type: 'notification' }]); // Reset to default
        toast.success(`Alert added with ${newAlertActions.length} action(s)`);
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Start telegram monitoring
  const startTelegramMonitoring = async () => {
    if (!telegramAccountId || !telegramChatId || !telegramUsername) {
      toast.error('Please select account, chat, and username');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/telegram-monitor/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          telegramAccountId,
          chatId: telegramChatId,
          username: telegramUsername
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`Now monitoring ${telegramUsername}!`);
        // Reset form
        setTelegramAccountId(null);
        setTelegramChatId('');
        setTelegramUsername('');
      } else {
        toast.error(data.error || 'Failed to start monitoring');
      }
    } catch (error) {
      console.error('Failed to start monitoring:', error);
      toast.error('Failed to start monitoring');
    } finally {
      setLoading(false);
    }
  };

  // Delete alert
  const deleteAlert = async (alertId: string) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/alerts/${alertId}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      const data = await response.json();
      
      if (data.success) {
        setAlerts(prev => prev.filter(a => a.id !== alertId));
        toast.success('Alert deleted');
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  // Start editing alert actions
  const startEditingAlert = (alert: Alert) => {
    setEditingAlertId(alert.id);
    setEditAlertActions([...alert.actions]);
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingAlertId(null);
    setEditAlertActions([]);
  };

  // Save edited alert actions
  const saveEditedActions = async (alertId: string) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/alerts/${alertId}/actions`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ actions: editAlertActions })
      });

      const data = await response.json();
      
      if (data.success) {
        setAlerts(prev => prev.map(a => 
          a.id === alertId ? { ...a, actions: editAlertActions } : a
        ));
        toast.success('Alert actions updated');
        cancelEditing();
      }
    } catch (error: any) {
      toast.error(error.message);
    }
  };

  const formatTime = (ms: number) => {
    const seconds = Math.floor((Date.now() - ms) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m ago`;
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
          <Zap className="w-6 h-6" />
          Test Lab - On-Chain WebSocket Monitoring
        </h2>
        <div className="text-sm text-gray-400">
          Real-time pool data via Solana WebSocket
        </div>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-4 border-b border-gray-700">
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === 'campaigns'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Campaigns
        </button>
        <button
          onClick={() => setActiveTab('history')}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'history'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Update History
          {history.length > 0 && (
            <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded-full text-xs">
              {history.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('triggers')}
          className={`px-4 py-2 font-medium transition-colors flex items-center gap-2 ${
            activeTab === 'triggers'
              ? 'text-cyan-400 border-b-2 border-cyan-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          <Bell className="w-4 h-4" />
          Alert Triggers
          {triggerHistory.length > 0 && (
            <span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded-full text-xs">
              {triggerHistory.length}
            </span>
          )}
        </button>
      </div>

      {activeTab === 'campaigns' && (
        <>
      {/* New Campaign */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-gray-800 border border-gray-700 rounded-xl p-6"
      >
        <h3 className="text-lg font-bold text-white mb-4">Start New Campaign</h3>
        
        {/* Source Type Selector */}
        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-2">Campaign Source</label>
          <div className="flex gap-3">
            <button
              onClick={() => setCampaignSource('manual')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'manual'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Manual</div>
              <div className="text-xs mt-1">Paste token address manually</div>
            </button>
            <button
              onClick={() => setCampaignSource('telegram')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'telegram'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Telegram Listener</div>
              <div className="text-xs mt-1">Auto-monitor user's token calls</div>
            </button>
            <button
              onClick={() => setCampaignSource('gmgn-test')}
              className={`flex-1 px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'gmgn-test'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">GMGN Scraper</div>
              <div className="text-xs mt-1">Test indicator extraction</div>
            </button>
          </div>
        </div>

        {/* Manual Source Fields */}
        {campaignSource === 'manual' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Token Contract Address</label>
            <input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Paste token CA..."
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-2">Pool Selection</label>
            {poolAddress ? (
              <div className="flex gap-2">
                <div className="flex-1 px-4 py-2 bg-green-900/20 border border-green-600/30 rounded-lg text-green-400 font-mono text-sm flex items-center justify-between">
                  <span className="truncate">{poolAddress}</span>
                  <X 
                    className="w-4 h-4 cursor-pointer hover:text-red-400" 
                    onClick={() => setPoolAddress('')}
                  />
                </div>
              </div>
            ) : (
              <button
                onClick={() => {
                  if (!tokenMint) {
                    toast.error('Please enter token address first');
                    return;
                  }
                  setShowPoolModal(true);
                }}
                disabled={!tokenMint}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 hover:border-cyan-500 rounded-lg text-gray-400 hover:text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {tokenMint ? 'Select Pool from Available Pools' : 'Enter token address first'}
              </button>
            )}
          </div>
          <div className="flex items-end">
            <button
              onClick={startCampaign}
              disabled={loading || !tokenMint || !poolAddress}
              className="w-full px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              {!tokenMint ? 'Enter Token Address' : !poolAddress ? 'Select Pool First' : loading ? 'Starting...' : 'Start Campaign'}
            </button>
          </div>
        </div>
        )}

        {/* Telegram Source Fields */}
        {campaignSource === 'telegram' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Telegram Account</label>
              <select
                value={telegramAccountId || ''}
                onChange={(e) => setTelegramAccountId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
              >
                <option value="">Select account...</option>
                {telegramAccounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.phone_number || `Account ${account.id}`}
                  </option>
                ))}
              </select>
            </div>
            
            <div>
              <label className="block text-sm text-gray-400 mb-2">Chat</label>
              <select
                value={telegramChatId}
                onChange={(e) => setTelegramChatId(e.target.value)}
                disabled={!telegramAccountId}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">Select chat...</option>
                {telegramChats.map((chat) => (
                  <option key={chat.id} value={chat.id}>
                    {chat.title || chat.username || `Chat ${chat.id}`}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm text-gray-400 mb-2">Target Username</label>
              <input
                type="text"
                value={telegramUsername}
                onChange={(e) => setTelegramUsername(e.target.value)}
                placeholder="@username or user ID"
                disabled={!telegramChatId}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>

          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <p className="text-sm text-cyan-300">
              <strong>Auto-Monitor Mode:</strong> When enabled, Test Lab will automatically create campaigns for any tokens posted by the selected user in the selected chat.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={startTelegramMonitoring}
              disabled={loading || !telegramAccountId || !telegramChatId || !telegramUsername}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Starting...' : 'Start Monitoring'}
            </button>
          </div>
        </div>
        )}

        {/* GMGN Scraper Test Fields */}
        {campaignSource === 'gmgn-test' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-2">Token Contract Address</label>
            <input
              type="text"
              value={tokenMint}
              onChange={(e) => setTokenMint(e.target.value)}
              placeholder="Enter token CA to test GMGN scraping..."
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white font-mono text-sm"
            />
          </div>

          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <p className="text-sm text-yellow-300">
              <strong>🧪 Test Mode:</strong> This will launch a browser window, navigate to GMGN chart, and attempt to extract price & indicator values (RSI, EMA) in real-time. Watch the console for extracted values.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="gmgn-debug-mode"
              checked={gmgnDebugMode}
              onChange={(e) => setGmgnDebugMode(e.target.checked)}
              className="w-4 h-4 rounded border-gray-600 bg-gray-700 text-purple-600 focus:ring-2 focus:ring-purple-500"
            />
            <label htmlFor="gmgn-debug-mode" className="text-sm text-gray-300">
              📸 Enable Debug Mode (take screenshots)
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={async () => {
                if (!tokenMint) {
                  toast.error('Please enter a token address');
                  return;
                }
                
                setLoading(true);
                try {
                  const response = await fetch(`${config.apiUrl}/api/test-lab/gmgn-test/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ tokenMint, debugMode: gmgnDebugMode })
                  });

                  const data = await response.json();
                  
                  if (data.success) {
                    toast.success('GMGN scraper test started! Check console for values.');
                  } else {
                    toast.error(data.error || 'Failed to start test');
                  }
                } catch (error) {
                  console.error('Failed to start GMGN test:', error);
                  toast.error('Failed to start test');
                } finally {
                  setLoading(false);
                }
              }}
              disabled={loading || !tokenMint}
              className="px-6 py-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              {loading ? 'Starting Test...' : 'Start GMGN Test'}
            </button>
          </div>

          {/* Live indicator values display */}
          <div className="mt-4 p-4 bg-gray-900 rounded-lg">
            <h4 className="text-sm font-medium text-gray-400 mb-2">Live Indicator Values</h4>
            <div className="grid grid-cols-4 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Price:</span>
                <span className="ml-2 font-mono text-cyan-400">
                  {gmgnIndicators.PRICE ? `$${gmgnIndicators.PRICE.toFixed(8)}` : '--'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">RSI:</span>
                <span className="ml-2 font-mono text-yellow-400">
                  {gmgnIndicators.RSI ? gmgnIndicators.RSI.toFixed(2) : '--'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">EMA(9):</span>
                <span className="ml-2 font-mono text-green-400">
                  {gmgnIndicators.EMA_9 ? `$${gmgnIndicators.EMA_9.toFixed(8)}` : '--'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">EMA(20):</span>
                <span className="ml-2 font-mono text-purple-400">
                  {gmgnIndicators.EMA_20 ? `$${gmgnIndicators.EMA_20.toFixed(8)}` : '--'}
                </span>
              </div>
            </div>
          </div>

          {/* Screenshot display */}
          {gmgnScreenshot && (
            <div className="mt-4 p-4 bg-gray-900 rounded-lg">
              <h4 className="text-sm font-medium text-gray-400 mb-2">📸 Browser Screenshot</h4>
              <p className="text-xs text-gray-500 mb-2">What the scraper sees on GMGN:</p>
              <div className="border border-gray-700 rounded overflow-hidden">
                <img 
                  src={`${config.apiUrl}${gmgnScreenshot}`} 
                  alt="GMGN Screenshot" 
                  className="w-full h-auto"
                  onError={(e) => {
                    console.error('Failed to load screenshot');
                    e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="400" height="200"%3E%3Ctext x="50%25" y="50%25" text-anchor="middle" fill="%23666"%3EScreenshot unavailable%3C/text%3E%3C/svg%3E';
                  }}
                />
              </div>
            </div>
          )}
        </div>
        )}
      </motion.div>

      {/* Active Campaigns */}
      {campaigns.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4">Active Campaigns ({campaigns.length})</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {campaigns.map(campaign => (
              <div
                key={campaign.id}
                onClick={() => selectCampaign(campaign)}
                className={`p-4 rounded-lg border cursor-pointer transition-all ${
                  selectedCampaign?.id === campaign.id
                    ? 'bg-cyan-900/30 border-cyan-500'
                    : 'bg-gray-900 border-gray-700 hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  {campaign.tokenLogo && (
                    <img src={campaign.tokenLogo} alt={campaign.tokenSymbol || 'Token'} className="w-10 h-10 rounded-full" />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-semibold text-white">
                        {campaign.tokenSymbol || campaign.tokenMint.slice(0, 8)}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyAddress(campaign.tokenMint);
                        }}
                        className="p-1 hover:bg-gray-700 rounded transition-colors"
                        title="Copy address"
                      >
                        {copiedAddress === campaign.tokenMint ? (
                          <Check className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3 text-gray-400" />
                        )}
                      </button>
                    </div>
                    {campaign.tokenName && (
                      <div className="text-xs text-gray-500 truncate">{campaign.tokenName}</div>
                    )}
                    <div className={`text-lg font-bold mt-1 ${
                      campaign.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {campaign.changePercent >= 0 ? '+' : ''}{campaign.changePercent.toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {formatTime(campaign.startTime)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      stopCampaign(campaign.id);
                    }}
                    className="p-1 hover:bg-red-600/20 rounded transition-colors"
                  >
                    <X className="w-4 h-4 text-red-400" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Selected Campaign Details */}
      {selectedCampaign && (
        <>
          {/* Token Header with Links */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4"
          >
            <div className="flex items-center gap-4">
              {selectedCampaign.tokenLogo && (
                <img src={selectedCampaign.tokenLogo} alt={selectedCampaign.tokenSymbol || 'Token'} className="w-16 h-16 rounded-full" />
              )}
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="text-xl font-bold text-white">
                    {selectedCampaign.tokenSymbol || selectedCampaign.tokenMint.slice(0, 8)}
                  </h3>
                  <button
                    onClick={() => copyAddress(selectedCampaign.tokenMint)}
                    className="p-1 hover:bg-gray-700 rounded transition-colors"
                    title="Copy address"
                  >
                    {copiedAddress === selectedCampaign.tokenMint ? (
                      <Check className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {selectedCampaign.tokenName && (
                  <div className="text-sm text-gray-400">{selectedCampaign.tokenName}</div>
                )}
                <div className="flex items-center gap-3 mt-2">
                  <a
                    href={`https://solscan.io/token/${selectedCampaign.tokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 bg-purple-600/20 hover:bg-purple-600/30 border border-purple-600/30 rounded-lg text-purple-400 text-sm transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Solscan
                  </a>
                  <a
                    href={`https://gmgn.ai/sol/token/${selectedCampaign.tokenMint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-3 py-1 bg-green-600/20 hover:bg-green-600/30 border border-green-600/30 rounded-lg text-green-400 text-sm transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    GMGN
                  </a>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-2 md:grid-cols-3 gap-4"
          >
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 col-span-2 md:col-span-1">
              <div className="text-sm text-gray-400 mb-1">Current Price</div>
              <div className="text-lg font-bold text-cyan-400">{selectedCampaign.currentPrice.toFixed(9)} SOL</div>
              {selectedCampaign.currentPriceUSD && (
                <div className="text-sm text-gray-400">${selectedCampaign.currentPriceUSD.toFixed(8)} USD</div>
              )}
              <div className={`text-lg font-bold mt-1 ${
                selectedCampaign.changePercent >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                {selectedCampaign.changePercent >= 0 ? '+' : ''}{selectedCampaign.changePercent.toFixed(2)}%
              </div>
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="text-sm text-gray-400 mb-1">Highest Gain</div>
              <div className="text-lg font-bold text-green-400">
                +{selectedCampaign.highestGainPercent.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500">Peak from start</div>
              <div className="text-sm text-white mt-1">{selectedCampaign.high.toFixed(9)} SOL</div>
              {selectedCampaign.highUSD && (
                <div className="text-xs text-gray-400">${selectedCampaign.highUSD.toFixed(6)} USD</div>
              )}
            </div>
            
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="text-sm text-gray-400 mb-1">Lowest Drop</div>
              <div className="text-lg font-bold text-red-400">
                {selectedCampaign.lowestDropPercent.toFixed(2)}%
              </div>
              <div className="text-xs text-gray-500">Dip from start</div>
              <div className="text-sm text-white mt-1">{selectedCampaign.low.toFixed(9)} SOL</div>
              {selectedCampaign.lowUSD && (
                <div className="text-xs text-gray-400">${selectedCampaign.lowUSD.toFixed(6)} USD</div>
              )}
            </div>
          </motion.div>

          {/* GMGN Price Chart */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4"
          >
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-white">Price Chart</h4>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-400">Interval:</span>
                <select
                  value={chartInterval}
                  onChange={(e) => setChartInterval(e.target.value as '1' | '5')}
                  className="px-2 py-1 bg-gray-700 border border-gray-600 rounded text-xs text-white"
                >
                  <option value="1">1m</option>
                  <option value="5">5m</option>
                </select>
              </div>
            </div>
            <div className="relative w-full" style={{ height: '500px' }}>
              <iframe
                key={`${selectedCampaign.tokenMint}-${chartInterval}`}
                src={`https://www.gmgn.cc/kline/sol/${selectedCampaign.tokenMint}?interval=${chartInterval}&theme=dark`}
                className="w-full h-full rounded-lg"
                style={{ border: 'none' }}
                title="GMGN Price Chart"
                sandbox="allow-scripts allow-same-origin"
              />
            </div>
            <div className="text-xs text-gray-500 mt-2 flex items-center justify-between">
              <span>Powered by GMGN.ai</span>
              <a
                href={`https://gmgn.ai/sol/token/${selectedCampaign.tokenMint}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
              >
                View on GMGN <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </motion.div>

          {/* Additional Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 border border-gray-700 rounded-xl p-4"
          >
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <div className="text-gray-400">Start Price</div>
                <div className="text-white font-mono">{selectedCampaign.startPrice.toFixed(9)} SOL</div>
                {selectedCampaign.startPriceUSD && (
                  <div className="text-gray-500 text-xs">${selectedCampaign.startPriceUSD.toFixed(6)} USD</div>
                )}
                <div className="text-gray-500 text-xs">{formatTime(selectedCampaign.startTime)}</div>
              </div>
              <div>
                <div className="text-gray-400">Session High</div>
                <div className="text-green-400 font-mono">{selectedCampaign.high.toFixed(9)} SOL</div>
                {selectedCampaign.highUSD && (
                  <div className="text-gray-500 text-xs">${selectedCampaign.highUSD.toFixed(6)} USD</div>
                )}
              </div>
              <div>
                <div className="text-gray-400">Session Low</div>
                <div className="text-red-400 font-mono">{selectedCampaign.low.toFixed(9)} SOL</div>
                {selectedCampaign.lowUSD && (
                  <div className="text-gray-500 text-xs">${selectedCampaign.lowUSD.toFixed(6)} USD</div>
                )}
              </div>
              <div>
                <div className="text-gray-400">Last Update</div>
                <div className="text-white">{formatTime(selectedCampaign.lastUpdate)}</div>
              </div>
            </div>
          </motion.div>

          {/* Alerts */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gray-800 border border-gray-700 rounded-xl p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Bell className="w-5 h-5 text-yellow-400" />
                Campaign Alerts
              </h3>
              <button
                onClick={resetCampaign}
                className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-sm rounded-lg flex items-center gap-1 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Reset Baseline
              </button>
            </div>

            {/* Add Alert */}
            <div className="space-y-4 mb-6">
              <div className="flex gap-2 flex-wrap">
                <select
                  value={newAlertPriceType}
                  onChange={(e) => setNewAlertPriceType(e.target.value as 'percentage' | 'exact_sol' | 'exact_usd')}
                  className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  <option value="percentage">Percentage %</option>
                  <option value="exact_sol">Exact SOL Price</option>
                  <option value="exact_usd">Exact USD Price</option>
                </select>
                <select
                  value={newAlertDirection}
                  onChange={(e) => setNewAlertDirection(e.target.value as 'above' | 'below')}
                  className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  <option value="above">Above</option>
                  <option value="below">Below</option>
                </select>
                <input
                  type="number"
                  value={newAlertPercent}
                  onChange={(e) => setNewAlertPercent(e.target.value)}
                  placeholder={
                    newAlertPriceType === 'percentage' ? '% from baseline...' :
                    newAlertPriceType === 'exact_sol' ? 'SOL price...' :
                    'USD price...'
                  }
                  step={newAlertPriceType === 'percentage' ? '0.1' : '0.000001'}
                  className="flex-1 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                />
                <button
                  onClick={addAlert}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg flex items-center gap-2 transition-colors whitespace-nowrap"
                >
                  <Plus className="w-4 h-4" />
                  Add Alert
                </button>
              </div>

              {/* Alert Actions Config */}
              <AlertActionConfig
                actions={newAlertActions}
                onChange={setNewAlertActions}
              />
            </div>

            {/* Alert List */}
            <div className="space-y-2">
              <AnimatePresence>
                {alerts.map((alert) => (
                  <motion.div
                    key={alert.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      alert.hit
                        ? 'bg-green-900/20 border-green-600'
                        : 'bg-gray-900 border-gray-700'
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1">
                      {alert.hit ? (
                        <Bell className="w-5 h-5 text-green-400" />
                      ) : alert.direction === 'above' ? (
                        <TrendingUp className="w-5 h-5 text-green-400" />
                      ) : (
                        <TrendingDown className="w-5 h-5 text-red-400" />
                      )}
                      <div className="flex-1">
                        <div className="font-medium text-white">
                          {alert.priceType === 'percentage' ? (
                            `${alert.direction === 'above' ? '+' : ''}${alert.targetPercent.toFixed(2)}%`
                          ) : alert.priceType === 'exact_sol' ? (
                            `${alert.direction === 'above' ? 'Above' : 'Below'} ${alert.targetPercent.toFixed(9)} SOL`
                          ) : (
                            `${alert.direction === 'above' ? 'Above' : 'Below'} $${alert.targetPercent.toFixed(8)} USD`
                          )}
                        </div>
                        {alert.priceType === 'percentage' && (
                          <div className="text-sm text-gray-400">
                            Target: {alert.targetPrice.toFixed(9)} SOL
                          </div>
                        )}
                        {/* Show actions for this alert */}
                        {alert.actions && alert.actions.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {alert.actions.map((action, idx) => (
                              <span key={idx} className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs font-mono">
                                {action.type === 'buy' ? `Buy ${action.amount} SOL (${action.slippage}% slip)` :
                                 action.type === 'sell' ? `Sell ${action.amount}% (${action.slippage}% slip)` :
                                 action.type === 'telegram' ? '📤 Telegram' :
                                 action.type === 'discord' ? '🔔 Discord' :
                                 '🔔 Notification'}
                              </span>
                            ))}
                          </div>
                        )}
                        {alert.hit && alert.hitAt && (
                          <div className="text-xs text-green-400 mt-1">
                            Hit at {new Date(alert.hitAt).toLocaleString('en-US', { 
                              month: 'short', 
                              day: 'numeric', 
                              hour: '2-digit', 
                              minute: '2-digit', 
                              second: '2-digit' 
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {alert.hit && (
                        <span className="px-2 py-1 bg-green-600 text-white text-xs rounded whitespace-nowrap">
                          HIT ✓
                        </span>
                      )}
                      {!alert.hit && (
                        <button
                          onClick={() => startEditingAlert(alert)}
                          className="p-1 hover:bg-cyan-900/30 rounded transition-colors group"
                          title="Edit actions"
                        >
                          <Edit className="w-4 h-4 text-gray-400 group-hover:text-cyan-400" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteAlert(alert.id)}
                        className="p-1 hover:bg-red-900/30 rounded transition-colors group"
                        title="Delete alert"
                      >
                        <X className="w-4 h-4 text-gray-400 group-hover:text-red-400" />
                      </button>
                    </div>
                    {/* Edit Mode */}
                    {editingAlertId === alert.id && (
                      <div className="mt-3 p-3 bg-gray-800 border border-cyan-500/30 rounded-lg">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="text-sm font-medium text-white">Edit Actions</h4>
                          <div className="flex gap-2">
                            <button
                              onClick={() => saveEditedActions(alert.id)}
                              className="px-3 py-1 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors"
                            >
                              Save
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-3 py-1 bg-gray-700 hover:bg-gray-600 text-white text-sm rounded transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                        <AlertActionConfig
                          actions={editAlertActions}
                          onChange={setEditAlertActions}
                        />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
              
              {alerts.length === 0 && (
                <div className="text-center py-8 text-gray-500">
                  No alerts set. Add percentage-based alerts above.
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}

      {/* Info */}
      {campaigns.length === 0 && (
        <div className="bg-blue-900/20 border border-blue-600 rounded-xl p-4 text-sm text-blue-300">
          <strong>Real-time On-Chain Monitoring:</strong> Enter a token mint and its Raydium/Orca pool address.
          The system subscribes to pool account changes via Solana WebSocket for true real-time price updates.
          Run multiple campaigns simultaneously, each with independent alerts. Perfect for testing strategies
          across multiple tokens without any trading.
        </div>
      )}
        </>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4">Update History</h3>
          {history.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No updates yet. Start a campaign to see real-time price updates logged here.
            </div>
          ) : (
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {history.map((entry, index) => (
                <div
                  key={`${entry.timestamp}-${index}`}
                  className="bg-gray-900 border border-gray-700 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    {entry.tokenLogo && (
                      <img src={entry.tokenLogo} alt={entry.tokenSymbol || 'Token'} className="w-8 h-8 rounded-full flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-gray-500 font-mono">{entry.timestamp}</span>
                        {entry.type === 'alert' && (
                          <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs">ALERT</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mb-1">
                        <div className="font-semibold text-white text-sm">
                          {entry.tokenSymbol || entry.tokenMint.slice(0, 8)}
                        </div>
                        <button
                          onClick={() => copyAddress(entry.tokenMint)}
                          className="p-0.5 hover:bg-gray-700 rounded transition-colors"
                          title="Copy address"
                        >
                          {copiedAddress === entry.tokenMint ? (
                            <Check className="w-3 h-3 text-green-400" />
                          ) : (
                            <Copy className="w-3 h-3 text-gray-400" />
                          )}
                        </button>
                        <a
                          href={`https://solscan.io/token/${entry.tokenMint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-0.5 hover:bg-purple-600/20 rounded transition-colors"
                          title="View on Solscan"
                        >
                          <ExternalLink className="w-3 h-3 text-purple-400" />
                        </a>
                        <a
                          href={`https://gmgn.ai/sol/token/${entry.tokenMint}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-0.5 hover:bg-green-600/20 rounded transition-colors"
                          title="View on GMGN"
                        >
                          <ExternalLink className="w-3 h-3 text-green-400" />
                        </a>
                      </div>
                      {entry.tokenName && (
                        <div className="text-xs text-gray-500 truncate mb-1">{entry.tokenName}</div>
                      )}
                      <div className="flex items-center gap-4 text-sm flex-wrap">
                        <div>
                          <span className="text-white font-mono">{entry.priceSOL.toFixed(9)} SOL</span>
                          {entry.priceUSD && (
                            <div className="text-xs text-gray-400">${entry.priceUSD.toFixed(8)} USD</div>
                          )}
                        </div>
                        <span className={`font-bold ${entry.changePercent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {entry.changePercent >= 0 ? '+' : ''}{entry.changePercent.toFixed(2)}%
                        </span>
                        <div className="text-xs text-gray-500">
                          <div>High: {entry.high.toFixed(9)} SOL</div>
                          {entry.highUSD && (
                            <div className="text-gray-600">${entry.highUSD.toFixed(6)} USD</div>
                          )}
                        </div>
                        <div className="text-xs text-gray-500">
                          <div>Low: {entry.low.toFixed(9)} SOL</div>
                          {entry.lowUSD && (
                            <div className="text-gray-600">${entry.lowUSD.toFixed(6)} USD</div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Triggers Tab */}
      {activeTab === 'triggers' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6"
        >
          <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
            <Bell className="w-5 h-5 text-yellow-400" />
            Alert Trigger History
          </h3>
          {triggerHistory.length === 0 ? (
            <div className="text-center text-gray-400 py-8">
              No alerts triggered yet. Set up alerts in your campaigns to see triggered events here.
            </div>
          ) : (
            <div className="space-y-3 max-h-[600px] overflow-y-auto">
              {triggerHistory.map((trigger) => (
                <div
                  key={trigger.id}
                  className="bg-gray-900 border border-yellow-500/30 rounded-lg p-4"
                >
                  <div className="flex items-start gap-3">
                    {trigger.tokenLogo && (
                      <img src={trigger.tokenLogo} alt={trigger.tokenSymbol || 'Token'} className="w-10 h-10 rounded-full flex-shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      {/* Header with token and timestamp */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white">
                            {trigger.tokenSymbol || trigger.tokenMint.slice(0, 8)}
                          </span>
                          <button
                            onClick={() => copyAddress(trigger.tokenMint)}
                            className="p-0.5 hover:bg-gray-700 rounded transition-colors"
                          >
                            {copiedAddress === trigger.tokenMint ? (
                              <Check className="w-3 h-3 text-green-400" />
                            ) : (
                              <Copy className="w-3 h-3 text-gray-400" />
                            )}
                          </button>
                          <a
                            href={`https://gmgn.ai/sol/token/${trigger.tokenMint}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-0.5 hover:bg-green-600/20 rounded transition-colors"
                          >
                            <ExternalLink className="w-3 h-3 text-green-400" />
                          </a>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(trigger.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {/* Alert Details */}
                      <div className="bg-gray-800 border border-gray-700 rounded-lg p-3 mb-3">
                        <div className="flex items-center gap-2 mb-2">
                          {trigger.direction === 'above' ? (
                            <TrendingUp className="w-4 h-4 text-green-400" />
                          ) : (
                            <TrendingDown className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-sm font-medium text-gray-300">
                            {trigger.alertType === 'percentage' ? (
                              `${trigger.direction === 'above' ? '+' : ''}${trigger.targetValue.toFixed(2)}% Alert`
                            ) : trigger.alertType === 'exact_sol' ? (
                              `${trigger.direction === 'above' ? 'Above' : 'Below'} ${trigger.targetValue.toFixed(9)} SOL`
                            ) : (
                              `${trigger.direction === 'above' ? 'Above' : 'Below'} $${trigger.targetValue.toFixed(8)} USD`
                            )}
                          </span>
                        </div>
                        <div className="text-sm text-gray-400">
                          <div>Triggered at: <span className="text-cyan-400 font-mono">{trigger.triggeredAt.toFixed(9)} SOL</span></div>
                          {trigger.triggeredAtUSD && (
                            <div>USD Price: <span className="text-green-400 font-mono">${trigger.triggeredAtUSD.toFixed(8)}</span></div>
                          )}
                        </div>
                      </div>

                      {/* Actions Executed */}
                      <div className="space-y-2">
                        <div className="text-sm font-medium text-gray-300">Actions Executed:</div>
                        {trigger.actions.map((action, idx) => (
                          <div
                            key={idx}
                            className={`flex items-center justify-between p-2 rounded-lg ${
                              action.status === 'success' ? 'bg-green-500/10 border border-green-500/30' :
                              action.status === 'failed' ? 'bg-red-500/10 border border-red-500/30' :
                              'bg-yellow-500/10 border border-yellow-500/30'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                action.status === 'success' ? 'bg-green-400' :
                                action.status === 'failed' ? 'bg-red-400' :
                                'bg-yellow-400'
                              }`} />
                              <span className="text-sm text-white capitalize">{action.type.replace('_', ' ')}</span>
                              {action.details && (
                                <span className="text-xs text-gray-400">- {action.details}</span>
                              )}
                            </div>
                            <span className={`text-xs font-medium ${
                              action.status === 'success' ? 'text-green-400' :
                              action.status === 'failed' ? 'text-red-400' :
                              'text-yellow-400'
                            }`}>
                              {action.status.toUpperCase()}
                            </span>
                          </div>
                        ))}
                        {trigger.actions.some(a => a.error) && (
                          <div className="text-xs text-red-400 mt-2">
                            {trigger.actions.find(a => a.error)?.error}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>
      )}

      {/* Pool Selection Modal */}
      <PoolSelectionModal
        isOpen={showPoolModal}
        onClose={() => setShowPoolModal(false)}
        tokenMint={tokenMint}
        onSelectPool={(poolAddr) => {
          setPoolAddress(poolAddr);
          toast.success('Pool selected!');
        }}
      />
    </div>
  );
};
