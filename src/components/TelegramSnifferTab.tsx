import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { 
  MessageSquare, 
  Settings as SettingsIcon, 
  Bot, 
  User, 
  Radio, 
  Check, 
  Eye,
  EyeOff,
  X,
  Trash2,
  RefreshCw,
  Search,
  ExternalLink,
  Copy,
  Users,
  Shield,
  History,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Crown,
  LogOut,
  Brain,
  TrendingUp,
  Plus
} from 'lucide-react';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import TelegramChatHistory from './TelegramChatHistory';
import { TelegramPositionsDashboard } from './TelegramPositionsDashboard';
import { TelegramAutoTradeConfig } from './TelegramAutoTradeConfig';

interface TelegramAccount {
  configured: boolean;
  verified: boolean;
  connected?: boolean; // Live connection status
  apiId?: string;
  apiHash?: string;
  phoneNumber?: string;
  botToken?: string;
  botUsername?: string;
  lastConnectedAt?: number;
  isVerified?: boolean;
}

interface SnifferChat {
  id: number;
  chatId: string;
  chatName?: string;
  chatType?: string;
  username?: string | null;
  inviteLink?: string | null;
  isActive: boolean;
  monitoredUserIds?: number[];
  monitoredKeywords?: string[];
  forwardToChatId?: string;
  processBotMessages?: boolean;
  forwardAccountId?: number | null;
  monitoredTopicIds?: string[];
  action_on_detection?: string;
  autoTradeConfig?: any;
}

interface ContractDetection {
  id: number;
  chatId: string;
  chatName?: string;
  chatPhotoUrl?: string;
  chatType?: string;
  contractAddress: string;
  senderUsername?: string;
  detectionType: 'standard' | 'obfuscated' | 'split' | 'url';
  forwarded: boolean;
  forwardedTo?: string;
  detectedAt: number;
}

