import { useState, useEffect } from 'react';
import { Trash2, Download, AlertTriangle, Check, X } from 'lucide-react';
import { config } from '../config';
import { useAuth } from '../contexts/AuthContext';

interface DataSummary {
  telegramUserAccounts: number;
  telegramBotAccounts: number;
  monitoredChats: number;
  detectedContracts: number;
  lastActivity: number | null;
}

export function UserDataManagement() {
  const { isAuthenticated } = useAuth();
  const [dataSummary, setDataSummary] = useState<DataSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showNuclearConfirm, setShowNuclearConfirm] = useState(false);
  const [confirmText, setConfirmText] = useState('');

  useEffect(() => {
    if (isAuthenticated) {
      loadDataSummary();
    }
  }, [isAuthenticated]);

  const loadDataSummary = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/user/data-summary`, {
        credentials: 'include'
      });

      if (response.ok) {
        const data = await response.json();
        setDataSummary(data.summary);
      }
    } catch (error: any) {
      console.error('Failed to load data summary:', error);
    }
  };

  const deleteDataType = async (type: string, name: string) => {
    if (!confirm(`Are you sure you want to delete all your ${name}? This cannot be undone.`)) {
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/user/data/${type}`, {
        method: 'DELETE',
        credentials: 'include'
      });

      if (response.ok) {
        const result = await response.json();
        setMessage({ type: 'success', text: result.message });
        loadDataSummary();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to delete data' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const deleteAllData = async () => {
    if (confirmText !== 'DELETE_ALL_MY_DATA') {
      setMessage({ type: 'error', text: 'Please type the confirmation text exactly' });
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/user/data/all`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmCode: 'DELETE_ALL_MY_DATA' })
      });

      if (response.ok) {
        const result = await response.json();
        setMessage({ 
          type: 'success', 
          text: `Successfully deleted ${result.totalRecords} records. All your data has been permanently removed.` 
        });
        setShowNuclearConfirm(false);
        setConfirmText('');
        loadDataSummary();
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to delete all data' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const exportData = async () => {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch(`${config.apiUrl}/api/user/data/export`, {
        credentials: 'include'
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `user-data-export-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        setMessage({ type: 'success', text: 'Data exported successfully' });
      } else {
        const error = await response.json();
        setMessage({ type: 'error', text: error.error || 'Failed to export data' });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
        <p className="text-yellow-300">Please connect your wallet to manage your data</p>
      </div>
    );
  }

  if (!dataSummary) {
    return (
      <div className="p-4 text-center text-gray-400">
        <p>Loading your data...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-cyan-300">User Data Management</h2>
        <p className="text-sm text-gray-400 mt-1">Manage, export, or delete your personal data</p>
      </div>

      {/* Message */}
      {message && (
        <div className={`p-4 rounded-lg border ${
          message.type === 'success' 
            ? 'bg-green-500/10 border-green-500/20 text-green-300' 
            : 'bg-red-500/10 border-red-500/20 text-red-300'
        }`}>
          <div className="flex items-center gap-2">
            {message.type === 'success' ? <Check className="w-5 h-5" /> : <X className="w-5 h-5" />}
            <p>{message.text}</p>
          </div>
        </div>
      )}

      {/* Data Summary */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
        <h3 className="text-lg font-bold text-cyan-300 mb-4">Your Data Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{dataSummary.telegramUserAccounts}</p>
            <p className="text-xs text-gray-400 mt-1">Telegram Accounts</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{dataSummary.telegramBotAccounts}</p>
            <p className="text-xs text-gray-400 mt-1">Bot Accounts</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{dataSummary.monitoredChats}</p>
            <p className="text-xs text-gray-400 mt-1">Monitored Chats</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{dataSummary.detectedContracts}</p>
            <p className="text-xs text-gray-400 mt-1">Detected Contracts</p>
          </div>
        </div>
        {dataSummary.lastActivity && (
          <p className="text-xs text-gray-500 mt-4 text-center">
            Last activity: {new Date(dataSummary.lastActivity * 1000).toLocaleString()}
          </p>
        )}
      </div>

      {/* Export Data */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-cyan-500/20 p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-cyan-300 mb-2">Export Your Data</h3>
            <p className="text-sm text-gray-400">
              Download all your data in JSON format (GDPR compliant)
            </p>
          </div>
          <button
            onClick={exportData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-lg text-blue-400 font-medium transition-all disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Delete Specific Data */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-yellow-500/20 p-6">
        <h3 className="text-lg font-bold text-yellow-300 mb-4">Delete Specific Data</h3>
        <div className="space-y-3">
          {dataSummary.telegramUserAccounts > 0 && (
            <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-yellow-500/10">
              <div>
                <p className="text-white font-medium">Telegram User Account</p>
                <p className="text-xs text-gray-400">Your Telegram authentication & sessions</p>
              </div>
              <button
                onClick={() => deleteDataType('telegram-user-account', 'Telegram user account')}
                disabled={loading}
                className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded text-yellow-400 text-sm font-medium transition-all disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}

          {dataSummary.telegramBotAccounts > 0 && (
            <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-yellow-500/10">
              <div>
                <p className="text-white font-medium">Telegram Bot Account</p>
                <p className="text-xs text-gray-400">Your bot token & configuration</p>
              </div>
              <button
                onClick={() => deleteDataType('telegram-bot-account', 'Telegram bot account')}
                disabled={loading}
                className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded text-yellow-400 text-sm font-medium transition-all disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}

          {dataSummary.monitoredChats > 0 && (
            <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-yellow-500/10">
              <div>
                <p className="text-white font-medium">Monitored Chats ({dataSummary.monitoredChats})</p>
                <p className="text-xs text-gray-400">All chat configurations</p>
              </div>
              <button
                onClick={() => deleteDataType('monitored-chats', 'monitored chats')}
                disabled={loading}
                className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded text-yellow-400 text-sm font-medium transition-all disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}

          {dataSummary.detectedContracts > 0 && (
            <div className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-yellow-500/10">
              <div>
                <p className="text-white font-medium">Detected Contracts ({dataSummary.detectedContracts})</p>
                <p className="text-xs text-gray-400">All contract detections history</p>
              </div>
              <button
                onClick={() => deleteDataType('detected-contracts', 'detected contracts')}
                disabled={loading}
                className="px-3 py-1.5 bg-yellow-500/20 hover:bg-yellow-500/30 border border-yellow-500/40 rounded text-yellow-400 text-sm font-medium transition-all disabled:opacity-50"
              >
                Delete
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Nuclear Option */}
      <div className="bg-black/20 backdrop-blur-sm rounded-xl border border-red-500/20 p-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-6 h-6 text-red-400 flex-shrink-0 mt-1" />
          <div>
            <h3 className="text-lg font-bold text-red-300 mb-1">Delete All Data</h3>
            <p className="text-sm text-gray-400">
              Permanently delete ALL your data. This action cannot be undone!
            </p>
          </div>
        </div>

        {!showNuclearConfirm ? (
          <button
            onClick={() => setShowNuclearConfirm(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete All My Data
          </button>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded">
              <p className="text-sm text-red-300 mb-2">
                Type <code className="px-2 py-1 bg-black/40 rounded font-mono text-xs">DELETE_ALL_MY_DATA</code> to confirm:
              </p>
              <input
                type="text"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="Type here to confirm..."
                className="w-full px-3 py-2 bg-black/40 border border-red-500/30 rounded text-white placeholder-gray-500 focus:outline-none focus:border-red-400"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={deleteAllData}
                disabled={loading || confirmText !== 'DELETE_ALL_MY_DATA'}
                className="flex-1 px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-400 font-medium transition-all disabled:opacity-50"
              >
                {loading ? 'Deleting...' : 'Confirm Delete All'}
              </button>
              <button
                onClick={() => {
                  setShowNuclearConfirm(false);
                  setConfirmText('');
                }}
                disabled={loading}
                className="px-4 py-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/40 rounded-lg text-gray-400 font-medium transition-all disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
