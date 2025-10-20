import { useState, useEffect } from 'react';
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
  RefreshCw
} from 'lucide-react';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';

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
}

interface ContractDetection {
  id: number;
  chatId: string;
  contractAddress: string;
  detectionType: 'standard' | 'obfuscated' | 'split';
  senderUsername?: string;
  detectedAt: number;
}

export function TelegramSnifferTab() {
  const { isAuthenticated } = useAuth();
  const [activeSection, setActiveSection] = useState<'settings' | 'chats' | 'detections'>('settings');
  const [userAccount, setUserAccount] = useState<TelegramAccount | null>(null);
  const [botAccount, setBotAccount] = useState<TelegramAccount | null>(null);
  const [monitoredChats, setMonitoredChats] = useState<MonitoredChat[]>([]);
  const [detections, setDetections] = useState<ContractDetection[]>([]);
  
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

  // Load account status when authentication changes
  useEffect(() => {
    if (isAuthenticated) {
      loadAccountStatus();
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

  const loadMonitoredChats = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/monitored-chats`, {
        credentials: 'include'
      });

      if (response.ok) {
        const chats = await response.json();
        setMonitoredChats(chats);
      }
    } catch (error) {
      console.error('Failed to load monitored chats:', error);
    }
  };

  const loadDetections = async () => {
    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/detected-contracts?limit=50`, {
        credentials: 'include'
      });

      if (response.ok) {
        const contracts = await response.json();
        setDetections(contracts);
      }
    } catch (error) {
      console.error('Failed to load detections:', error);
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

  const handleFetchChats = async () => {
    setLoading(true);
    setMessage(null);

    try {
      if (!isAuthenticated) return;

      const response = await fetch(`${config.apiUrl}/api/telegram/fetch-chats`, {
        method: 'POST',
        credentials: 'include'
      });

      if (response.ok) {
        setMessage({ type: 'success', text: 'Chats fetched successfully!' });
        await loadMonitoredChats();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to fetch chats' });
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

  // Load chats and detections when switching sections
  useEffect(() => {
    if (activeSection === 'chats') {
      loadMonitoredChats();
    } else if (activeSection === 'detections') {
      loadDetections();
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

      {/* Section Tabs */}
      <div className="flex gap-2 mb-6 bg-black/40 backdrop-blur-xl p-1.5 rounded-xl border border-cyan-500/20">
        <button
          onClick={() => setActiveSection('settings')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeSection === 'settings'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <SettingsIcon className="w-4 h-4" />
          Account Settings
        </button>
        <button
          onClick={() => setActiveSection('chats')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeSection === 'chats'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Monitored Chats
        </button>
        <button
          onClick={() => setActiveSection('detections')}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
            activeSection === 'detections'
              ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/40'
              : 'text-gray-400 hover:text-cyan-300'
          }`}
        >
          <Radio className="w-4 h-4" />
          Detections
        </button>
      </div>

      {/* Content */}
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
                  placeholder={userAccount?.apiId || "26373394"}
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
                    placeholder={userAccount?.apiHash || "45c5edf0039ffdd8efe7965189b42141"}
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
                  placeholder={userAccount?.phoneNumber || "+66642397038"}
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
            {userAccount?.configured && !userAccount?.verified && (
              <div className="mt-4 space-y-4">
                {authStep === 'idle' && (
                  <button
                    onClick={handleStartAuth}
                    disabled={loading}
                    className="w-full px-4 py-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 font-medium transition-all disabled:opacity-50"
                  >
                    {loading ? 'Starting...' : 'Start Authentication'}
                  </button>
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
        </div>
      )}

      {activeSection === 'chats' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-xl font-bold text-cyan-300">Monitored Chats</h3>
            <button
              onClick={handleFetchChats}
              disabled={loading || !userAccount?.verified}
              className="flex items-center gap-2 px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 font-medium transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Fetch My Chats
            </button>
          </div>

          {!userAccount?.verified && (
            <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-4">
              <p className="text-yellow-300 text-sm">
                Please configure and verify your user account first to fetch chats.
              </p>
            </div>
          )}

          {monitoredChats.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No monitored chats yet</p>
              <p className="text-sm">Click "Fetch My Chats" to load your Telegram conversations</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {monitoredChats.map((chat) => (
                <div key={chat.id} className="bg-black/20 backdrop-blur-sm rounded-lg border border-cyan-500/20 p-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h4 className="font-medium text-white">{chat.chatName || chat.chatId}</h4>
                      <div className="space-y-1 mt-1">
                        <p className="text-sm text-gray-400">
                          Type: <span className="text-gray-300">{chat.chatType}</span>
                        </p>
                        <p className="text-sm text-gray-400">
                          ID: <span className="font-mono text-gray-300">{chat.chatId}</span>
                        </p>
                        {chat.username && (
                          <p className="text-sm text-gray-400">
                            Username: <a href={`https://t.me/${chat.username}`} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline">@{chat.username}</a>
                          </p>
                        )}
                        {chat.inviteLink && (
                          <p className="text-sm text-gray-400">
                            Invite Link: <a href={chat.inviteLink} target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:underline truncate max-w-xs inline-block align-bottom">{chat.inviteLink}</a>
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-1 rounded text-xs font-bold ${
                        chat.isActive
                          ? 'bg-green-500/20 border border-green-500/30 text-green-400'
                          : 'bg-gray-500/20 border border-gray-500/30 text-gray-400'
                      }`}>
                        {chat.isActive ? 'ACTIVE' : 'INACTIVE'}
                      </span>
                    </div>
                  </div>
                  
                  {/* Configuration Section */}
                  <div className="mt-4 pt-4 border-t border-cyan-500/10">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {/* Monitored Keywords */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Keywords to Monitor
                        </label>
                        <div className="text-sm text-gray-300">
                          {chat.monitoredKeywords && chat.monitoredKeywords.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {chat.monitoredKeywords.map((keyword, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-cyan-500/10 border border-cyan-500/20 rounded text-cyan-400 text-xs">
                                  {keyword}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">No keywords set - monitoring all messages</span>
                          )}
                        </div>
                      </div>

                      {/* Monitored Users */}
                      <div>
                        <label className="block text-xs font-medium text-gray-400 mb-1">
                          Monitored User IDs
                        </label>
                        <div className="text-sm text-gray-300">
                          {chat.monitoredUserIds && chat.monitoredUserIds.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {chat.monitoredUserIds.map((userId, idx) => (
                                <span key={idx} className="px-2 py-0.5 bg-purple-500/10 border border-purple-500/20 rounded text-purple-400 text-xs font-mono">
                                  {userId}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-500 text-xs">No specific users - monitoring all</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-3">
                      <button
                        className="flex-1 px-3 py-1.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 text-sm font-medium transition-all"
                      >
                        Configure
                      </button>
                      <button
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                          chat.isActive
                            ? 'bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 text-red-400'
                            : 'bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 text-green-400'
                        }`}
                      >
                        {chat.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeSection === 'detections' && (
        <div>
          <h3 className="text-xl font-bold text-cyan-300 mb-4">Detected Contracts</h3>

          {detections.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <Radio className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No contract detections yet</p>
              <p className="text-sm">Contracts will appear here when detected in monitored chats</p>
            </div>
          ) : (
            <div className="space-y-2">
              {detections.map((detection) => (
                <div key={detection.id} className="bg-black/20 backdrop-blur-sm rounded-lg border border-cyan-500/20 p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <code className="text-cyan-400 font-mono text-sm">{detection.contractAddress}</code>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                          detection.detectionType === 'standard'
                            ? 'bg-green-500/20 text-green-400'
                            : detection.detectionType === 'obfuscated'
                            ? 'bg-yellow-500/20 text-yellow-400'
                            : 'bg-purple-500/20 text-purple-400'
                        }`}>
                          {detection.detectionType.toUpperCase()}
                        </span>
                        {detection.senderUsername && (
                          <span className="text-xs text-gray-400">from @{detection.senderUsername}</span>
                        )}
                        <span className="text-xs text-gray-500">
                          {new Date(detection.detectedAt * 1000).toLocaleString()}
                        </span>
                      </div>
                    </div>
                    <a
                      href={`https://solscan.io/token/${detection.contractAddress}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded text-cyan-400 text-sm transition-all"
                    >
                      View
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default TelegramSnifferTab;
