import { useState, useEffect, useMemo } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';
import { useWebSocket } from '../hooks/useWebSocket';
import TelegramChatHistory from './TelegramChatHistory';

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

interface MonitoredChat {
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
  forwardAccountId?: number | null;
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
  const [activeSection, setActiveSection] = useState<'sniffer' | 'monitored' | 'detections' | 'forwards' | 'settings'>('sniffer');
  const [fetchProgress, setFetchProgress] = useState<{saved: number, total: number} | null>(null);
  const [userAccount, setUserAccount] = useState<TelegramAccount | null>(null);
  const [botAccount, setBotAccount] = useState<TelegramAccount | null>(null);
  const [availableChats, setAvailableChats] = useState<any[]>([]);
  const [monitoredChats, setMonitoredChats] = useState<MonitoredChat[]>([]);
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
  const [configUserIds, setConfigUserIds] = useState('');
  const [configForwardTo, setConfigForwardTo] = useState('');
  const [configForwardAccountId, setConfigForwardAccountId] = useState<number | null>(null);
  const [configContractDetection, setConfigContractDetection] = useState(true);
  const [configInitialHistory, setConfigInitialHistory] = useState(0); // 0 = none, 1-10000 = limit, 999999 = all
  
  // Available telegram accounts for forwarding
  const [telegramAccounts, setTelegramAccounts] = useState<Array<{ id: number; name: string; phone?: string }>>([]);

