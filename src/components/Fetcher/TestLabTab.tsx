import React, { useState, useEffect, useRef } from 'react';
import { TrendingUp, TrendingDown, Bell, Plus, X, RefreshCw, Play, Zap, Copy, ExternalLink, Check, Edit } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { config } from '../../config';
import { toast } from 'react-hot-toast';
import { useTradingStore } from '../../stores/tradingStore';
import { PoolSelectionModal } from './PoolSelectionModal';
import { AlertActionConfig, AlertAction } from './AlertActionConfig';
import { OnchainOHLCVChart } from '../charts/OnchainOHLCVChart';

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

interface TokenSummary {
  tokenMint: string;
  tokenSymbol?: string;
  status: 'open' | 'closed';
  balance: number;
  avgEntryPrice: number;
  currentPrice?: number;
  invested: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalPnl: number;
  roi: number;
  totalTrades: number;
  buys: number;
  sells: number;
  duration: number;
}

interface CampaignSummary {
  monitorId: string;
  userId: number;
  generatedAt: number;
  overview: {
    totalPositions: number;
    closedPositions: number;
    openPositions: number;
    totalTrades: number;
    totalInvested: number;
    totalRealizedPnl: number;
    totalUnrealizedPnl: number;
    totalPnl: number;
    overallRoi: number;
    winRate: number;
    winningPositions: number;
    losingPositions: number;
  };
  bestPerformer: TokenSummary | null;
  worstPerformer: TokenSummary | null;
  tokens: TokenSummary[];
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
  const [campaignSource, setCampaignSource] = useState<'manual' | 'telegram' | 'gmgn-test' | 'telegram-autotrader' | 'pumpfun-sniper' | 'smart-money' | 'onchain-ohlcv'>('manual');
  const [telegramAccountId, setTelegramAccountId] = useState<number | null>(null);
  const [telegramChatId, setTelegramChatId] = useState<string>('');
  const [telegramSelectedUserIds, setTelegramSelectedUserIds] = useState<string[]>([]);
  const [telegramAccounts, setTelegramAccounts] = useState<any[]>([]);
  const [telegramChats, setTelegramChats] = useState<any[]>([]);
  const [telegramUsers, setTelegramUsers] = useState<any[]>([]);
  const [telegramUserSearch, setTelegramUserSearch] = useState<string>('');
  const [telegramAlerts, setTelegramAlerts] = useState<Alert[]>([]);
  const [telegramMonitorAllUsers, setTelegramMonitorAllUsers] = useState<boolean>(false);
  const [telegramExcludeBots, setTelegramExcludeBots] = useState<boolean>(true);
  const [telegramExcludeNoUsername, setTelegramExcludeNoUsername] = useState<boolean>(false);
  const [telegramInitialAction, setTelegramInitialAction] = useState<'monitor_only' | 'buy_and_monitor'>('monitor_only');
  const [telegramBuyAmountSol, setTelegramBuyAmountSol] = useState<number>(0.1);
  const [telegramWalletId, setTelegramWalletId] = useState<number | null>(null);
  const [telegramOnlyBuyNew, setTelegramOnlyBuyNew] = useState<boolean>(true);
  const [activeTelegramMonitors, setActiveTelegramMonitors] = useState<any[]>([]);
  
  // Telegram AutoTrader specific states
  const [autoTraderEnabled, setAutoTraderEnabled] = useState(false);
  const [telegramAction, setTelegramAction] = useState<'monitor' | 'buy_monitor'>('monitor');
  const [buyAmount, setBuyAmount] = useState('0.1');
  const [buyTiming, setBuyTiming] = useState<'instant' | 'wait_dip' | 'wait_pump'>('instant');
  const [priceChangeThreshold, setPriceChangeThreshold] = useState('5');
  const [takeProfit, setTakeProfit] = useState('20');
  const [stopLoss, setStopLoss] = useState('-10');
  const [activeTelegramPositions, setActiveTelegramPositions] = useState<any[]>([]);
  
  // Pumpfun Sniper states
  const [pumpfunSnipeMode, setPumpfunSnipeMode] = useState<'single' | 'all'>('single');
  const [pumpfunBuyAmount, setPumpfunBuyAmount] = useState('0.1');
  const [pumpfunStopLoss, setPumpfunStopLoss] = useState('-10');
  const [pumpfunTakeProfits, setPumpfunTakeProfits] = useState<string[]>(['20', '50', '100']);
  const [pumpfunTPAmounts, setPumpfunTPAmounts] = useState<string[]>(['33', '33', '34']); // Split equally by default
  const [pumpfunSlippagePercent, setPumpfunSlippagePercent] = useState('5');
  const [pumpfunPriority, setPumpfunPriority] = useState<'low' | 'medium' | 'high' | 'ultra' | 'custom'>('high');
  const [pumpfunCustomPriority, setPumpfunCustomPriority] = useState('0.002');
  const [pumpfunSkipPlatformFee, setPumpfunSkipPlatformFee] = useState(false);
  const [pumpfunMaxSnipes, setPumpfunMaxSnipes] = useState('10');
  const [pumpfunExcludeGraduated, setPumpfunExcludeGraduated] = useState(true);
  const [pumpfunMinLiquidity, setPumpfunMinLiquidity] = useState('');
  const [pumpfunMaxLiquidity, setPumpfunMaxLiquidity] = useState('');
  const [pumpfunSniperActive, setPumpfunSniperActive] = useState(false);
  const [pumpfunSnipedTokens, setPumpfunSnipedTokens] = useState<string[]>([]);
  const [selectedPumpfunWallet, setSelectedPumpfunWallet] = useState<number | null>(null);
  
  // Smart Money Tracker states
  const [smartMoneyActive, setSmartMoneyActive] = useState(false);
  const [smartMoneyPositions, setSmartMoneyPositions] = useState<any[]>([]);
  const [smartMoneyWalletLeaderboard, setSmartMoneyWalletLeaderboard] = useState<any[]>([]);
  const [smartMoneyTokenLeaderboard, setSmartMoneyTokenLeaderboard] = useState<any[]>([]);
  const [smartMoneyStats, setSmartMoneyStats] = useState<any>(null);
  const [smartMoneyTab, setSmartMoneyTab] = useState<'positions' | 'wallets' | 'tokens'>('positions');
  const [smartMoneyConfig, setSmartMoneyConfig] = useState({
    minTokenThreshold: 5000000,
    priceUpdateIntervalMs: 1500,
    minMarketCapUsd: 0,
    maxMarketCapUsd: 0 // 0 = no limit
  });

  // Onchain OHLCV Builder states
  const [ohlcvCandles, setOhlcvCandles] = useState<any[]>([]);
  const [ohlcvMetadata, setOhlcvMetadata] = useState<any>(null);
  const [ohlcvLoading, setOhlcvLoading] = useState(false);
  const [ohlcvTimeframe, setOhlcvTimeframe] = useState<number>(5);
  const [ohlcvLookback, setOhlcvLookback] = useState<string>('24h');
  
