import { useEffect, useState, useRef } from 'react';
import { Settings, Circle, Flame, Database, Activity, TrendingUp, ChevronRight, Lock, AlertTriangle } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { Stats } from '../types';
import { config, apiUrl } from '../config';
import { SettingsPanel } from './SettingsPanel';
import { WalletMonitoringHub } from './WalletMonitoringHub.tsx';
import { RecentTokenMints } from './RecentTokenMints';
import { TokensTab } from './TokensTab';
import { DatabaseTab } from './DatabaseTab';
import { YouTubeMiniPlayer } from './YouTubeMiniPlayer';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'wallets' | 'tokens' | 'database';

export function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('wallets');
  const starsCanvasRef = useRef<HTMLCanvasElement>(null);
  const vortexCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const { isConnected, subscribe } = useWebSocket(`${config.wsUrl}/ws`);
  const { user, isAuthenticated } = useAuth();
  
  const isSuperAdmin = user?.role === 'super_admin';
  const hasAccess = isAuthenticated && isSuperAdmin;

  useEffect(() => {
    // Only fetch data if user has access
    if (hasAccess) {
      fetchData();
      const interval = setInterval(fetchData, 10000);
      return () => clearInterval(interval);
    }
  }, [hasAccess]);
  
  useEffect(() => {
    // Set up vortex animation for non-admins
    if (!hasAccess) {
      const canvas = vortexCanvasRef.current;
      if (!canvas) return;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      
      const resizeCanvas = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      };
      resizeCanvas();
      window.addEventListener('resize', resizeCanvas);
      
      let time = 0;
      const centerX = canvas.width / 2;
      const centerY = canvas.height / 2;
      
      const animateVortex = () => {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw spiraling particles into vortex
        for (let i = 0; i < 50; i++) {
          const angle = (i / 50) * Math.PI * 2 + time * 0.02;
          const radius = 300 * Math.exp(-i * 0.01) * (1 - Math.sin(time * 0.01) * 0.3);
          const x = centerX + Math.cos(angle) * radius;
          const y = centerY + Math.sin(angle) * radius;
          
          const size = 2 * (1 - i / 50);
          const opacity = (1 - i / 50) * 0.8;
          
          ctx.beginPath();
          ctx.fillStyle = `rgba(0, 255, 221, ${opacity})`;
          ctx.arc(x, y, size, 0, Math.PI * 2);
          ctx.fill();
          
          // Add purple accent particles
          if (i % 5 === 0) {
            ctx.beginPath();
            ctx.fillStyle = `rgba(147, 51, 234, ${opacity * 0.6})`;
            ctx.arc(x + 5, y + 5, size * 0.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }
        
        time += 1;
        requestAnimationFrame(animateVortex);
      };
      animateVortex();
      
      return () => {
        window.removeEventListener('resize', resizeCanvas);
      };
    }
  }, [hasAccess]);
  
  useEffect(() => {
    // Only set up stars animation if user has access
    if (!hasAccess) return;
    
    // Animated stars background
    const canvas = starsCanvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    const stars: Array<{ x: number; y: number; size: number; speed: number; opacity: number }> = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random()
      });
    }
    
    let animationId: number;
    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      stars.forEach(star => {
        ctx.beginPath();
        ctx.fillStyle = `rgba(0, 255, 221, ${star.opacity})`;
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        
        star.x -= star.speed;
        star.opacity = Math.sin(Date.now() * 0.001 + star.x) * 0.5 + 0.5;
        
        if (star.x < 0) {
          star.x = canvas.width;
          star.y = Math.random() * canvas.height;
        }
      });
      
      animationId = requestAnimationFrame(animate);
    };
    animate();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationId);
    };
  }, [hasAccess]);

  useEffect(() => {
    // Listen for monitoring status updates
    const unsubStats = subscribe('stats_update', () => {
      fetchStats();
    });

    return () => {
      unsubStats();
    };
  }, [subscribe]);

  const fetchData = async () => {
    await fetchStats();
  };

  const fetchStats = async () => {
    try {
      const response = await fetch(apiUrl('/api/stats'));
      const data = await response.json();
      setStats(data);
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  };
  

  // Show vortex access denied screen for non-super_admins
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-black relative overflow-hidden flex items-center justify-center">
        {/* Vortex Animation Background */}
        <canvas 
          ref={vortexCanvasRef}
          className="fixed inset-0 w-full h-full"
          style={{ background: 'radial-gradient(circle at center, #000511 0%, #000000 100%)' }}
        />
        
        {/* Access Denied Message */}
        <div className="relative z-10 text-center p-8 bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/20 max-w-md">
          <div className="mb-6">
            <Lock className="w-16 h-16 text-cyan-400 mx-auto mb-4" />
            <h1 className="text-3xl font-bold text-cyan-400 mb-2">ACCESS DENIED</h1>
            <p className="text-cyan-300/60">You have entered the vortex, but lack the clearance to proceed.</p>
          </div>
          
          <div className="space-y-4">
            {!isAuthenticated ? (
              <>
                <p className="text-sm text-gray-400">
                  Please authenticate from the Black Hole landing page
                </p>
                <a
                  href="/"
                  className="w-full inline-block px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-cyan-500/20 backdrop-blur-sm text-center"
                >
                  Return to Landing Page
                </a>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 justify-center text-red-400">
                  <AlertTriangle className="w-5 h-5" />
                  <p className="text-sm font-medium">
                    INSUFFICIENT CLEARANCE
                  </p>
                </div>
                <p className="text-xs text-gray-500">
                  Only super administrators may access the dashboard
                </p>
                <a
                  href="/"
                  className="w-full inline-block px-6 py-3 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-400 border border-cyan-500/40 rounded-lg font-medium transition-all hover:shadow-lg hover:shadow-cyan-500/20 backdrop-blur-sm text-center mt-4"
                >
                  Return to Landing Page
                </a>
              </>
            )}
          </div>
          
          <div className="mt-6 pt-4 border-t border-cyan-500/20">
            <p className="text-xs text-cyan-300/40">
              SNIFF AGENCY SECURITY PROTOCOL ACTIVE
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Regular dashboard for super_admins
  return (
    <div className="min-h-screen bg-black relative overflow-hidden">
      {/* Animated Stars Background */}
      <canvas 
        ref={starsCanvasRef}
        className="fixed inset-0 w-full h-full"
        style={{ background: 'radial-gradient(circle at center, #000511 0%, #000000 100%)' }}
      />
      
      {/* Cosmic Glow Effects */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl animate-pulse" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />
      </div>
      
      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-start justify-center overflow-y-auto p-4">
          <div className="w-full max-w-6xl bg-black/60 backdrop-blur-xl rounded-2xl border border-cyan-500/30 shadow-2xl shadow-cyan-500/20 my-8">
            <div className="flex items-center justify-between p-6 border-b border-cyan-500/20">
              <h2 className="text-2xl font-bold text-cyan-400">Settings & Configuration</h2>
              <button
                onClick={() => setShowSettings(false)}
                className="text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <SettingsPanel onUpdate={fetchData} />
          </div>
        </div>
      )}

      <div className="container mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="relative">
            <h1 className="text-5xl font-bold mb-2 tracking-wider">
              <span className="text-cyan-400 drop-shadow-[0_0_30px_rgba(0,255,221,0.5)]">
                SNIFF AGENCY
              </span>
            </h1>
            <p className="text-lg text-cyan-300/60 font-light">Follow the Money.</p>
            <div className="absolute -bottom-2 left-0 h-[1px] w-32 bg-gradient-to-r from-cyan-400 to-transparent" />
          </div>
          
          <div className="flex items-center gap-4">
            {/* Connection Status */}
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-cyan-500/20 shadow-lg shadow-cyan-500/10">
              <Circle 
                className={`w-2.5 h-2.5 ${isConnected ? 'fill-cyan-400 text-cyan-400' : 'fill-red-400 text-red-400'}`}
              />
              <span className={`text-sm font-medium ${isConnected ? 'text-cyan-400' : 'text-red-400'}`}>
                {isConnected ? 'LIVE' : 'OFFLINE'}
              </span>
              {isConnected && (
                <div className="absolute inset-0 rounded-full bg-cyan-400/20 animate-ping" />
              )}
            </div>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettings(true)}
              className="flex items-center gap-2 bg-black/40 backdrop-blur-xl hover:bg-cyan-500/10 px-4 py-2 rounded-full border border-cyan-500/20 transition-all text-gray-300 hover:text-cyan-400 hover:border-cyan-500/40 shadow-lg shadow-cyan-500/10 group"
              title="Open Settings"
            >
              <Settings className="w-5 h-5 group-hover:rotate-90 transition-transform duration-300" />
              <span className="font-medium">Settings</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-3 mb-8 bg-black/40 backdrop-blur-xl p-1.5 rounded-2xl border border-cyan-500/20">
          <button
            onClick={() => setActiveTab('wallets')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all relative overflow-hidden group ${
              activeTab === 'wallets'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20 border border-cyan-500/40'
                : 'text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/5'
            }`}
          >
            {activeTab === 'wallets' && (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-cyan-500/20 animate-pulse" />
            )}
            <Activity className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Wallet Monitoring</span>
            {activeTab === 'wallets' && (
              <Activity className="w-4 h-4 ml-2 animate-pulse text-cyan-300 relative z-10" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('tokens')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all relative overflow-hidden group ${
              activeTab === 'tokens'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20 border border-cyan-500/40'
                : 'text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/5'
            }`}
          >
            {activeTab === 'tokens' && (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-cyan-500/20 animate-pulse" />
            )}
            <Flame className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Token Launch History</span>
            {activeTab === 'tokens' && (
              <TrendingUp className="w-4 h-4 ml-2 animate-pulse text-cyan-300 relative z-10" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('database')}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all relative overflow-hidden group ${
              activeTab === 'database'
                ? 'bg-cyan-500/20 text-cyan-400 shadow-lg shadow-cyan-500/20 border border-cyan-500/40'
                : 'text-gray-400 hover:text-cyan-300 hover:bg-cyan-500/5'
            }`}
          >
            {activeTab === 'database' && (
              <div className="absolute inset-0 bg-gradient-to-r from-cyan-500/20 via-transparent to-cyan-500/20 animate-pulse" />
            )}
            <Database className="w-5 h-5 relative z-10" />
            <span className="relative z-10">Database Admin</span>
            {activeTab === 'database' && (
              <ChevronRight className="w-4 h-4 ml-2 text-cyan-300 relative z-10" />
            )}
          </button>
        </div>

        {/* Main Content with Glassmorphism */}
        {activeTab === 'wallets' ? (
          <div className="space-y-6">
            {/* Wallet Monitoring Hub */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
              <WalletMonitoringHub stats={stats} onUpdate={fetchData} />
            </div>
            
            {/* Recent Token Mints */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
              <RecentTokenMints />
            </div>
          </div>
        ) : activeTab === 'tokens' ? (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
            <TokensTab />
          </div>
        ) : (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 h-[calc(100vh-250px)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
            <DatabaseTab />
          </div>
        )}
      </div>
      
      {/* YouTube Mini Player */}
      <YouTubeMiniPlayer />
    </div>
  );
}
