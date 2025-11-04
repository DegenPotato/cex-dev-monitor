import React, { useState, useEffect, useCallback } from 'react';
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
  Target,
  Zap,
  Shield,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import { config } from '../config';
import { useWebSocket } from '../hooks/useWebSocket';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';

interface Position {
  id: number;
  token_mint: string;
  token_symbol?: string;
  token_name?: string;
  buy_amount_sol: number;
  current_balance: number;
  avg_entry_price: number;
  current_price?: number;
  current_price_usd?: number;
  entry_price_usd?: number;
  peak_price?: number;
  peak_price_usd?: number;
  low_price?: number;
  low_price_usd?: number;
  realized_pnl_sol: number;
  unrealized_pnl_sol: number;
  unrealized_pnl_usd?: number;
  total_pnl_sol: number;
  roi_percent: number;
  total_invested_sol: number;
  current_value_sol?: number;
  current_value_usd?: number;
  status: string;
  source_chat_name?: string;
  source_sender_username?: string;
  detected_at: number;
  created_at: number;
  first_buy_at?: number;
  current_mcap_usd?: number;
  peak_roi_percent?: number;
  max_drawdown_percent?: number;
  stop_loss_target?: number;
  take_profit_target?: number;
  trailing_stop_active?: boolean;
  current_tokens?: number;
  last_price?: number;
  monitoring_active?: boolean;
  last_update?: number;
  alerts_triggered?: number;
}


