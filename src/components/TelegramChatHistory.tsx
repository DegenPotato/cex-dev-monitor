import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { 
  MessageSquare, 
  Bot, 
  User,
  X,
  Download,
  RefreshCw,
  Copy,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';

interface Message {
  id: number;
  message_id: number;
  message_text: string | null;
  message_date: number;
  sender_id: string | null;
  sender_username: string | null;
  sender_name: string | null;
  is_bot: number;
  is_forwarded: number;
  has_media: number;
  media_type: string | null;
  has_contract: number;
  detected_contracts: string[];
}

interface TelegramChatHistoryProps {
  chatId: string;
  chatName: string;
  isOpen: boolean;
  onClose: () => void;
}

export function TelegramChatHistory({ chatId, chatName, isOpen, onClose }: TelegramChatHistoryProps) {
  const { subscribe } = useWebSocket(`${config.wsUrl}/ws`);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchProgress, setFetchProgress] = useState({ fetched: 0, total: 0 });
  const [fetchStatus, setFetchStatus] = useState<any>(null);
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);
  const [fetchLimit, setFetchLimit] = useState(1000);
  const [showLimitSelector, setShowLimitSelector] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Load cached messages when modal opens
  useEffect(() => {
    if (isOpen && chatId) {
      loadCachedMessages();
    }
  }, [isOpen, chatId]);

  // Subscribe to WebSocket events for fetch progress
  useEffect(() => {
    const unsubProgress = subscribe('history_fetch_progress', (data: any) => {
      if (data.chatId === chatId) {
        setFetchProgress({ fetched: data.fetched, total: data.total });
      }
    });

    const unsubComplete = subscribe('history_fetch_complete', (data: any) => {
      if (data.chatId === chatId) {
        setFetching(false);
        loadCachedMessages(); // Reload to show new messages
      }
    });

    const unsubError = subscribe('history_fetch_error', (data: any) => {
      if (data.chatId === chatId) {
        setFetching(false);
        console.error('History fetch error:', data.error);
      }
    });

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [chatId, subscribe]);

  const loadCachedMessages = async (resetOffset = false) => {
    setLoading(true);
    try {
      const currentOffset = resetOffset ? 0 : offset;
      const response = await fetch(
        `${config.apiUrl}/api/telegram/chats/${encodeURIComponent(chatId)}/history?limit=50&offset=${currentOffset}`,
        { credentials: 'include' }
      );

      if (response.ok) {
        const data = await response.json();
        if (resetOffset || offset === 0) {
          setMessages(data.messages);
          setOffset(data.messages.length);
        } else {
          setMessages(prev => [...prev, ...data.messages]);
          setOffset(prev => prev + data.messages.length);
        }
        setFetchStatus(data.fetchStatus);
        setHasMore(data.hasMore);
      }
    } catch (error) {
      console.error('Error loading cached messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNewHistory = async () => {
    setFetching(true);
    setFetchProgress({ fetched: 0, total: fetchLimit });
    setShowLimitSelector(false);

    try {
      const response = await fetch(
        `${config.apiUrl}/api/telegram/chats/${encodeURIComponent(chatId)}/fetch-history`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ limit: fetchLimit })
        }
      );

      if (!response.ok) {
        throw new Error('Failed to start history fetch');
      }
    } catch (error) {
      console.error('Error fetching history:', error);
      setFetching(false);
    }
  };

  const limitOptions = [
    { value: 100, label: 'Last 100 messages' },
    { value: 500, label: 'Last 500 messages' },
    { value: 1000, label: 'Last 1,000 messages' },
    { value: 5000, label: 'Last 5,000 messages' },
    { value: 10000, label: 'Last 10,000 messages' },
    { value: 50000, label: 'Last 50,000 messages' },
    { value: 999999, label: 'Entire History (All)' }
  ];

  const copyContract = (contract: string) => {
    navigator.clipboard.writeText(contract);
  };

  const openInSolscan = (contract: string) => {
    window.open(`https://solscan.io/token/${contract}`, '_blank');
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const handleScroll = useCallback(() => {
    if (!scrollContainerRef.current || loading || !hasMore) return;

    const { scrollTop } = scrollContainerRef.current;
    if (scrollTop < 100) {
      loadCachedMessages();
    }
  }, [loading, hasMore]);

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" style={{ zIndex: 9999 }}>
      <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
        
        {/* Header */}
        <div className="border-b border-cyan-500/20 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-6 h-6 text-cyan-400" />
            <div>
              <h3 className="text-xl font-bold text-cyan-300">{chatName}</h3>
              <p className="text-sm text-gray-400">{chatId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {fetchStatus && (
              <div className="text-xs text-gray-400 mr-4 space-y-1">
                <div>
                  💾 <strong>{fetchStatus.total_messages_fetched.toLocaleString()}</strong> cached in DB
                </div>
                <div>
                  👁️ <strong>{messages.length.toLocaleString()}</strong> loaded in view
                  {hasMore && <span className="text-cyan-400 ml-1">(scroll up ↑ for older)</span>}
                </div>
              </div>
            )}
            <div className="relative">
              <button
                onClick={() => setShowLimitSelector(!showLimitSelector)}
                disabled={fetching}
                className="p-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 transition-all disabled:opacity-50"
                title="Fetch messages"
              >
                <Download className="w-5 h-5" />
              </button>
              
              {/* Limit Selector Dropdown */}
              {showLimitSelector && (
                <div className="absolute right-0 top-full mt-2 bg-gray-900 border border-cyan-500/40 rounded-lg shadow-2xl z-10 min-w-[240px]">
                  <div className="p-2 border-b border-cyan-500/20">
                    <p className="text-xs text-gray-400 mb-2">Select how many messages to fetch:</p>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {limitOptions.map((option) => (
                      <button
                        key={option.value}
                        onClick={() => {
                          setFetchLimit(option.value);
                          fetchNewHistory();
                        }}
                        className={`w-full text-left px-4 py-2 hover:bg-cyan-500/10 transition-colors ${
                          fetchLimit === option.value ? 'bg-cyan-500/20 text-cyan-300' : 'text-gray-300'
                        }`}
                      >
                        <span className="text-sm">{option.label}</span>
                        <span className="text-xs text-gray-500 ml-2">
                          ({option.value.toLocaleString()})
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-cyan-500/20">
                    <button
                      onClick={() => setShowLimitSelector(false)}
                      className="w-full px-3 py-1 bg-gray-800 hover:bg-gray-700 rounded text-sm text-gray-400"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
            <button
              onClick={() => loadCachedMessages(true)}
              className="p-2 bg-green-500/20 hover:bg-green-500/30 border border-green-500/40 rounded-lg text-green-400 transition-all"
              title="Refresh and load latest messages"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={onClose}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>

        {/* Fetch Progress */}
        {fetching && (
          <div className="border-b border-cyan-500/20 p-3 bg-cyan-500/10">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-cyan-300">
                Fetching {fetchLimit === 999999 ? 'entire history' : `last ${fetchLimit.toLocaleString()} messages`}...
              </span>
              <span className="text-sm text-cyan-400">
                {fetchProgress.fetched} / {fetchProgress.total}
              </span>
            </div>
            <div className="w-full bg-black/40 rounded-full h-2">
              <div 
                className="bg-gradient-to-r from-cyan-500 to-purple-500 h-2 rounded-full transition-all"
                style={{ width: `${(fetchProgress.fetched / fetchProgress.total) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Messages Container */}
        <div 
          ref={scrollContainerRef}
          onScroll={handleScroll}
          className="flex-1 overflow-y-auto p-4 space-y-2 flex flex-col-reverse"
        >
          {messages.length === 0 && !loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <MessageSquare className="w-12 h-12 text-gray-600 mx-auto mb-3" />
                <p className="text-gray-400">No messages cached yet</p>
                <p className="text-xs text-gray-500 mt-2 mb-4">Click the download icon above to fetch messages</p>
                <div className="space-y-2">
                  {limitOptions.slice(0, 4).map((option) => (
                    <button
                      key={option.value}
                      onClick={() => {
                        setFetchLimit(option.value);
                        fetchNewHistory();
                      }}
                      className="block w-full px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 rounded-lg text-cyan-400 transition-all"
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <>
              {messages.map((message) => (
                <div key={message.message_id} className="group">
                  <div className={`flex items-start gap-3 p-3 rounded-lg bg-black/40 hover:bg-black/60 transition-all ${
                    message.has_contract ? 'border border-purple-500/30' : 'border border-transparent'
                  }`}>
                    {/* Avatar */}
                    <div className="flex-shrink-0">
                      {message.is_bot ? (
                        <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                          <Bot className="w-6 h-6 text-purple-400" />
                        </div>
                      ) : (
                        <div className="w-10 h-10 bg-cyan-500/20 rounded-full flex items-center justify-center">
                          <User className="w-6 h-6 text-cyan-400" />
                        </div>
                      )}
                    </div>

                    {/* Message Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-cyan-300">
                          {message.sender_name || 'Unknown'}
                        </span>
                        {message.sender_username && (
                          <span className="text-xs text-gray-400">@{message.sender_username}</span>
                        )}
                        {message.is_bot === 1 && (
                          <span className="px-1.5 py-0.5 bg-purple-500/20 border border-purple-500/40 rounded text-purple-400 text-xs">
                            BOT
                          </span>
                        )}
                        {message.is_forwarded === 1 && (
                          <span className="text-xs text-gray-500 italic">forwarded</span>
                        )}
                        <span className="text-xs text-gray-500 ml-auto">
                          {formatDate(message.message_date)}
                        </span>
                      </div>

                      {/* Message Text */}
                      <div className="text-gray-300 break-words whitespace-pre-wrap">
                        {message.message_text || (
                          <span className="italic text-gray-500">
                            {message.has_media ? `[${message.media_type}]` : '[No text]'}
                          </span>
                        )}
                      </div>

                      {/* Detected Contracts */}
                      {message.has_contract === 1 && message.detected_contracts.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="w-4 h-4 text-purple-400" />
                            <span className="text-sm font-medium text-purple-400">
                              Contract{message.detected_contracts.length > 1 ? 's' : ''} Detected:
                            </span>
                          </div>
                          {message.detected_contracts.map((contract, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-purple-500/10 rounded-lg border border-purple-500/20">
                              <code className="text-xs text-purple-300 font-mono flex-1">
                                {contract}
                              </code>
                              <button
                                onClick={() => copyContract(contract)}
                                className="p-1 hover:bg-purple-500/20 rounded transition-all"
                                title="Copy"
                              >
                                <Copy className="w-3.5 h-3.5 text-purple-400" />
                              </button>
                              <button
                                onClick={() => openInSolscan(contract)}
                                className="p-1 hover:bg-purple-500/20 rounded transition-all"
                                title="View on Solscan"
                              >
                                <ExternalLink className="w-3.5 h-3.5 text-purple-400" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Load More Indicator */}
              {loading && (
                <div className="text-center py-4">
                  <div className="inline-flex items-center gap-2 text-cyan-400">
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Loading more messages...
                  </div>
                </div>
              )}

              {!hasMore && messages.length > 0 && (
                <div className="text-center py-4 text-gray-500 text-sm">
                  — Beginning of cached history —
                </div>
              )}

              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </div>
    </div>
  );

  // Render modal at document.body level to escape parent overflow constraints
  return createPortal(modalContent, document.body);
}

export default TelegramChatHistory;