  // Chat history viewing state
  const [selectedHistoryChat, setSelectedHistoryChat] = useState<{id: string, name: string} | null>(null);

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
      loadMonitoredChats(); // Reload chat list
    });

    const unsubscribe4 = subscribe('telegram_chat_fetch_complete', (data: any) => {
      setFetchProgress(null);
      setMessage({ type: 'success', text: `Successfully saved ${data.savedCount}/${data.totalChats} chats!` });
      loadMonitoredChats();
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

  // Load account status and chats when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      loadAccountStatus();
      loadMonitoredChats(); // Load existing chats from database
      loadDetections(); // Load existing detections
      loadTelegramAccounts(); // Load available accounts for forwarding
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

  const loadMonitoredChats = async () => {
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

      // Load active chats for Monitored section
      const activeChatsResponse = await fetch(`${config.apiUrl}/api/telegram/monitored-chats`, {
        credentials: 'include'
      });

      if (activeChatsResponse.ok) {
        const activeChats = await activeChatsResponse.json();
        setMonitoredChats(activeChats);
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
      ? `Delete ALL ${availableChats.length} chats?` 
      : `Delete ${selectedChats.size} selected chats?`;
    
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
        loadMonitoredChats();
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to delete chats' });
      }
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
        loadMonitoredChats();
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
    let filtered = availableChats;
    
    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(chat => 
        chat.chatName?.toLowerCase().includes(query) ||
        chat.username?.toLowerCase().includes(query) ||
        chat.chatId?.includes(query) ||
        chat.description?.toLowerCase().includes(query)
      );
    }
    
    // Apply type filter
    if (filterType !== 'all') {
      filtered = filtered.filter(chat => {
        if (filterType === 'group') return chat.chatType === 'group' || chat.chatType === 'supergroup';
        if (filterType === 'channel') return chat.chatType === 'channel';
        if (filterType === 'private') return chat.chatType === 'private';
        return true;
      });
    }
    
    // Apply verified filter
    if (filterVerified) {
      filtered = filtered.filter(chat => chat.isVerified);
    }
    
    return filtered;
  }, [availableChats, searchQuery, filterType, filterVerified]);
  
  // Load chats and detections when switching sections
  useEffect(() => {
    if (activeSection === 'monitored') {
      loadMonitoredChats();
    } else if (activeSection === 'detections') {
      loadDetections();
    } else if (activeSection === 'sniffer') {
      // Load available chats if we have them
      if (availableChats.length === 0) {
        loadMonitoredChats(); // For now, show monitored chats in the sniffer too
      }
    } else if (activeSection === 'forwards') {
      loadForwardingHistory();
      loadForwardingStats();
    }
  }, [activeSection]);

  return (
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
          Monitored ({monitoredChats.filter(c => c.isActive).length})
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
                    Monitoring: <span className="text-cyan-400 font-bold">{monitoredChats.filter(c => c.isActive).length}</span> active chats
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
              
              {/* Filters */}
              <div className="flex gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as any)}
                  className="px-3 py-2 bg-black/40 border border-cyan-500/30 rounded-lg text-white focus:outline-none focus:border-cyan-400"
                >
                  <option value="all">All Types</option>
                  <option value="group">Groups</option>
                  <option value="channel">Channels</option>
                  <option value="private">Private</option>
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
                      onClick={() => handleBulkDelete('selected')}
                      className="px-3 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
                    >
                      <Trash2 className="w-3 h-3 inline mr-1" />
                      Delete Selected ({selectedChats.size})
                    </button>
                    <button
                      className="px-3 py-1 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 text-sm font-medium transition-all"
                    >
                      Configure Selected ({selectedChats.size})
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
                  const isMonitored = monitoredChats.some(m => m.chatId === chat.chatId && m.isActive);
                  
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
                              {chat.chatType === 'bot' && (
                                <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/40 rounded text-purple-400 text-xs font-bold flex items-center gap-1">
                                  <Bot className="w-3 h-3" /> BOT
                                </span>
                              )}
                              {chat.isVerified && (
                                <span title="Verified">
                                  <Shield className="w-4 h-4 text-blue-400" />
                                </span>
                              )}
                              {isMonitored && (
                                <span className="px-2 py-0.5 bg-green-500/20 border border-green-500/30 rounded text-green-400 text-xs font-bold">
                                  MONITORING
                                </span>
                              )}
                              {chat.contractsDetected30d > 0 && (
                                <span className="px-2 py-0.5 bg-yellow-500/20 border border-yellow-500/30 rounded text-yellow-400 text-xs font-bold">
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
                                  body: JSON.stringify({ isActive: !isMonitored })
                                });
                                if (response.ok) {
                                  setMessage({ type: 'success', text: `${isMonitored ? 'Stopped' : 'Started'} monitoring ${chat.chatName}` });
                                  await loadMonitoredChats();
                                } else {
                                  setMessage({ type: 'error', text: 'Failed to toggle monitoring' });
                                }
                              } catch (error) {
                                setMessage({ type: 'error', text: 'Error toggling monitoring' });
                              }
                            }}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                              isMonitored
                                ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400'
                                : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400'
                            }`}
                          >
                            {isMonitored ? 'Stop' : 'Start'}
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfigChat(chat);
                              const monitored = monitoredChats.find(m => m.chatId === chat.chatId);
                              if (monitored) {
                                setConfigKeywords(monitored.monitoredKeywords?.join(', ') || '');
                                setConfigUserIds(monitored.monitoredUserIds?.join(', ') || '');
                                setConfigForwardTo(monitored.forwardToChatId || '');
                              }
                              setConfigModalOpen(true);
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
                          setMonitoredChats([]);
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
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold text-cyan-300">Active Monitoring</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Currently monitoring {monitoredChats.filter(c => c.isActive).length} of {monitoredChats.length} configured chats
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 text-sm font-medium transition-all"
                >
                  Pause All
                </button>
                <button
                  className="px-3 py-1.5 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 text-sm font-medium transition-all"
                >
                  Resume All
                </button>
              </div>
            </div>
          </div>

          {/* Monitored Chats */}
          <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
            {monitoredChats.filter(c => c.isActive).length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                <Radio className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No active monitoring</p>
                <p className="text-sm mt-2">Go to Sniffer tab to select and configure chats</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {monitoredChats.filter(c => c.isActive).map((chat) => (
                  <div key={chat.id} className="bg-black/40 border border-green-500/20 rounded-lg p-4 hover:border-green-500/40 transition-all">
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
                          onClick={() => setSelectedHistoryChat({ id: chat.chatId, name: chat.chatName || chat.chatId })}
                          className="px-2 py-1 bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 rounded text-purple-400 text-xs font-medium transition-all flex items-center gap-1"
                          title="View message history"
                        >
                          <History className="w-3 h-3" />
                          History
                        </button>
                        <button
                          onClick={() => {/* TODO: Open configuration modal */}}
                          className="px-2 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-cyan-400 text-xs font-medium transition-all flex items-center gap-1"
                          title="Configure monitoring"
                        >
                          <SettingsIcon className="w-3 h-3" />
                          Configure
                        </button>
                        <button
                          className="px-2 py-1 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded text-red-400 text-xs font-medium transition-all"
                          title="Pause monitoring"
                        >
                          Pause
                        </button>
                      </div>
                    </div>
                    
                    {/* Comprehensive Insights */}
                    <div className="space-y-3">
                      {/* Configuration Summary */}
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        {chat.monitoredUserIds && chat.monitoredUserIds.length > 0 ? (
                          <span className="px-2 py-1 bg-cyan-500/20 border border-cyan-500/30 rounded text-cyan-400 flex items-center gap-1">
                            <Users className="w-3 h-3" />
                            {chat.monitoredUserIds.length} users
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400">
                            All users
                          </span>
                        )}
                        
                        {chat.monitoredKeywords && chat.monitoredKeywords.length > 0 ? (
                          <span className="px-2 py-1 bg-purple-500/20 border border-purple-500/30 rounded text-purple-400">
                            {chat.monitoredKeywords.length} keywords
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-gray-500/20 border border-gray-500/30 rounded text-gray-400">
                            All messages
                          </span>
                        )}
                        
                        {chat.forwardToChatId && (
                          <span className="px-2 py-1 bg-green-500/20 border border-green-500/30 rounded text-green-400 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" />
                            Auto-forward
                          </span>
                        )}
                        
                        {chat.forwardAccountId && (
                          <span className="px-2 py-1 bg-orange-500/20 border border-orange-500/30 rounded text-orange-400">
                            Custom account
                          </span>
                        )}
                      </div>
                      
                      {/* Stats Grid */}
                      <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-700/50">
                        <div className="text-center">
                          <p className="text-lg font-bold text-cyan-400">
                            {detections.filter(d => d.chatId === chat.chatId).length}
                          </p>
                          <p className="text-[10px] text-gray-500">Detections</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-green-400">
                            {detections.filter(d => d.chatId === chat.chatId && d.forwarded).length}
                          </p>
                          <p className="text-[10px] text-gray-500">Forwarded</p>
                        </div>
                        <div className="text-center">
                          <p className="text-lg font-bold text-purple-400">
                            {Math.round((detections.filter(d => d.chatId === chat.chatId && d.forwarded).length / Math.max(detections.filter(d => d.chatId === chat.chatId).length, 1)) * 100)}%
                          </p>
                          <p className="text-[10px] text-gray-500">Success Rate</p>
                        </div>
                      </div>
                      
                      {/* Forward Target */}
                      {chat.forwardToChatId && (
                        <div className="text-xs text-gray-500 flex items-center gap-2 pt-2 border-t border-gray-700/50">
                          <ExternalLink className="w-3 h-3" />
                          <span>Forwarding to:</span>
                          <span className="text-cyan-400 font-mono">{chat.forwardToChatId}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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

      {/* Configuration Modal */}
      {configModalOpen && configChat && (
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
                    User IDs to Monitor
                  </label>
                  <input
                    type="text"
                    value={configUserIds}
                    onChange={(e) => setConfigUserIds(e.target.value)}
                    placeholder="123456789, 987654321 (comma-separated)"
                    className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Only messages from these Telegram user IDs will be monitored
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

              {/* Forward Configuration */}
              <div className="space-y-4 p-4 bg-black/20 rounded-lg border border-yellow-500/20">
                <h4 className="text-sm font-medium text-yellow-300">Auto-Forward Settings (Optional)</h4>
                
                {/* Forward To Chat */}
                <div>
                  <label className="block text-sm font-medium text-cyan-300 mb-2">
                    Destination Chat
                  </label>
                  <input
                    type="text"
                    value={configForwardTo}
                    onChange={(e) => setConfigForwardTo(e.target.value)}
                    placeholder="Enter chat ID or @username"
                    className="w-full px-4 py-3 bg-black/40 border border-cyan-500/30 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-cyan-500/50"
                  />
                  <p className="text-xs text-gray-400 mt-2">
                    Auto-forward detected contracts to this chat
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
                onClick={() => setConfigModalOpen(false)}
                className="flex-1 px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg text-white font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats/${configChat.chatId}/configure`, {
                      method: 'POST',
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        monitoredKeywords: configKeywords ? configKeywords.split(',').map(k => k.trim()).filter(k => k) : [],
                        monitoredUserIds: configUserIds ? configUserIds.split(',').map(u => u.trim()).filter(u => u) : [],
                        forwardToChatId: configForwardTo || null,
                        forwardAccountId: configForwardAccountId,
                        initialHistoryLimit: configInitialHistory,
                        isActive: true
                      })
                    });

                    if (response.ok) {
                      setMessage({ type: 'success', text: 'Configuration saved successfully!' });
                      setConfigModalOpen(false);
                      await loadMonitoredChats();
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
        </div>
      )}

      {/* Chat History Viewer Modal */}
      {selectedHistoryChat && (
        <TelegramChatHistory
          chatId={selectedHistoryChat.id}
          chatName={selectedHistoryChat.name}
          isOpen={!!selectedHistoryChat}
          onClose={() => setSelectedHistoryChat(null)}
        />
      )}
    </div>
  );
}

export default TelegramSnifferTab;