export function TelegramSnifferTab() {
  const { isAuthenticated } = useAuth();
  const { subscribe } = useWebSocket(`${config.wsUrl}/ws`);
  const [activeSection, setActiveSection] = useState<'sniffer' | 'monitored' | 'positions' | 'detections' | 'forwards' | 'traffic' | 'settings'>('sniffer');
  const [fetchProgress, setFetchProgress] = useState<{saved: number, total: number} | null>(null);
  const [userAccount, setUserAccount] = useState<TelegramAccount | null>(null);
  const [botAccount, setBotAccount] = useState<TelegramAccount | null>(null);
  const [availableChats, setAvailableChats] = useState<any[]>([]);
  const [snifferChats, setSnifferChats] = useState<SnifferChat[]>([]);
  const [selectedChats, setSelectedChats] = useState<Set<string>>(new Set());
  const [detections, setDetections] = useState<ContractDetection[]>([]);
  
  // Forwarding history and stats
  const [forwardingHistory, setForwardingHistory] = useState<any[]>([]);
  const [forwardingStats, setForwardingStats] = useState<any>(null);
  
  // Search and filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'group' | 'channel' | 'private'>('all');
  const [filterVerified, setFilterVerified] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  
  // Enhanced filters
  const [filterRole, setFilterRole] = useState<'all' | 'creator' | 'admin' | 'member'>('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'inactive'>('all');
  const [filterActivity, setFilterActivity] = useState<'all' | 'high' | 'medium' | 'low' | 'dead'>('all');
  const [filterHasContracts, setFilterHasContracts] = useState(false);
  const [filterUsername, setFilterUsername] = useState<'all' | 'with' | 'without'>('all');
  const [minMembers, setMinMembers] = useState(0);
  const [sortBy, setSortBy] = useState<'role' | 'members' | 'activity' | 'name'>('role');
  
  // Global Configuration Modal
  const [showGlobalConfigModal, setShowGlobalConfigModal] = useState(false);
  const [globalConfig, setGlobalConfig] = useState<{
    monitoredKeywords: string[];
    forwardDestinations: string[];
    duplicateStrategy: string;
    historyLimit: number;
  }>({
    monitoredKeywords: [],
    forwardDestinations: [],
    duplicateStrategy: 'first_only_no_backlog',
    historyLimit: 0
  });
  
  // Form states
  const [apiId, setApiId] = useState('');
  const [apiHash, setApiHash] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [botToken, setBotToken] = useState('');
  const [showApiHash, setShowApiHash] = useState(false);
  const [showBotToken, setShowBotToken] = useState(false);
  
  // Authentication flow states
  const [authStep, setAuthStep] = useState<'idle' | 'code_sent' | 'awaiting_2fa' | 'connected'>('idle');
  const [verificationCode, setVerificationCode] = useState('');
  const [twoFAPassword, setTwoFAPassword] = useState('');
  const [show2FAPassword, setShow2FAPassword] = useState(false);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info', text: string } | null>(null);
  const [includeAccountsInDelete, setIncludeAccountsInDelete] = useState(false);

  // Configuration modal states
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [configChat, setConfigChat] = useState<any | null>(null);
  const [configMonitorMode, setConfigMonitorMode] = useState<'all' | 'users' | 'keywords'>('all');
  const [configKeywords, setConfigKeywords] = useState('');
  const [configForwardTo, setConfigForwardTo] = useState('');
  const [configForwardAccountId, setConfigForwardAccountId] = useState<number | null>(null);
  const [configContractDetection, setConfigContractDetection] = useState(true);
  const [configInitialHistory, setConfigInitialHistory] = useState(0); // 0 = none, 1-10000 = limit, 999999 = all
  const [configDuplicateStrategy, setConfigDuplicateStrategy] = useState<string>('first_only_no_backlog');
  const [configProcessBotMessages, setConfigProcessBotMessages] = useState(false);
  
  // Topic monitoring
  const [availableTopics, setAvailableTopics] = useState<Array<{
    topicId: string;
    topicTitle: string;
    messageCount: number;
    uniqueSenders: number;
    contractsDetected: number;
    lastActivityTime: number;
  }>>([]);
  const [selectedTopicIds, setSelectedTopicIds] = useState<string[]>([]);
  const [monitorAllTopics, setMonitorAllTopics] = useState(true);
  const [loadingTopics, setLoadingTopics] = useState(false);
  
  // Multi-select forward destinations
  const [availableForwardTargets, setAvailableForwardTargets] = useState<Array<any>>([]);
  const [selectedForwardDestinations, setSelectedForwardDestinations] = useState<Array<{ 
    targetChatId: string; 
    targetChatName: string; 
    forwardAccountId?: number | null;
  }>>([]);
  const [forwardTargetFilter, setForwardTargetFilter] = useState('');
  const [showForwardDropdown, setShowForwardDropdown] = useState(false);
  
  // Multi-select user targeting
  const [availableUsers, setAvailableUsers] = useState<Array<any>>([]);
  const [selectedUsers, setSelectedUsers] = useState<Array<{
    userId: string;
    displayName: string;
    username?: string;
    isBot?: boolean;
  }>>([]);
  const [userFilter, setUserFilter] = useState('');
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  
  // Available telegram accounts for forwarding
  const [telegramAccounts, setTelegramAccounts] = useState<Array<{ id: number; name: string; phone?: string }>>([]);

  // Chat history viewing state
  const [selectedHistoryChat, setSelectedHistoryChat] = useState<{id: string, name: string, username?: string} | null>(null);
  
  // Traffic monitoring states
  const [trafficMetrics, setTrafficMetrics] = useState<any>(null);
  const [trafficReport, setTrafficReport] = useState<any>(null);
  const [trafficReportPeriod, setTrafficReportPeriod] = useState(60);
  
  // Auto-trade configuration states
  const [autoTradeModalOpen, setAutoTradeModalOpen] = useState(false);
  const [autoTradeChat, setAutoTradeChat] = useState<any | null>(null);
  const [tradingWallets, setTradingWallets] = useState<any[]>([]);

  // Auto-trade configuration states for Configure Monitoring modal
  const [configActionOnDetection, setConfigActionOnDetection] = useState<string>('forward_only');
  const [configAutoBuyAmount, setConfigAutoBuyAmount] = useState<number>(0.1);
  const [configAutoBuyWalletId, setConfigAutoBuyWalletId] = useState<number | null>(null);
  const [configAutoBuySlippage, setConfigAutoBuySlippage] = useState<number>(1000); // basis points
  const [configAutoBuyPriority, setConfigAutoBuyPriority] = useState<string>('medium');
  const [configStopLoss, setConfigStopLoss] = useState<number>(50);
  const [configTakeProfit, setConfigTakeProfit] = useState<number>(100);
  const [configTrailingStop, setConfigTrailingStop] = useState<number>(0);
  const [configTrailingStopEnabled, setConfigTrailingStopEnabled] = useState<boolean>(false);
  const [configMonitorDuration, setConfigMonitorDuration] = useState<number>(24);
  const [configAlertThreshold, setConfigAlertThreshold] = useState<number>(50);
  
  // Comprehensive alerts (like Test Lab)
  const [configAlerts, setConfigAlerts] = useState<any[]>([]);
  const [showComprehensiveAlerts, setShowComprehensiveAlerts] = useState<boolean>(false);
  const [newAlertPercent, setNewAlertPercent] = useState<string>('');
  const [newAlertDirection, setNewAlertDirection] = useState<'above' | 'below'>('above');
  const [newAlertPriceType, setNewAlertPriceType] = useState<'percentage' | 'exact_sol' | 'exact_usd'>('percentage');

  // Fetch trading wallets for auto-trade configuration (following Fetcher pattern)
  const fetchTradingWallets = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/trading/wallets`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        // API returns { wallets: [...] } structure, same as Fetcher
        const wallets = data.wallets || [];
        setTradingWallets(wallets);
      } else {
        console.error('Failed to fetch wallets, status:', response.status);
        setTradingWallets([]);
      }
    } catch (error) {
      console.error('Failed to fetch trading wallets:', error);
      setTradingWallets([]);
    }
  };

  // Load available forward targets when modal opens
  const loadAvailableForwardTargets = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/forward-destinations/available-targets`, {
        credentials: 'include'
      });
      if (response.ok) {
        const targets = await response.json();
        setAvailableForwardTargets(targets);
      }
    } catch (error) {
      console.error('Failed to load forward targets:', error);
    }
  };
  
  // Load existing forward destinations for a chat
  const loadForwardDestinations = async (chatId: string) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/forward-destinations/destinations/${chatId}`, {
        credentials: 'include'
      });
      if (response.ok) {
        const destinations = await response.json();
        setSelectedForwardDestinations(destinations.map((d: any) => ({
          targetChatId: d.target_chat_id,
          targetChatName: d.target_chat_name || d.target_chat_id,
          forwardAccountId: d.forward_account_id
        })));
      }
    } catch (error) {
      console.error('Failed to load forward destinations:', error);
    }
  };

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.forward-dropdown-container')) {
        setShowForwardDropdown(false);
      }
    };

    if (showForwardDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showForwardDropdown]);

  // WebSocket listeners for chat fetch progress
  useEffect(() => {
    const unsubscribe1 = subscribe('telegram_chat_fetch_started', () => {
      setFetchProgress({ saved: 0, total: 0 });
      setMessage({ type: 'info', text: 'Fetching chats from Telegram...' });
    });

    const unsubscribe2 = subscribe('telegram_chat_fetch_fetched', (data: any) => {
      setFetchProgress({ saved: 0, total: data.totalChats });
      setMessage({ type: 'info', text: `Fetched ${data.totalChats} chats, saving to database...` });
    });

    const unsubscribe3 = subscribe('telegram_chat_fetch_progress', (data: any) => {
      setFetchProgress({ saved: data.saved, total: data.total });
      loadSnifferChats(); // Reload chat list
    });

    const unsubscribe4 = subscribe('telegram_chat_fetch_complete', (data: any) => {
      setFetchProgress(null);
      setMessage({ type: 'success', text: `Successfully saved ${data.savedCount}/${data.totalChats} chats!` });
      loadSnifferChats();
      setLoading(false);
    });

    // Subscribe to real-time contract detections
    const unsubscribe5 = subscribe('telegram_detection', (data: any) => {
      console.log('🔔 Real-time detection received:', data);
      // Add new detection to the top of the list
      setDetections(prev => [{
        id: Date.now(), // Temporary ID until we reload from DB
        chatId: data.chatId,
        chatName: data.chatName,
        contractAddress: data.contract,
        senderUsername: data.username,
        detectionType: data.type,
        forwarded: data.forwarded || false,
        forwardedTo: data.forwardedTo,
        detectedAt: data.timestamp
      }, ...prev]);
      
      // Show notification
      setMessage({ 
        type: 'success', 
        text: `New ${data.type} contract detected: ${data.contract.substring(0, 8)}...` 
      });
    });

    const unsubscribe6 = subscribe('telegram_chat_fetch_error', (data: any) => {
      setFetchProgress(null);
      setMessage({ type: 'error', text: `Error: ${data.error}` });
      setLoading(false);
    });

    // Subscribe to forwarding events
    const unsubscribe7 = subscribe('telegram_forward_logged', (data: any) => {
      console.log('📤 Forward event received:', data);
      // Reload forwarding history when new forward happens
      if (activeSection === 'forwards') {
        loadForwardingHistory();
      }
    });

    return () => {
      unsubscribe1();
      unsubscribe2();
      unsubscribe3();
      unsubscribe4();
      unsubscribe5();
      unsubscribe6();
      unsubscribe7();
    };
  }, [subscribe, activeSection]);

  // WebSocket listeners for metadata and status updates
  useEffect(() => {
    const unsubMetadata = subscribe('metadata_update', (data: any) => {
      setAvailableChats(prev => prev.map(chat => 
        chat.chatId === data.chatId 
          ? { ...chat, ...data.metadata }
          : chat
      ));
    });
    
    const unsubStatus = subscribe('chat_status_update', (data: any) => {
      setAvailableChats(prev => prev.map(chat => 
        chat.chatId === data.chatId 
          ? { ...chat, isActive: data.isActive }
          : chat
      ));
    });
    
    const unsubContracts = subscribe('telegram_contract_detected', (data: any) => {
      setAvailableChats(prev => prev.map(chat => 
        chat.chatId === data.chatId 
          ? { ...chat, contractsDetected30d: (chat.contractsDetected30d || 0) + 1 }
          : chat
      ));
    });

    // Subscribe to position updates for auto-trading
    const unsubscribePositionCreated = subscribe('telegram_position_created', (data: any) => {
      setMessage({ type: 'success', text: `New position: ${data.token_symbol || data.token_mint?.slice(0, 8) || 'Unknown'}...` });
    });

    const unsubscribeTradeExecuted = subscribe('telegram_trade_executed', (data: any) => {
      const action = data.trade_type === 'buy' ? '🟢 Bought' : '🔴 Sold';
      setMessage({ type: 'success', text: `${action} ${data.token_symbol || ''}` });
    });

    const unsubscribePositionClosed = subscribe('telegram_position_closed', (data: any) => {
      const emoji = data.roi_percent > 0 ? '🎉' : '😔';
      setMessage({ 
        type: data.roi_percent > 0 ? 'success' : 'error', 
        text: `${emoji} Position closed: ${data.roi_percent > 0 ? '+' : ''}${data.roi_percent?.toFixed(2)}% ROI` 
      });
    });
    
    return () => {
      unsubMetadata();
      unsubStatus();
      unsubContracts();
      unsubscribePositionCreated();
      unsubscribeTradeExecuted();
      unsubscribePositionClosed();
    };
  }, [subscribe]);

  // Load account status and chats when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      loadAccountStatus();
      loadSnifferChats(); 
      loadDetections();
      loadTelegramAccounts();
      fetchTradingWallets();
    }
  }, [isAuthenticated]);

  const loadAccountStatus = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/status`, {
        credentials: 'include' // Send cookies for authentication
      });

      if (response.ok) {
        const data = await response.json();
        setUserAccount(data.userAccount);
        setBotAccount(data.botAccount);
      }
    } catch (error) {
      console.error('Failed to load account status:', error);
    }
  };

  const loadTelegramAccounts = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/accounts`, {
        credentials: 'include'
      });

      if (response.ok) {
        const accounts = await response.json();
        setTelegramAccounts(accounts);
      }
    } catch (error) {
      console.error('Failed to load telegram accounts:', error);
    }
  };

  const loadSnifferChats = async () => {
    try {
      if (!isAuthenticated) return;

      // Load ALL chats for Available Chats section
      const allChatsResponse = await fetch(`${config.apiUrl}/api/telegram/all-chats`, {
        credentials: 'include'
      });

      if (allChatsResponse.ok) {
        const allChats = await allChatsResponse.json();
        setAvailableChats(allChats.map((chat: any) => ({
          ...chat,
          id: chat.chatId
        })));
      }

      // Load active chats for Sniffers section
      const activeChatsResponse = await fetch(`${config.apiUrl}/api/telegram/monitored-chats`, {
        credentials: 'include'
      });

      if (activeChatsResponse.ok) {
        const activeChats = await activeChatsResponse.json();
        setSnifferChats(activeChats);
      }
    } catch (error) {
      console.error('Failed to load chats:', error);
    }
  };

  const loadDetections = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/detections`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setDetections(data);
      }
    } catch (error) {
      console.error('Failed to load detections:', error);
    }
  };

  const loadForwardingHistory = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/forwarding/history?limit=50`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setForwardingHistory(data.history || []);
      }
    } catch (error) {
      console.error('Failed to load forwarding history:', error);
    }
  };

  const loadForwardingStats = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/forwarding/stats?days=7`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setForwardingStats(data);
      }
    } catch (error) {
      console.error('Failed to load forwarding stats:', error);
    }
  };

  const handleSaveUserAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const response = await fetch(`${config.apiUrl}/api/telegram/user-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          apiId,
          apiHash,
          phoneNumber
        })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'User account configured successfully! Click "Start Authentication" to connect.' });
        await loadAccountStatus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to save account' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleStartAuth = async () => {
    setLoading(true);
    setMessage(null);
    setAuthStep('idle');

    try {
      if (!isAuthenticated) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const response = await fetch(`${config.apiUrl}/api/telegram/user-account/start-auth`, {
        method: 'POST',
        credentials: 'include'
      });

      const data = await response.json();
      
      if (data.success) {
        if (data.status === 'connected') {
          setAuthStep('connected');
          setMessage({ type: 'success', text: `Already authenticated! Welcome ${data.user.firstName}` });
          await loadAccountStatus();
        } else if (data.status === 'code_sent') {
          setAuthStep('code_sent');
          setMessage({ type: 'info', text: data.message });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to start authentication' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/user-account/verify-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ code: verificationCode })
      });

      const data = await response.json();
      
      if (data.success) {
        if (data.status === 'connected') {
          setAuthStep('connected');
          setMessage({ type: 'success', text: `Successfully authenticated! Welcome ${data.user.firstName}` });
          await loadAccountStatus();
          setVerificationCode('');
        } else if (data.status === 'awaiting_2fa') {
          setAuthStep('awaiting_2fa');
          setMessage({ type: 'info', text: data.message });
        }
      } else {
        setMessage({ type: 'error', text: data.error || 'Invalid verification code' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/user-account/verify-2fa`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ password: twoFAPassword })
      });

      const data = await response.json();
      
      if (data.success && data.status === 'connected') {
        setAuthStep('connected');
        setMessage({ type: 'success', text: `Successfully authenticated with 2FA! Welcome ${data.user.firstName}` });
        await loadAccountStatus();
        setTwoFAPassword('');
      } else {
        setMessage({ type: 'error', text: data.error || 'Invalid 2FA password' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSaveBotAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) {
        setMessage({ type: 'error', text: 'Not authenticated' });
        return;
      }

      const response = await fetch(`${config.apiUrl}/api/telegram/bot-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ botToken })
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Bot account configured successfully!' });
        await loadAccountStatus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to save bot account' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyBot = async () => {
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/bot-account/verify`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setMessage({ type: 'success', text: `Bot verified: @${data.botUsername}` });
        await loadAccountStatus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to verify bot' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkDelete = async (mode: 'selected' | 'all') => {
    const confirmMsg = mode === 'all' 
      ? `Delete ALL ${availableChats.length} chats from our database?` 
      : `Delete ${selectedChats.size} selected chats from our database?`;
    
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats/bulk-delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          chatIds: mode === 'all' ? 'all' : Array.from(selectedChats)
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setSelectedChats(new Set());
        loadSnifferChats();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete chats' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleBulkLeaveTelegram = async () => {
    if (selectedChats.size === 0) return;
    
    const confirmMsg = `⚠️ LEAVE ${selectedChats.size} chats from your Telegram account?\n\nThis will:\n- Remove you from these channels/groups\n- Delete private conversations\n- Cannot be undone!`;
    
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/bulk-leave-telegram`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ 
          chatIds: Array.from(selectedChats)
        })
      });

      const data = await response.json();
      if (data.success) {
        setMessage({ 
          type: 'success', 
          text: `${data.message}. Successfully left: ${data.successful.length}, Failed: ${data.failed.length}` 
        });
        setSelectedChats(new Set());
        // Reload the chat list
        loadSnifferChats();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to leave chats' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleApplyGlobalConfig = async () => {
    if (selectedChats.size === 0) return;

    setLoading(true);
    try {
      const selectedChatIds = Array.from(selectedChats);
      let successCount = 0;
      let failCount = 0;

      // Apply configuration to each selected chat
      for (const chatId of selectedChatIds) {
        try {
          const chatData = availableChats.find(c => c.chatId === chatId);
          if (!chatData) continue;

          const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              chatId,
              chatName: chatData.chatName,
              chatType: chatData.chatType,
              monitoredKeywords: globalConfig.monitoredKeywords,
              initialHistoryLimit: globalConfig.historyLimit
            })
          });

          if (response.ok) {
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          failCount++;
        }
      }

      setMessage({
        type: 'success',
        text: `Applied configuration to ${successCount} chats${failCount > 0 ? `, ${failCount} failed` : ''}`
      });
      
      setSelectedChats(new Set());
      setShowGlobalConfigModal(false);
      loadSnifferChats();
      
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleFetchChats = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/fetch-chats`, {
        method: 'POST',
        credentials: 'include'
      });
      const data = await response.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        // Set available chats from the response
        if (data.chats) {
          setAvailableChats(data.chats.map((chat: any) => ({
            ...chat,
            id: chat.chatId, // Use chatId as id for consistency
            isActive: false // Default to inactive for new chats
          })));
        }
        loadSnifferChats();
        // Switch to sniffer tab to show fetched chats
        setActiveSection('sniffer');
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to fetch chats' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUserAccount = async () => {
    if (!confirm('Are you sure you want to disconnect your Telegram user account? You will need to re-authenticate to use it again.')) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/user-account`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'User account disconnected successfully' });
        // Reset form fields
        setApiId('');
        setApiHash('');
        setPhoneNumber('');
        setVerificationCode('');
        setTwoFAPassword('');
        setAuthStep('idle');
        await loadAccountStatus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to disconnect account' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteBotAccount = async () => {
    if (!confirm('Are you sure you want to remove your Telegram bot account?')) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/bot-account`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Bot account removed successfully' });
        setBotToken('');
        await loadAccountStatus();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to remove bot account' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  // Filter and search chats
  const filteredChats = useMemo(() => {
    let filtered = availableChats.filter(chat => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          chat.chatName?.toLowerCase().includes(query) ||
          chat.username?.toLowerCase().includes(query) ||
          chat.chatId.toLowerCase().includes(query) ||
          chat.description?.toLowerCase().includes(query);
        if (!matchesSearch) return false;
      }
      
      // Type filter
      if (filterType !== 'all' && chat.chatType !== filterType) {
        return false;
      }
      
      // Role filter
      if (filterRole !== 'all') {
        if (filterRole === 'creator' && !chat.isCreator) return false;
        if (filterRole === 'admin' && !chat.isAdmin) return false;
        if (filterRole === 'member' && !chat.isMember) return false;
      }
      
      // Status filter
      if (filterStatus !== 'all') {
        if (filterStatus === 'active' && !chat.isActive) return false;
        if (filterStatus === 'inactive' && chat.isActive) return false;
      }
      
      // Activity filter
      if (filterActivity !== 'all') {
        const msgsPerDay = chat.avgMessagesPerDay || 0;
        if (filterActivity === 'high' && msgsPerDay < 100) return false;
        if (filterActivity === 'medium' && (msgsPerDay < 10 || msgsPerDay >= 100)) return false;
        if (filterActivity === 'low' && (msgsPerDay === 0 || msgsPerDay >= 10)) return false;
        if (filterActivity === 'dead' && msgsPerDay > 0) return false;
      }
      
      // Has contracts filter
      if (filterHasContracts && (!chat.contractsDetected30d || chat.contractsDetected30d === 0)) {
        return false;
      }
      
      // Min members filter
      if (minMembers > 0 && (!chat.memberCount || chat.memberCount < minMembers)) {
        return false;
      }
      
      // Verified filter
      if (filterVerified && !chat.isVerified) {
        return false;
      }
      
      // Username filter
      if (filterUsername !== 'all') {
        if (filterUsername === 'with' && !chat.username) return false;
        if (filterUsername === 'without' && chat.username) return false;
      }
      
      return true;
    });
    
    // Sort results
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'role':
          const roleValue = (c: any) => c.isCreator ? 3 : c.isAdmin ? 2 : c.isMember ? 1 : 0;
          return roleValue(b) - roleValue(a);
        case 'members':
          return (b.memberCount || 0) - (a.memberCount || 0);
        case 'activity':
          return (b.avgMessagesPerDay || 0) - (a.avgMessagesPerDay || 0);
        case 'name':
        default:
          return (a.chatName || '').localeCompare(b.chatName || '');
      }
    });
    return filtered;
  }, [availableChats, searchQuery, filterType, filterRole, filterStatus, filterActivity, filterHasContracts, minMembers, filterVerified, filterUsername, sortBy]);
  
  // Load chats and detections when switching sections
  useEffect(() => {
    if (activeSection === 'monitored') {
      loadSnifferChats();
    } else if (activeSection === 'detections') {
      loadDetections();
    } else if (activeSection === 'sniffer') {
      // Load available chats if we have them
      if (availableChats.length === 0) {
        loadSnifferChats(); // For now, show sniffer chats in the sniffer too
      }
    } else if (activeSection === 'forwards') {
      loadForwardingHistory();
      loadForwardingStats();
    }
  }, [activeSection]);

  return (
    <>
      <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <MessageSquare className="w-8 h-8 text-cyan-400" />
          <h2 className="text-3xl font-bold text-cyan-400">Telegram Sniffer</h2>
        </div>
        <p className="text-gray-400">Monitor Telegram chats for contract addresses and trading signals</p>
      </div>

      {/* Message Banner */}
      {message && (
        <div className={`mb-4 p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-500/10 border-green-500/30 text-green-400'
            : message.type === 'info'
            ? 'bg-blue-500/10 border-blue-500/30 text-blue-400'
            : 'bg-red-500/10 border-red-500/30 text-red-400'
        }`}>
          {message.text}
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-cyan-500/20">
        <button
          onClick={() => setActiveSection('sniffer')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'sniffer' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Available Chats ({availableChats.length})
        </button>
        <button
          onClick={() => setActiveSection('monitored')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'monitored' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Active Sniffers ({snifferChats.filter(c => c.isActive).length})
        </button>
        <button
          onClick={() => setActiveSection('detections')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'detections' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Detections ({detections.length})
        </button>
        <button
          onClick={() => setActiveSection('positions')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'positions' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Positions 💹
        </button>
        <button
          onClick={() => setActiveSection('forwards')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'forwards' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Forwards 📤
        </button>
        <button
          onClick={() => setActiveSection('traffic')}
          className={`px-6 py-3 font-medium transition-all ${
            activeSection === 'traffic' 
              ? 'text-cyan-400 border-b-2 border-cyan-400' 
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          Traffic 📊
        </button>
        <button
          onClick={() => setActiveSection('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeSection === 'settings'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          Settings
        </button>
      </div>

      {/* Content */}
      {/* Main Sniffer Interface */}
      {activeSection === 'sniffer' && (
        <div className="space-y-6">
          {/* Admin/Creator Stats Bar */}
          <div className="bg-gradient-to-r from-yellow-500/10 to-purple-500/10 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              <div>
                <div className="text-2xl font-bold text-white">{availableChats.length}</div>
                <div className="text-xs text-gray-400">Total Chats</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-yellow-400">{availableChats.filter(c => c.isCreator).length}</div>
                <div className="text-xs text-gray-400">👑 Creator</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-purple-400">{availableChats.filter(c => c.isAdmin && !c.isCreator).length}</div>
                <div className="text-xs text-gray-400">🛡️ Admin</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-400">{availableChats.filter(c => c.isActive).length}</div>
                <div className="text-xs text-gray-400">Active</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-orange-400">{availableChats.filter(c => c.contractsDetected30d > 0).length}</div>
                <div className="text-xs text-gray-400">w/ CAs</div>
              </div>
            </div>
          </div>
          
          {/* Status Bar */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${userAccount?.connected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                  <span className="text-sm text-gray-400">
                    {userAccount?.connected ? 'Connected' : 'Not Connected'}
                  </span>
                </div>
                {userAccount?.connected && (
                  <span className="text-sm text-gray-400">
                    Monitoring: <span className="text-cyan-400 font-bold">{snifferChats.filter((c: any) => c.isActive).length}</span> active chats
                  </span>
                )}
              </div>
              
              {/* Fetch Chats Button */}
              <button
                onClick={handleFetchChats}
                disabled={loading || !userAccount?.verified}
                className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Fetch All Chats
              </button>

              {/* Real-time Progress Indicator */}
              {fetchProgress && (
                <div className="mt-3 p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs text-cyan-300">
                      {fetchProgress.total > 0 
                        ? `Saving chats: ${fetchProgress.saved} / ${fetchProgress.total}` 
                        : 'Fetching from Telegram...'}
                    </span>
                    <span className="text-xs text-cyan-400 font-medium">
                      {fetchProgress.total > 0 
                        ? `${Math.round((fetchProgress.saved / fetchProgress.total) * 100)}%`
                        : '...'}
                    </span>
                  </div>
                  {fetchProgress.total > 0 && (
                    <div className="w-full bg-black/30 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-gradient-to-r from-cyan-500 to-blue-500 h-full transition-all duration-300"
                        style={{ width: `${(fetchProgress.saved / fetchProgress.total) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4 mb-4">
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Search Bar */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats by name, username, ID..."
                  className="w-full pl-10 pr-4 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                />
              </div>
              
              {/* Enhanced Filters */}
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Types</option>
                  <option value="group">Groups</option>
                  <option value="channel">Channels</option>
                  <option value="private">Private</option>
                </select>
                
                <select
                  value={filterRole}
                  onChange={(e) => setFilterRole(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Roles</option>
                  <option value="creator">👑 Creator</option>
                  <option value="admin">🛡️ Admin</option>
                  <option value="member">👤 Member</option>
                </select>
                
                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Status</option>
                  <option value="active">🟢 Active</option>
                  <option value="inactive">⭕ Inactive</option>
                </select>
                
                <select
                  value={filterActivity}
                  onChange={(e) => setFilterActivity(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Activity</option>
                  <option value="high">🔥 High</option>
                  <option value="medium">📊 Medium</option>
                  <option value="low">📉 Low</option>
                  <option value="dead">💀 Dead</option>
                </select>
                
                <button
                  onClick={() => setFilterHasContracts(!filterHasContracts)}
                  className={`px-3 py-2 rounded-lg border text-sm transition-all ${
                    filterHasContracts 
                      ? 'bg-orange-500/20 border-orange-500/40 text-orange-400' 
                      : 'bg-black/40 border-cyan-500/30 text-gray-400'
                  }`}
                >
                  Has CAs
                </button>
                
                <select
                  value={filterUsername}
                  onChange={(e) => setFilterUsername(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Usernames</option>
                  <option value="with">@ With Username</option>
                  <option value="without">⭕ Without Username</option>
                </select>
                
                <button
                  onClick={() => setFilterVerified(!filterVerified)}
                  className={`px-3 py-2 rounded-lg border transition-all ${
                    filterVerified 
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' 
                      : 'bg-black/40 border-cyan-500/30 text-gray-400 hover:text-cyan-400'
                  }`}
                >
                  <Check className="w-4 h-4" />
                  <span className="ml-2">Verified Only</span>
                </button>
                
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className={`px-3 py-2 rounded-lg border transition-all ${
                    showDetails 
                      ? 'bg-cyan-500/20 border-cyan-500/40 text-cyan-400' 
                      : 'bg-black/40 border-cyan-500/30 text-gray-400 hover:text-cyan-400'
                  }`}
                >
                  <Eye className="w-4 h-4" />
                  <span className="ml-2">Details</span>
                </button>
                
                {/* Min Members Filter */}
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4 text-gray-400" />
                  <input
                    type="number"
                    value={minMembers}
                    onChange={(e) => setMinMembers(parseInt(e.target.value) || 0)}
                    placeholder="Min"
                    className="w-20 px-2 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                    min="0"
                  />
                </div>
                
                {/* Sort By Selector */}
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="role">Sort: Role</option>
                  <option value="members">Sort: Members</option>
                  <option value="activity">Sort: Activity</option>
                  <option value="name">Sort: Name</option>
                </select>
              </div>
            </div>
            
            {/* Results Counter */}
            <div className="mt-3 text-sm text-gray-400">
              Showing {filteredChats.length} of {availableChats.length} chats
              {searchQuery && ` matching "${searchQuery}"`}
            </div>
          </div>

          {/* Available Chats Section */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-cyan-300">Available Chats</h3>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    if (selectedChats.size === filteredChats.length) {
                      setSelectedChats(new Set());
                    } else {
                      setSelectedChats(new Set(filteredChats.map(c => c.chatId)));
                    }
                  }}
                  className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded-lg text-purple-400 text-sm font-medium transition-all"
                >
                  {selectedChats.size === filteredChats.length ? 'Deselect All' : 'Select All'}
                </button>
                {selectedChats.size > 0 && (
                  <>
                    <button
                      onClick={handleBulkLeaveTelegram}
                      className="px-3 py-1 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-orange-400 text-sm font-medium transition-all"
                      title="Leave these chats from your Telegram account"
                    >
                      <LogOut className="w-3 h-3 inline mr-1" />
                      Leave from Telegram ({selectedChats.size})
                    </button>
                    <button
                      onClick={() => handleBulkDelete('selected')}
                      className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
                      title="Remove from our database only"
                    >
                      <Trash2 className="w-3 h-3 inline mr-1" />
                      Delete from DB ({selectedChats.size})
                    </button>
                    <button
                      onClick={() => setShowGlobalConfigModal(true)}
                      className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 text-sm font-medium transition-all"
                      title="Apply same configuration to all selected chats"
                    >
                      <SettingsIcon className="w-3 h-3 inline mr-1" />
                      Global Config ({selectedChats.size})
                    </button>
                  </>
                )}
                {availableChats.length > 0 && (
                  <button
                    onClick={() => handleBulkDelete('all')}
                    className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
                  >
                    <Trash2 className="w-3 h-3 inline mr-1" />
                    Delete All ({availableChats.length})
                  </button>
                )}
              </div>
            </div>

            {!userAccount?.verified ? (
              <div className="text-center py-12 text-gray-400">
                <User className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>Connect your Telegram account first</p>
                <p className="text-sm mt-2">Go to Settings tab to configure your account</p>
              </div>
            ) : availableChats.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No chats loaded</p>
                <p className="text-sm mt-2">Click "Fetch All Chats" to load your Telegram conversations</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[600px] overflow-y-auto">
                {filteredChats.map((chat) => {
                  const isSelected = selectedChats.has(chat.chatId);
                  const isSniffer = snifferChats.some(m => m.chatId === chat.chatId && m.isActive);
                  
                  return (
                    <div
                      key={chat.chatId}
                      className={`bg-black/40 border rounded-lg p-4 transition-all cursor-pointer ${
                        isSelected 
                          ? 'border-purple-500/40 shadow-lg shadow-purple-500/10' 
                          : 'border-cyan-500/10 hover:border-cyan-500/20'
                      }`}
                      onClick={() => {
                        const newSelected = new Set(selectedChats);
                        if (isSelected) {
                          newSelected.delete(chat.chatId);
                        } else {
                          newSelected.add(chat.chatId);
                        }
                        setSelectedChats(newSelected);
                      }}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3 flex-1">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            className="mt-1 w-4 h-4 text-purple-600 bg-black/40 border-purple-500/40 rounded focus:ring-purple-500 focus:ring-2"
                          />
                          
                          {/* Profile Photo or Icon */}
                          {chat.photoUrl ? (
                            <img 
                              src={chat.photoUrl} 
                              alt={chat.chatName}
                              className="w-12 h-12 rounded-lg object-cover"
                            />
                          ) : (
                            <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                              chat.chatType === 'channel' ? 'bg-purple-500/20' : 
                              chat.chatType === 'bot' ? 'bg-blue-500/20' : 
                              'bg-cyan-500/20'
                            }`}>
                              {chat.chatType === 'channel' ? (
                                <Radio className="w-6 h-6 text-purple-400" />
                              ) : chat.chatType === 'bot' ? (
                                <Bot className="w-6 h-6 text-blue-400" />
                              ) : (
                                <MessageSquare className="w-6 h-6 text-cyan-400" />
                              )}
                            </div>
                          )}
                          
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-white">
                                {chat.chatName || chat.chatId}
                              </h4>
                              {chat.isCreator && (
                                <span className="px-1.5 py-0.5 bg-yellow-500/20 border border-yellow-500/40 rounded text-yellow-400 text-xs font-bold flex items-center gap-1">
                                  <Crown className="w-3 h-3" /> CREATOR
                                </span>
                              )}
                              {chat.isAdmin && !chat.isCreator && (
                                <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/40 rounded text-purple-400 text-xs font-bold flex items-center gap-1">
                                  <Shield className="w-3 h-3" /> ADMIN
                                </span>
                              )}
                              {chat.chatType === 'bot' && (
                                <span className="px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded text-blue-400 text-xs font-bold flex items-center gap-1">
                                  <Bot className="w-3 h-3" /> BOT
                                </span>
                              )}
                              {chat.isVerified && (
                                <span title="Verified">
                                  <Shield className="w-4 h-4 text-blue-400" />
                                </span>
                              )}
                              {isSniffer && (
                                <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold">
                                  MONITORING
                                </span>
                              )}
                              {chat.contractsDetected30d > 0 && (
                                <span className="px-2 py-0.5 bg-orange-500/20 border border-orange-500/30 rounded text-orange-400 text-xs font-bold">
                                  {chat.contractsDetected30d} CAs
                                </span>
                              )}
                            </div>
                            
                            {/* Primary Stats Row */}
                            <div className="flex flex-wrap items-center gap-3 mb-2">
                              <span className="text-xs text-gray-400">{chat.chatType}{chat.chatSubtype ? ` • ${chat.chatSubtype}` : ''}</span>
                              {chat.username && (
                                <span className="text-xs text-cyan-400">@{chat.username}</span>
                              )}
                              <span className="text-xs text-gray-500" title="Chat ID">ID: {chat.chatId}</span>
                              {chat.memberCount > 0 && (
                                <span className="text-xs text-gray-400 flex items-center gap-1">
                                  <Users className="w-3 h-3" />
                                  {chat.memberCount?.toLocaleString() || chat.participantsCount?.toLocaleString()}
                                  {chat.onlineCount > 0 && (
                                    <span className="text-green-400"> ({chat.onlineCount.toLocaleString()} online)</span>
                                  )}
                                </span>
                              )}
                              {chat.isScam && (
                                <span className="text-xs text-red-400">⚠ Scam</span>
                              )}
                            </div>
                            
                            {/* Activity Insights */}
                            {(chat.avgMessagesPerDay || chat.peakActivityHour !== undefined || chat.botPercentage > 0) && (
                              <div className="flex flex-wrap items-center gap-3 text-xs mb-2">
                                {chat.avgMessagesPerDay > 0 && (
                                  <span className="text-gray-400">
                                    📊 {Math.round(chat.avgMessagesPerDay)} msgs/day
                                  </span>
                                )}
                                {chat.peakActivityHour !== undefined && (
                                  <span className="text-gray-400">
                                    🕐 Peak: {chat.peakActivityHour}:00
                                  </span>
                                )}
                                {chat.botPercentage > 0 && (
                                  <span className={`${chat.botPercentage > 50 ? 'text-orange-400' : 'text-gray-400'}`}>
                                    🤖 {Math.round(chat.botPercentage)}% bots
                                  </span>
                                )}
                                {chat.lastMessageDate && (
                                  <span className="text-gray-400">
                                    Last active: {new Date(chat.lastMessageDate * 1000).toLocaleDateString()}
                                  </span>
                                )}
                              </div>
                            )}
                            
                            {/* Description Preview */}
                            {chat.description && (
                              <p className="text-xs text-gray-400 line-clamp-2 mb-2">
                                {chat.description}
                              </p>
                            )}
                            
                            {/* Quick Actions Row */}
                            <div className="flex items-center gap-2 mt-2">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setSelectedHistoryChat({
                                    id: chat.chatId,
                                    name: chat.chatName || chat.chatId,
                                    username: chat.username
                                  });
                                }}
                                className="text-xs text-green-400 hover:text-green-300 flex items-center gap-1 transition-colors"
                                title="View real-time messages"
                              >
                                <History className="w-3 h-3" />
                                History
                              </button>
                              {chat.inviteLink && (
                                <>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      window.open(chat.inviteLink, '_blank');
                                    }}
                                    className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition-colors"
                                    title="Open in Telegram"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                    Open
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigator.clipboard.writeText(chat.inviteLink);
                                      setMessage({ type: 'success', text: 'Link copied!' });
                                      setTimeout(() => setMessage(null), 2000);
                                    }}
                                    className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1 transition-colors"
                                    title="Copy invite link"
                                  >
                                    <Copy className="w-3 h-3" />
                                    Copy Link
                                  </button>
                                </>
                              )}
                            </div>
                            
                            {/* Extended Details */}
                            {showDetails && (
                              <div className="mt-3 p-3 bg-black/20 rounded-lg border border-cyan-500/10 text-xs space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                  {chat.onlineCount && (
                                    <div className="text-gray-400">
                                      Online: <span className="text-green-400">{chat.onlineCount.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {chat.unreadCount > 0 && (
                                    <div className="text-gray-400">
                                      Unread: <span className="text-yellow-400">{chat.unreadCount}</span>
                                    </div>
                                  )}
                                  {chat.adminRights && (
                                    <div className="text-gray-400">
                                      Role: <span className="text-purple-400">Admin</span>
                                    </div>
                                  )}
                                  {chat.isCreator && (
                                    <div className="text-gray-400">
                                      Role: <span className="text-yellow-400">Owner</span>
                                    </div>
                                  )}
                                  {chat.hasLeft && (
                                    <div className="text-gray-400">
                                      Status: <span className="text-red-400">Left</span>
                                    </div>
                                  )}
                                  {chat.lastMessage && (
                                    <div className="col-span-2 text-gray-400 truncate">
                                      Last msg: <span className="text-gray-300">{chat.lastMessage.text?.substring(0, 50)}...</span>
                                    </div>
                                  )}
                                  {chat.statistics && (
                                    <div className="col-span-2 text-gray-400">
                                      Stats: {chat.statistics.followers} followers • {chat.statistics.messagesViewsCount} views
                                    </div>
                                  )}
                                </div>
                                {chat.description && (
                                  <div className="text-gray-400">
                                    <p className="text-gray-300">{chat.description.substring(0, 100)}...</p>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2 ml-4">
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              try {
                                const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${chat.chatId}/toggle`, {
                                  method: 'POST',
                                  credentials: 'include',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ isActive: !isSniffer })
                                });
                                if (response.ok) {
                                  setMessage({ type: 'success', text: `${isSniffer ? 'Stopped' : 'Started'} sniffing ${chat.chatName}` });
                                  await loadSnifferChats();
                                } else {
                                  setMessage({ type: 'error', text: 'Failed to toggle monitoring' });
                                }
                              } catch (error) {
                                setMessage({ type: 'error', text: 'Error toggling monitoring' });
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              isSniffer
                                ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400'
                                : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400'
                            }`}
                          >
                            {isSniffer ? 'Stop' : 'Start'}
                          </button>
                          <button
                            onClick={async (e) => {
                              e.stopPropagation();
                              setConfigChat(chat);
                              const sniffer = snifferChats.find(m => m.chatId === chat.chatId);
                              if (sniffer) {
                                setConfigKeywords(sniffer.monitoredKeywords?.join(', ') || '');
                                setConfigForwardTo(sniffer.forwardToChatId || '');
                                setConfigForwardAccountId(sniffer.forwardAccountId || null);
                                setConfigProcessBotMessages(sniffer.processBotMessages || false);
                                setSelectedTopicIds(sniffer.monitoredTopicIds || []);
                                setMonitorAllTopics(!sniffer.monitoredTopicIds || sniffer.monitoredTopicIds.length === 0);
                                // Note: initialHistoryLimit is not loaded since it's a one-time fetch
                                
                                // Load duplicate strategy from chat config API
                                fetch(`${config.apiUrl}/api/telegram/chat-config/${chat.chatId}`, {
                                  credentials: 'include'
                                }).then(response => response.json()).then(data => {
                                  if (data.duplicateStrategy) {
                                    setConfigDuplicateStrategy(data.duplicateStrategy);
                                  }
                                }).catch(err => console.error('Failed to load chat config:', err));
                                
                                // Load available topics if it's a forum group
                                if (chat.is_forum) {
                                  setLoadingTopics(true);
                                  fetch(`${config.apiUrl}/api/telegram/chats/${chat.chatId}/topics`, {
                                    credentials: 'include'
                                  }).then(response => response.json()).then(data => {
                                    if (data.success && data.topics) {
                                      setAvailableTopics(data.topics);
                                    }
                                  }).catch(err => console.error('Failed to load topics:', err))
                                  .finally(() => setLoadingTopics(false));
                                }
                                
                                // Load users if there are monitored user IDs
                                if (sniffer.monitoredUserIds && sniffer.monitoredUserIds.length > 0) {
                                  try {
                                    const response = await fetch(
                                      `${config.apiUrl}/api/telegram/chats/${encodeURIComponent(chat.chatId)}/participants?limit=200`,
                                      { credentials: 'include' }
                                    );
                                    if (response.ok) {
                                      const data = await response.json();
                                      setAvailableUsers(data.participants || []);
                                      
                                      // Match and select users by ID
                                      const usersToSelect = data.participants.filter((p: any) => 
                                        sniffer.monitoredUserIds?.includes(Number(p.userId)) || 
                                        sniffer.monitoredUserIds?.includes(p.userId)
                                      ).map((p: any) => ({
                                        userId: p.userId,
                                        displayName: p.displayName,
                                        username: p.username,
                                        isBot: p.isBot
                                      }));
                                      setSelectedUsers(usersToSelect);
                                    }
                                  } catch (err) {
                                    console.error('Failed to load users:', err);
                                  }
                                }
                              }
                              loadForwardDestinations(chat.chatId);
                              loadAvailableForwardTargets();
                              setConfigModalOpen(true);
                              fetchTradingWallets();
                            }}
                            className="p-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 transition-all"
                          >
                            <SettingsIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Actions */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button
                className="flex flex-col items-center gap-2 p-4 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/20 rounded-lg transition-all"
              >
                <Radio className="w-6 h-6 text-purple-400" />
                <span className="text-sm text-purple-400 font-medium">Monitor All Chats</span>
                <span className="text-xs text-gray-400">Start monitoring everything</span>
              </button>
              <button
                className="flex flex-col items-center gap-2 p-4 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 rounded-lg transition-all"
              >
                <MessageSquare className="w-6 h-6 text-cyan-400" />
                <span className="text-sm text-cyan-400 font-medium">Configure Keywords</span>
                <span className="text-xs text-gray-400">Set global search terms</span>
              </button>
              <button
                className="flex flex-col items-center gap-2 p-4 bg-green-500/10 hover:bg-green-500/20 border border-green-500/20 rounded-lg transition-all"
              >
                <Bot className="w-6 h-6 text-green-400" />
                <span className="text-sm text-green-400 font-medium">Setup Auto-Forward</span>
                <span className="text-xs text-gray-400">Forward detections to bot</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'settings' && (
        <div className="space-y-6">
          {/* Account Overview */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Connected Accounts Overview</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* User Account Summary */}
              <div className="bg-black/40 border border-cyan-500/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <User className="w-5 h-5 text-cyan-400" />
                    <span className="font-medium text-cyan-300">User Account</span>
                  </div>
                  {userAccount?.connected ? (
                    <span className="px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400 text-xs font-bold">
                      LIVE
                    </span>
                  ) : userAccount?.verified ? (
                    <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold">
                      READY
                    </span>
                  ) : userAccount?.configured ? (
                    <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-xs font-bold">
                      PENDING
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400 text-xs font-bold">
                      NOT SET
                    </span>
                  )}
                </div>
                
                {userAccount?.configured ? (
                  <div className="space-y-1 text-sm">
                    <p className="text-gray-400">Phone: <span className="text-gray-300">{userAccount.phoneNumber}</span></p>
                    {userAccount.connected && (
                      <p className="text-gray-400">Status: <span className="text-cyan-400">Connected & Monitoring</span></p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Configure account to monitor chats</p>
                )}
              </div>

              {/* Bot Account Summary */}
              <div className="bg-black/40 border border-cyan-500/10 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Bot className="w-5 h-5 text-cyan-400" />
                    <span className="font-medium text-cyan-300">Bot Account</span>
                  </div>
                  {botAccount?.verified ? (
                    <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold">
                      VERIFIED
                    </span>
                  ) : botAccount?.configured ? (
                    <span className="px-2 py-1 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-xs font-bold">
                      PENDING
                    </span>
                  ) : (
                    <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400 text-xs font-bold">
                      NOT SET
                    </span>
                  )}
                </div>
                
                {botAccount?.configured ? (
                  <div className="space-y-1 text-sm">
                    {botAccount.botUsername ? (
                      <p className="text-gray-400">Username: <span className="text-gray-300">@{botAccount.botUsername}</span></p>
                    ) : (
                      <p className="text-gray-400">Username: <span className="text-gray-500">Not verified</span></p>
                    )}
                    {botAccount.verified && (
                      <p className="text-gray-400">Status: <span className="text-green-400">Ready to send</span></p>
                    )}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm">Configure bot for notifications</p>
                )}
              </div>
            </div>

            {/* Quick Status Message */}
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-sm text-blue-300">
                {userAccount?.connected && botAccount?.verified ? (
                  <><strong>✅ All Systems Active:</strong> Monitoring chats and ready to send notifications</>
                ) : userAccount?.connected ? (
                  <><strong>🟡 Partially Active:</strong> Monitoring active, but bot not configured for notifications</>
                ) : botAccount?.verified ? (
                  <><strong>🟡 Bot Ready:</strong> Can send notifications, but not monitoring chats</>
                ) : (
                  <><strong>⚡ Get Started:</strong> Configure your accounts below to start monitoring Telegram</>
                )}
              </p>
            </div>
          </div>

          {/* Configuration Forms */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* User Account Configuration */}
            <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
              <div className="flex items-center gap-3 mb-4">
                <User className="w-6 h-6 text-cyan-400" />
                <h3 className="text-xl font-bold text-cyan-300">User Account</h3>
                {userAccount?.connected && (
                  <span className="ml-auto px-2 py-1 bg-blue-500/20 border border-blue-500/30 rounded text-blue-400 text-xs font-bold flex items-center gap-1">
                    <Radio className="w-3 h-3 animate-pulse" />
                    CONNECTED
                  </span>
                )}
                {userAccount?.verified && !userAccount?.connected && (
                  <span className="ml-auto px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold flex items-center gap-1">
                    <Check className="w-3 h-3" />
                    VERIFIED
                  </span>
                )}
              </div>
            
            <p className="text-sm text-gray-400 mb-4">
              Configure your Telegram user account for full chat access
            </p>

            <form onSubmit={handleSaveUserAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">API ID</label>
                <input
                  type="text"
                  value={apiId}
                  onChange={(e) => setApiId(e.target.value)}
                  placeholder="Your API ID (e.g., 12345678)"
                  className="w-full px-4 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">API Hash</label>
                <div className="relative">
                  <input
                    type={showApiHash ? "text" : "password"}
                    value={apiHash}
                    onChange={(e) => setApiHash(e.target.value)}
                    placeholder="Your API Hash (32 characters)"
                    className="w-full px-4 py-2 pr-10 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowApiHash(!showApiHash)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-400"
                  >
                    {showApiHash ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Phone Number</label>
                <input
                  type="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="+1234567890"
                  className="w-full px-4 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
              >
                {loading ? 'Saving...' : 'Save User Account'}
              </button>

              {/* Disconnect button */}
              {userAccount?.configured && (
                <button
                  type="button"
                  onClick={handleDeleteUserAccount}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <X className="w-4 h-4" />
                  Disconnect Account
                </button>
              )}
            </form>

            {/* Authentication Flow */}
            {userAccount?.configured && (
              <div className="mt-4 space-y-4">
                {authStep === 'idle' && (
                  <>
                    {!userAccount?.verified ? (
                      <button
                        onClick={handleStartAuth}
                        disabled={loading}
                        className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 font-medium transition-all disabled:opacity-50"
                      >
                        {loading ? 'Starting...' : 'Start Authentication'}
                      </button>
                    ) : (
                      <button
                        onClick={handleStartAuth}
                        disabled={loading}
                        className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                        {loading ? 'Reconnecting...' : 'Reconnect Account'}
                      </button>
                    )}
                  </>
                )}

                {authStep === 'code_sent' && (
                  <form onSubmit={handleVerifyCode} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        Verification Code
                      </label>
                      <input
                        type="text"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value)}
                        placeholder="Enter the code sent to your Telegram"
                        className="w-full px-4 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !verificationCode}
                      className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
                    >
                      {loading ? 'Verifying...' : 'Verify Code'}
                    </button>
                  </form>
                )}

                {authStep === 'awaiting_2fa' && (
                  <form onSubmit={handleVerify2FA} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-300 mb-2">
                        2FA Password
                      </label>
                      <div className="relative">
                        <input
                          type={show2FAPassword ? "text" : "password"}
                          value={twoFAPassword}
                          onChange={(e) => setTwoFAPassword(e.target.value)}
                          placeholder="Enter your 2FA password"
                          className="w-full px-4 py-2 pr-10 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => setShow2FAPassword(!show2FAPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-400"
                        >
                          {show2FAPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>
                    <button
                      type="submit"
                      disabled={loading || !twoFAPassword}
                      className="w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
                    >
                      {loading ? 'Verifying...' : 'Verify 2FA Password'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {/* Connection Status Info */}
            {userAccount?.verified && (
              <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-300">
                  {userAccount?.connected ? (
                    <><strong>✅ Connected:</strong> Your account is actively monitoring Telegram. Session is saved and will persist.</>
                  ) : (
                    <><strong>⚠️ Verified but Not Connected:</strong> Click "Reconnect Account" above to establish live connection.</>
                  )}
                </p>
              </div>
            )}

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>Note:</strong> Get your API credentials from <a href="https://my.telegram.org/apps" target="_blank" rel="noopener noreferrer" className="underline">my.telegram.org/apps</a>
              </p>
            </div>
          </div>

          {/* Bot Account Configuration */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <div className="flex items-center gap-3 mb-4">
              <Bot className="w-6 h-6 text-cyan-400" />
              <h3 className="text-xl font-bold text-cyan-300">Bot Account</h3>
              {botAccount?.verified && (
                <span className="ml-auto px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  VERIFIED
                </span>
              )}
            </div>

            <p className="text-sm text-gray-400 mb-4">
              Configure a Telegram bot for sending notifications
            </p>

            <form onSubmit={handleSaveBotAccount} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">Bot Token</label>
                <div className="relative">
                  <input
                    type={showBotToken ? "text" : "password"}
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={botAccount?.botToken || "1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"}
                    className="w-full px-4 py-2 pr-10 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowBotToken(!showBotToken)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-cyan-400"
                  >
                    {showBotToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {botAccount?.botUsername && (
                <div className="p-3 bg-cyan-500/10 border border-cyan-500/20 rounded-lg">
                  <p className="text-sm text-cyan-300">
                    <strong>Bot Username:</strong> @{botAccount.botUsername}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Save Bot Account'}
                </button>
                
                {botAccount?.configured && (
                  <button
                    type="button"
                    onClick={handleVerifyBot}
                    disabled={loading}
                    className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 font-medium transition-all disabled:opacity-50"
                  >
                    Verify
                  </button>
                )}
              </div>

              {/* Delete bot button */}
              {botAccount?.configured && (
                <button
                  type="button"
                  onClick={handleDeleteBotAccount}
                  disabled={loading}
                  className="w-full mt-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove Bot Account
                </button>
              )}
            </form>

            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
              <p className="text-xs text-blue-300">
                <strong>Note:</strong> Create a bot with <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="underline">@BotFather</a> on Telegram
              </p>
            </div>
          </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-red-500/10 backdrop-blur-sm rounded-xl border border-red-500/30 p-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertTriangle className="w-6 h-6 text-red-400" />
              <h3 className="text-xl font-bold text-red-400">Danger Zone</h3>
            </div>
            
            <p className="text-sm text-gray-400 mb-4">
              These actions are irreversible and will permanently delete your data.
            </p>

            <div className="space-y-4">
              <div className="p-4 bg-black/40 border border-red-500/20 rounded-lg">
                <h4 className="font-medium text-red-300 mb-2">Delete All Telegram Data</h4>
                <p className="text-sm text-gray-400 mb-3">
                  This will permanently delete ALL your Telegram data from the database including:
                </p>
                <ul className="text-xs text-gray-500 ml-4 mb-3 list-disc">
                  <li>All monitored chats configuration</li>
                  <li>All detected contracts history</li>
                  <li>All message history and metadata</li>
                  <li className={includeAccountsInDelete ? 'text-red-400 font-bold' : ''}>
                    Your Telegram account connections {includeAccountsInDelete && '(WILL BE DELETED)'}
                  </li>
                  <li className={includeAccountsInDelete ? 'text-red-400 font-bold' : ''}>
                    Bot account configuration {includeAccountsInDelete && '(WILL BE DELETED)'}
                  </li>
                </ul>
                
                {/* Toggle for including accounts */}
                <div className="flex items-center justify-between p-3 bg-black/20 rounded-lg border border-yellow-500/20 mb-3">
                  <div>
                    <div className="font-medium text-yellow-300 text-sm">Also delete connected accounts?</div>
                    <div className="text-xs text-gray-400 mt-1">
                      {includeAccountsInDelete 
                        ? 'Will disconnect and remove all account credentials' 
                        : 'Will keep accounts connected, only delete data'}
                    </div>
                  </div>
                  <button
                    onClick={() => setIncludeAccountsInDelete(!includeAccountsInDelete)}
                    className={`relative w-14 h-7 rounded-full transition-colors ${
                      includeAccountsInDelete ? 'bg-red-500' : 'bg-gray-600'
                    }`}
                  >
                    <div
                      className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                        includeAccountsInDelete ? 'translate-x-8' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
                
                <button
                  onClick={async () => {
                    const confirmText = prompt(
                      'This will DELETE ALL your Telegram data permanently!\n\n' +
                      (includeAccountsInDelete 
                        ? '⚠️ INCLUDING your account connections and credentials!\n\n' 
                        : 'Your account connections will be kept.\n\n') +
                      'Type "DELETE ALL" to confirm:'
                    );
                    
                    if (confirmText === 'DELETE ALL') {
                      try {
                        setLoading(true);
                        const response = await fetch(`${config.apiUrl}/api/telegram/delete-all-data?includeAccounts=${includeAccountsInDelete}`, {
                          method: 'DELETE',
                          credentials: 'include'
                        });
                        
                        if (response.ok) {
                          const result = await response.json();
                          setMessage({ type: 'success', text: result.message || 'All Telegram data deleted successfully' });
                          
                          // Reset data state (always)
                          setAvailableChats([]);
                          setSnifferChats([]);
                          setDetections([]);
                          setSelectedChats(new Set());
                          
                          // Reset account state only if accounts were deleted
                          if (includeAccountsInDelete) {
                            setUserAccount(null);
                            setBotAccount(null);
                            setApiId('');
                            setApiHash('');
                            setPhoneNumber('');
                            setBotToken('');
                          }
                        } else {
                          const error = await response.json();
                          setMessage({ type: 'error', text: error.error || 'Failed to delete data' });
                        }
                      } catch (error) {
                        setMessage({ type: 'error', text: 'Error deleting Telegram data' });
                      } finally {
                        setLoading(false);
                      }
                    } else if (confirmText !== null) {
                      setMessage({ type: 'info', text: 'Deletion cancelled - confirmation text did not match' });
                    }
                  }}
                  disabled={loading}
                  className="w-full px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-4 h-4" />
                  Delete All Telegram Data
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeSection === 'monitored' && (
        <div className="space-y-6">
          {/* Active Monitoring Overview */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4">
            <div className="mb-6 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-cyan-300">Active Sniffers</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Currently monitoring {snifferChats.filter(c => c.isActive).length} of {snifferChats.length} configured chats
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    // Pause all active sniffers
                    const activeChats = snifferChats.filter(c => c.isActive);
                    for (const chat of activeChats) {
                      try {
                        await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${chat.chatId}/toggle`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ isActive: false })
                        });
                      } catch (error) {
                        console.error('Failed to pause chat:', chat.chatId);
                      }
                    }
                    setMessage({ type: 'success', text: `Paused all ${activeChats.length} active sniffers` });
                    await loadSnifferChats();
                  }}
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
                >
                  Pause All
                </button>
                <button
                  onClick={async () => {
                    // Resume all inactive sniffers
                    const inactiveChats = snifferChats.filter(c => !c.isActive);
                    for (const chat of inactiveChats) {
                      try {
                        await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${chat.chatId}/toggle`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ isActive: true })
                        });
                      } catch (error) {
                        console.error('Failed to resume chat:', chat.chatId);
                      }
                    }
                    setMessage({ type: 'success', text: `Resumed ${inactiveChats.length} sniffers` });
                    await loadSnifferChats();
                  }}
                  className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 text-sm font-medium transition-all"
                >
                  Resume All
                </button>
              </div>
              <button
                onClick={handleFetchChats}
                disabled={loading}
                className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 text-xs font-medium transition-all flex items-center gap-2"
              >
                <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
                Refresh Chats
              </button>
              <button 
                onClick={() => window.open('/intelligence', '_blank')}
                className="bg-gradient-to-r from-cyan-500/20 to-purple-500/20 hover:from-cyan-500/30 hover:to-purple-500/30 border border-cyan-500/30 rounded-lg px-4 py-2 text-cyan-400 font-medium transition-all flex items-center gap-2"
              >
                <Brain className="w-4 h-4" />
                Intelligence Platform
              </button>
            </div>
            
            {/* Live Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-4">
              <div className="bg-black/40 rounded-lg p-3 border border-cyan-500/10">
                <div className="text-2xl font-bold text-cyan-400">
                  {detections.length}
                </div>
                <div className="text-xs text-gray-400">Total Detections</div>
              </div>
              <div className="bg-black/40 rounded-lg p-3 border border-green-500/10">
                <div className="text-2xl font-bold text-green-400">
                  {detections.filter(d => new Date(d.detectedAt * 1000).toDateString() === new Date().toDateString()).length}
                </div>
                <div className="text-xs text-gray-400">Today's Finds</div>
              </div>
              <div className="bg-black/40 rounded-lg p-3 border border-purple-500/10">
                <div className="text-2xl font-bold text-purple-400">
                  {forwardingStats?.successRate ? `${Math.round(forwardingStats.successRate)}%` : '0%'}
                </div>
                <div className="text-xs text-gray-400">Forward Success</div>
              </div>
              <div className="bg-black/40 rounded-lg p-3 border border-yellow-500/10">
                <div className="text-2xl font-bold text-yellow-400">
                  {forwardingStats?.avgLatencyMs ? `${Math.round(forwardingStats.avgLatencyMs)}ms` : '0ms'}
                </div>
                <div className="text-xs text-gray-400">Avg Latency</div>
              </div>
              <div className="bg-black/40 rounded-lg p-3 border border-orange-500/10">
                <div className="text-2xl font-bold text-orange-400">
                  {new Set(detections.map(d => d.contractAddress)).size}
                </div>
                <div className="text-xs text-gray-400">Unique Tokens</div>
              </div>
            </div>
          </div>

          {/* Active Sniffers */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            {snifferChats.filter(c => c.isActive).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <MessageSquare className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p className="text-lg font-medium mb-2">No Active Sniffers</p>
                <p className="text-sm mt-2">Go to Sniffer tab to select and configure chats</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {snifferChats.filter(c => c.isActive).map((chat) => (
                  <div key={chat.id} className="bg-black/40 border border-green-500/20 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                          <h4 className="font-medium text-white">{chat.chatName || chat.chatId}</h4>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">
                          {chat.chatType} • {chat.username ? `@${chat.username}` : `ID: ${chat.chatId}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAutoTradeChat(chat);
                            setAutoTradeModalOpen(true);
                          }}
                          className="p-2 bg-gradient-to-r from-green-500/20 to-blue-500/20 hover:from-green-500/30 hover:to-blue-500/30 border border-green-500/40 rounded-lg transition-all group"
                          title="Configure Auto-Trading"
                        >
                          <TrendingUp className="w-4 h-4 text-green-400 group-hover:text-green-300" />
                        </button>
                        <button
                          onClick={() => setSelectedHistoryChat({ 
                            id: chat.chatId, 
                            name: chat.chatName || chat.chatId, 
                            username: chat.username || undefined 
                          })}
                          className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded text-purple-400 text-xs font-medium transition-all flex items-center gap-1"
                        >
                          <History className="w-3 h-3" />
                          History
                        </button>
                        <button
                          onClick={async () => {
                            try {
                              const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${chat.chatId}/toggle`, {
                                method: 'POST',
                                credentials: 'include',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ isActive: false })
                              });
                              if (response.ok) {
                                setMessage({ type: 'success', text: `Paused sniffing ${chat.chatName || chat.chatId}` });
                                await loadSnifferChats();
                              } else {
                                setMessage({ type: 'error', text: 'Failed to pause sniffer' });
                              }
                            } catch (error) {
                              setMessage({ type: 'error', text: 'Error pausing sniffer' });
                            }
                          }}
                          className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-400 text-xs font-medium transition-all"
                        >
                          Pause
                        </button>
                      </div>
                    </div>
                    
                    {/* Active Configuration */}
                    <div className="space-y-2 text-xs">
                      {/* Real-time Stats */}
                      <div className="flex items-center gap-4 p-2 bg-black/60 rounded border border-cyan-500/10">
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Detections:</span>
                          <span className="font-bold text-cyan-400">
                            {detections.filter(d => d.chatId === chat.chatId).length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Today:</span>
                          <span className="font-bold text-green-400">
                            {detections.filter(d => 
                              d.chatId === chat.chatId && 
                              new Date(d.detectedAt * 1000).toDateString() === new Date().toDateString()
                            ).length}
                          </span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-gray-500">Success:</span>
                          <span className="font-bold text-purple-400">
                            {detections.filter(d => d.chatId === chat.chatId && d.forwarded).length}/
                            {detections.filter(d => d.chatId === chat.chatId).length}
                          </span>
                        </div>
                      </div>
                      
                      {chat.monitoredKeywords && chat.monitoredKeywords.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500">Keywords:</span>
                          <div className="flex flex-wrap gap-1">
                            {chat.monitoredKeywords.map((kw, idx) => (
                              <span key={idx} className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/30 rounded text-purple-400 text-xs">
                                {kw}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {chat.monitoredUserIds && chat.monitoredUserIds.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500">Users:</span>
                          <span className="text-cyan-400">{chat.monitoredUserIds.length} specific users</span>
                        </div>
                      )}
                      
                      {chat.forwardToChatId && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500">Forwarding:</span>
                          <span className="text-green-400 flex items-center gap-1">
                            📤 To: {chat.forwardToChatId}{chat.forwardAccountId ? ' (custom account)' : ''}
                          </span>
                        </div>
                      )}
                      
                      {/* Trading Status Indicator */}
                      {chat.action_on_detection && chat.action_on_detection !== 'forward_only' && (
                        <div className="flex items-start gap-2">
                          <span className="text-gray-500">Actions:</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            chat.action_on_detection === 'trade_only' ? 'bg-green-500/20 text-green-400' :
                            chat.action_on_detection === 'monitor_only' ? 'bg-purple-500/20 text-purple-400' :
                            chat.action_on_detection === 'forward_and_trade' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-blue-500/20 text-blue-400'
                          }`}>
                            {chat.action_on_detection === 'trade_only' ? '🤖 Auto-Trade' :
                             chat.action_on_detection === 'monitor_only' ? '📊 Monitor' :
                             chat.action_on_detection === 'forward_and_trade' ? '📤🤖 Forward+Trade' :
                             chat.action_on_detection === 'forward_and_monitor' ? '📤📊 Forward+Monitor' :
                             chat.action_on_detection === 'all' ? '🔥 All Actions' : ''}
                          </span>
                        </div>
                      )}
                      
                      {(!chat.monitoredKeywords || chat.monitoredKeywords.length === 0) && 
                       (!chat.monitoredUserIds || chat.monitoredUserIds.length === 0) && (
                        <span className="text-gray-500">Monitoring all messages</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* Top Performing Sniffers */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Top Performing Chats</h3>
            <div className="space-y-3">
              {(() => {
                // Calculate performance metrics for each chat
                const chatPerformance = snifferChats.map(chat => {
                  const chatDetections = detections.filter(d => d.chatId === chat.chatId);
                  const todayDetections = chatDetections.filter(d => 
                    new Date(d.detectedAt * 1000).toDateString() === new Date().toDateString()
                  );
                  const successfulForwards = chatDetections.filter(d => d.forwarded).length;
                  const successRate = chatDetections.length > 0 
                    ? (successfulForwards / chatDetections.length) * 100 
                    : 0;
                  
                  return {
                    ...chat,
                    totalDetections: chatDetections.length,
                    todayDetections: todayDetections.length,
                    successRate,
                    uniqueTokens: new Set(chatDetections.map(d => d.contractAddress)).size
                  };
                })
                .filter(chat => chat.totalDetections > 0)
                .sort((a, b) => b.totalDetections - a.totalDetections)
                .slice(0, 5);
                
                if (chatPerformance.length === 0) {
                  return <p className="text-center text-gray-400 py-4">No detection data yet</p>;
                }
                
                return chatPerformance.map((chat, index) => (
                  <div key={chat.id} className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-cyan-500/10">
                    <div className="flex items-center gap-3">
                      <div className="text-2xl font-bold text-cyan-400 w-8">#{index + 1}</div>
                      <div>
                        <div className="font-medium text-white">{chat.chatName || chat.chatId}</div>
                        <div className="text-xs text-gray-400">
                          {chat.chatType} • {chat.username ? `@${chat.username}` : `ID: ${chat.chatId}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <div className="text-center">
                        <div className="font-bold text-cyan-400">{chat.totalDetections}</div>
                        <div className="text-gray-500">Total</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-green-400">{chat.todayDetections}</div>
                        <div className="text-gray-500">Today</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-purple-400">{Math.round(chat.successRate)}%</div>
                        <div className="text-gray-500">Success</div>
                      </div>
                      <div className="text-center">
                        <div className="font-bold text-yellow-400">{chat.uniqueTokens}</div>
                        <div className="text-gray-500">Unique</div>
                      </div>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
          
          {/* Recent Activity Timeline */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Recent Activity</h3>
            <div className="space-y-2">
              {detections.slice(0, 5).map((detection) => (
                <div key={detection.id} className="flex items-center gap-3 p-2 bg-black/40 rounded-lg border-l-2 border-cyan-500/30">
                  <div className="text-xs text-gray-500 w-16">
                    {new Date(detection.detectedAt * 1000).toLocaleTimeString()}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-cyan-400">
                        {detection.contractAddress.substring(0, 8)}...
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                        detection.detectionType === 'standard'
                          ? 'bg-green-500/20 text-green-400'
                          : detection.detectionType === 'obfuscated'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-purple-500/20 text-purple-400'
                      }`}>
                        {detection.detectionType}
                      </span>
                      {detection.forwarded && (
                        <span className="px-1.5 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">✓</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1">
                      from {detection.chatName || 'Unknown Chat'}
                      {detection.senderUsername && ` by @${detection.senderUsername}`}
                    </div>
                  </div>
                </div>
              ))}
              {detections.length === 0 && (
                <p className="text-center text-gray-400 py-4">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Positions Section */}
      {activeSection === 'positions' && (
        <div className="space-y-6">
          <TelegramPositionsDashboard />
        </div>
      )}

      {activeSection === 'detections' && (
        <div className="space-y-6">
          {/* Detection Stats */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-cyan-400">{detections.length}</p>
                <p className="text-xs text-gray-400">Total Detections</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">
                  {detections.filter(d => d.detectionType === 'standard').length}
                </p>
                <p className="text-xs text-gray-400">Standard</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-yellow-400">
                  {detections.filter(d => d.detectionType === 'obfuscated').length}
                </p>
                <p className="text-xs text-gray-400">Obfuscated</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-400">
                  {detections.filter(d => d.detectionType === 'split').length}
                </p>
                <p className="text-xs text-gray-400">Split</p>
              </div>
            </div>
            
            {/* Forwarding Stats */}
            <div className="border-t border-cyan-500/20 pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-green-400">
                  {detections.filter(d => d.forwarded).length}
                </p>
                <p className="text-xs text-gray-400">Forwarded</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-orange-400">
                  {detections.filter(d => d.forwardedTo && !d.forwarded).length}
                </p>
                <p className="text-xs text-gray-400">Pending Forward</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-gray-400">
                  {detections.filter(d => !d.forwardedTo).length}
                </p>
                <p className="text-xs text-gray-400">No Forward Config</p>
              </div>
            </div>
          </div>

          {/* Detections List */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Recent Detections</h3>
            
            {detections.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Check className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No contract detections yet</p>
                <p className="text-sm mt-2">Contracts will appear here when detected in monitored chats</p>
              </div>
            ) : (
              <div className="space-y-3">
                {detections.slice(0, 10).map((detection) => (
                  <div key={detection.id} className="bg-black/40 border border-cyan-500/10 rounded-lg p-4 hover:border-cyan-500/20 transition-all">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <code className="text-cyan-400 font-mono text-sm">{detection.contractAddress}</code>
                          <button
                            className="p-1 hover:bg-cyan-500/20 rounded transition-all"
                            title="Copy address"
                          >
                            <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                            </svg>
                          </button>
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <div className="flex items-center gap-2">
                            {detection.chatPhotoUrl ? (
                              <img 
                                src={detection.chatPhotoUrl} 
                                alt={detection.chatName}
                                className="w-10 h-10 rounded-lg object-cover"
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                                detection.chatType === 'channel' ? 'bg-purple-500/20' : 
                                detection.chatType === 'bot' ? 'bg-blue-500/20' : 
                                'bg-cyan-500/20'
                              }`}>
                                {detection.chatType === 'channel' ? (
                                  <Radio className="w-5 h-5 text-purple-400" />
                                ) : detection.chatType === 'bot' ? (
                                  <Bot className="w-5 h-5 text-blue-400" />
                                ) : (
                                  <MessageSquare className="w-5 h-5 text-cyan-400" />
                                )}
                              </div>
                            )}
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              detection.detectionType === 'standard'
                                ? 'bg-green-500/20 text-green-400'
                                : detection.detectionType === 'obfuscated'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : detection.detectionType === 'url'
                                ? 'bg-blue-500/20 text-blue-400'
                                : 'bg-purple-500/20 text-purple-400'
                            }`}>
                              {detection.detectionType.toUpperCase()}
                            </span>
                          </div>
                          {detection.chatName && (
                            <span className="text-gray-400">
                              Chat: <span className="text-yellow-400">{detection.chatName}</span>
                            </span>
                          )}
                          {detection.senderUsername && (
                            <span className="text-gray-400">
                              From: <span className="text-cyan-400">@{detection.senderUsername}</span>
                            </span>
                          )}
                          {detection.forwarded && (
                            <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs">
                              ✓ Forwarded
                            </span>
                          )}
                          <span className="text-gray-500">
                            {new Date(detection.detectedAt * 1000).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button 
                          onClick={() => {
                            navigator.clipboard.writeText(detection.contractAddress);
                            // Show a brief toast notification
                            const toast = document.createElement('div');
                            toast.className = 'fixed bottom-4 right-4 px-4 py-2 bg-green-500/20 border border-green-500/40 rounded-lg text-green-400 text-sm font-medium z-50';
                            toast.textContent = 'Copied!';
                            document.body.appendChild(toast);
                            setTimeout(() => toast.remove(), 2000);
                          }}
                          className="px-3 py-1.5 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/40 rounded-lg text-gray-400 text-sm font-medium transition-all flex items-center gap-1"
                          title="Copy address"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                          </svg>
                          <span className="hidden sm:inline">Copy</span>
                        </button>
                        <button 
                          onClick={() => window.open(`https://solscan.io/token/${detection.contractAddress}`, '_blank')}
                          className="px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 text-sm font-medium transition-all flex items-center gap-1"
                          title="View on Solscan"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span className="hidden sm:inline">View</span>
                        </button>
                        <button 
                          onClick={() => window.open(`https://gmgn.ai/sol/${detection.contractAddress}`, '_blank')}
                          className="px-3 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded-lg text-purple-400 text-sm font-medium transition-all flex items-center gap-1"
                          title="View on GMGN"
                        >
                          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                          </svg>
                          <span className="hidden sm:inline">GMGN</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            
            {detections.length > 10 && (
              <div className="text-center mt-4">
                <button className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 text-sm font-medium transition-all">
                  Load More ({detections.length - 10} remaining)
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Forwards Tab */}
      {activeSection === 'forwards' && (
        <div className="space-y-6">
          {/* Forwarding Stats */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Forwarding Statistics (Last 7 Days)</h3>
            
            {forwardingStats ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-black/40 rounded-lg p-4 border border-cyan-500/10">
                  <div className="text-sm text-gray-400 mb-1">Total Forwards</div>
                  <div className="text-2xl font-bold text-white">{forwardingStats.summary?.total_forwards || 0}</div>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between text-xs">
                      <span className="text-green-400">Success</span>
                      <span className="text-green-400">{forwardingStats.summary?.successful || 0}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-red-400">Failed</span>
                      <span className="text-red-400">{forwardingStats.summary?.failed || 0}</span>
                    </div>
                  </div>
                </div>
                
                <div className="bg-black/40 rounded-lg p-4 border border-cyan-500/10">
                  <div className="text-sm text-gray-400 mb-1">Success Rate</div>
                  <div className="text-2xl font-bold text-cyan-400">
                    {forwardingStats.summary?.total_forwards > 0 
                      ? Math.round((forwardingStats.summary.successful / forwardingStats.summary.total_forwards) * 100)
                      : 0}%
                  </div>
                  <div className="mt-2 text-xs text-gray-500">
                    Avg latency: {Math.round(forwardingStats.summary?.avg_latency_ms || 0)}ms
                  </div>
                </div>
                
                <div className="bg-black/40 rounded-lg p-4 border border-cyan-500/10">
                  <div className="text-sm text-gray-400 mb-1">Unique Contracts</div>
                  <div className="text-2xl font-bold text-purple-400">{forwardingStats.summary?.unique_contracts || 0}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    From {forwardingStats.summary?.unique_source_chats || 0} chats
                  </div>
                </div>
                
                <div className="bg-black/40 rounded-lg p-4 border border-cyan-500/10">
                  <div className="text-sm text-gray-400 mb-1">Accounts Used</div>
                  <div className="text-2xl font-bold text-blue-400">{forwardingStats.summary?.unique_forward_accounts || 0}</div>
                  <div className="mt-2 text-xs text-gray-500">
                    To {forwardingStats.summary?.unique_target_chats || 0} targets
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-gray-400 text-center py-8">Loading statistics...</div>
            )}
          </div>
          
          {/* Top Forwarded Contracts */}
          {forwardingStats?.topContracts && forwardingStats.topContracts.length > 0 && (
            <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
              <h3 className="text-xl font-bold text-cyan-300 mb-4">Top Forwarded Contracts</h3>
              <div className="space-y-2">
                {forwardingStats.topContracts.slice(0, 5).map((contract: any, index: number) => (
                  <div key={contract.contract_address} className="flex items-center justify-between bg-black/40 rounded-lg p-3 border border-cyan-500/10">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-500">#{index + 1}</span>
                      <div>
                        <div className="font-mono text-sm text-cyan-400">{contract.contract_address.substring(0, 8)}...{contract.contract_address.slice(-6)}</div>
                        <div className="text-xs text-gray-500">
                          Last: {new Date(contract.last_forwarded * 1000).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-white">{contract.forward_count}</div>
                      <div className="text-xs text-gray-400">forwards</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Recent Forwarding History */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-xl font-bold text-cyan-300 mb-4">Recent Forwards</h3>
            
            {forwardingHistory.length > 0 ? (
              <div className="space-y-2">
                {forwardingHistory.map((forward: any) => (
                  <div key={forward.id} className="bg-black/40 rounded-lg p-4 border border-cyan-500/10">
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                            forward.status === 'success' 
                              ? 'bg-green-500/20 text-green-400' 
                              : forward.status === 'failed'
                              ? 'bg-red-500/20 text-red-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {forward.status === 'success' ? '✓ Success' : forward.status === 'failed' ? '✗ Failed' : '⏳ Pending'}
                          </span>
                          <span className="font-mono text-sm text-cyan-400">
                            {forward.contract_address.substring(0, 8)}...{forward.contract_address.slice(-6)}
                          </span>
                          {forward.response_time_ms && (
                            <span className="text-xs text-gray-500">{forward.response_time_ms}ms</span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>From: <span className="text-white">{forward.source_chat_name || forward.source_chat_id}</span></span>
                          <span>→</span>
                          <span>To: <span className="text-white">{forward.target_chat_name || forward.target_chat_id}</span></span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500">
                          <span>Via: <span className="text-cyan-400">Account {forward.forward_account_id || forward.detection_account_id}</span></span>
                          {forward.forward_account_phone && (
                            <span className="text-gray-600">({forward.forward_account_phone})</span>
                          )}
                        </div>
                        {forward.error_message && (
                          <div className="text-xs text-red-400 mt-1">Error: {forward.error_message}</div>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(forward.forwarded_at * 1000).toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <p className="text-gray-400">No forwarding history yet</p>
                <p className="text-sm text-gray-500 mt-2">Forwards will appear here when contracts are detected and forwarded</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Traffic Monitoring Tab */}
      {activeSection === 'traffic' && (
        <div className="space-y-6">
          {/* Load Traffic Data */}
          {(() => {
            if (!trafficMetrics) {
              // Load metrics on tab switch
              fetch(`${config.apiUrl}/api/telegram/traffic-metrics`, { credentials: 'include' })
                .then(res => res.json())
                .then(setTrafficMetrics)
                .catch(err => console.error('Failed to load traffic metrics:', err));
              
              // Load report
              fetch(`${config.apiUrl}/api/telegram/traffic-report/${trafficReportPeriod}`, { credentials: 'include' })
                .then(res => res.json())
                .then(setTrafficReport)
                .catch(err => console.error('Failed to load traffic report:', err));
            }
            return null;
          })()}

          {/* Traffic Overview */}
          <div className="bg-gradient-to-r from-purple-500/10 to-cyan-500/10 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-lg font-semibold text-cyan-300 mb-4">Telegram API Traffic Overview</h3>
            
            {trafficMetrics?.summary && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-white">{trafficMetrics.summary.totalCalls}</div>
                  <div className="text-xs text-gray-400">Total Calls</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-400">{trafficMetrics.summary.successRate}</div>
                  <div className="text-xs text-gray-400">Success Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-yellow-400">{trafficMetrics.summary.callsPerMinute}</div>
                  <div className="text-xs text-gray-400">Calls/Min</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-cyan-400">{trafficMetrics.summary.currentDelay}</div>
                  <div className="text-xs text-gray-400">Current Delay</div>
                </div>
                <div className="text-center">
                  <div className={`text-2xl font-bold ${
                    trafficMetrics.summary.adaptiveStatus?.includes('BACKING') ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {trafficMetrics.summary.adaptiveStatus || 'NORMAL'}
                  </div>
                  <div className="text-xs text-gray-400">Rate Limiter</div>
                </div>
              </div>
            )}
            
            {trafficMetrics?.summary?.floodErrors > 0 && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
                <p className="text-sm text-red-400">
                  ⚠️ {trafficMetrics.summary.floodErrors} flood wait errors detected
                </p>
              </div>
            )}
          </div>

          {/* Method Breakdown */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <h3 className="text-lg font-semibold text-cyan-300 mb-4">API Method Breakdown</h3>
            
            {trafficMetrics?.methodBreakdown && trafficMetrics.methodBreakdown.length > 0 ? (
              <div className="space-y-2">
                <div className="grid grid-cols-6 text-xs text-gray-400 pb-2 border-b border-gray-800">
                  <div>Method</div>
                  <div className="text-center">Calls</div>
                  <div className="text-center">Success</div>
                  <div className="text-center">Failed</div>
                  <div className="text-center">Avg Duration</div>
                  <div className="text-center">Last Flood</div>
                </div>
                {trafficMetrics.methodBreakdown.map((method: any) => (
                  <div key={method.method} className="grid grid-cols-6 py-2 text-sm hover:bg-cyan-500/5 rounded">
                    <div className="text-white font-medium">{method.method}</div>
                    <div className="text-center text-gray-300">{method.calls}</div>
                    <div className="text-center text-green-400">{method.success}</div>
                    <div className="text-center text-red-400">{method.failed}</div>
                    <div className="text-center text-gray-300">{method.avgDuration}ms</div>
                    <div className="text-center">
                      {method.lastFloodWait ? (
                        <span className="text-yellow-400">{method.lastFloodWait}s</span>
                      ) : (
                        <span className="text-gray-600">-</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-400">No API calls tracked yet</p>
            )}
          </div>

          {/* Flood Wait History */}
          {trafficMetrics?.floodWaitHistory && trafficMetrics.floodWaitHistory.length > 0 && (
            <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-yellow-500/20 p-6">
              <h3 className="text-lg font-semibold text-yellow-300 mb-4">Flood Wait History</h3>
              
              <div className="space-y-3">
                {trafficMetrics.floodWaitHistory.map((history: any) => (
                  <div key={history.method} className="flex items-center justify-between p-3 bg-black/40 rounded-lg">
                    <div>
                      <div className="text-white font-medium">{history.method}</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Recent waits: {history.recentWaits.join(', ')}s
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm text-yellow-400">Max: {history.maxWait}s</div>
                      <div className="text-xs text-gray-400">Avg: {history.avgWait}s</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Traffic Report */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-cyan-300">Traffic Report</h3>
              <select
                value={trafficReportPeriod}
                onChange={(e) => {
                  const period = parseInt(e.target.value);
                  setTrafficReportPeriod(period);
                  // Reload report with new period
                  fetch(`${config.apiUrl}/api/telegram/traffic-report/${period}`, { credentials: 'include' })
                    .then(res => res.json())
                    .then(setTrafficReport)
                    .catch(err => console.error('Failed to load traffic report:', err));
                }}
                className="px-3 py-1 bg-black/40 border border-cyan-500/30 rounded-lg text-sm"
              >
                <option value={15}>Last 15 minutes</option>
                <option value={30}>Last 30 minutes</option>
                <option value={60}>Last 1 hour</option>
                <option value={120}>Last 2 hours</option>
                <option value={360}>Last 6 hours</option>
              </select>
            </div>
            
            {trafficReport && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="bg-black/40 p-3 rounded-lg">
                    <div className="text-gray-400">Total Calls</div>
                    <div className="text-xl text-white">{trafficReport.totalCalls || 0}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-lg">
                    <div className="text-gray-400">Unique Methods</div>
                    <div className="text-xl text-white">{trafficReport.uniqueMethods || 0}</div>
                  </div>
                  <div className="bg-black/40 p-3 rounded-lg">
                    <div className="text-gray-400">Flood Events</div>
                    <div className="text-xl text-yellow-400">{trafficReport.floodEvents?.length || 0}</div>
                  </div>
                </div>
                
                {trafficReport.floodEvents && trafficReport.floodEvents.length > 0 && (
                  <div className="mt-4">
                    <h4 className="text-sm font-medium text-yellow-300 mb-2">Recent Flood Events</h4>
                    <div className="space-y-2">
                      {trafficReport.floodEvents.slice(0, 5).map((event: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-sm p-2 bg-yellow-500/10 rounded">
                          <span className="text-white">{event.method}</span>
                          <span className="text-yellow-400">{event.waitSeconds}s wait</span>
                          <span className="text-gray-400">{new Date(event.timestamp).toLocaleTimeString()}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Reset Button */}
          <div className="flex justify-end">
            <button
              onClick={async () => {
                try {
                  const res = await fetch(`${config.apiUrl}/api/telegram/reset-rate-limits`, {
                    method: 'POST',
                    credentials: 'include'
                  });
                  if (res.ok) {
                    setMessage({ type: 'success', text: 'Rate limiter delays reset to baseline' });
                    // Reload metrics
                    setTimeout(() => {
                      setTrafficMetrics(null);
                      setTrafficReport(null);
                    }, 100);
                  }
                } catch (err) {
                  setMessage({ type: 'error', text: 'Failed to reset rate limits' });
                }
              }}
              className="px-4 py-2 bg-cyan-500/20 border border-cyan-500/40 rounded-lg text-cyan-400 hover:bg-cyan-500/30 transition-colors"
            >
              Reset Rate Limiter Delays
            </button>
          </div>
        </div>
      )}
      </div>

      {/* Configuration Modal - Rendered via Portal */}
      {configModalOpen && configChat && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-cyan-500/20 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-cyan-300 mb-2">Configure Monitoring</h3>
                  <p className="text-gray-400">
                    {configChat.chatName || configChat.chatId}
                    {configChat.username && (
                      <span className="ml-2 text-cyan-400">@{configChat.username}</span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => setConfigModalOpen(false)}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Monitor Mode */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-3">
                  Monitoring Mode
                </label>
                <div className="grid grid-cols-3 gap-3">
                  <button
                    onClick={() => setConfigMonitorMode('all')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      configMonitorMode === 'all'
                        ? 'border-purple-500 bg-purple-500/20'
                        : 'border-gray-700 bg-black/20 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-center">
                      <MessageSquare className="w-6 h-6 mx-auto mb-2 text-purple-400" />
                      <div className="font-medium text-white">All Messages</div>
                      <div className="text-xs text-gray-400 mt-1">Monitor everything</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setConfigMonitorMode('keywords')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      configMonitorMode === 'keywords'
                        ? 'border-cyan-500 bg-cyan-500/20'
                        : 'border-gray-700 bg-black/20 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-center">
                      <Search className="w-6 h-6 mx-auto mb-2 text-cyan-400" />
                      <div className="font-medium text-white">Keywords</div>
                      <div className="text-xs text-gray-400 mt-1">Specific terms only</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setConfigMonitorMode('users')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      configMonitorMode === 'users'
                        ? 'border-green-500 bg-green-500/20'
                        : 'border-gray-700 bg-black/20 hover:border-gray-600'
                    }`}
                  >
                    <div className="text-center">
                      <User className="w-6 h-6 mx-auto mb-2 text-green-400" />
                      <div className="font-medium text-white">Specific Users</div>
                      <div className="text-xs text-gray-400 mt-1">Track user IDs</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Keywords (if mode is keywords) */}
              {configMonitorMode === 'keywords' && (
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Keywords to Monitor
                  </label>
                  <input
                    type="text"
                    value={configKeywords}
                    onChange={(e) => setConfigKeywords(e.target.value)}
                    placeholder="contract, CA, token, pump (comma-separated)"
                    className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Messages containing any of these keywords will be monitored
                  </p>
                </div>
              )}

              {/* User IDs (if mode is users) */}
              {configMonitorMode === 'users' && (
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Users to Monitor
                  </label>
                  
                  {/* Selected Users */}
                  {selectedUsers.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedUsers.map((user, index) => (
                        <div key={index} className="flex items-center gap-1 px-3 py-1.5 bg-purple-500/20 border border-purple-500/40 rounded-lg">
                          <span className="text-sm text-purple-300">
                            {user.displayName}
                            {user.isBot && <span className="ml-1 text-xs text-gray-400">(bot)</span>}
                          </span>
                          {user.username && (
                            <span className="text-xs text-gray-400">@{user.username}</span>
                          )}
                          <button
                            onClick={() => {
                              setSelectedUsers(prev => prev.filter((_, i) => i !== index));
                            }}
                            className="ml-1 text-purple-400 hover:text-purple-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Dropdown Selector */}
                  <div className="relative user-dropdown-container">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={userFilter}
                        onChange={(e) => setUserFilter(e.target.value)}
                        onFocus={async () => {
                          setShowUserDropdown(true);
                          // Load users from the chat when dropdown opens
                          if (configChat && availableUsers.length === 0) {
                            try {
                              const response = await fetch(
                                `${config.apiUrl}/api/telegram/chats/${encodeURIComponent(configChat.chatId)}/participants?limit=200`,
                                { credentials: 'include' }
                              );
                              if (response.ok) {
                                const data = await response.json();
                                setAvailableUsers(data.participants || []);
                              }
                            } catch (err) {
                              console.error('Failed to load users:', err);
                            }
                          }
                        }}
                        placeholder="Search users in this chat..."
                        className="flex-1 px-4 py-3 bg-black/40 border border-purple-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50"
                      />
                      <button
                        onClick={() => setShowUserDropdown(!showUserDropdown)}
                        className="px-3 py-3 bg-black/40 border border-purple-500/30 rounded-lg text-purple-400 hover:bg-purple-500/10 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Dropdown List */}
                    {showUserDropdown && (
                      <div className="absolute z-50 w-full mt-2 max-h-60 overflow-y-auto bg-gray-900/95 backdrop-blur-sm border border-purple-500/30 rounded-lg shadow-xl">
                        {/* Bulk Actions */}
                        <div className="sticky top-0 bg-gray-900 border-b border-purple-500/20 p-2 flex gap-2">
                          <button
                            onClick={() => {
                              const filtered = availableUsers.filter(u =>
                                !userFilter ||
                                u.displayName?.toLowerCase().includes(userFilter.toLowerCase()) ||
                                u.username?.toLowerCase().includes(userFilter.toLowerCase()) ||
                                u.firstName?.toLowerCase().includes(userFilter.toLowerCase())
                              );
                              const newUsers = filtered.map(u => ({
                                userId: u.userId,
                                displayName: u.displayName,
                                username: u.username,
                                isBot: u.isBot
                              }));
                              setSelectedUsers(prev => {
                                const existing = new Set(prev.map(u => u.userId));
                                return [
                                  ...prev,
                                  ...newUsers.filter(u => !existing.has(u.userId))
                                ];
                              });
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded text-purple-300 transition-colors"
                          >
                            Select All Filtered
                          </button>
                          <button
                            onClick={() => setSelectedUsers([])}
                            className="flex-1 px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-300 transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                        
                        {/* User List */}
                        <div className="p-1">
                          {availableUsers
                            .filter(user =>
                              !userFilter ||
                              user.displayName?.toLowerCase().includes(userFilter.toLowerCase()) ||
                              user.username?.toLowerCase().includes(userFilter.toLowerCase()) ||
                              user.firstName?.toLowerCase().includes(userFilter.toLowerCase()) ||
                              user.userId?.includes(userFilter)
                            )
                            .map(user => {
                              const isSelected = selectedUsers.some(u => u.userId === user.userId);
                              return (
                                <button
                                  key={user.userId}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedUsers(prev =>
                                        prev.filter(u => u.userId !== user.userId)
                                      );
                                    } else {
                                      setSelectedUsers(prev => [...prev, {
                                        userId: user.userId,
                                        displayName: user.displayName,
                                        username: user.username,
                                        isBot: user.isBot
                                      }]);
                                    }
                                  }}
                                  className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-purple-500/10 rounded transition-colors ${
                                    isSelected ? 'bg-purple-500/20' : ''
                                  }`}
                                >
                                  <CheckSquare className={`w-4 h-4 ${isSelected ? 'text-purple-400' : 'text-gray-500'}`} />
                                  <div className="flex-1">
                                    <div className="text-sm text-white flex items-center gap-2">
                                      {user.displayName}
                                      {user.isBot && (
                                        <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 border border-blue-500/40 rounded text-blue-300">BOT</span>
                                      )}
                                      {user.isVerified && (
                                        <span className="text-xs px-1.5 py-0.5 bg-cyan-500/20 border border-cyan-500/40 rounded text-cyan-300">✓</span>
                                      )}
                                    </div>
                                    {user.username && (
                                      <div className="text-xs text-gray-400">@{user.username}</div>
                                    )}
                                    <div className="text-xs text-gray-500">ID: {user.userId}</div>
                                  </div>
                                </button>
                              );
                            })}
                          {availableUsers.length === 0 && (
                            <div className="text-center text-gray-400 py-4">
                              <p>Click to load users from this chat</p>
                              <p className="text-xs mt-1">May require admin permissions</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-2">
                    Selected {selectedUsers.length} user{selectedUsers.length !== 1 ? 's' : ''} to monitor. Only messages from these users will be processed.
                  </p>
                </div>
              )}

              {/* Contract Detection Toggle */}
              <div className="flex items-center justify-between p-4 bg-black/20 rounded-lg border border-purple-500/20">
                <div>
                  <div className="font-medium text-white">Contract Address Detection</div>
                  <div className="text-sm text-gray-400 mt-1">
                    Automatically detect Solana contract addresses
                  </div>
                </div>
                <button
                  onClick={() => setConfigContractDetection(!configContractDetection)}
                  className={`relative w-14 h-7 rounded-full transition-colors ${
                    configContractDetection ? 'bg-green-500' : 'bg-gray-600'
                  }`}
                >
                  <div
                    className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                      configContractDetection ? 'translate-x-8' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Initial History Fetch */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Fetch Chat History (Initial Setup)
                </label>
                <select
                  value={configInitialHistory}
                  onChange={(e) => setConfigInitialHistory(parseInt(e.target.value))}
                  className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value={0}>Don't fetch history (real-time only)</option>
                  <option value={100}>Last 100 messages</option>
                  <option value={500}>Last 500 messages</option>
                  <option value={1000}>Last 1,000 messages</option>
                  <option value={2500}>Last 2,500 messages</option>
                  <option value={5000}>Last 5,000 messages</option>
                  <option value={10000}>Last 10,000 messages</option>
                  <option value={999999}>Entire Chat History (All)</option>
                </select>
                <p className="text-xs text-gray-400 mt-2">
                  💡 All future messages will be cached automatically. This is only for old messages.
                </p>
              </div>

              {/* Topic Monitoring (Forum Groups Only) */}
              {configChat?.is_forum && (
                <div className="space-y-4">
                  <h3 className="text-lg font-medium text-white flex items-center gap-2">
                    🎯 Topic Monitoring
                    {loadingTopics && <span className="text-xs text-gray-400">(Loading...)</span>}
                  </h3>
                  
                  <div className="space-y-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={monitorAllTopics}
                        onChange={(e) => {
                          setMonitorAllTopics(e.target.checked);
                          if (e.target.checked) {
                            setSelectedTopicIds([]);
                          }
                        }}
                        className="w-4 h-4 text-cyan-500 rounded border-gray-600 focus:ring-cyan-500/50"
                      />
                      <span className="text-white">Monitor All Topics</span>
                    </label>
                    
                    {!monitorAllTopics && availableTopics.length > 0 && (
                      <div className="space-y-2 pl-6">
                        <p className="text-sm text-gray-400">Select specific topics to monitor:</p>
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {availableTopics.map(topic => (
                            <label key={topic.topicId} className="flex items-start gap-2 cursor-pointer p-2 hover:bg-black/20 rounded">
                              <input
                                type="checkbox"
                                checked={selectedTopicIds.includes(topic.topicId)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedTopicIds([...selectedTopicIds, topic.topicId]);
                                  } else {
                                    setSelectedTopicIds(selectedTopicIds.filter(id => id !== topic.topicId));
                                  }
                                }}
                                className="w-4 h-4 mt-0.5 text-cyan-500 rounded border-gray-600 focus:ring-cyan-500/50"
                              />
                              <div className="flex-1">
                                <span className="text-white block">{topic.topicTitle || `Topic ${topic.topicId}`}</span>
                                <div className="text-xs text-gray-500 flex gap-3">
                                  <span>{topic.messageCount} messages</span>
                                  <span>{topic.uniqueSenders} users</span>
                                  {topic.contractsDetected > 0 && (
                                    <span className="text-green-400">{topic.contractsDetected} CAs</span>
                                  )}
                                </div>
                              </div>
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                    
                    {!monitorAllTopics && availableTopics.length === 0 && !loadingTopics && (
                      <p className="text-sm text-gray-500 pl-6">No topics found. Messages need to be received first to detect topics.</p>
                    )}
                  </div>
                </div>
              )}

              {/* Bot Message Processing */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Bot Message Processing
                </label>
                <div className="flex items-center justify-between p-4 bg-black/40 border border-cyan-500/30 rounded-lg">
                  <div className="flex-1">
                    <p className="text-white">Process messages from bot accounts</p>
                    <p className="text-xs text-gray-400 mt-1">
                      When enabled, messages from bot accounts will be processed for contract detection.
                      Disable to ignore bot messages and reduce noise.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setConfigProcessBotMessages(!configProcessBotMessages)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      configProcessBotMessages ? 'bg-cyan-500' : 'bg-gray-700'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        configProcessBotMessages ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>

              {/* Duplicate CA Handling Strategy */}
              <div>
                <label className="block text-sm font-medium text-cyan-300 mb-2">
                  Duplicate Contract Handling
                </label>
                <select
                  value={configDuplicateStrategy}
                  onChange={(e) => setConfigDuplicateStrategy(e.target.value)}
                  className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                >
                  <option value="first_only_no_backlog">Buy First Call Only (No backlog history)</option>
                  <option value="first_only_with_backlog">Buy First Call Only (With backlog history)</option>
                  <option value="buy_any_call">Buy Any Call (No backlog history)</option>
                  <option value="custom" disabled>More to follow...</option>
                </select>
                <div className="text-xs text-gray-400 mt-2 space-y-1">
                  <p>📌 <b>First Only (No backlog):</b> Only forward the first time you see a CA (default)</p>
                  <p>📜 <b>First Only (With backlog):</b> Scan chat history to find actual first mention</p>
                  <p>🔁 <b>Buy Any Call:</b> Forward every time the CA is mentioned</p>
                </div>
              </div>

              {/* Auto-Trading Configuration */}
              <div className="border-t border-cyan-500/20 pt-6">
                <div className="flex items-center justify-between mb-4">
                  <label className="text-lg font-bold text-green-400 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Auto-Trading Configuration
                  </label>
                  <span className="text-xs px-2 py-1 bg-green-500/20 border border-green-500/40 rounded text-green-300">
                    BETA
                  </span>
                </div>

                {/* Action on Detection */}
                <div className="mb-4">
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Action on Detection
                  </label>
                  <select
                    value={configActionOnDetection || 'forward_only'}
                    onChange={(e) => setConfigActionOnDetection(e.target.value)}
                    className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                  >
                    <option value="forward_only">Forward Only (Default)</option>
                    <option value="trade_only">Trade Only (No Forwarding)</option>
                    <option value="monitor_only">Monitor Only (Track Price)</option>
                    <option value="forward_and_trade">Forward + Trade</option>
                    <option value="forward_and_monitor">Forward + Monitor</option>
                    <option value="trade_and_monitor">Trade + Monitor</option>
                    <option value="all">All Actions (Forward + Trade + Monitor)</option>
                  </select>
                  <p className="text-xs text-gray-400 mt-2">
                    Choose what happens when a contract is detected
                  </p>
                </div>

                {/* Auto-Buy Configuration */}
                {(configActionOnDetection?.includes('trade') || configActionOnDetection === 'all') && (
                  <div className="space-y-4 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                    <h4 className="text-sm font-bold text-green-300">Auto-Buy Settings</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Buy Amount (SOL)
                        </label>
                        <input
                          type="number"
                          value={configAutoBuyAmount || 0.1}
                          onChange={(e) => setConfigAutoBuyAmount(parseFloat(e.target.value))}
                          step="0.01"
                          min="0.01"
                          className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded text-white text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Trading Wallet
                        </label>
                        <select
                          value={configAutoBuyWalletId || ''}
                          onChange={(e) => setConfigAutoBuyWalletId(e.target.value ? parseInt(e.target.value) : null)}
                          className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded text-white text-sm"
                        >
                          <option value="">
                            {Array.isArray(tradingWallets) && tradingWallets.length > 0 
                              ? "Select Wallet" 
                              : "No wallets available"}
                          </option>
                          {Array.isArray(tradingWallets) && tradingWallets.map((wallet: any) => (
                            <option key={wallet.id} value={wallet.id}>
                              {wallet.name || (wallet.publicKey ? wallet.publicKey.substring(0, 8) + '...' : 'Wallet')} 
                              {wallet.isDefault && ' (Default)'}
                              {' - '}
                              {(wallet.balance || 0).toFixed(4)} SOL
                            </option>
                          ))}
                        </select>
                        {(!Array.isArray(tradingWallets) || tradingWallets.length === 0) && (
                          <p className="text-xs text-yellow-400 mt-1">
                            💡 Create wallets in the Fetcher tab first
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Slippage (%)
                        </label>
                        <input
                          type="number"
                          value={(configAutoBuySlippage || 1000) / 100}
                          onChange={(e) => setConfigAutoBuySlippage(Math.round(parseFloat(e.target.value) * 100))}
                          step="0.5"
                          min="0.5"
                          max="50"
                          className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded text-white text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Priority Level
                        </label>
                        <select
                          value={configAutoBuyPriority || 'medium'}
                          onChange={(e) => setConfigAutoBuyPriority(e.target.value)}
                          className="w-full px-3 py-2 bg-black/40 border border-green-500/30 rounded text-white text-sm"
                        >
                          <option value="low">Low (Slower)</option>
                          <option value="medium">Medium</option>
                          <option value="high">High (Faster)</option>
                          <option value="very_high">Very High</option>
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Auto-Sell Configuration */}
                {(configActionOnDetection?.includes('trade') || configActionOnDetection === 'all') && (
                  <div className="space-y-4 p-4 bg-red-500/10 border border-red-500/20 rounded-lg mt-4">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-red-300">Auto-Sell Settings</h4>
                      <button
                        type="button"
                        onClick={() => setShowComprehensiveAlerts(!showComprehensiveAlerts)}
                        className="px-3 py-1 bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 text-xs rounded-lg flex items-center gap-1 transition-colors"
                      >
                        {showComprehensiveAlerts ? (
                          <>
                            <ChevronUp className="w-3 h-3" />
                            Simple Mode
                          </>
                        ) : (
                          <>
                            <TrendingUp className="w-3 h-3" />
                            Advanced Alerts
                          </>
                        )}
                      </button>
                    </div>
                    
                    {!showComprehensiveAlerts ? (
                      /* Simple Mode */
                      <>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Stop Loss (%)
                            </label>
                            <input
                              type="number"
                              value={configStopLoss || 50}
                              onChange={(e) => setConfigStopLoss(parseFloat(e.target.value))}
                              step="5"
                              min="0"
                              max="100"
                              className="w-full px-3 py-2 bg-black/40 border border-red-500/30 rounded text-white text-sm"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Take Profit (%)
                            </label>
                            <input
                              type="number"
                              value={configTakeProfit || 100}
                              onChange={(e) => setConfigTakeProfit(parseFloat(e.target.value))}
                              step="10"
                              min="0"
                              className="w-full px-3 py-2 bg-black/40 border border-red-500/30 rounded text-white text-sm"
                            />
                          </div>
                          
                          <div>
                            <label className="block text-xs font-medium text-gray-300 mb-1">
                              Trailing Stop (%)
                            </label>
                            <input
                              type="number"
                              value={configTrailingStop || 0}
                              onChange={(e) => setConfigTrailingStop(parseFloat(e.target.value))}
                              step="5"
                              min="0"
                              max="50"
                              disabled={!configTrailingStopEnabled}
                              className="w-full px-3 py-2 bg-black/40 border border-red-500/30 rounded text-white text-sm disabled:opacity-50"
                            />
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="trailing-stop-enabled"
                            checked={configTrailingStopEnabled || false}
                            onChange={(e) => setConfigTrailingStopEnabled(e.target.checked)}
                            className="rounded border-gray-600 text-red-500 focus:ring-red-500"
                          />
                          <label htmlFor="trailing-stop-enabled" className="text-xs text-gray-300">
                            Enable Trailing Stop (locks in profits)
                          </label>
                        </div>
                      </>
                    ) : (
                      /* Comprehensive Alerts Mode */
                      <div className="space-y-4">
                        <div className="p-3 bg-gray-900 border border-gray-700 rounded-lg space-y-3">
                          <h5 className="text-sm font-medium text-gray-300">Add Custom Alert</h5>
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Price Type</label>
                              <select
                                value={newAlertPriceType}
                                onChange={(e) => setNewAlertPriceType(e.target.value as any)}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                              >
                                <option value="percentage">Percentage</option>
                                <option value="exact_sol">Exact (SOL)</option>
                                <option value="exact_usd">Exact (USD)</option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs text-gray-400 mb-1">Direction</label>
                              <select
                                value={newAlertDirection}
                                onChange={(e) => setNewAlertDirection(e.target.value as any)}
                                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
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
                                className="w-full px-2 py-1.5 bg-gray-800 border border-gray-700 rounded text-white text-sm"
                              />
                            </div>
                          </div>
                          
                          {/* Alert Actions - Simplified inline for now */}
                          <div className="text-xs text-gray-400">
                            Actions: Sell {newAlertDirection === 'below' ? '100%' : '25%'} + Notify
                          </div>
                          
                          <button
                            type="button"
                            onClick={() => {
                              if (!newAlertPercent) return;
                              const newAlert = {
                                id: `alert-${Date.now()}`,
                                target_percent: parseFloat(newAlertPercent),
                                direction: newAlertDirection,
                                price_type: newAlertPriceType,
                                actions: [{
                                  type: 'sell',
                                  amount: newAlertDirection === 'below' ? 100 : 25,
                                  slippage: configAutoBuySlippage || 1000,
                                  priorityFee: 0.0001,
                                  walletId: configAutoBuyWalletId,
                                  useDynamicPercentage: newAlertDirection === 'below' // Use dynamic % for stop loss
                                }, {
                                  type: 'notification'
                                }]
                              };
                              setConfigAlerts([...configAlerts, newAlert]);
                              setNewAlertPercent('');
                            }}
                            className="w-full px-3 py-1.5 bg-cyan-600 hover:bg-cyan-700 text-white text-sm rounded transition-colors"
                          >
                            <Plus className="w-3 h-3 inline mr-1" />
                            Add Alert
                          </button>
                        </div>
                        
                        {/* Alerts List */}
                        {configAlerts.length > 0 && (
                          <div className="space-y-2">
                            <h5 className="text-sm font-medium text-gray-300">Configured Alerts ({configAlerts.length})</h5>
                            {configAlerts.map((alert) => (
                              <div key={alert.id} className="p-2 bg-gray-900 border border-gray-700 rounded flex items-center justify-between">
                                <div className="text-sm">
                                  <span className="text-white font-medium">
                                    {alert.price_type === 'percentage' ? `${alert.target_percent}%` : `${alert.target_percent} ${alert.price_type === 'exact_sol' ? 'SOL' : 'USD'}`}
                                  </span>
                                  <span className={`ml-2 ${alert.direction === 'above' ? 'text-green-400' : 'text-red-400'}`}>
                                    {alert.direction === 'above' ? '↑' : '↓'}
                                  </span>
                                  <span className="ml-2 text-xs text-gray-400">
                                    Sell {alert.actions[0]?.amount}%
                                    {alert.actions[0]?.useDynamicPercentage && ' (dynamic)'}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setConfigAlerts(configAlerts.filter(a => a.id !== alert.id))}
                                  className="p-1 hover:bg-gray-800 rounded transition-colors"
                                >
                                  <X className="w-3 h-3 text-gray-400" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Quick Templates */}
                        <div className="p-2 bg-blue-900/20 border border-blue-500/30 rounded-lg">
                          <p className="text-xs text-blue-300 mb-2">💡 Quick Templates:</p>
                          <div className="flex gap-2 flex-wrap">
                            <button
                              type="button"
                              onClick={() => {
                                setConfigAlerts([
                                  {
                                    id: 'sl-30',
                                    target_percent: -30,
                                    direction: 'below',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 100,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId,
                                      useDynamicPercentage: true
                                    }, { type: 'notification' }]
                                  },
                                  {
                                    id: 'tp-50',
                                    target_percent: 50,
                                    direction: 'above',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 25,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId
                                    }, { type: 'notification' }]
                                  },
                                  {
                                    id: 'tp-100',
                                    target_percent: 100,
                                    direction: 'above',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 25,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId
                                    }, { type: 'notification' }]
                                  },
                                  {
                                    id: 'tp-200',
                                    target_percent: 200,
                                    direction: 'above',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 25,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId
                                    }, { type: 'notification' }]
                                  },
                                  {
                                    id: 'tp-500',
                                    target_percent: 500,
                                    direction: 'above',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 25,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId
                                    }, { type: 'notification' }]
                                  }
                                ]);
                              }}
                              className="px-2 py-1 bg-blue-600/30 hover:bg-blue-600/50 text-blue-300 text-xs rounded transition-colors"
                            >
                              Progressive Exits
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setConfigAlerts([
                                  {
                                    id: 'sl-50',
                                    target_percent: -50,
                                    direction: 'below',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 100,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId,
                                      useDynamicPercentage: true
                                    }, { type: 'notification' }]
                                  },
                                  {
                                    id: 'tp-100-full',
                                    target_percent: 100,
                                    direction: 'above',
                                    price_type: 'percentage',
                                    actions: [{
                                      type: 'sell',
                                      amount: 100,
                                      slippage: 1000,
                                      priorityFee: 0.0001,
                                      walletId: configAutoBuyWalletId
                                    }, { type: 'notification' }]
                                  }
                                ]);
                              }}
                              className="px-2 py-1 bg-red-600/30 hover:bg-red-600/50 text-red-300 text-xs rounded transition-colors"
                            >
                              Conservative
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Monitoring Configuration */}
                {(configActionOnDetection?.includes('monitor') || configActionOnDetection === 'all') && (
                  <div className="space-y-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg mt-4">
                    <h4 className="text-sm font-bold text-blue-300">Price Monitoring Settings</h4>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Monitor Duration (hours)
                        </label>
                        <input
                          type="number"
                          value={configMonitorDuration || 24}
                          onChange={(e) => setConfigMonitorDuration(parseInt(e.target.value))}
                          step="1"
                          min="1"
                          max="168"
                          className="w-full px-3 py-2 bg-black/40 border border-blue-500/30 rounded text-white text-sm"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-xs font-medium text-gray-300 mb-1">
                          Alert on Price Change (%)
                        </label>
                        <input
                          type="number"
                          value={configAlertThreshold || 50}
                          onChange={(e) => setConfigAlertThreshold(parseFloat(e.target.value))}
                          step="10"
                          min="10"
                          className="w-full px-3 py-2 bg-black/40 border border-blue-500/30 rounded text-white text-sm"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Forward Configuration */}
              <div className="space-y-4 p-4 bg-black/20 rounded-lg border border-yellow-500/20">
                <h4 className="text-sm font-medium text-yellow-300">Auto-Forward Settings (Optional)</h4>
                
                {/* Multi-Select Forward Destinations */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Forward Destinations
                  </label>
                  
                  {/* Selected Destinations */}
                  {selectedForwardDestinations.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-2">
                      {selectedForwardDestinations.map((dest, index) => (
                        <div key={index} className="flex items-center gap-1 px-3 py-1.5 bg-cyan-500/20 border border-cyan-500/40 rounded-lg">
                          <span className="text-sm text-cyan-300">
                            {dest.targetChatName || dest.targetChatId}
                          </span>
                          <button
                            onClick={() => {
                              setSelectedForwardDestinations(prev => 
                                prev.filter((_, i) => i !== index)
                              );
                            }}
                            className="ml-1 text-cyan-400 hover:text-cyan-300"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Dropdown Selector */}
                  <div className="relative forward-dropdown-container">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={forwardTargetFilter}
                        onChange={(e) => setForwardTargetFilter(e.target.value)}
                        onFocus={() => setShowForwardDropdown(true)}
                        placeholder="Search chats to forward to..."
                        className="flex-1 px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                      />
                      <button
                        onClick={() => setShowForwardDropdown(!showForwardDropdown)}
                        className="px-3 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-cyan-400 hover:bg-cyan-500/10 transition-colors"
                      >
                        <ChevronDown className="w-4 h-4" />
                      </button>
                    </div>
                    
                    {/* Dropdown List */}
                    {showForwardDropdown && (
                      <div className="absolute z-50 w-full mt-2 max-h-60 overflow-y-auto bg-gray-900/95 backdrop-blur-sm border border-cyan-500/30 rounded-lg shadow-xl">
                        {/* Bulk Actions */}
                        <div className="sticky top-0 bg-gray-900 border-b border-cyan-500/20 p-2 flex gap-2">
                          <button
                            onClick={() => {
                              const filtered = availableForwardTargets.filter(t => 
                                !forwardTargetFilter || 
                                t.chat_name?.toLowerCase().includes(forwardTargetFilter.toLowerCase()) ||
                                t.username?.toLowerCase().includes(forwardTargetFilter.toLowerCase())
                              );
                              const newDestinations = filtered.map(t => ({
                                targetChatId: t.chat_id,
                                targetChatName: t.chat_name || t.username || t.chat_id,
                                forwardAccountId: null
                              }));
                              setSelectedForwardDestinations(prev => {
                                const existing = new Set(prev.map(d => d.targetChatId));
                                return [
                                  ...prev,
                                  ...newDestinations.filter(d => !existing.has(d.targetChatId))
                                ];
                              });
                            }}
                            className="flex-1 px-2 py-1 text-xs bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-cyan-300 transition-colors"
                          >
                            Select All Filtered
                          </button>
                          <button
                            onClick={() => setSelectedForwardDestinations([])}
                            className="flex-1 px-2 py-1 text-xs bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-300 transition-colors"
                          >
                            Clear All
                          </button>
                        </div>
                        
                        {/* Target List */}
                        <div className="p-1">
                          {availableForwardTargets
                            .filter(target => 
                              !forwardTargetFilter || 
                              target.chat_name?.toLowerCase().includes(forwardTargetFilter.toLowerCase()) ||
                              target.username?.toLowerCase().includes(forwardTargetFilter.toLowerCase()) ||
                              target.chat_id?.toLowerCase().includes(forwardTargetFilter.toLowerCase())
                            )
                            .map(target => {
                              const isSelected = selectedForwardDestinations.some(d => d.targetChatId === target.chat_id);
                              return (
                                <button
                                  key={target.chat_id}
                                  onClick={() => {
                                    if (isSelected) {
                                      setSelectedForwardDestinations(prev => 
                                        prev.filter(d => d.targetChatId !== target.chat_id)
                                      );
                                    } else {
                                      setSelectedForwardDestinations(prev => [...prev, {
                                        targetChatId: target.chat_id,
                                        targetChatName: target.chat_name || target.username || target.chat_id,
                                        forwardAccountId: null
                                      }]);
                                    }
                                  }}
                                  className={`w-full px-3 py-2 text-left flex items-center gap-2 hover:bg-cyan-500/10 rounded transition-colors ${
                                    isSelected ? 'bg-cyan-500/20' : ''
                                  }`}
                                >
                                  <CheckSquare className={`w-4 h-4 ${isSelected ? 'text-cyan-400' : 'text-gray-500'}`} />
                                  <div className="flex-1">
                                    <div className="text-sm text-white">
                                      {target.chat_name || 'Unnamed Chat'}
                                    </div>
                                    {target.username && (
                                      <div className="text-xs text-gray-400">@{target.username}</div>
                                    )}
                                  </div>
                                  <span className="text-xs px-1.5 py-0.5 bg-black/30 rounded text-gray-400">
                                    {target.chat_type || 'unknown'}
                                  </span>
                                </button>
                              );
                            })}
                          {availableForwardTargets.length === 0 && (
                            <p className="text-center text-gray-400 py-4">No available chats to forward to</p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  
                  <p className="text-xs text-gray-400 mt-2">
                    Selected {selectedForwardDestinations.length} destination{selectedForwardDestinations.length !== 1 ? 's' : ''} for auto-forwarding
                  </p>
                </div>
                
                {/* Forward Account Selector */}
                {configForwardTo && telegramAccounts.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-cyan-300 mb-2">
                      Forward Using Account
                    </label>
                    <select
                      value={configForwardAccountId || ''}
                      onChange={(e) => setConfigForwardAccountId(e.target.value ? parseInt(e.target.value) : null)}
                      className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
                    >
                      <option value="">Same as detection account</option>
                      {telegramAccounts.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.name}{acc.phone ? ` (${acc.phone})` : ''}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-gray-400 mt-2">
                      Choose which account sends the forwarded messages
                    </p>
                    <div className="mt-3 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                      <p className="text-xs text-blue-300">
                        <strong>💡 Tip:</strong> Use a different account for forwarding to separate detection from notification, 
                        or to forward from private groups to public channels.
                      </p>
                    </div>
                  </div>
                )}
                
                {/* Auto-Forwarding Status */}
                {configForwardTo && !telegramAccounts.length && (
                  <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                    <p className="text-xs text-yellow-300">
                      ⚠️ No additional accounts available. Forwards will use the detection account.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="sticky bottom-0 bg-gray-900/95 backdrop-blur-sm border-t border-cyan-500/20 p-6 flex gap-3">
              <button
                onClick={() => {
                  setConfigModalOpen(false);
                  setSelectedForwardDestinations([]);
                  setForwardTargetFilter('');
                  setShowForwardDropdown(false);
                  setSelectedUsers([]);
                  setAvailableUsers([]);
                  setUserFilter('');
                  setShowUserDropdown(false);
                }}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    
                    // Save main configuration
                    const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${configChat.chatId}/configure`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        monitoredKeywords: configKeywords ? configKeywords.split(',').map(k => k.trim()).filter(k => k) : [],
                        monitoredUserIds: selectedUsers.map(u => u.userId),
                        forwardToChatId: configForwardTo || null,
                        forwardAccountId: configForwardAccountId,
                        initialHistoryLimit: configInitialHistory,
                        isActive: true,
                        processBotMessages: configProcessBotMessages,
                        monitoredTopicIds: !monitorAllTopics ? selectedTopicIds : [],
                        // Auto-trading configuration
                        action_on_detection: configActionOnDetection,
                        auto_buy_enabled: configActionOnDetection?.includes('trade') || false,
                        auto_buy_amount_sol: configAutoBuyAmount,
                        auto_buy_wallet_id: configAutoBuyWalletId,
                        auto_buy_slippage_bps: configAutoBuySlippage,
                        auto_buy_priority_level: configAutoBuyPriority,
                        auto_sell_enabled: configActionOnDetection?.includes('trade') || false,
                        stop_loss_percent: configStopLoss,
                        take_profit_percent: configTakeProfit,
                        trailing_stop_enabled: configTrailingStopEnabled,
                        trailing_stop_percent: configTrailingStop,
                        auto_monitor_enabled: configActionOnDetection?.includes('monitor') || false,
                        monitor_duration_hours: configMonitorDuration,
                        alert_price_changes: `${configAlertThreshold}%`
                      })
                    });

                    if (response.ok) {
                      // Save multi-destination configuration
                      if (selectedForwardDestinations.length > 0) {
                        await fetch(`${config.apiUrl}/api/telegram/forward-destinations/destinations/${configChat.chatId}`, {
                          method: 'POST',
                          credentials: 'include',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            destinations: selectedForwardDestinations.map(d => ({
                              targetChatId: d.targetChatId,
                              targetChatName: d.targetChatName,
                              forwardAccountId: d.forwardAccountId
                            }))
                          })
                        });
                      } else {
                        // Clear all destinations if none selected
                        await fetch(`${config.apiUrl}/api/telegram/forward-destinations/destinations/${configChat.chatId}`, {
                          method: 'DELETE',
                          credentials: 'include'
                        });
                      }
                      
                      // Also save duplicate strategy configuration
                      await fetch(`${config.apiUrl}/api/telegram/chat-config`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          chatId: configChat.chatId,
                          duplicateStrategy: configDuplicateStrategy,
                          backlogScanDepth: configDuplicateStrategy === 'first_only_with_backlog' ? 1000 : 0,
                          backlogTimeLimit: 86400
                        })
                      });
                      
                      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
                      setConfigModalOpen(false);
                      setSelectedForwardDestinations([]);
                      setForwardTargetFilter('');
                      setShowForwardDropdown(false);
                      setSelectedUsers([]);
                      setAvailableUsers([]);
                      setUserFilter('');
                      setShowUserDropdown(false);
                      await loadSnifferChats();
                    } else {
                      setMessage({ type: 'error', text: 'Failed to save configuration' });
                    }
                  } catch (error) {
                    setMessage({ type: 'error', text: 'Error saving configuration' });
                  } finally {
                    setLoading(false);
                  }
                }}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-cyan-600 hover:from-purple-500 hover:to-cyan-500 rounded-lg text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Saving...' : 'Save & Start Monitoring'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Chat History Viewer Modal */}
      {selectedHistoryChat && (
        <TelegramChatHistory
          chatId={selectedHistoryChat!.id}
          chatName={selectedHistoryChat!.name}
          username={selectedHistoryChat!.username}
          isOpen={!!selectedHistoryChat}
          onClose={() => setSelectedHistoryChat(null)}
        />
      )}

      {/* Global Configuration Modal */}
      {showGlobalConfigModal && createPortal(
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-[9999]">
          <div className="bg-gradient-to-br from-gray-900 via-black to-gray-900 border border-cyan-500/30 rounded-xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-2xl font-bold text-cyan-300">
                🎯 Global Configuration
              </h3>
              <button
                onClick={() => setShowGlobalConfigModal(false)}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-4 p-4 bg-cyan-500/10 border border-cyan-500/30 rounded-lg">
              <p className="text-sm text-gray-300">
                Apply the same configuration to <span className="text-cyan-400 font-bold">{selectedChats.size} selected chats</span>.
                This will activate monitoring for all selected chats.
              </p>
            </div>

            <div className="space-y-6">
              {/* Keywords Configuration */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  🔍 Monitored Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={globalConfig.monitoredKeywords.join(', ')}
                  onChange={(e) => setGlobalConfig({
                    ...globalConfig,
                    monitoredKeywords: e.target.value.split(',').map(k => k.trim()).filter(k => k)
                  })}
                  placeholder="ca, contract, pump, launch, etc."
                  className="w-full px-4 py-2 bg-black/40 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Only messages containing these keywords will be processed. Leave empty to monitor all messages.
                </p>
              </div>

              {/* Duplicate Strategy */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  🔄 Duplicate Contract Handling
                </label>
                <select
                  value={globalConfig.duplicateStrategy}
                  onChange={(e) => setGlobalConfig({
                    ...globalConfig,
                    duplicateStrategy: e.target.value
                  })}
                  className="w-full px-4 py-2 bg-black/40 border border-gray-600 rounded-lg text-white focus:border-cyan-500 focus:outline-none"
                >
                  <option value="first_only_no_backlog">First Mention Only (Real-time)</option>
                  <option value="first_only_with_backlog">First Mention Only (Scan History)</option>
                  <option value="buy_any_call">Process Every Mention</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">
                  {globalConfig.duplicateStrategy === 'first_only_no_backlog' && 'Only process the first time a contract is mentioned in real-time'}
                  {globalConfig.duplicateStrategy === 'first_only_with_backlog' && 'Process first mention after scanning chat history'}
                  {globalConfig.duplicateStrategy === 'buy_any_call' && 'Process every mention of the contract'}
                </p>
              </div>

              {/* History Limit */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  📚 Fetch Message History
                </label>
                <input
                  type="number"
                  value={globalConfig.historyLimit}
                  onChange={(e) => setGlobalConfig({
                    ...globalConfig,
                    historyLimit: parseInt(e.target.value) || 0
                  })}
                  min="0"
                  max="5000"
                  placeholder="0"
                  className="w-full px-4 py-2 bg-black/40 border border-gray-600 rounded-lg text-white placeholder-gray-500 focus:border-cyan-500 focus:outline-none"
                />
                <p className="text-xs text-gray-400 mt-1">
                  Number of past messages to scan (0 = don't fetch history, max 5000). This will run in the background.
                </p>
              </div>

              {/* Summary */}
              <div className="p-4 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                <h4 className="text-sm font-semibold text-purple-300 mb-2">📋 Configuration Summary</h4>
                <ul className="text-xs text-gray-300 space-y-1">
                  <li>✓ Will activate <span className="text-cyan-400 font-bold">{selectedChats.size} chats</span></li>
                  <li>✓ Keywords: {globalConfig.monitoredKeywords.length > 0 ? globalConfig.monitoredKeywords.join(', ') : 'All messages'}</li>
                  <li>✓ Duplicate Strategy: {globalConfig.duplicateStrategy.replace(/_/g, ' ')}</li>
                  <li>✓ History: {globalConfig.historyLimit > 0 ? `${globalConfig.historyLimit} messages` : 'Real-time only'}</li>
                </ul>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowGlobalConfigModal(false)}
                className="flex-1 px-6 py-3 bg-gray-600 hover:bg-gray-500 rounded-lg text-white font-bold transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyGlobalConfig}
                disabled={loading}
                className="flex-1 px-6 py-3 bg-gradient-to-r from-green-600 to-cyan-600 hover:from-green-500 hover:to-cyan-500 rounded-lg text-white font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Applying...' : `Apply to ${selectedChats.size} Chats`}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Auto-Trade Configuration Modal */}
      {autoTradeModalOpen && autoTradeChat && createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            {/* Modal Header */}
            <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-cyan-500/20 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-cyan-300 mb-2">Auto-Trading Configuration</h3>
                  <p className="text-gray-400">
                    {autoTradeChat.chatName || autoTradeChat.chatId}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setAutoTradeModalOpen(false);
                    setAutoTradeChat(null);
                  }}
                  className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5 text-red-400" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-6">
              <TelegramAutoTradeConfig
                chatId={autoTradeChat.chatId}
                currentConfig={autoTradeChat.autoTradeConfig}
                onSave={async (newConfig) => {
                  // Save configuration
                  try {
                    const response = await fetch(`${config.apiUrl}/api/telegram/auto-trade/config`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      credentials: 'include',
                      body: JSON.stringify({
                        chatId: autoTradeChat.chatId,
                        config: newConfig
                      })
                    });

                    if (response.ok) {
                      setMessage({ type: 'success', text: 'Auto-trade configuration saved!' });
                      setAutoTradeModalOpen(false);
                      setAutoTradeChat(null);
                      // Refresh monitored chats to show new config
                      await loadSnifferChats();
                    } else {
                      setMessage({ type: 'error', text: 'Failed to save configuration' });
                    }
                  } catch (error) {
                    setMessage({ type: 'error', text: 'Error saving configuration' });
                  }
                }}
                onCancel={() => {
                  setAutoTradeModalOpen(false);
                  setAutoTradeChat(null);
                }}
              />
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export default TelegramSnifferTab;
