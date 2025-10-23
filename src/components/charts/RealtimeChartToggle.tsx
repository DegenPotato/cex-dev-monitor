import React, { useState, useEffect, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';
import { Activity, Play, Zap, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

interface RealtimeChartToggleProps {
  mintAddress: string;
  poolAddress?: string;
  userId: number;
  onStatusChange?: (isActive: boolean) => void;
}

interface RealtimeUpdate {
  mintAddress: string;
  poolAddress: string;
  updates: Array<{
    timeframe: string;
    count: number;
    latest: any;
  }>;
  errorCount: number;
  timestamp: number;
  elapsed: number;
}

const RealtimeChartToggle: React.FC<RealtimeChartToggleProps> = ({
  mintAddress,
  poolAddress,
  userId,
  onStatusChange
}) => {
  const [isActive, setIsActive] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);
  const [updateCount, setUpdateCount] = useState(0);
  const [nextUpdateIn, setNextUpdateIn] = useState<number | null>(null);

  // Initialize socket connection
  useEffect(() => {
    const socketInstance = io(window.location.origin, {
      withCredentials: true,
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('🔌 Connected to real-time OHLCV service');
    });

    socketInstance.on('disconnect', () => {
      console.log('🔌 Disconnected from real-time OHLCV service');
    });

    // Listen for subscription confirmations
    socketInstance.on('ohlcv:subscribed', (data: any) => {
      console.log('✅ Subscribed to real-time updates:', data);
      toast.success(`Real-time updates active for ${mintAddress.slice(0, 8)}...`);
      setIsActive(true);
      setIsConnecting(false);
      onStatusChange?.(true);
    });

    socketInstance.on('ohlcv:unsubscribed', () => {
      console.log('🛑 Unsubscribed from real-time updates');
      setIsActive(false);
      onStatusChange?.(false);
    });

    // Listen for subscription switch (when user activates another token)
    socketInstance.on('ohlcv:subscription_switched', (data: any) => {
      toast(`Switched real-time updates from ${data.previousToken.slice(0, 8)}... to ${data.newToken.slice(0, 8)}...`, {
        icon: 'ℹ️',
      });
    });

    // Listen for updates
    socketInstance.on('ohlcv:update', (data: RealtimeUpdate) => {
      console.log('📊 Real-time OHLCV update:', data);
      setLastUpdate(data.timestamp);
      setUpdateCount(prev => prev + 1);
      
      // Notify parent component to refresh charts
      window.dispatchEvent(new CustomEvent('ohlcv:updated', {
        detail: data
      }));
      
      if (data.errorCount > 0) {
        toast.error(`Failed to update ${data.errorCount} timeframes`);
      }
    });

    // Listen for errors
    socketInstance.on('ohlcv:error', (error: any) => {
      console.error('❌ Real-time OHLCV error:', error);
      toast.error(error.error || 'Real-time update failed');
      setIsActive(false);
      setIsConnecting(false);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, [mintAddress, onStatusChange]);

  // Update countdown timer
  useEffect(() => {
    if (!isActive || !lastUpdate) {
      setNextUpdateIn(null);
      return;
    }

    const interval = setInterval(() => {
      const elapsed = Date.now() - lastUpdate;
      const remaining = Math.max(0, 60000 - elapsed); // 60 seconds
      setNextUpdateIn(Math.ceil(remaining / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, lastUpdate]);

  // Toggle real-time updates
  const toggleRealtime = useCallback(() => {
    if (!socket) return;

    if (isActive) {
      // Unsubscribe
      socket.emit('ohlcv:unsubscribe', { userId });
      setIsActive(false);
      setLastUpdate(null);
      setUpdateCount(0);
      toast('Real-time updates paused');
    } else {
      // Subscribe
      setIsConnecting(true);
      socket.emit('ohlcv:subscribe', {
        userId,
        mintAddress,
        poolAddress
      });
    }
  }, [socket, isActive, userId, mintAddress, poolAddress]);

  return (
    <div className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-700">
      <button
        onClick={toggleRealtime}
        disabled={isConnecting}
        className={`
          flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all
          ${isActive 
            ? 'bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30' 
            : 'bg-gray-700 text-gray-300 border border-gray-600 hover:bg-gray-600'
          }
          ${isConnecting ? 'opacity-50 cursor-not-allowed' : ''}
        `}
      >
        {isActive ? (
          <>
            <Activity className="w-4 h-4 animate-pulse" />
            <span>Real-time Active</span>
          </>
        ) : isConnecting ? (
          <>
            <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
            <span>Connecting...</span>
          </>
        ) : (
          <>
            <Play className="w-4 h-4" />
            <span>Enable Real-time</span>
          </>
        )}
      </button>

      {isActive && (
        <>
          {/* Update Status */}
          <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg">
            <Zap className="w-4 h-4 text-yellow-400" />
            <span className="text-xs text-gray-400">
              {updateCount} updates
            </span>
          </div>

          {/* Next Update Countdown */}
          {nextUpdateIn !== null && (
            <div className="flex items-center gap-2 px-3 py-1 bg-black/40 rounded-lg">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-gray-400">
                Next in {nextUpdateIn}s
              </span>
            </div>
          )}

          {/* Last Update Time */}
          {lastUpdate && (
            <div className="text-xs text-gray-500">
              Last: {new Date(lastUpdate).toLocaleTimeString()}
            </div>
          )}
        </>
      )}

      {/* Info */}
      <div className="ml-auto text-xs text-gray-500">
        {isActive ? (
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            60s interval • All timeframes
          </span>
        ) : (
          <span>Standard 15min updates</span>
        )}
      </div>
    </div>
  );
};

export default RealtimeChartToggle;