  // Use existing trading store for wallets 
  const { wallets: tradingWallets, fetchWallets } = useTradingStore();
  const [gmgnIndicators, setGmgnIndicators] = useState<{ [key: string]: number | null }>({
    PRICE: null,
    RSI: null,
    EMA_9: null,
    EMA_20: null
  });
  const [gmgnScreenshot, setGmgnScreenshot] = useState<string | null>(null);
  const [gmgnDebugMode, setGmgnDebugMode] = useState(false);
  const [campaignSummary, setCampaignSummary] = useState<CampaignSummary | null>(null);
  const [showSummaryModal, setShowSummaryModal] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Copy address to clipboard
  const copyAddress = async (address: string) => {
    await navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    toast.success('Address copied!');
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Fetch Smart Money Tracker data
  const fetchSmartMoneyData = async () => {
    try {
      const [positionsRes, leaderboardsRes, statusRes] = await Promise.all([
        fetch(`${config.apiUrl}/api/smart-money-tracker/positions`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/smart-money-tracker/leaderboards`, { credentials: 'include' }),
        fetch(`${config.apiUrl}/api/smart-money-tracker/status`, { credentials: 'include' })
      ]);

      if (positionsRes.ok) {
        const data = await positionsRes.json();
        setSmartMoneyPositions(data.positions || []);
      }

      if (leaderboardsRes.ok) {
        const data = await leaderboardsRes.json();
        setSmartMoneyWalletLeaderboard(data.wallets || []);
        setSmartMoneyTokenLeaderboard(data.tokens || []);
      }

      if (statusRes.ok) {
        const data = await statusRes.json();
        setSmartMoneyStats(data);
      }
    } catch (error) {
      console.error('Failed to fetch smart money data:', error);
    }
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

  // Fetch trading wallets for buy_and_monitor option
  useEffect(() => {
    fetchWallets();
    // Auto-select default wallet
    const defaultWallet = tradingWallets.find((w: any) => w.isDefault);
    if (defaultWallet) setTelegramWalletId(parseInt(defaultWallet.id));
  }, [fetchWallets]);

  // Poll Smart Money data when active
  useEffect(() => {
    if (smartMoneyActive) {
      // Fetch immediately
      fetchSmartMoneyData();
      
      // Poll every 3 seconds
      const interval = setInterval(fetchSmartMoneyData, 3000);
      return () => clearInterval(interval);
    }
  }, [smartMoneyActive]);

  // Initialize Smart Money state from backend + localStorage on mount
  useEffect(() => {
    const initializeSmartMoney = async () => {
      try {
        // Check backend status
        const statusRes = await fetch(`${config.apiUrl}/api/smart-money-tracker/status`, { credentials: 'include' });
        if (statusRes.ok) {
          const data = await statusRes.json();
          const isRunning = data.isRunning || false;
          
          // Restore state from localStorage or backend
          const savedState = localStorage.getItem('smartMoneyActive');
          const wasActiveLastSession = savedState === 'true';
          
          if (isRunning) {
            // Backend is running - sync frontend state
            setSmartMoneyActive(true);
            localStorage.setItem('smartMoneyActive', 'true');
            // Fetch existing data immediately
            fetchSmartMoneyData();
            console.log('✅ Smart Money Tracker restored - backend is running');
          } else if (wasActiveLastSession && !isRunning) {
            // Was active but backend stopped - clear state
            setSmartMoneyActive(false);
            localStorage.removeItem('smartMoneyActive');
            console.log('⚠️ Smart Money Tracker was active but backend stopped');
          }
        }
      } catch (error) {
        console.error('Failed to initialize Smart Money state:', error);
      }
    };
    initializeSmartMoney();
  }, []); // Run once on mount

  // Persist smartMoneyActive to localStorage
  useEffect(() => {
    if (smartMoneyActive) {
      localStorage.setItem('smartMoneyActive', 'true');
    } else {
      localStorage.removeItem('smartMoneyActive');
    }
  }, [smartMoneyActive]);

  // Fetch Smart Money config when campaign source is selected
  useEffect(() => {
    if (campaignSource === 'smart-money') {
      fetch(`${config.apiUrl}/api/smart-money-tracker/config`, {
        credentials: 'include'
      })
        .then(res => res.json())
        .then(data => {
          if (data.minTokenThreshold !== undefined) {
            setSmartMoneyConfig(data);
          }
        })
        .catch(console.error);
    }
  }, [campaignSource]);

  // Fetch active Telegram monitors
  const fetchActiveTelegramMonitors = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/telegram-monitors`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setActiveTelegramMonitors(data.monitors || []);
      }
    } catch (error) {
      console.error('Failed to fetch active monitors:', error);
    }
  };

  // Fetch monitors on mount and when campaign source changes to telegram
  useEffect(() => {
    if (campaignSource === 'telegram') {
      fetchActiveTelegramMonitors();
    }
  }, [campaignSource]);

  // Fetch active Telegram AutoTrader positions
  useEffect(() => {
    if (campaignSource === 'telegram-autotrader') {
      const fetchPositions = async () => {
        try {
          const response = await fetch(`${config.apiUrl}/api/test-lab/telegram-autotrader/positions`, {
            credentials: 'include'
          });
          if (response.ok) {
            const data = await response.json();
            setActiveTelegramPositions(data.positions || []);
          }
        } catch (error) {
          console.error('Failed to fetch positions:', error);
        }
      };
      fetchPositions();
    }
  }, [campaignSource]);

  // Fetch chats when account is selected
  useEffect(() => {
    if (!telegramAccountId) {
      setTelegramChats([]);
      setTelegramUsers([]);
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

  // Fetch users when chat is selected
  useEffect(() => {
    if (!telegramChatId || !telegramAccountId) {
      setTelegramUsers([]);
      return;
    }

    const fetchUsers = async () => {
      try {
        const response = await fetch(`${config.apiUrl}/api/telegram/chat-users?accountId=${telegramAccountId}&chatId=${telegramChatId}`, {
          credentials: 'include'
        });
        if (response.ok) {
          const data = await response.json();
          setTelegramUsers(data.users || []);
        }
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };
    fetchUsers();
  }, [telegramChatId, telegramAccountId]);

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

        // Handle new campaign created from Telegram
        if (message.type === 'test_lab_campaign_created') {
          const data = message.data;
          console.log(`🚀 [${timestamp}] New campaign auto-created from Telegram:`, data);
          
          // Automatically fetch campaigns to show the new one
          fetchCampaigns();
          
          // Show notification
          toast.success(
            <div className="flex flex-col gap-2">
              <div className="font-bold text-base">🎯 New Campaign Created!</div>
              <div className="text-sm">
                Token detected from <span className="font-medium">Telegram</span>
              </div>
              <div className="text-xs text-gray-400">
                {data.tokenMint?.slice(0, 8)}...
              </div>
            </div>,
            { duration: 5000 }
          );
          
          // Also refresh active monitors to update campaign count
          if (campaignSource === 'telegram') {
            fetchActiveTelegramMonitors();
          }
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

        // Handle campaign summary on stop
        if (message.type === 'test_lab_campaign_summary') {
          const data = message.data as any;
          console.log(`🏆 Campaign Summary received:`, data);
          
          // Handle empty campaign (no positions)
          if (data && data.totalPositions === 0 && data.message) {
            toast(`Monitor stopped: ${data.message}`, { icon: 'ℹ️' });
            return;
          }
          
          // Validate data structure for campaigns with positions
          if (!data || !data.overview) {
            console.error('❌ Invalid summary data:', data);
            toast.error('Failed to load campaign summary');
            return;
          }
          
          // Show summary modal
          setCampaignSummary(data);
          setShowSummaryModal(true);
          
          // Also show toast
          const { totalPnl, overallRoi } = data.overview;
          const pnlColor = totalPnl >= 0 ? 'success' : 'error';
          toast[pnlColor](
            `Campaign ended! P/L: ${totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(4)} SOL (${overallRoi >= 0 ? '+' : ''}${overallRoi.toFixed(2)}%)`,
            { duration: 5000 }
          );
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
      // Use different endpoint for telegram-autotrader (persistent DB tracking)
      const endpoint = campaignSource === 'telegram-autotrader' 
        ? '/api/test-lab/telegram-autotrader/start'
        : '/api/test-lab/campaign/start';
        
      const response = await fetch(`${config.apiUrl}${endpoint}`, {
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
    if (!telegramAccountId || !telegramChatId) {
      toast.error('Please select account and chat');
      return;
    }

    if (!telegramMonitorAllUsers && telegramSelectedUserIds.length === 0) {
      toast.error('Please select at least one user or enable "Monitor All Users"');
      return;
    }

    console.log('Starting monitor with:', {
      telegramAccountId,
      telegramChatId,
      monitorAllUsers: telegramMonitorAllUsers,
      selectedUserIds: telegramSelectedUserIds
    });

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/telegram-monitor/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          telegramAccountId,
          chatId: telegramChatId,
          monitorAllUsers: telegramMonitorAllUsers,
          selectedUserIds: telegramSelectedUserIds,
          excludeBots: telegramExcludeBots,
          excludeNoUsername: telegramExcludeNoUsername,
          initialAction: telegramInitialAction,
          buyAmountSol: telegramBuyAmountSol,
          walletId: telegramWalletId,
          onlyBuyNew: telegramOnlyBuyNew,
          alerts: telegramAlerts
        })
      });

      console.log('Response status:', response.status, response.ok);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Response error:', errorText);
        toast.error(`Server error: ${response.status} - ${errorText.substring(0, 100)}`);
        return;
      }

      const data = await response.json();
      console.log('Response data:', data);
      
      if (data.success) {
        const message = telegramMonitorAllUsers 
          ? 'Now monitoring all users in chat!'
          : `Now monitoring ${telegramSelectedUserIds.length} user(s)!`;
        
        toast.success(message);
        
        // Refresh campaigns list to show any auto-created campaigns
        fetchCampaigns();
        fetchActiveTelegramMonitors();
        
        // Show that monitoring is active
        toast.success('Monitor active! Campaigns will appear here when contracts are detected.');
      } else {
        toast.error(data.error || 'Failed to start monitoring');
      }
    } catch (error: any) {
      console.error('Failed to start monitoring:', error);
      toast.error(`Failed to start monitoring: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Save Telegram AutoTrader configuration
  const saveTelegramAutoTraderConfig = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/test-lab/telegram-autotrader/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          enabled: autoTraderEnabled,
          action: telegramAction,
          buyAmount: parseFloat(buyAmount),
          buyTiming,
          priceChangeThreshold: buyTiming !== 'instant' ? parseFloat(priceChangeThreshold) : null,
          takeProfit: telegramAction === 'buy_monitor' ? parseFloat(takeProfit) : null,
          stopLoss: telegramAction === 'buy_monitor' ? parseFloat(stopLoss) : null
        })
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Telegram AutoTrader configuration saved!');
        
        // If enabled, start listening for Telegram contract addresses
        if (autoTraderEnabled) {
          toast.success('AutoTrader is now active and waiting for contracts from Telegram');
        }
      } else {
        toast.error(data.error || 'Failed to save configuration');
      }
    } catch (error: any) {
      console.error('Failed to save configuration:', error);
      toast.error('Failed to save configuration');
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
          <div className="grid grid-cols-3 gap-3">
            <button
              onClick={() => setCampaignSource('manual')}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
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
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
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
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'gmgn-test'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">GMGN Scraper</div>
              <div className="text-xs mt-1">Test indicator extraction</div>
            </button>
            <button
              onClick={() => setCampaignSource('telegram-autotrader')}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'telegram-autotrader'
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">Telegram AutoTrader</div>
              <div className="text-xs mt-1">Persistent position tracking</div>
            </button>
            <button
              onClick={() => setCampaignSource('pumpfun-sniper')}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'pumpfun-sniper'
                  ? 'bg-purple-500/20 border-purple-500 text-purple-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">🎯 Pumpfun Sniper</div>
              <div className="text-xs mt-1">Auto-snipe new launches</div>
            </button>
            <button
              onClick={() => setCampaignSource('smart-money')}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'smart-money'
                  ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">💎 Smart Money Tracker</div>
              <div className="text-xs mt-1">Track large Pumpfun buys</div>
            </button>
            <button
              onClick={() => setCampaignSource('onchain-ohlcv')}
              className={`px-4 py-3 rounded-lg border-2 transition-all ${
                campaignSource === 'onchain-ohlcv'
                  ? 'bg-orange-500/20 border-orange-500 text-orange-400'
                  : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
              }`}
            >
              <div className="font-medium">📊 Onchain OHLCV Builder</div>
              <div className="text-xs mt-1">Build candlesticks from TX data</div>
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

          </div>

          {/* User Search & Selection */}
          {telegramChatId && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <label className="block text-sm text-gray-400">Users to Monitor</label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={telegramMonitorAllUsers}
                    onChange={(e) => {
                      setTelegramMonitorAllUsers(e.target.checked);
                      if (e.target.checked) setTelegramSelectedUserIds([]);
                    }}
                    className="w-4 h-4 bg-gray-800 border-gray-600 rounded"
                  />
                  <span className="text-cyan-400">Monitor All Users</span>
                </label>
              </div>

              {!telegramMonitorAllUsers && (
                <>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={telegramExcludeBots}
                        onChange={(e) => setTelegramExcludeBots(e.target.checked)}
                        className="w-4 h-4 bg-gray-800 border-gray-600 rounded"
                      />
                      Exclude Bots
                    </label>
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                      <input
                        type="checkbox"
                        checked={telegramExcludeNoUsername}
                        onChange={(e) => setTelegramExcludeNoUsername(e.target.checked)}
                        className="w-4 h-4 bg-gray-800 border-gray-600 rounded"
                      />
                      Exclude No Username
                    </label>
                  </div>

                  <input
                    type="text"
                    value={telegramUserSearch}
                    onChange={(e) => setTelegramUserSearch(e.target.value)}
                    placeholder="Search users..."
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white text-sm"
                  />

                  <div className="bg-gray-900 border border-gray-700 rounded-lg max-h-64 overflow-y-auto">
                    {telegramUsers
                      .filter(user => {
                        // Apply filters
                        if (telegramExcludeBots && user.is_bot) return false;
                        if (telegramExcludeNoUsername && !user.username) return false;
                        // Apply search
                        if (telegramUserSearch && 
                            !user.username?.toLowerCase().includes(telegramUserSearch.toLowerCase()) &&
                            !user.first_name?.toLowerCase().includes(telegramUserSearch.toLowerCase()) &&
                            !user.id?.toString().includes(telegramUserSearch)
                        ) return false;
                        return true;
                      })
                      .map((user) => {
                        const isSelected = telegramSelectedUserIds.includes(user.id);
                        return (
                          <button
                            key={user.id}
                            onClick={() => {
                              setTelegramSelectedUserIds(prev => 
                                isSelected 
                                  ? prev.filter(id => id !== user.id)
                                  : [...prev, user.id]
                              );
                            }}
                            className={`w-full px-4 py-3 text-left border-b border-gray-800 hover:bg-gray-800 transition-colors flex items-center gap-2 ${
                              isSelected ? 'bg-cyan-500/20 border-cyan-500' : ''
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => {}}
                              className="w-4 h-4 bg-gray-800 border-gray-600 rounded"
                            />
                            <div className="flex-1">
                              <div className="font-medium text-white flex items-center gap-2">
                                {user.first_name || 'Unknown'} {user.last_name || ''}
                                {user.is_bot && <span className="text-xs px-2 py-0.5 bg-purple-500/20 text-purple-400 rounded">BOT</span>}
                              </div>
                              {user.username ? (
                                <div className="text-sm text-gray-400">@{user.username}</div>
                              ) : (
                                <div className="text-sm text-gray-500 italic">No username</div>
                              )}
                              <div className="text-xs text-gray-500">ID: {user.id}</div>
                            </div>
                          </button>
                        );
                      })}
                    {telegramUsers.length === 0 && (
                      <div className="p-4 text-center text-gray-500">No users found</div>
                    )}
                  </div>

                  {telegramSelectedUserIds.length > 0 && (
                    <div className="text-sm text-cyan-400">
                      {telegramSelectedUserIds.length} user(s) selected
                    </div>
                  )}
                </>
              )}

              {telegramMonitorAllUsers && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/30 rounded-lg text-sm text-cyan-300">
                  ✓ Monitoring all users in chat (filters still apply)
                </div>
              )}
            </div>
          )}

          {/* Initial Action & Buy Configuration */}
          {(telegramMonitorAllUsers || telegramSelectedUserIds.length > 0) && (
            <div className="space-y-4 p-4 bg-gray-900 border border-gray-700 rounded-lg">
              <h3 className="text-lg font-semibold text-white">Action on Detection</h3>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">When contract is detected:</label>
                <select
                  value={telegramInitialAction}
                  onChange={(e) => setTelegramInitialAction(e.target.value as 'monitor_only' | 'buy_and_monitor')}
                  className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                >
                  <option value="monitor_only">Monitor Only (Just track price)</option>
                  <option value="buy_and_monitor">Buy & Monitor (Execute buy, then track position + price)</option>
                </select>
              </div>

              {telegramInitialAction === 'buy_and_monitor' && (
                <>
                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Trading Wallet</label>
                    <select
                      value={telegramWalletId || ''}
                      onChange={(e) => setTelegramWalletId(parseInt(e.target.value))}
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                    >
                      <option value="">Select wallet...</option>
                      {tradingWallets.map((wallet) => (
                        <option key={wallet.id} value={wallet.id}>
                          {wallet.name || (wallet.publicKey ? wallet.publicKey.substring(0, 8) + '...' : 'Wallet')} 
                          {wallet.isDefault && ' (Default)'}
                          {' - '}
                          {wallet.balance?.toFixed(4) || '0.0000'} SOL
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2">Buy Amount (SOL)</label>
                    <input
                      type="number"
                      value={telegramBuyAmountSol}
                      onChange={(e) => setTelegramBuyAmountSol(parseFloat(e.target.value))}
                      min="0.001"
                      step="0.01"
                      className="w-full px-4 py-2 bg-gray-800 border border-gray-600 rounded-lg text-white"
                      placeholder="0.1"
                    />
                    <p className="text-xs text-gray-500 mt-1">Amount of SOL to spend on initial buy</p>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={telegramOnlyBuyNew}
                        onChange={(e) => setTelegramOnlyBuyNew(e.target.checked)}
                        className="w-4 h-4 bg-gray-800 border-gray-600 rounded"
                      />
                      <span className="text-gray-300">Only buy NEW tokens (skip if already in token_registry)</span>
                    </label>
                    <p className="text-xs text-gray-500 mt-1 ml-6">
                      When enabled, will skip buy if token already exists in your system
                    </p>
                  </div>

                  <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-300">
                      💰 When a contract is detected, we'll automatically execute a buy order and then monitor both price alerts AND your position value.
                    </p>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Alert Configuration */}
          {(telegramMonitorAllUsers || telegramSelectedUserIds.length > 0) && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold text-white">Configure Alerts</h3>
                <span className="text-sm text-gray-400">{telegramAlerts.length} alert(s)</span>
              </div>
              
              {/* Add Alert Section */}
              <div className="p-4 bg-gray-900 border border-gray-700 rounded-lg space-y-4">
                <h4 className="text-sm font-medium text-gray-300">Add New Alert</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Price Type</label>
                    <select
                      value={newAlertPriceType}
                      onChange={(e) => setNewAlertPriceType(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    >
                      <option value="percentage">Percentage Change</option>
                      <option value="exact_sol">Exact Price (SOL)</option>
                      <option value="exact_usd">Exact Price (USD)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Direction</label>
                    <select
                      value={newAlertDirection}
                      onChange={(e) => setNewAlertDirection(e.target.value as any)}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    >
                      <option value="above">Above</option>
                      <option value="below">Below</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Value</label>
                    <input
                      type="number"
                      value={newAlertPercent}
                      onChange={(e) => setNewAlertPercent(e.target.value)}
                      placeholder={newAlertPriceType === 'percentage' ? '50' : '0.001'}
                      className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white text-sm"
                    />
                  </div>
                </div>

                {/* Alert Actions */}
                <AlertActionConfig
                  actions={newAlertActions}
                  onChange={setNewAlertActions}
                />

                <button
                  onClick={() => {
                    if (!newAlertPercent) {
                      toast.error('Please enter alert value');
                      return;
                    }
                    const newAlert: Alert = {
                      id: `telegram-alert-${Date.now()}`,
                      campaignId: '', // Will be set when monitoring starts
                      targetPrice: 0,
                      targetPercent: parseFloat(newAlertPercent),
                      direction: newAlertDirection,
                      priceType: newAlertPriceType,
                      hit: false,
                      actions: newAlertActions
                    };
                    setTelegramAlerts([...telegramAlerts, newAlert]);
                    setNewAlertPercent('');
                    setNewAlertActions([{ type: 'notification' }]);
                    toast.success('Alert added!');
                  }}
                  className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg text-sm transition-colors"
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  Add Alert
                </button>
              </div>

              {/* Alerts List */}
              {telegramAlerts.length > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-300">Configured Alerts</h4>
                  {telegramAlerts.map((alert) => (
                    <div key={alert.id} className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="text-sm text-white font-medium">
                            {alert.priceType === 'percentage' ? `${alert.targetPercent}%` : `${alert.targetPercent} ${alert.priceType === 'exact_sol' ? 'SOL' : 'USD'}`}
                            {' '}{alert.direction === 'above' ? '↑' : '↓'}
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            Actions: {alert.actions.map(a => a.type).join(', ')}
                          </div>
                        </div>
                        <button
                          onClick={() => setTelegramAlerts(telegramAlerts.filter(a => a.id !== alert.id))}
                          className="p-1 hover:bg-gray-800 rounded transition-colors"
                        >
                          <X className="w-4 h-4 text-gray-400" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
            <p className="text-sm text-cyan-300">
              <strong>Auto-Monitor Mode:</strong> When enabled, Test Lab will automatically create campaigns for any tokens posted by the selected user in the selected chat.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={startTelegramMonitoring}
              disabled={loading || !telegramAccountId || !telegramChatId || (!telegramMonitorAllUsers && telegramSelectedUserIds.length === 0)}
              className="px-6 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors"
            >
              <Play className="w-4 h-4" />
              {!telegramMonitorAllUsers && telegramSelectedUserIds.length === 0 ? 'Select User(s) or Enable Monitor All' : loading ? 'Starting...' : 'Start Monitoring'}
            </button>
          </div>
        </div>
        )}

        {/* Telegram AutoTrader Configuration */}
        {campaignSource === 'telegram-autotrader' && (
        <div className="space-y-4">
          {/* Auto-Trader Toggle */}
          <div className="flex items-center justify-between p-4 bg-gray-900 rounded-lg border border-gray-700">
            <div>
              <h3 className="text-white font-medium">Telegram Auto-Trader</h3>
              <p className="text-sm text-gray-400 mt-1">Automatically process contract addresses from Telegram</p>
            </div>
            <button
              onClick={() => setAutoTraderEnabled(!autoTraderEnabled)}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                autoTraderEnabled ? 'bg-cyan-600' : 'bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                  autoTraderEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Configuration Options */}
          {autoTraderEnabled && (
            <div className="space-y-4 p-4 bg-gray-900/50 rounded-lg border border-gray-700">
              {/* Action on New CA */}
              <div>
                <label className="block text-sm text-gray-400 mb-2">Action on New Contract</label>
                <select
                  value={telegramAction}
                  onChange={(e) => setTelegramAction(e.target.value as 'monitor' | 'buy_monitor')}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  <option value="monitor">Monitor Only</option>
                  <option value="buy_monitor">Buy + Monitor</option>
                </select>
              </div>

              {/* Buy Configuration */}
              {telegramAction === 'buy_monitor' && (
                <div className="space-y-4 p-4 bg-green-900/20 rounded-lg border border-green-600/30">
                  <h4 className="text-green-400 font-medium">Buy Configuration</h4>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Buy Amount (SOL)</label>
                      <input
                        type="number"
                        value={buyAmount}
                        onChange={(e) => setBuyAmount(e.target.value)}
                        step="0.01"
                        min="0.01"
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">Buy Timing</label>
                      <select
                        value={buyTiming}
                        onChange={(e) => setBuyTiming(e.target.value as 'instant' | 'wait_dip' | 'wait_pump')}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      >
                        <option value="instant">Instant Buy</option>
                        <option value="wait_dip">Wait for Dip</option>
                        <option value="wait_pump">Wait for Pump</option>
                      </select>
                    </div>
                  </div>

                  {/* Price Change Threshold */}
                  {buyTiming !== 'instant' && (
                    <div>
                      <label className="block text-sm text-gray-400 mb-2">
                        Wait for {buyTiming === 'wait_dip' ? 'Dip' : 'Pump'} (%)
                      </label>
                      <input
                        type="number"
                        value={priceChangeThreshold}
                        onChange={(e) => setPriceChangeThreshold(e.target.value)}
                        step="1"
                        min="1"
                        placeholder={buyTiming === 'wait_dip' ? '-5' : '5'}
                        className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                      />
                    </div>
                  )}

                  {/* Exit Strategy */}
                  <div className="space-y-3">
                    <h5 className="text-sm text-gray-300">Exit Strategy</h5>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Take Profit (%)</label>
                        <input
                          type="number"
                          value={takeProfit}
                          onChange={(e) => setTakeProfit(e.target.value)}
                          step="5"
                          min="5"
                          placeholder="20"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-sm text-gray-400 mb-1">Stop Loss (%)</label>
                        <input
                          type="number"
                          value={stopLoss}
                          onChange={(e) => setStopLoss(e.target.value)}
                          step="5"
                          max="-5"
                          placeholder="-10"
                          className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Save Configuration Button */}
              <button
                onClick={() => saveTelegramAutoTraderConfig()}
                className="w-full px-4 py-2 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg transition-colors"
              >
                Save Configuration
              </button>
            </div>
          )}

          {/* Active Telegram Monitors */}
          {autoTraderEnabled && activeTelegramPositions.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm text-gray-400">Active Telegram Positions</h3>
              <div className="bg-gray-900 rounded-lg border border-gray-700 p-3">
                {activeTelegramPositions.map((position) => (
                  <div key={position.id} className="flex items-center justify-between py-2 border-b border-gray-800 last:border-0">
                    <div>
                      <span className="text-white font-mono text-sm">{position.token_address.slice(0,8)}...</span>
                      <span className="text-gray-400 text-xs ml-2">{position.status}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-white text-sm">${position.current_value?.toFixed(2)}</div>
                      <div className={`text-xs ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {position.pnl >= 0 ? '+' : ''}{position.pnl?.toFixed(2)}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
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
              <strong>🧪 Test Mode:</strong> Launches headless browser, navigates to GMGN chart, and extracts price & indicator values (RSI, EMA) every 5 seconds. Enable screenshots to see what the bot sees.
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
              📸 Enable Screenshots (captures what the bot sees)
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

        {/* Pumpfun Sniper Fields */}
        {campaignSource === 'pumpfun-sniper' && (
        <div className="space-y-4">
          {/* Wallet Selection */}
          <div>
            <label className="block text-sm text-gray-400 mb-2">Trading Wallet *</label>
            <select
              value={selectedPumpfunWallet || ''}
              onChange={(e) => setSelectedPumpfunWallet(e.target.value ? parseInt(e.target.value) : null)}
              className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
            >
              <option value="">Select wallet...</option>
              {tradingWallets.map((wallet: any) => (
                <option key={wallet.id} value={wallet.id}>
                  {wallet.name || wallet.publicKey?.substring(0, 8) || 'Wallet'} 
                  {wallet.isDefault && ' (Default)'}
                  {' - '}
                  {wallet.balance?.toFixed(4) || '0.0000'} SOL
                </option>
              ))}
            </select>
          </div>

          {/* Snipe Mode */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Snipe Mode</label>
              <select
                value={pumpfunSnipeMode}
                onChange={(e) => setPumpfunSnipeMode(e.target.value as 'single' | 'all')}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              >
                <option value="single">Single Token (Stop after 1)</option>
                <option value="all">Multi-Snipe (Continue sniping)</option>
              </select>
            </div>
            
            {pumpfunSnipeMode === 'all' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Max Snipes</label>
                <input
                  type="number"
                  value={pumpfunMaxSnipes}
                  onChange={(e) => setPumpfunMaxSnipes(e.target.value)}
                  min="1"
                  max="100"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                />
              </div>
            )}
          </div>

          {/* Buy Configuration */}
          <div className="p-4 bg-purple-900/20 border border-purple-600/30 rounded-lg space-y-4">
            <h4 className="text-purple-400 font-medium">Buy Configuration</h4>
            
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Buy Amount (SOL)</label>
                <input
                  type="number"
                  value={pumpfunBuyAmount}
                  onChange={(e) => setPumpfunBuyAmount(e.target.value)}
                  step="0.01"
                  min="0.01"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                />
              </div>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2">Slippage (%)</label>
                <input
                  type="number"
                  value={pumpfunSlippagePercent}
                  onChange={(e) => setPumpfunSlippagePercent(e.target.value)}
                  min="0.5"
                  max="20"
                  step="0.5"
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                />
                <p className="text-xs text-gray-500 mt-1">We convert to basis points automatically (e.g. 5% → 500 bps).</p>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2">Priority Fee Preset</label>
                <select
                  value={pumpfunPriority}
                  onChange={(e) => setPumpfunPriority(e.target.value as any)}
                  className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                >
                  <option value="low">Low (0.00001 SOL)</option>
                  <option value="medium">Medium (0.00005 SOL)</option>
                  <option value="high">High (0.0002 SOL)</option>
                  <option value="ultra">Ultra (0.0005 SOL)</option>
                  <option value="custom">Custom</option>
                </select>
                <p className="text-xs text-gray-500 mt-1">Bigger priority fees push the transaction higher in the queue.</p>
              </div>

              {pumpfunPriority === 'custom' && (
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Custom Priority Fee (SOL)</label>
                  <input
                    type="number"
                    value={pumpfunCustomPriority}
                    onChange={(e) => setPumpfunCustomPriority(e.target.value)}
                    min="0"
                    step="0.0001"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                  <p className="text-xs text-gray-500 mt-1">Enter the exact amount of SOL to spend on compute prioritization.</p>
                </div>
              )}
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pumpfunSkipPlatformFee}
                onChange={(e) => setPumpfunSkipPlatformFee(e.target.checked)}
                className="w-4 h-4 bg-gray-800 border-gray-600 rounded text-purple-600"
              />
              <span className="text-sm text-gray-300">Disable platform fee for this run</span>
            </label>
          </div>

          {/* Exit Strategy */}
          <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg space-y-4">
            <h4 className="text-gray-300 font-medium">Exit Strategy</h4>
            
            {/* Stop Loss */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Stop Loss (%)</label>
              <input
                type="number"
                value={pumpfunStopLoss}
                onChange={(e) => setPumpfunStopLoss(e.target.value)}
                step="5"
                max="-1"
                placeholder="-10"
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              />
              <p className="text-xs text-gray-500 mt-1">Percentage loss from entry price (e.g., -10 for 10% stop loss)</p>
            </div>
            
            {/* Take Profits */}
            <div>
              <label className="block text-sm text-gray-400 mb-2">Take Profits (%)</label>
              <div className="space-y-2">
                {pumpfunTakeProfits.map((tp, index) => (
                  <div key={index} className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={tp}
                      onChange={(e) => {
                        const newTPs = [...pumpfunTakeProfits];
                        newTPs[index] = e.target.value;
                        setPumpfunTakeProfits(newTPs);
                      }}
                      min="5"
                      placeholder={`TP ${index + 1}`}
                      className="col-span-2 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                    <input
                      type="number"
                      value={pumpfunTPAmounts[index]}
                      onChange={(e) => {
                        const newAmounts = [...pumpfunTPAmounts];
                        newAmounts[index] = e.target.value;
                        setPumpfunTPAmounts(newAmounts);
                      }}
                      min="1"
                      max="100"
                      placeholder="% to sell"
                      className="px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                    />
                  </div>
                ))}
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (pumpfunTakeProfits.length < 5) {
                        setPumpfunTakeProfits([...pumpfunTakeProfits, '']);
                        setPumpfunTPAmounts([...pumpfunTPAmounts, '20']);
                      }
                    }}
                    disabled={pumpfunTakeProfits.length >= 5}
                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-700 text-white rounded text-sm"
                  >
                    <Plus className="w-4 h-4 inline" /> Add TP
                  </button>
                  {pumpfunTakeProfits.length > 1 && (
                    <button
                      onClick={() => {
                        setPumpfunTakeProfits(pumpfunTakeProfits.slice(0, -1));
                        setPumpfunTPAmounts(pumpfunTPAmounts.slice(0, -1));
                      }}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm"
                    >
                      <X className="w-4 h-4 inline" /> Remove Last
                    </button>
                  )}
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Set multiple take profit levels. Each TP sells a percentage of your position.</p>
            </div>
          </div>

          {/* Filters */}
          <div className="p-4 bg-gray-900/50 border border-gray-700 rounded-lg space-y-4">
            <h4 className="text-gray-300 font-medium">Filters</h4>
            
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pumpfunExcludeGraduated}
                  onChange={(e) => setPumpfunExcludeGraduated(e.target.checked)}
                  className="w-4 h-4 bg-gray-800 border-gray-600 rounded text-purple-600"
                />
                <span className="text-sm text-gray-300">Skip graduated tokens (already on Raydium)</span>
              </label>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Min Liquidity (SOL)</label>
                  <input
                    type="number"
                    value={pumpfunMinLiquidity}
                    onChange={(e) => setPumpfunMinLiquidity(e.target.value)}
                    step="0.1"
                    min="0"
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-2">Max Liquidity (SOL)</label>
                  <input
                    type="number"
                    value={pumpfunMaxLiquidity}
                    onChange={(e) => setPumpfunMaxLiquidity(e.target.value)}
                    step="1"
                    min="0"
                    placeholder="Optional"
                    className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
            <p className="text-sm text-purple-300">
              <strong>🎯 Pumpfun Sniper:</strong> Monitors the Pumpfun program for new token launches in real-time via WebSocket. 
              Automatically buys when a new bonding curve is created, with configurable stop loss and take profit levels.
            </p>
          </div>

          {/* Start/Stop Button */}
          <div className="flex justify-between items-center">
            {pumpfunSniperActive && (
              <div className="text-sm text-gray-400">
                Sniped: <span className="text-purple-400 font-bold">{pumpfunSnipedTokens.length}</span> token(s)
              </div>
            )}
            <button
              onClick={async () => {
                if (pumpfunSniperActive) {
                  // Stop sniper
                  setLoading(true);
                  try {
                    const response = await fetch(`${config.apiUrl}/api/test-lab/pumpfun-sniper/stop`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include'
                    });
                    const data = await response.json();
                    if (data.success) {
                      setPumpfunSniperActive(false);
                      setPumpfunSnipedTokens(data.tokens || []);
                      toast.success(`Sniper stopped! Sniped ${data.totalSniped} tokens`);
                    }
                  } catch (error) {
                    toast.error('Failed to stop sniper');
                  } finally {
                    setLoading(false);
                  }
                } else {
                  // Start sniper
                  if (!selectedPumpfunWallet) {
                    toast.error('Please select a wallet');
                    return;
                  }
                  
                  setLoading(true);
                  try {
                    const response = await fetch(`${config.apiUrl}/api/test-lab/pumpfun-sniper/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        walletId: selectedPumpfunWallet,
                        snipeMode: pumpfunSnipeMode,
                        buyAmountSol: parseFloat(pumpfunBuyAmount),
                        stopLoss: parseFloat(pumpfunStopLoss),
                        takeProfits: pumpfunTakeProfits.filter(tp => tp).map(tp => parseFloat(tp)),
                        takeProfitAmounts: pumpfunTPAmounts.map(a => parseFloat(a)),
                        slippageBps: Math.round(parseFloat(pumpfunSlippagePercent || '5') * 100),
                        priorityLevel: pumpfunPriority,
                        priorityFee: pumpfunPriority === 'custom' ? parseFloat(pumpfunCustomPriority || '0') : undefined,
                        skipTax: pumpfunSkipPlatformFee,
                        maxSnipes: parseInt(pumpfunMaxSnipes),
                        excludeGraduated: pumpfunExcludeGraduated,
                        minLiquidity: pumpfunMinLiquidity ? parseFloat(pumpfunMinLiquidity) : undefined,
                        maxLiquidity: pumpfunMaxLiquidity ? parseFloat(pumpfunMaxLiquidity) : undefined
                      })
                    });
                    const data = await response.json();
                    if (data.success) {
                      setPumpfunSniperActive(true);
                      setPumpfunSnipedTokens([]);
                      toast.success('Pumpfun sniper activated! Monitoring for new launches...');
                    } else {
                      toast.error(data.error || 'Failed to start sniper');
                    }
                  } catch (error) {
                    toast.error('Failed to start sniper');
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              disabled={loading}
              className={`px-6 py-2 ${
                pumpfunSniperActive 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-purple-600 hover:bg-purple-700'
              } disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors ml-auto`}
            >
              {pumpfunSniperActive ? (
                <>
                  <X className="w-4 h-4" />
                  {loading ? 'Stopping...' : 'Stop Sniper'}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  {loading ? 'Starting...' : 'Start Sniper'}
                </>
              )}
            </button>
          </div>

          {/* Sniped Tokens Display */}
          {pumpfunSnipedTokens.length > 0 && (
            <div className="mt-4 p-4 bg-gray-900 rounded-lg">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Sniped Tokens</h4>
              <div className="space-y-2">
                {pumpfunSnipedTokens.map((token) => (
                  <div key={token} className="flex items-center justify-between p-2 bg-gray-800 rounded">
                    <span className="font-mono text-purple-400 text-sm">{token.substring(0, 8)}...</span>
                    <button
                      onClick={() => copyAddress(token)}
                      className="p-1 hover:bg-gray-700 rounded transition-colors"
                    >
                      {copiedAddress === token ? (
                        <Check className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        )}

        {/* Smart Money Tracker Fields */}
        {campaignSource === 'smart-money' && (
        <div className="space-y-4">
          <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
            <p className="text-sm text-emerald-300">
              <strong>💎 Smart Money Tracker:</strong> Monitors all Pumpfun transactions and tracks large buys (5M+ tokens). 
              Automatically follows positions until the wallet sells, tracking P&L, highs/lows, and performance metrics. 
              Features wallet and token leaderboards. In-memory tracking, refreshable within sessions.
            </p>
          </div>

          {/* Configuration Controls */}
          <div className="space-y-4 p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h4 className="text-white font-medium flex items-center gap-2">
              <span>⚙️</span> Configuration
            </h4>
            
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">Minimum Tokens</label>
                <input
                  type="number"
                  value={smartMoneyConfig.minTokenThreshold}
                  onChange={(e) => setSmartMoneyConfig({...smartMoneyConfig, minTokenThreshold: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  step="1000000"
                  min="1000000"
                />
                <p className="text-xs text-gray-500 mt-1">Track buys above this threshold</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">Price Update (ms)</label>
                <input
                  type="number"
                  value={smartMoneyConfig.priceUpdateIntervalMs}
                  onChange={(e) => setSmartMoneyConfig({...smartMoneyConfig, priceUpdateIntervalMs: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  step="500"
                  min="1000"
                />
                <p className="text-xs text-gray-500 mt-1">Jupiter Price API polling</p>
              </div>
            </div>
            
            {/* Market Cap Filters */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-2">💰 Min Market Cap (USD)</label>
                <input
                  type="number"
                  value={smartMoneyConfig.minMarketCapUsd}
                  onChange={(e) => setSmartMoneyConfig({...smartMoneyConfig, minMarketCapUsd: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  step="1000"
                  min="0"
                  placeholder="0 = no limit"
                />
                <p className="text-xs text-gray-500 mt-1">Only track tokens above this market cap</p>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-2">💰 Max Market Cap (USD)</label>
                <input
                  type="number"
                  value={smartMoneyConfig.maxMarketCapUsd}
                  onChange={(e) => setSmartMoneyConfig({...smartMoneyConfig, maxMarketCapUsd: parseInt(e.target.value)})}
                  className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                  step="1000"
                  min="0"
                  placeholder="0 = no limit"
                />
                <p className="text-xs text-gray-500 mt-1">Only track tokens below this market cap</p>
              </div>
            </div>
            
            <div className="p-3 bg-emerald-900/20 border border-emerald-600/30 rounded-lg">
              <p className="text-sm text-emerald-400">
                🚀 <strong>WebSocket Mode:</strong> Direct connection with no rate limits on private RPC endpoint
              </p>
            </div>
            
            <button
              onClick={async () => {
                try {
                  const response = await fetch(`${config.apiUrl}/api/smart-money-tracker/config`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify(smartMoneyConfig)
                  });
                  const data = await response.json();
                  if (data.success) {
                    // Update local state with actual backend config
                    setSmartMoneyConfig(data.config);
                    toast.success('Configuration updated');
                  }
                } catch (error) {
                  toast.error('Failed to update config');
                }
              }}
              className="w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              Apply Configuration
            </button>
          </div>

          {/* Start/Stop Button */}
          <div className="flex justify-between items-center">
            {smartMoneyStats && (
              <div className="text-sm text-gray-400">
                <span className="text-emerald-400 font-bold">{smartMoneyStats.activePositions || 0}</span> active • 
                <span className="text-gray-300 font-bold ml-2">{smartMoneyStats.closedPositions || 0}</span> closed
              </div>
            )}
            <button
              onClick={async () => {
                if (smartMoneyActive) {
                  // Stop tracker
                  setLoading(true);
                  try {
                    const response = await fetch(`${config.apiUrl}/api/smart-money-tracker/stop`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include'
                    });
                    const data = await response.json();
                    if (data.success) {
                      setSmartMoneyActive(false);
                      toast.success('Smart Money Tracker stopped');
                    }
                  } catch (error) {
                    toast.error('Failed to stop tracker');
                  } finally {
                    setLoading(false);
                  }
                } else {
                  // Start tracker
                  setLoading(true);
                  try {
                    const response = await fetch(`${config.apiUrl}/api/smart-money-tracker/start`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include'
                    });
                    const data = await response.json();
                    if (data.success) {
                      setSmartMoneyActive(true);
                      toast.success(data.message);
                      // Fetch initial data
                      fetchSmartMoneyData();
                    } else {
                      toast.error(data.error || 'Failed to start tracker');
                    }
                  } catch (error) {
                    toast.error('Failed to start tracker');
                  } finally {
                    setLoading(false);
                  }
                }
              }}
              disabled={loading}
              className={`px-6 py-2 ${
                smartMoneyActive 
                  ? 'bg-red-600 hover:bg-red-700' 
                  : 'bg-emerald-600 hover:bg-emerald-700'
              } disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center gap-2 transition-colors ml-auto`}
            >
              {smartMoneyActive ? (
                <>
                  <X className="w-4 h-4" />
                  {loading ? 'Stopping...' : 'Stop Tracker'}
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  {loading ? 'Starting...' : 'Start Tracking'}
                </>
              )}
            </button>
          </div>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h4 className="text-white font-medium mb-2">What Gets Tracked:</h4>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>• <span className="text-emerald-400">Large Buys:</span> Positions opened with 5M+ tokens</li>
              <li>• <span className="text-emerald-400">Price Monitoring:</span> Real-time updates every 1.5s via Jupiter</li>
              <li>• <span className="text-emerald-400">Performance:</span> Unrealized P&L, high/low since entry</li>
              <li>• <span className="text-emerald-400">Exit Detection:</span> Automatic position closure when wallet sells</li>
              <li>• <span className="text-emerald-400">Leaderboards:</span> Top performing wallets and hottest tokens</li>
            </ul>
          </div>

          {/* Smart Money Data Display */}
          {smartMoneyActive && (
            <div className="mt-6 space-y-4">
              {/* Tabs */}
              <div className="flex gap-2 border-b border-gray-700">
                <button
                  onClick={() => setSmartMoneyTab('positions')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    smartMoneyTab === 'positions'
                      ? 'text-emerald-400 border-b-2 border-emerald-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  💎 Positions ({smartMoneyPositions.length})
                </button>
                <button
                  onClick={() => setSmartMoneyTab('wallets')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    smartMoneyTab === 'wallets'
                      ? 'text-emerald-400 border-b-2 border-emerald-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  👤 Wallets ({smartMoneyWalletLeaderboard.length})
                </button>
                <button
                  onClick={() => setSmartMoneyTab('tokens')}
                  className={`px-4 py-2 font-medium transition-colors ${
                    smartMoneyTab === 'tokens'
                      ? 'text-emerald-400 border-b-2 border-emerald-400'
                      : 'text-gray-400 hover:text-gray-300'
                  }`}
                >
                  🪙 Tokens ({smartMoneyTokenLeaderboard.length})
                </button>
              </div>

              {/* Positions Tab */}
              {smartMoneyTab === 'positions' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {smartMoneyPositions.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No positions detected yet. Waiting for large buys...
                    </div>
                  ) : (
                    smartMoneyPositions.map((pos: any) => (
                      <div key={pos.id} className={`p-4 rounded-lg border ${
                        pos.isActive
                          ? 'bg-emerald-900/10 border-emerald-600/30'
                          : 'bg-gray-800/50 border-gray-700'
                      }`}>
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              {/* Token Logo */}
                              {pos.tokenLogo && (
                                <img src={pos.tokenLogo} alt={pos.tokenSymbol} className="w-8 h-8 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              )}
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  {/* Token Symbol with Solscan Link */}
                                  <a 
                                    href={`https://solscan.io/token/${pos.tokenMint}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-white font-medium hover:text-emerald-400 transition-colors"
                                  >
                                    {pos.tokenSymbol || pos.tokenMint.slice(0, 8)}
                                  </a>
                                  {/* GMGN Chart Link */}
                                  <a
                                    href={`https://gmgn.ai/sol/token/${pos.tokenMint}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                                    title="View on GMGN"
                                  >
                                    📊
                                  </a>
                                  {pos.isActive && <span className="px-2 py-0.5 text-xs bg-emerald-500/20 text-emerald-400 rounded">ACTIVE</span>}
                                  {!pos.isActive && <span className="px-2 py-0.5 text-xs bg-gray-600/20 text-gray-400 rounded">CLOSED</span>}
                                </div>
                                {/* Token Name */}
                                {pos.tokenName && (
                                  <div className="text-xs text-gray-500 mt-0.5">{pos.tokenName}</div>
                                )}
                              </div>
                            </div>
                            <div className="text-sm text-gray-400 space-y-1">
                              {/* Wallet with Solscan Link */}
                              <div className="flex items-center gap-2">
                                <span>Wallet:</span>
                                <a 
                                  href={`https://solscan.io/account/${pos.walletAddress}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-gray-300 font-mono hover:text-emerald-400 transition-colors"
                                >
                                  {pos.walletAddress.slice(0, 8)}...{pos.walletAddress.slice(-6)}
                                </a>
                              </div>
                              
                              {/* Entry Details */}
                              <div className="grid grid-cols-2 gap-2 pt-1">
                                <div>
                                  <span className="text-gray-500">Entry:</span>{' '}
                                  <a 
                                    href={`https://solscan.io/tx/${pos.entryTx}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-blue-400 hover:text-blue-300 underline"
                                    title="View entry transaction on Solscan"
                                  >
                                    {new Date(pos.entryTime).toLocaleTimeString()}
                                  </a>
                                </div>
                                <div>
                                  <span className="text-gray-500">Buys:</span> <span className="text-emerald-400">{pos.buyCount || 0}</span>
                                  {pos.sellCount > 0 && <span className="text-gray-500"> • Sells: <span className="text-red-400">{pos.sellCount}</span></span>}
                                </div>
                                <div>
                                  <span className="text-gray-500">Entry Price:</span> <span className="text-cyan-400">{Number(pos.entryPrice ?? 0).toFixed(10)} SOL/{pos.tokenSymbol || 'token'}</span>
                                </div>
                                <div>
                                  <span className="text-gray-500">Total Cost:</span> <span className="text-cyan-400">{Number(pos.solSpent ?? 0).toFixed(4)} SOL</span>
                                </div>
                              </div>

                              {/* Active Position Metrics */}
                              {pos.isActive && (
                                <div className="pt-2 border-t border-gray-700">
                                  <div className="grid grid-cols-2 gap-2">
                                    {Number(pos.currentPriceUsd || 0) > 0 ? (
                                      <div>
                                        <span className="text-gray-500">Price:</span>{' '}
                                        <span className="text-yellow-400 font-bold">${Number(pos.currentPriceUsd).toFixed(8)}</span>
                                        <span className="text-gray-600 text-xs ml-1">({Number(pos.currentPrice ?? 0).toFixed(10)} SOL)</span>
                                      </div>
                                    ) : (
                                      <div>
                                        <span className="text-gray-500">Price:</span>{' '}
                                        <span className="text-white">{Number(pos.currentPrice ?? 0).toFixed(10)} SOL/{pos.tokenSymbol || 'token'}</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-gray-500">P&L:</span>{' '}
                                      <span className={Number(pos.unrealizedPnl ?? 0) >= 0 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                        {Number(pos.unrealizedPnl ?? 0) >= 0 ? '+' : ''}{Number(pos.unrealizedPnl ?? 0).toFixed(4)} SOL ({Number(pos.unrealizedPnlPercent ?? 0).toFixed(2)}%)
                                      </span>
                                    </div>
                                    {Number(pos.marketCapUsd || 0) > 0 && (
                                      <div>
                                        <span className="text-gray-500">Market Cap:</span>{' '}
                                        <span className="text-purple-400">${Number(pos.marketCapUsd / 1000).toFixed(1)}K</span>
                                      </div>
                                    )}
                                    <div>
                                      <span className="text-gray-500">High:</span>{' '}
                                      <span className="text-green-400">
                                        {Number(pos.high ?? 0).toFixed(10)} SOL/{pos.tokenSymbol || 'token'} (+{Number(((pos.high ?? 0) / (pos.entryPrice || 1) - 1) * 100).toFixed(2)}%)
                                      </span>
                                      {Number(pos.highUsd || 0) > 0 && (
                                        <span className="ml-1 text-green-300 text-xs">(${Number(pos.highUsd).toFixed(8)})</span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Low:</span>{' '}
                                      <span className="text-red-400">
                                        {Number(pos.low ?? 0).toFixed(10)} SOL/{pos.tokenSymbol || 'token'} ({Number(((pos.low ?? 0) / (pos.entryPrice || 1) - 1) * 100).toFixed(2)}%)
                                      </span>
                                      {Number(pos.lowUsd || 0) > 0 && (
                                        <span className="ml-1 text-red-300 text-xs">(${Number(pos.lowUsd).toFixed(8)})</span>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    Last update: {new Date(pos.lastUpdate).toLocaleTimeString()}
                                  </div>
                                </div>
                              )}

                              {/* Closed Position Metrics */}
                              {!pos.isActive && pos.realizedPnl !== undefined && (
                                <div className="pt-2 border-t border-gray-700">
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <span className="text-gray-500">Exit:</span>{' '}
                                      {pos.exitTx ? (
                                        <a 
                                          href={`https://solscan.io/tx/${pos.exitTx}`}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-blue-400 hover:text-blue-300"
                                          title="View exit transaction"
                                        >
                                          {pos.exitTime ? new Date(pos.exitTime).toLocaleTimeString() : 'N/A'}
                                        </a>
                                      ) : (
                                        <span className="text-gray-500">Detected</span>
                                      )}
                                    </div>
                                    <div>
                                      <span className="text-gray-500">Exit Price:</span>{' '}
                                      <span className="text-white">{pos.exitPrice ? Number(pos.exitPrice).toFixed(10) : 'N/A'} SOL/{pos.tokenSymbol || 'token'}</span>
                                    </div>
                                    <div className="col-span-2">
                                      <span className="text-gray-500">Realized P&L:</span>{' '}
                                      <span className={Number(pos.realizedPnl ?? 0) >= 0 ? 'text-green-400 font-bold text-lg' : 'text-red-400 font-bold text-lg'}>
                                        {Number(pos.realizedPnl ?? 0) >= 0 ? '+' : ''}{Number(pos.realizedPnl ?? 0).toFixed(4)} SOL ({Number(pos.realizedPnlPercent ?? 0).toFixed(2)}%)
                                      </span>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Wallets Tab */}
              {smartMoneyTab === 'wallets' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {smartMoneyWalletLeaderboard.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No wallet data yet
                    </div>
                  ) : (
                    smartMoneyWalletLeaderboard.map((wallet: any, idx: number) => (
                      <div key={wallet.walletAddress} className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : '💎'}</span>
                            <div>
                              {/* Wallet Address with Solscan Link */}
                              <a
                                href={`https://solscan.io/account/${wallet.walletAddress}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-white font-mono hover:text-emerald-400 transition-colors"
                              >
                                {wallet.walletAddress.slice(0, 8)}...{wallet.walletAddress.slice(-6)}
                              </a>
                              <div className="text-xs text-gray-400 mt-1">
                                {wallet.activePositions || 0} active • {wallet.closedPositions || 0} closed • {wallet.totalBuys || 0} buys • {wallet.totalSells || 0} sells
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Win Rate: {Number(wallet.winRate || 0).toFixed(1)}% • Avg Hold: {Number((wallet.avgHoldingTime || 0) / 3600000).toFixed(1)}h
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${Number(wallet.totalRealizedPnl || 0) + Number(wallet.totalUnrealizedPnl || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(wallet.totalRealizedPnl || 0) + Number(wallet.totalUnrealizedPnl || 0) >= 0 ? '+' : ''}
                              {Number(Number(wallet.totalRealizedPnl || 0) + Number(wallet.totalUnrealizedPnl || 0)).toFixed(4)} SOL
                            </div>
                            <div className="text-xs text-gray-400">
                              In: {Number(wallet.totalInvested || 0).toFixed(2)} SOL • Out: {Number(wallet.totalReturned || 0).toFixed(2)} SOL
                            </div>
                            <div className="text-xs text-gray-500 mt-0.5">
                              Avg Buy: {Number((wallet.avgEntryPrice || 0) * 1e9).toFixed(4)} SOL/token
                            </div>
                            {(wallet.avgExitPrice || 0) > 0 && (
                              <div className="text-xs text-gray-500">
                                Avg Sell: {Number((wallet.avgExitPrice || 0) * 1e9).toFixed(4)} SOL/token
                              </div>
                            )}
                            <div className="text-xs text-gray-600 mt-1">
                              Best: {Number(wallet.bestTrade || 0).toFixed(1)}% | Worst: {Number(wallet.worstTrade || 0).toFixed(1)}%
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Tokens Tab */}
              {smartMoneyTab === 'tokens' && (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {smartMoneyTokenLeaderboard.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      No token data yet
                    </div>
                  ) : (
                    smartMoneyTokenLeaderboard.map((token: any, idx: number) => (
                      <div key={token.tokenMint} className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <span className="text-2xl">{idx === 0 ? '🔥' : idx === 1 ? '⚡' : idx === 2 ? '✨' : '🪙'}</span>
                            {/* Token Logo */}
                            {token.tokenLogo && (
                              <img src={token.tokenLogo} alt={token.tokenSymbol} className="w-10 h-10 rounded-full" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            )}
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {/* Token Symbol with Solscan Link */}
                                <a
                                  href={`https://solscan.io/token/${token.tokenMint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-white font-medium hover:text-emerald-400 transition-colors"
                                >
                                  {token.tokenSymbol || token.tokenMint.slice(0, 8)}
                                </a>
                                {/* GMGN Chart Link */}
                                <a
                                  href={`https://gmgn.ai/sol/token/${token.tokenMint}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-purple-400 hover:text-purple-300 transition-colors"
                                  title="View chart on GMGN"
                                >
                                  📊
                                </a>
                              </div>
                              {/* Token Name */}
                              {token.tokenName && (
                                <div className="text-xs text-gray-500 mt-0.5">{token.tokenName}</div>
                              )}
                              <div className="text-xs text-gray-400 mt-1">
                                {token.holders || 0} holders • {token.totalBuys || 0} buys • {token.totalSells || 0} sells
                              </div>
                              <div className="text-xs text-gray-500 mt-0.5">
                                Vol: {Number(token.totalVolumeSol ?? 0).toFixed(2)} SOL ({Number(token.totalVolumeTokens ?? 0).toLocaleString()} tokens)
                              </div>
                              {/* Current Price */}
                              <div className="text-xs text-gray-500 mt-1">
                                {Number(token.currentPriceUsd || 0) > 0 ? (
                                  <>
                                    Price: <span className="text-yellow-400 font-semibold">${Number(token.currentPriceUsd).toFixed(8)}</span>
                                    <span className="ml-1 text-gray-600">
                                      ({Number((token.currentPrice || 0) * 1e9).toFixed(6)} SOL)
                                    </span>
                                  </>
                                ) : (
                                  <>Price: {Number((token.currentPrice || 0) * 1e9).toFixed(6)} SOL/{token.tokenSymbol || 'token'}</>
                                )}
                              </div>
                              {/* Market Cap */}
                              {Number(token.marketCapUsd || 0) > 0 && (
                                <div className="text-xs text-gray-500">
                                  MCap: ${Number(token.marketCapUsd / 1e6).toFixed(2)}M
                                  {Number(token.marketCapSol || 0) > 0 && (
                                    <span className="ml-1">({Number(token.marketCapSol).toFixed(2)} SOL)</span>
                                  )}
                                </div>
                              )}
                              <div className="text-xs text-gray-600 mt-0.5">
                                Avg Buy: {Number(token.avgBuyPrice || 0).toFixed(10)} SOL/{token.tokenSymbol || 'token'}
                                {(token.avgSellPrice || 0) > 0 && (
                                  <span className="ml-1">• Avg Sell: {Number(token.avgSellPrice || 0).toFixed(10)} SOL/{token.tokenSymbol || 'token'}</span>
                                )}
                              </div>
                              {(token.avgHoldingTime || 0) > 0 && (
                                <div className="text-xs text-gray-600">
                                  Avg Hold: {Number((token.avgHoldingTime || 0) / 3600000).toFixed(1)}h
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="text-right">
                            <div className={`text-lg font-bold ${Number(token.bestPerformance || 0) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {Number(token.bestPerformance || 0) >= 0 ? '+' : ''}{Number(token.bestPerformance || 0).toFixed(2)}%
                            </div>
                            <div className="text-xs text-emerald-400">
                              Top Gain
                            </div>
                            {token.bestPerformer && (
                              <a
                                href={`https://solscan.io/account/${token.bestPerformer}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-purple-400 hover:text-purple-300 transition-colors"
                                title="Best performer"
                              >
                                {token.bestPerformer.slice(0, 6)}...{token.bestPerformer.slice(-4)}
                              </a>
                            )}
                            {(token.worstPerformance || 0) < 0 && (
                              <>
                                <div className="text-xs text-red-400 mt-1">
                                  Worst: {Number(token.worstPerformance || 0).toFixed(1)}%
                                </div>
                                {token.worstPerformer && (
                                  <a
                                    href={`https://solscan.io/account/${token.worstPerformer}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-xs text-gray-400 hover:text-gray-300 transition-colors"
                                    title="Worst performer"
                                  >
                                    {token.worstPerformer.slice(0, 6)}...{token.worstPerformer.slice(-4)}
                                  </a>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* Onchain OHLCV Builder Fields */}
        {campaignSource === 'onchain-ohlcv' && (
        <div className="space-y-4">
          <div className="p-4 bg-orange-500/10 border border-orange-500/30 rounded-lg">
            <h4 className="text-orange-400 font-medium mb-2">📊 Onchain OHLCV Builder</h4>
            <p className="text-sm text-gray-400">
              Build candlestick charts from raw Solana transactions. Extracts price, volume, and metadata directly from onchain data.
            </p>
          </div>

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

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Timeframe</label>
              <select
                value={ohlcvTimeframe}
                onChange={(e) => setOhlcvTimeframe(parseInt(e.target.value))}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              >
                <option value="1">1 minute</option>
                <option value="5">5 minutes</option>
                <option value="15">15 minutes</option>
                <option value="60">1 hour</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Lookback Period</label>
              <select
                value={ohlcvLookback}
                onChange={(e) => setOhlcvLookback(e.target.value)}
                className="w-full px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg text-white"
              >
                <option value="1h">Last 1 hour</option>
                <option value="4h">Last 4 hours</option>
                <option value="24h">Last 24 hours</option>
                <option value="7d">Last 7 days</option>
              </select>
            </div>
          </div>

          <button
            onClick={async () => {
              if (!tokenMint.trim()) {
                toast.error('Please enter a token contract address');
                return;
              }
              
              setOhlcvLoading(true);
              toast.loading('Fetching transactions from blockchain...');
              
              try {
                // Parse lookback period
                const lookbackHours = ohlcvLookback === '1h' ? 1 : 
                                     ohlcvLookback === '4h' ? 4 : 
                                     ohlcvLookback === '24h' ? 24 : 168; // 7d
                
                const response = await fetch(`${config.apiUrl}/api/ohlcv/onchain/build`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  credentials: 'include',
                  body: JSON.stringify({
                    tokenMint: tokenMint.trim(),
                    timeframeMinutes: ohlcvTimeframe,
                    lookbackHours
                  })
                });
                
                const data = await response.json();
                
                if (data.success) {
                  setOhlcvCandles(data.candles);
                  setOhlcvMetadata(data.metadata);
                  toast.dismiss();
                  toast.success(`Built ${data.candles.length} candles from ${data.metadata.totalSwaps} swaps!`);
                } else {
                  toast.dismiss();
                  toast.error(data.error || 'Failed to build OHLCV data');
                }
              } catch (error: any) {
                toast.dismiss();
                toast.error('Failed to build OHLCV data');
                console.error(error);
              } finally {
                setOhlcvLoading(false);
              }
            }}
            disabled={ohlcvLoading}
            className="w-full px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg flex items-center justify-center gap-2 transition-colors"
          >
            {ohlcvLoading ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Building from blockchain...
              </>
            ) : (
              <>
                <span>📊</span>
                Build Chart from Onchain Data
              </>
            )}
          </button>

          <div className="p-4 bg-gray-800/50 border border-gray-700 rounded-lg">
            <h4 className="text-white font-medium mb-2">Data Sources:</h4>
            <ul className="space-y-1 text-sm text-gray-400">
              <li>• <span className="text-orange-400">Transaction Data:</span> Direct from Solana blockchain</li>
              <li>• <span className="text-orange-400">OHLCV:</span> Calculated from swap transactions</li>
              <li>• <span className="text-orange-400">Volume:</span> Aggregated from all detected swaps</li>
              <li>• <span className="text-orange-400">Metadata:</span> Extracted from Metaplex</li>
              <li>• <span className="text-orange-400">Chart:</span> TradingView lightweight charts widget</li>
            </ul>
          </div>

          {/* Chart Display */}
          {ohlcvCandles.length > 0 && (
            <div className="mt-6">
              <OnchainOHLCVChart 
                candles={ohlcvCandles} 
                tokenSymbol={ohlcvMetadata?.tokenMint?.slice(0, 8)} 
              />
              
              {/* Metadata Display */}
              {ohlcvMetadata && (
                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="text-xs text-gray-500">Total Swaps</div>
                    <div className="text-lg font-bold text-white">{ohlcvMetadata.totalSwaps}</div>
                  </div>
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="text-xs text-gray-500">Total Volume</div>
                    <div className="text-lg font-bold text-emerald-400">{ohlcvMetadata.totalVolume.toFixed(2)} SOL</div>
                  </div>
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="text-xs text-gray-500">Candles</div>
                    <div className="text-lg font-bold text-orange-400">{ohlcvCandles.length}</div>
                  </div>
                  <div className="p-3 bg-gray-800 border border-gray-700 rounded-lg">
                    <div className="text-xs text-gray-500">Timeframe</div>
                    <div className="text-lg font-bold text-purple-400">{ohlcvTimeframe}m</div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}
      </motion.div>

      {/* Active Telegram Monitors */}
      {campaignSource === 'telegram' && activeTelegramMonitors.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gray-800 border border-gray-700 rounded-xl p-6 mb-4"
        >
          <h3 className="text-lg font-bold text-white mb-4">Active Telegram Monitors ({activeTelegramMonitors.length})</h3>
          <div className="space-y-2">
            {activeTelegramMonitors.map((monitor: any) => (
              <div key={monitor.id} className="p-3 bg-gray-900 border border-gray-700 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-white font-medium">Chat: {monitor.chat_name || monitor.chat_id}</div>
                    <div className="text-sm text-gray-400">
                      {monitor.monitored_user_ids.length === 0 
                        ? 'Monitoring all users' 
                        : `Monitoring ${monitor.monitored_user_ids.length} user(s)`}
                      {monitor.exclude_no_username && ' • Excluding no-username'}
                      {!monitor.process_bot_messages && ' • Excluding bots'}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {monitor.active_campaigns} active campaign(s) • {monitor.test_lab_alerts.length} alert rule(s)
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`${config.apiUrl}/api/test-lab/telegram-monitor/stop`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          credentials: 'include',
                          body: JSON.stringify({ monitorId: monitor.id })
                        });
                        fetchActiveTelegramMonitors();
                        toast.success('Monitor stopped');
                      } catch (error) {
                        toast.error('Failed to stop monitor');
                      }
                    }}
                    className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-lg text-sm transition-colors"
                  >
                    Stop
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

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

      {/* Campaign Summary Modal - FIXED z-index to prevent cutoff */}
      <AnimatePresence>
        {showSummaryModal && campaignSummary && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSummaryModal(false)}
              className="fixed inset-0 bg-black/80 backdrop-blur-sm"
              style={{ zIndex: 9999 }}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="fixed inset-4 md:inset-8 lg:inset-16 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden"
              style={{ zIndex: 10000 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between p-6 border-b border-cyan-500/30 bg-gradient-to-r from-cyan-900/20 to-blue-900/20">
                <div>
                  <h2 className="text-2xl font-bold text-cyan-400 flex items-center gap-2">
                    🏆 Campaign Summary
                  </h2>
                  <p className="text-sm text-gray-400 mt-1">
                    Monitor ID: {campaignSummary.monitorId}
                  </p>
                </div>
                <button
                  onClick={() => setShowSummaryModal(false)}
                  className="p-2 hover:bg-cyan-500/10 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6 text-gray-400 hover:text-white" />
                </button>
              </div>

              {/* Scrollable Content */}
              <div className="overflow-y-auto h-[calc(100%-80px)] p-6">
                {/* Overview Stats Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="bg-gradient-to-br from-blue-900/30 to-cyan-900/20 border border-cyan-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Total Positions</div>
                    <div className="text-2xl font-bold text-white">{campaignSummary.overview.totalPositions}</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {campaignSummary.overview.closedPositions} closed / {campaignSummary.overview.openPositions} open
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-purple-900/30 to-blue-900/20 border border-purple-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Total Trades</div>
                    <div className="text-2xl font-bold text-white">{campaignSummary.overview.totalTrades}</div>
                  </div>

                  <div className="bg-gradient-to-br from-green-900/30 to-emerald-900/20 border border-green-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Total Invested</div>
                    <div className="text-2xl font-bold text-green-400">
                      {campaignSummary.overview.totalInvested.toFixed(4)} SOL
                    </div>
                  </div>

                  <div className={`bg-gradient-to-br ${campaignSummary.overview.totalPnl >= 0 ? 'from-green-900/30 to-emerald-900/20 border-green-500/30' : 'from-red-900/30 to-pink-900/20 border-red-500/30'} border rounded-xl p-4`}>
                    <div className="text-xs text-gray-400 mb-1">Total P/L</div>
                    <div className={`text-2xl font-bold ${campaignSummary.overview.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {campaignSummary.overview.totalPnl >= 0 ? '+' : ''}{campaignSummary.overview.totalPnl.toFixed(4)} SOL
                    </div>
                    <div className={`text-xs mt-1 ${campaignSummary.overview.overallRoi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {campaignSummary.overview.overallRoi >= 0 ? '+' : ''}{campaignSummary.overview.overallRoi.toFixed(2)}% ROI
                    </div>
                  </div>
                </div>

                {/* P/L Breakdown */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                  <div className="bg-gray-800/50 border border-green-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Realized P/L</div>
                    <div className={`text-xl font-bold ${campaignSummary.overview.totalRealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {campaignSummary.overview.totalRealizedPnl >= 0 ? '+' : ''}{campaignSummary.overview.totalRealizedPnl.toFixed(4)} SOL
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-yellow-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Unrealized P/L</div>
                    <div className={`text-xl font-bold ${campaignSummary.overview.totalUnrealizedPnl >= 0 ? 'text-yellow-400' : 'text-orange-400'}`}>
                      {campaignSummary.overview.totalUnrealizedPnl >= 0 ? '+' : ''}{campaignSummary.overview.totalUnrealizedPnl.toFixed(4)} SOL
                    </div>
                  </div>

                  <div className="bg-gray-800/50 border border-cyan-500/30 rounded-xl p-4">
                    <div className="text-xs text-gray-400 mb-1">Win Rate</div>
                    <div className="text-xl font-bold text-cyan-400">
                      {campaignSummary.overview.winRate.toFixed(1)}%
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      {campaignSummary.overview.winningPositions}W / {campaignSummary.overview.losingPositions}L
                    </div>
                  </div>
                </div>

                {/* Best/Worst Performers */}
                {(campaignSummary.bestPerformer || campaignSummary.worstPerformer) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                    {campaignSummary.bestPerformer && (
                      <div className="bg-gradient-to-br from-green-900/20 to-emerald-900/10 border border-green-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">🥇</span>
                          <div className="text-sm font-medium text-green-400">Best Performer</div>
                        </div>
                        <div className="font-mono text-lg text-white mb-1">
                          {campaignSummary.bestPerformer.tokenSymbol || campaignSummary.bestPerformer.tokenMint.slice(0, 8)}
                        </div>
                        <div className="text-2xl font-bold text-green-400">
                          +{campaignSummary.bestPerformer.totalPnl.toFixed(4)} SOL
                        </div>
                        <div className="text-sm text-green-300 mt-1">
                          +{campaignSummary.bestPerformer.roi.toFixed(2)}% ROI
                        </div>
                      </div>
                    )}

                    {campaignSummary.worstPerformer && (
                      <div className="bg-gradient-to-br from-red-900/20 to-pink-900/10 border border-red-500/30 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-2xl">📉</span>
                          <div className="text-sm font-medium text-red-400">Worst Performer</div>
                        </div>
                        <div className="font-mono text-lg text-white mb-1">
                          {campaignSummary.worstPerformer.tokenSymbol || campaignSummary.worstPerformer.tokenMint.slice(0, 8)}
                        </div>
                        <div className="text-2xl font-bold text-red-400">
                          {campaignSummary.worstPerformer.totalPnl.toFixed(4)} SOL
                        </div>
                        <div className="text-sm text-red-300 mt-1">
                          {campaignSummary.worstPerformer.roi.toFixed(2)}% ROI
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* All Tokens Table */}
                <div className="bg-gray-800/30 border border-cyan-500/30 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-cyan-500/30 bg-cyan-900/10">
                    <h3 className="text-lg font-bold text-cyan-400">All Positions ({campaignSummary.tokens?.length || 0})</h3>
                  </div>
                  {campaignSummary.tokens && campaignSummary.tokens.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-800/50 text-xs text-gray-400 uppercase">
                        <tr>
                          <th className="px-4 py-3 text-left">Token</th>
                          <th className="px-4 py-3 text-left">Status</th>
                          <th className="px-4 py-3 text-right">Invested</th>
                          <th className="px-4 py-3 text-right">Realized P/L</th>
                          <th className="px-4 py-3 text-right">Unrealized P/L</th>
                          <th className="px-4 py-3 text-right">Total P/L</th>
                          <th className="px-4 py-3 text-right">ROI</th>
                          <th className="px-4 py-3 text-center">Trades</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-700/50">
                        {campaignSummary.tokens.map((token, idx) => (
                          <tr key={idx} className="hover:bg-gray-800/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-mono text-sm text-white">
                                {token.tokenSymbol || token.tokenMint.slice(0, 8)}
                              </div>
                              <div className="text-xs text-gray-400 font-mono">
                                {token.tokenMint.slice(0, 12)}...
                              </div>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${
                                token.status === 'closed' 
                                  ? 'bg-gray-700 text-gray-300' 
                                  : 'bg-green-900/30 text-green-400'
                              }`}>
                                {token.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-mono text-sm text-gray-300">
                              {token.invested.toFixed(4)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-sm ${
                              token.realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {token.realizedPnl >= 0 ? '+' : ''}{token.realizedPnl.toFixed(4)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-sm ${
                              token.unrealizedPnl >= 0 ? 'text-yellow-400' : 'text-orange-400'
                            }`}>
                              {token.unrealizedPnl >= 0 ? '+' : ''}{token.unrealizedPnl.toFixed(4)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-sm font-bold ${
                              token.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {token.totalPnl >= 0 ? '+' : ''}{token.totalPnl.toFixed(4)}
                            </td>
                            <td className={`px-4 py-3 text-right font-mono text-sm ${
                              token.roi >= 0 ? 'text-green-400' : 'text-red-400'
                            }`}>
                              {token.roi >= 0 ? '+' : ''}{token.roi.toFixed(2)}%
                            </td>
                            <td className="px-4 py-3 text-center">
                              <div className="text-sm text-white">{token.totalTrades}</div>
                              <div className="text-xs text-gray-400">{token.buys}B / {token.sells}S</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  ) : (
                    <div className="p-8 text-center text-gray-400">
                      No positions to display
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
};
