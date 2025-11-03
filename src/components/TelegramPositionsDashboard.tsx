import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, 
  Activity,
  DollarSign,
  Clock,
  XCircle,
  MessageSquare,
  User,
  ExternalLink,
  Copy,
  RefreshCw,
  ArrowUpCircle,
  ArrowDownCircle,
  Target
} from 'lucide-react';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface Position {
  id: number;
  user_id: number;
  wallet_id: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  source_chat_id: string;
  source_chat_name?: string;
  source_sender_username?: string;
  status: 'pending' | 'open' | 'partial_close' | 'closed' | 'failed';
  current_balance: number;
  avg_entry_price: number;
  current_price?: number;
  total_invested_sol: number;
  realized_pnl_sol: number;
  unrealized_pnl_sol: number;
  total_pnl_sol: number;
  roi_percent: number;
  peak_price?: number;
  stop_loss_target?: number;
  take_profit_target?: number;
  trailing_stop_active?: boolean;
  exit_reason?: string;
  first_buy_at?: number;
  closed_at?: number;
  detected_at: number;
}

interface PositionUpdate {
  position_id: number;
  token_symbol?: string;
  old_price?: number;
  new_price?: number;
  change_percent?: number;
  unrealized_pnl?: number;
  total_pnl?: number;
  roi_percent?: number;
  trade_type?: string;
  amount_sol?: number;
  signature?: string;
  alert_type?: string;
  message?: string;
}