export const TelegramPositionsDashboard: React.FC = () => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'open' | 'closed'>('open');
  const [sortBy, setSortBy] = useState<'time' | 'pnl' | 'roi'>('time');
  const [selectedPosition, setSelectedPosition] = useState<Position | null>(null);
  const [realtimeEnabled, setRealtimeEnabled] = useState(true);
  const [priceChangeIndicators, setPriceChangeIndicators] = useState<Map<number, 'up' | 'down'>>(new Map());
  
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

  const handlePriceUpdate = useCallback((data: any) => {
    setPositions(prev => prev.map(p => {
      if (p.id === data.position_id) {
        // Track price direction for visual indicator
        const priceChange = (data.current_price_sol || 0) - (p.current_price || 0);
        if (priceChange !== 0) {
          setPriceChangeIndicators(prev => ({
            ...prev,
            [p.id]: priceChange > 0 ? 'up' : 'down'
          }));
          
          // Clear indicator after animation
          setTimeout(() => {
            setPriceChangeIndicators(prev => {
              const next = new Map(prev);
              next.delete(p.id);
              return next;
            });
          }, 1000);
        }
        
        return {
          ...p,
          // Prices (SOL + USD)
          current_price: data.current_price_sol,
          current_price_usd: data.current_price_usd,
          entry_price_usd: data.entry_price_usd,
          
          // Session stats (SOL + USD)
          peak_price: data.session_high_sol,
          peak_price_usd: data.session_high_usd,
          low_price: data.session_low_sol,
          low_price_usd: data.session_low_usd,
          peak_roi_percent: data.highest_gain_percent,
          max_drawdown_percent: Math.abs(data.lowest_drop_percent || 0),
          
          // P&L
          unrealized_pnl_sol: data.unrealized_pnl_sol,
          unrealized_pnl_usd: data.unrealized_pnl_usd,
          total_pnl_sol: data.total_pnl_sol,
          roi_percent: data.roi_percent,
          
          // Holdings
          current_tokens: data.current_tokens,
          current_value_sol: data.current_value_sol,
          current_value_usd: data.current_value_usd,
          
          // Metadata
          last_price: p.current_price,
          last_update: data.last_update || Date.now()
        };
      }
      return p;
    }));
    
    // Show toast for significant moves
    if (Math.abs(data.change_percent_from_entry) > 10) {
      const direction = data.change_percent_from_entry > 0 ? '📈' : '📉';
      toast(`${direction} ${data.token_symbol}: ${data.change_percent_from_entry.toFixed(1)}% from entry`, {
        position: 'top-right'
      });
    }
  }, []);

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

  // Separate open and closed positions
  const openPositions = positions.filter(p => p.status === 'open' || p.status === 'pending');
  const closedPositions = positions.filter(p => p.status === 'closed' || p.status === 'failed');

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
  
  const totalInvested = totals.invested;
  const totalRealized = totals.realized;
  const totalUnrealized = totals.unrealized;
  const totalPnl = totals.total;

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
          <p className={`text-2xl font-bold ${totalRealized >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalRealized >= 0 ? '+' : ''}{totalRealized.toFixed(6)} SOL
          </p>
          <p className="text-xs text-gray-500 mt-1">{closedPositions.length} closed | {openPositions.length} active</p>
        </div>
        <div className="bg-gradient-to-br from-cyan-900/20 to-black border border-cyan-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Unrealized P&L</p>
            <Activity className="w-4 h-4 text-cyan-400" />
          </div>
          <p className={`text-2xl font-bold ${totalUnrealized >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalUnrealized >= 0 ? '+' : ''}{totalUnrealized.toFixed(6)} SOL
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {totalUnrealized >= 0 ? 'Paper gains' : 'Paper loss'}
          </p>
        </div>
        <div className="bg-gradient-to-br from-purple-900/20 to-black border border-purple-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-gray-400 text-sm">Total P&L</p>
            <TrendingUp className="w-4 h-4 text-purple-400" />
          </div>
          <p className={`text-2xl font-bold ${totalPnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(6)} SOL
          </p>
          <p className="text-xs text-gray-500 mt-1">
            {((totalPnl / Math.max(totalInvested, 0.0001)) * 100).toFixed(1)}% ROI
          </p>
        </div>
      </div>

      {/* Enhanced Controls with Real-time Toggle */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['all', 'open', 'closed'].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f as any)}
              className={`px-4 py-2 rounded-lg transition-all ${
                filter === f
                  ? 'bg-cyan-500/20 border-cyan-500 text-cyan-400'
                  : 'bg-black/40 border-gray-700 text-gray-400 hover:border-cyan-500/50'
              } border`}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          {/* Real-time Toggle */}
          <button
            onClick={() => setRealtimeEnabled(!realtimeEnabled)}
            className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all ${
              realtimeEnabled
                ? 'bg-green-500/20 border-green-500 text-green-400'
                : 'bg-black/40 border-gray-700 text-gray-400'
            }`}
          >
            <Activity className="w-4 h-4" />
            <span className="text-sm">{realtimeEnabled ? 'Live' : 'Paused'}</span>
          </button>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-black/40 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 focus:border-cyan-500/50 focus:outline-none"
          >
            <option value="time">Latest First</option>
            <option value="pnl">P&L (High to Low)</option>
            <option value="roi">ROI (High to Low)</option>
          </select>

          <button
            onClick={fetchPositions}
            className="p-2 bg-black/40 border border-gray-700 rounded-lg text-gray-400 hover:text-white hover:border-cyan-500/50 transition-all"
            title="Refresh positions"
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
              priceChangeIndicators={priceChangeIndicators}
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
  priceChangeIndicators: Map<number, 'up' | 'down'>;
  onSell: (position: Position, percentage: number) => void;
  onClick: () => void;
}> = ({ position, priceChangeIndicators, onSell, onClick }) => {
  const isOpen = position.status === 'open';
  const isPending = position.status === 'pending';
  const pnl = position.total_pnl_sol;
  const roi = position.roi_percent;
  const priceIndicator = priceChangeIndicators?.get(position.id);
  const isMonitored = position.monitoring_active;
  const timeSinceUpdate = position.last_update ? Date.now() - position.last_update : null;

  return (
    <div 
      className="bg-gradient-to-br from-gray-900 to-black border border-cyan-500/30 rounded-xl p-6 hover:border-cyan-500/50 transition-all cursor-pointer"
      onClick={onClick}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              {position.token_symbol || position.token_mint.slice(0, 8) + '...'}
              {priceIndicator && (
                <span className={`inline-flex items-center animate-pulse ${
                  priceIndicator === 'up' ? 'text-green-400' : 'text-red-400'
                }`}>
                  {priceIndicator === 'up' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </span>
              )}
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
            {isMonitored && (
              <span className="px-2 py-1 bg-purple-500/20 text-purple-400 text-xs rounded-full flex items-center gap-1">
                <Activity className="w-3 h-3" />
                MONITORING
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
              {formatDistanceToNow((position.first_buy_at || position.detected_at) * 1000, { addSuffix: true })}
            </span>
            {timeSinceUpdate && timeSinceUpdate < 10000 && (
              <span className="flex items-center gap-1 text-xs text-cyan-400">
                <Zap className="w-3 h-3" />
                Updated {Math.floor(timeSinceUpdate / 1000)}s ago
              </span>
            )}
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

      {/* Enhanced Trading Info Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
        <div className="bg-black/20 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <DollarSign className="w-3 h-3" /> Entry
          </p>
          <p className="text-sm font-bold text-white">
            {(position.avg_entry_price || 0).toFixed(9)} SOL
          </p>
          {position.entry_price_usd && (
            <p className="text-xs text-cyan-400">
              ${(position.entry_price_usd || 0).toFixed(8)} USD
            </p>
          )}
          <p className="text-xs text-gray-500">
            {position.current_tokens ? `${position.current_tokens.toFixed(2)} tokens` : ''}
          </p>
          <p className="text-xs text-gray-500">
            Invested: {position.total_invested_sol.toFixed(4)} SOL
          </p>
        </div>
        <div className="bg-black/20 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <Activity className="w-3 h-3" /> Current
            {priceChangeIndicators.get(position.id) && (
              <span className={`text-xs ${
                priceChangeIndicators.get(position.id) === 'up' ? 'text-green-400' : 'text-red-400'
              } animate-pulse`}>
                {priceChangeIndicators.get(position.id) === 'up' ? '↑' : '↓'}
              </span>
            )}
          </p>
          <p className="text-sm font-bold text-white">
            {(position.current_price || 0) > 0 ? 
              `${(position.current_price || 0).toFixed(9)} SOL` : 
              'No price data'
            }
          </p>
          {position.current_price_usd && (
            <p className="text-xs text-green-400">
              ${(position.current_price_usd || 0).toFixed(8)} USD
            </p>
          )}
          {(position.current_price || 0) > 0 && (position.avg_entry_price || 0) > 0 && (
            <p className="text-xs text-gray-500">
              {(((position.current_price || 0) / (position.avg_entry_price || 1) - 1) * 100).toFixed(2)}% from entry
            </p>
          )}
        </div>
        <div className="bg-black/20 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            {pnl >= 0 ? <ArrowUpCircle className="w-3 h-3" /> : <ArrowDownCircle className="w-3 h-3" />} P&L
          </p>
          <p className={`text-sm font-bold ${pnl >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {pnl >= 0 ? '+' : ''}{pnl.toFixed(9)} SOL
          </p>
          {position.unrealized_pnl_usd !== undefined && (
            <p className="text-xs text-gray-500">
              ${position.unrealized_pnl_usd.toFixed(4)} USD
            </p>
          )}
        </div>
        <div className="bg-black/20 rounded-lg p-3">
          <p className="text-xs text-gray-400 mb-1 flex items-center gap-1">
            <TrendingUp className="w-3 h-3" /> ROI
          </p>
          <p className={`text-sm font-bold ${roi >= 0 ? 'text-green-500' : 'text-red-500'}`}>
            {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
          </p>
          {position.peak_roi_percent !== undefined && (
            <p className="text-xs text-green-400">
              High: +{Math.abs(position.peak_roi_percent || 0).toFixed(1)}%
            </p>
          )}
          {position.max_drawdown_percent !== undefined && (
            <p className="text-xs text-red-400">
              Low: -{Math.abs(position.max_drawdown_percent || 0).toFixed(1)}%
            </p>
          )}
        </div>
      </div>
      
      {/* Risk Metrics (if monitoring) */}
      {isOpen && (position.stop_loss_target || position.take_profit_target || position.trailing_stop_active) && (
        <div className="flex gap-2 mb-3">
          {position.stop_loss_target && (
            <div className="flex items-center gap-1 px-2 py-1 bg-red-900/20 text-red-400 rounded-lg text-xs">
              <Shield className="w-3 h-3" />
              SL: {position.stop_loss_target}%
            </div>
          )}
          {position.take_profit_target && (
            <div className="flex items-center gap-1 px-2 py-1 bg-green-900/20 text-green-400 rounded-lg text-xs">
              <Target className="w-3 h-3" />
              TP: {position.take_profit_target}%
            </div>
          )}
          {position.trailing_stop_active && (
            <div className="flex items-center gap-1 px-2 py-1 bg-purple-900/20 text-purple-400 rounded-lg text-xs">
              <Zap className="w-3 h-3" />
              Trailing Stop Active
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

          {/* Session Stats Display */}
          <div className="mt-4 p-3 bg-black/20 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Session Statistics</span>
                <span className="text-xs text-gray-500">Last update: {formatDistanceToNow(new Date(position.last_update || Date.now()))} ago</span>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-green-900/20 p-2 rounded">
                  <p className="text-green-400 mb-1">Session High</p>
                  <p className="text-white font-mono">
                    {(position.peak_price || position.current_price || 0).toFixed(9)} SOL
                  </p>
                  {position.peak_price_usd && (
                    <p className="text-cyan-400 text-xs">
                      ${position.peak_price_usd.toFixed(8)} USD
                    </p>
                  )}
                  {position.peak_roi_percent !== undefined && (
                    <p className="text-green-400 mt-1">
                      +{Math.abs(position.peak_roi_percent || 0).toFixed(2)}% from entry
                    </p>
                  )}
                </div>
                <div className="bg-red-900/20 p-2 rounded">
                  <p className="text-red-400 mb-1">Session Low</p>
                  <p className="text-white font-mono">
                    {(position.low_price || position.current_price || 0).toFixed(9)} SOL
                  </p>
                  {position.low_price_usd && (
                    <p className="text-cyan-400 text-xs">
                      ${position.low_price_usd.toFixed(8)} USD
                    </p>
                  )}
                  {position.max_drawdown_percent !== undefined && (
                    <p className="text-red-400 mt-1">
                      -{Math.abs(position.max_drawdown_percent || 0).toFixed(2)}% from entry
                    </p>
                  )}
                </div>
              </div>
              {position.current_value_usd !== undefined && (
                <div className="mt-2 p-2 bg-gray-900/30 rounded">
                  <p className="text-gray-400 mb-1">Current Value</p>
                  <p className="text-white font-bold">
                    {(position.current_value_sol || 0).toFixed(6)} SOL
                    <span className="text-cyan-400 ml-2">
                      ${(position.current_value_usd || 0).toFixed(2)} USD
                    </span>
                  </p>
                </div>
              )}
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