export const TelegramPositionsDashboard: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [sortBy, setSortBy] = useState<'time' | 'pnl' | 'roi'>('time');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  
  // WebSocket subscription
  const { subscribe } = useWebSocket(`${config.wsUrl}/ws`);

  // Fetch initial positions
  useEffect(() => {
    fetchPositions();
  }, []);

  // Subscribe to WebSocket updates
  useEffect(() => {
    const subscriptions = [
      subscribe('telegram_position_created', handlePositionCreated),
      subscribe('telegram_trade_executed', handleTradeExecuted),
      subscribe('telegram_position_price_update', handlePriceUpdate),
      subscribe('telegram_position_alert', handleAlert),
      subscribe('telegram_position_closed', handlePositionClosed)
    ];

    return () => {
      subscriptions.forEach(unsub => unsub());
    };
  }, []);

  const fetchPositions = async () => {
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/positions`, {
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        setPositions(data.positions || []);
      }
    } catch (error) {
      console.error('Failed to fetch positions:', error);
      toast.error('Failed to load positions');
    } finally {
      setLoading(false);
    }
  };

  // WebSocket handlers
  const handlePositionCreated = (data: any) => {
    toast.success(`New position: ${data.token_symbol || data.token_mint.slice(0, 8)}...`);
    fetchPositions(); // Refresh to get full position data
  };

  const handleTradeExecuted = (data: any) => {
    setPositions(prev => prev.map(p => 
      p.id === data.position_id
        ? {
            ...p,
            current_balance: data.new_balance,
            avg_entry_price: data.new_avg_price || p.avg_entry_price,
            status: 'open'
          }
        : p
    ));
    
    const action = data.trade_type === 'buy' ? '🟢 Bought' : '🔴 Sold';
    toast.success(`${action} ${data.amount_tokens?.toFixed(2) || ''} ${data.token_symbol || ''}`);
  };

  const handlePriceUpdate = (data: PositionUpdate) => {
    setPositions(prev => prev.map(p => 
      p.id === data.position_id
        ? {
            ...p,
            current_price: data.new_price,
            unrealized_pnl_sol: data.unrealized_pnl || p.unrealized_pnl_sol,
            total_pnl_sol: data.total_pnl || p.total_pnl_sol,
            roi_percent: data.roi_percent || p.roi_percent
          }
        : p
    ));
  };

  const handleAlert = (data: any) => {
    if (data.alert_type === 'stop_loss') {
      toast.error(`Stop loss triggered for ${data.token_symbol || 'position'}`);
    } else if (data.alert_type === 'take_profit') {
      toast.success(`Take profit triggered for ${data.token_symbol || 'position'}`);
    } else {
      toast(data.message || 'Position alert', { icon: '⚠️' });
    }
  };

  const handlePositionClosed = (data: any) => {
    setPositions(prev => prev.map(p => 
      p.id === data.position_id
        ? { ...p, status: 'closed', exit_reason: data.exit_reason }
        : p
    ));
    
    const emoji = data.roi_percent > 0 ? '🎉' : '😔';
    toast(`${emoji} Position closed: ${data.roi_percent > 0 ? '+' : ''}${data.roi_percent?.toFixed(2)}% ROI`);
  };

  // Manual sell
  const handleManualSell = async (position: Position, percentage: number) => {
    try {
      const response = await fetch(`${config.apiUrl}/api/telegram/positions/${position.id}/sell`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ percentage })
      });

      if (response.ok) {
        toast.success(`Selling ${percentage}% of position...`);
      } else {
        toast.error('Failed to execute sell');
      }
    } catch (error) {
      toast.error('Failed to execute sell');
    }
  };

  // Filter and sort positions
  const filteredPositions = positions
    .filter(p => {
      if (filter === 'open') return p.status === 'open' || p.status === 'pending';
      if (filter === 'closed') return p.status === 'closed' || p.status === 'failed';
      return true;
    })
    .sort((a, b) => {
      switch (sortBy) {
        case 'pnl':
          return b.total_pnl_sol - a.total_pnl_sol;
        case 'roi':
          return b.roi_percent - a.roi_percent;
        case 'time':
        default:
          return (b.first_buy_at || b.detected_at) - (a.first_buy_at || a.detected_at);
      }
    });

  // Calculate totals
  const totals = filteredPositions.reduce(
    (acc, p) => ({
      invested: acc.invested + p.total_invested_sol,
      realized: acc.realized + p.realized_pnl_sol,
      unrealized: acc.unrealized + (p.status === 'open' ? p.unrealized_pnl_sol : 0),
      total: acc.total + p.total_pnl_sol
    }),
    { invested: 0, realized: 0, unrealized: 0, total: 0 }
  );

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <DollarSign className="w-5 h-5 text-cyan-400" />
            <span className="text-xs text-gray-400">Invested</span>
          </div>
          <div className="text-2xl font-bold text-white">
            {totals.invested.toFixed(4)} SOL
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-black border border-green-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <TrendingUp className="w-5 h-5 text-green-400" />
            <span className="text-xs text-gray-400">Realized P&L</span>
          </div>
          <div className={`text-2xl font-bold ${totals.realized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totals.realized >= 0 ? '+' : ''}{totals.realized.toFixed(4)} SOL
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-black border border-purple-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Activity className="w-5 h-5 text-purple-400" />
            <span className="text-xs text-gray-400">Unrealized P&L</span>
          </div>
          <div className={`text-2xl font-bold ${totals.unrealized >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totals.unrealized >= 0 ? '+' : ''}{totals.unrealized.toFixed(4)} SOL
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-900 to-black border border-yellow-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <Target className="w-5 h-5 text-yellow-400" />
            <span className="text-xs text-gray-400">Total P&L</span>
          </div>
          <div className={`text-2xl font-bold ${totals.total >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {totals.total >= 0 ? '+' : ''}{totals.total.toFixed(4)} SOL
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['all', 'open', 'closed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                filter === f
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-black/20 text-gray-400 border border-gray-700 hover:border-gray-600'
              }`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-4 py-2 bg-black/40 border border-gray-700 rounded-lg text-white focus:outline-none focus:border-cyan-500/50"
          >
            <option value="time">Latest First</option>
            <option value="pnl">P&L (High to Low)</option>
            <option value="roi">ROI (High to Low)</option>
          </select>

          <button
            onClick={fetchPositions}
            className="p-2 bg-black/40 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-cyan-500/50 transition-all"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Positions List */}
      <div className="space-y-4">
        {loading ? (
          <div className="text-center py-12 text-gray-400">Loading positions...</div>
        ) : filteredPositions.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            No {filter !== 'all' ? filter : ''} positions found
          </div>
        ) : (
          filteredPositions.map(position => (
            <PositionCard
              key={position.id}
              position={position}
              onSell={handleManualSell}
              onClick={() => setSelectedPosition(position)}
            />
          ))
        )}
      </div>

      {/* Position Details Modal */}
      {selectedPosition && (
        <PositionDetailsModal
          position={selectedPosition}
          onClose={() => setSelectedPosition(null)}
          onSell={handleManualSell}
        />
      )}
    </div>
  );
};

// Position Card Component
const PositionCard: React.FC<{
  position: Position;
  onSell: (position: Position, percentage: number) => void;
  onClick: () => void;
}> = ({ position, onSell, onClick }) => {
  const isOpen = position.status === 'open';
  const isPending = position.status === 'pending';
  const pnl = position.total_pnl_sol;
  const roi = position.roi_percent;

  return (
    <div 
      className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-6 hover:border-cyan-500/50 transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-bold text-white">
              {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
            </h3>
            {isOpen && (
              <span className="px-2 py-1 bg-green-500/20 text-green-400 text-xs rounded-full">
                OPEN
              </span>
            )}
            {isPending && (
              <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 text-xs rounded-full">
                PENDING
              </span>
            )}
            {position.status === 'closed' && (
              <span className="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs rounded-full">
                CLOSED
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4 text-sm text-gray-400">
            <span className="flex items-center gap-1">
              <MessageSquare className="w-3.5 h-3.5" />
              {position.source_chat_name || 'Unknown Chat'}
            </span>
            {position.source_sender_username && (
              <span className="flex items-center gap-1">
                <User className="w-3.5 h-3.5" />
                @{position.source_sender_username}
              </span>
            )}
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {formatDistanceToNow(position.first_buy_at || position.detected_at, { addSuffix: true })}
            </span>
          </div>
        </div>

        {isOpen && (
          <div className="flex gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSell(position, 50);
              }}
              className="px-3 py-1.5 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-sm font-medium text-orange-300 transition-all"
            >
              Sell 50%
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onSell(position, 100);
              }}
              className="px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-sm font-medium text-red-300 transition-all"
            >
              Sell All
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-5 gap-4">
        {/* Balance */}
        <div>
          <div className="text-xs text-gray-400 mb-1">Balance</div>
          <div className="text-white font-medium">
            {position.current_balance.toFixed(2)}
          </div>
        </div>

        {/* Entry Price */}
        <div>
          <div className="text-xs text-gray-400 mb-1">Entry</div>
          <div className="text-white font-medium">
            {position.avg_entry_price.toFixed(6)} SOL
          </div>
        </div>

        {/* Current Price */}
        <div>
          <div className="text-xs text-gray-400 mb-1">Current</div>
          <div className="text-white font-medium">
            {position.current_price?.toFixed(6) || '---'} SOL
          </div>
        </div>

        {/* P&L */}
        <div>
          <div className="text-xs text-gray-400 mb-1">P&L</div>
          <div className={`font-medium ${pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(4)} SOL
          </div>
        </div>

        {/* ROI */}
        <div>
          <div className="text-xs text-gray-400 mb-1">ROI</div>
          <div className={`font-medium ${roi >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Auto-sell indicators */}
      {isOpen && (position.stop_loss_target || position.take_profit_target) && (
        <div className="mt-4 flex gap-3">
          {position.stop_loss_target && (
            <div className="flex items-center gap-1 text-xs text-red-400">
              <ArrowDownCircle className="w-3.5 h-3.5" />
              Stop: {position.stop_loss_target.toFixed(6)} SOL
            </div>
          )}
          {position.take_profit_target && (
            <div className="flex items-center gap-1 text-xs text-green-400">
              <ArrowUpCircle className="w-3.5 h-3.5" />
              TP: {position.take_profit_target.toFixed(6)} SOL
            </div>
          )}
          {position.trailing_stop_active && (
            <div className="flex items-center gap-1 text-xs text-orange-400">
              <Activity className="w-3.5 h-3.5" />
              Trailing Active
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// Position Details Modal
const PositionDetailsModal: React.FC<{
  position: Position;
  onClose: () => void;
  onSell: (position: Position, percentage: number) => void;
}> = ({ position, onClose, onSell }) => {
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-cyan-500/20 p-6">
          <div className="flex items-center justify-between">
            <h3 className="text-2xl font-bold text-cyan-300">
              Position Details: {position.token_symbol || 'Unknown'}
            </h3>
            <button
              onClick={onClose}
              className="p-2 hover:bg-red-500/20 rounded-lg transition-colors"
            >
              <XCircle className="w-5 h-5 text-red-400" />
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Token Info */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">Token Information</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Contract Address</span>
                <div className="flex items-center gap-2">
                  <span className="text-white font-mono text-sm">
                    {position.token_mint.slice(0, 8)}...{position.token_mint.slice(-8)}
                  </span>
                  <button
                    onClick={() => copyToClipboard(position.token_mint)}
                    className="text-cyan-400 hover:text-cyan-300"
                  >
                    <Copy className="w-4 h-4" />
                  </button>
                  <a
                    href={`https://solscan.io/token/${position.token_mint}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-cyan-400 hover:text-cyan-300"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          {/* Source Info */}
          <div>
            <h4 className="text-sm font-medium text-gray-400 mb-3">Discovery Source</h4>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-gray-400">Chat</span>
                <span className="text-white">{position.source_chat_name || 'Unknown'}</span>
              </div>
              {position.source_sender_username && (
                <div className="flex items-center justify-between">
                  <span className="text-gray-400">Called By</span>
                  <span className="text-white">@{position.source_sender_username}</span>
                </div>
              )}
            </div>
          </div>

          {/* Trade Actions */}
          {position.status === 'open' && (
            <div className="border-t border-gray-800 pt-6">
              <h4 className="text-sm font-medium text-gray-400 mb-3">Quick Actions</h4>
              <div className="grid grid-cols-4 gap-3">
                <button
                  onClick={() => onSell(position, 25)}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/40 rounded-lg text-blue-300 font-medium transition-all"
                >
                  Sell 25%
                </button>
                <button
                  onClick={() => onSell(position, 50)}
                  className="px-4 py-2 bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/40 rounded-lg text-orange-300 font-medium transition-all"
                >
                  Sell 50%
                </button>
                <button
                  onClick={() => onSell(position, 75)}
                  className="px-4 py-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/40 rounded-lg text-pink-300 font-medium transition-all"
                >
                  Sell 75%
                </button>
                <button
                  onClick={() => onSell(position, 100)}
                  className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/40 rounded-lg text-red-300 font-medium transition-all"
                >
                  Sell All
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
