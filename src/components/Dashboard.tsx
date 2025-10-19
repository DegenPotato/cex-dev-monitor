import { useEffect, useState, useRef } from 'react';
import { Settings, Circle, Flame, Database, Activity, TrendingUp, ChevronRight, Lock, AlertTriangle } from 'lucide-react';
import { useWebSocket } from '../hooks/useWebSocket';
import { config } from '../config';
import { SettingsPanel } from './SettingsPanel';
import { WalletMonitoringTabs } from './WalletMonitoringTabs';
import { RecentTokenMints } from './RecentTokenMints';
import { TokensTab } from './TokensTab';
import { DatabaseTab } from './DatabaseTab';
import { TokenPage } from './TokenPage';
import { useAuth } from '../contexts/AuthContext';
import { useWallet } from '@solana/wallet-adapter-react';
import { UnifiedMusicController } from './UnifiedMusicController';
import { useAudio } from '../contexts/AudioContext';

type Tab = 'wallets' | 'tokens' | 'database';

// Sound-reactive glow component
function SoundReactiveGlow({ analyser }: { analyser: AnalyserNode | null }) {
  const [audioLevel, setAudioLevel] = useState(0);
  
  useEffect(() => {
    if (!analyser) return;
    
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    let animationId: number;
    
    const animate = () => {
      analyser.getByteFrequencyData(dataArray);
      const sum = dataArray.reduce((a, b) => a + b, 0);
      const level = sum / dataArray.length / 255; // Normalize to 0-1
      setAudioLevel(level);
      
      animationId = requestAnimationFrame(animate);
    };
    animate();
    
    return () => cancelAnimationFrame(animationId);
  }, [analyser]);
  
  const glowIntensity = Math.min(audioLevel * 30, 20);
  const scale = 1 + audioLevel * 0.5;
  
  return (
    <div className="fixed inset-0 pointer-events-none">
      <div 
        className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl"
        style={{ 
          opacity: 0.1 + audioLevel * 0.5,
          transform: `scale(${scale})`,
          filter: `blur(${48 + glowIntensity}px)`,
          transition: 'transform 0.1s ease-out, opacity 0.1s ease-out'
        }}
      />
      <div 
        className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl"
        style={{ 
          opacity: 0.1 + audioLevel * 0.5,
          transform: `scale(${scale})`,
          filter: `blur(${48 + glowIntensity}px)`,
          transition: 'transform 0.1s ease-out, opacity 0.1s ease-out'
        }}
      />
    </div>
  );
}

export function Dashboard() {
  const [showSettings, setShowSettings] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('wallets');
  const [isAgentMinimized, setIsAgentMinimized] = useState(true); // Start minimized
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);
  const [isDashboardMinimized, setIsDashboardMinimized] = useState(false);
  const starsCanvasRef = useRef<HTMLCanvasElement>(null);
  const vortexCanvasRef = useRef<HTMLCanvasElement>(null);
  
  const { isConnected } = useWebSocket(`${config.wsUrl}/ws`);
  const { user, isAuthenticated, logout } = useAuth();
  const { publicKey } = useWallet();
  const { getAudioAnalyzer } = useAudio();
  
  // Get the Web Audio API analyser node from THREE.AudioAnalyser
  const audioAnalyzer = getAudioAnalyzer();
  const analyser = audioAnalyzer?.analyser || null;
  
  const isSuperAdmin = user?.role === 'super_admin';
  const hasAccess = isAuthenticated && isSuperAdmin;

  
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
    
    const stars: Array<{ x: number; y: number; baseSize: number; size: number; speed: number; opacity: number; pulseOffset: number }> = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        baseSize: Math.random() * 2,
        size: Math.random() * 2,
        speed: Math.random() * 0.5 + 0.1,
        opacity: Math.random(),
        pulseOffset: Math.random() * Math.PI * 2
      });
    }
    
    // Audio analysis setup
    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);
    
    let animationId: number;
    const animate = () => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Get audio data
      let audioLevel = 0;
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        // Calculate average volume
        const sum = dataArray.reduce((a, b) => a + b, 0);
        audioLevel = sum / dataArray.length / 255; // Normalize to 0-1
      }
      
      stars.forEach((star, index) => {
        // Make stars pulse with audio
        const pulseFactor = 1 + audioLevel * 3;
        const frequencyIndex = Math.floor((index / stars.length) * dataArray.length);
        const frequencyLevel = analyser ? dataArray[frequencyIndex] / 255 : 0;
        
        // Size reacts to audio
        star.size = star.baseSize * pulseFactor * (1 + frequencyLevel);
        
        // Opacity pulses with audio
        const basePulse = Math.sin(Date.now() * 0.001 + star.pulseOffset) * 0.5 + 0.5;
        star.opacity = basePulse * (0.5 + audioLevel * 0.5);
        
        // Speed increases with audio
        const currentSpeed = star.speed * (1 + audioLevel * 2);
        
        ctx.beginPath();
        // Color shifts with audio intensity
        const r = Math.floor(audioLevel * 100);
        const g = 255;
        const b = 221 + Math.floor(audioLevel * 34); // Shifts towards white with audio
        ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${star.opacity})`;
        ctx.shadowBlur = audioLevel * 20;
        ctx.shadowColor = `rgba(0, 255, 221, ${audioLevel})`;
        ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
        
        star.x -= currentSpeed;
        
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
  }, [hasAccess, analyser]);

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
      
      {/* Sound-Reactive Cosmic Glow Effects */}
      <SoundReactiveGlow analyser={analyser} />
      
      {/* Settings Overlay */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[200] flex items-start justify-center overflow-y-auto p-4">
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
            <SettingsPanel onUpdate={() => {}} />
          </div>
        </div>
      )}

      {/* Agent Active Indicator - Fixed to top-right */}
      {isAuthenticated && (
        <div className="fixed top-6 right-8 bg-black/80 backdrop-blur-md border border-cyan-500/30 
                       rounded-lg shadow-[0_0_20px_rgba(0,255,255,0.2)] z-[9999]
                       transition-all duration-300 hover:border-cyan-400/50 hover:shadow-[0_0_30px_rgba(0,255,255,0.3)]">
          {/* Status Header - Clickable to toggle minimize */}
          <div 
            onClick={() => setIsAgentMinimized(!isAgentMinimized)}
            className="flex items-center gap-2 p-4 cursor-pointer hover:bg-cyan-500/5 transition-colors"
          >
            <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            <span className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex-1">
              AGENT ACTIVE
            </span>
            <svg 
              className={`w-4 h-4 text-cyan-400 transition-transform duration-300 ${isAgentMinimized ? 'rotate-180' : ''}`}
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          
          {/* Expandable Content */}
          {!isAgentMinimized && (
            <div className="px-4 pb-4">
              {/* Wallet Address */}
              {publicKey && (
                <div className="mb-2">
                  <div className="text-xs text-gray-500 mb-1">WALLET</div>
                  <div className="text-sm font-mono text-cyan-100">
                    {publicKey.toBase58().slice(0, 6)}...{publicKey.toBase58().slice(-6)}
                  </div>
                </div>
              )}
              
              {/* User Role */}
              {user && (
                <div className="mb-3">
                  <div className="text-xs text-gray-500 mb-1">CLEARANCE</div>
                  <div className={`inline-block px-2 py-1 rounded text-xs font-bold uppercase ${
                    user.role === 'super_admin' 
                      ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_10px_rgba(168,85,247,0.4)]' 
                      : user.role === 'admin'
                      ? 'bg-gradient-to-r from-blue-600 to-cyan-600 text-white shadow-[0_0_10px_rgba(6,182,212,0.4)]'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {user.role === 'super_admin' ? '🔮 SUPER ADMIN' : 
                     user.role === 'admin' ? '⭐ ADMIN' : 
                     '👤 AGENT'}
                  </div>
                </div>
              )}

              {/* Unified Music Controls */}
              <div className="mb-3 border-t border-cyan-500/20 pt-3">
                <UnifiedMusicController />
              </div>
              
              {/* Dashboard Minimizer */}
              <button
                onClick={() => setIsDashboardMinimized(!isDashboardMinimized)}
                className={`w-full mb-3 px-3 py-2 ${
                  isDashboardMinimized 
                    ? 'bg-cyan-500/20 border-cyan-400/60 text-cyan-300' 
                    : 'bg-black/40 border-cyan-500/30 text-cyan-400 hover:text-cyan-300'
                } hover:bg-cyan-500/30 border rounded text-xs font-bold uppercase tracking-wide
                  transition-all duration-200 hover:shadow-[0_0_15px_rgba(0,255,255,0.3)]
                  flex items-center justify-center gap-2`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  {isDashboardMinimized ? (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  )}
                </svg>
                {isDashboardMinimized ? 'SHOW DASHBOARD' : 'HIDE DASHBOARD'}
              </button>
              
              {/* Disconnect Button */}
              <button
                onClick={async () => {
                  await logout();
                  window.location.href = '/';
                }}
                className="w-full px-3 py-2 bg-red-600/20 hover:bg-red-600/40 border border-red-500/30 hover:border-red-500/60
                         text-red-400 hover:text-red-300 rounded text-xs font-bold uppercase tracking-wide
                         transition-all duration-200 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]
                         flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                DISCONNECT
              </button>
            </div>
          )}
        </div>
      )}

      {!isDashboardMinimized && (
        <div className="container mx-auto px-4 py-6 relative z-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8 mr-80">
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
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur-xl px-4 py-2 rounded-full border border-cyan-500/20 shadow-lg shadow-cyan-500/10 relative">
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
            {/* Wallet Monitoring with Tabs */}
            <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 overflow-hidden relative">
              <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 pointer-events-none" />
              <WalletMonitoringTabs />
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
            <TokensTab onTokenSelect={setSelectedTokenAddress} />
          </div>
        ) : (
          <div className="bg-black/40 backdrop-blur-xl rounded-2xl border border-cyan-500/20 shadow-2xl shadow-cyan-500/10 h-[calc(100vh-250px)] overflow-hidden relative">
            <div className="absolute inset-0 bg-gradient-to-br from-purple-500/5 via-transparent to-cyan-500/5 pointer-events-none" />
            <DatabaseTab />
          </div>
        )}
      </div>
      )}

      {/* Token Detail Overlay */}
      {selectedTokenAddress && (
        <div className="fixed inset-0 bg-black/30 backdrop-blur-sm z-[10000] overflow-y-auto">
          <div className="min-h-screen flex items-start justify-center p-4 py-8">
            <div className="w-full max-w-7xl relative">
              {/* Token Page Content with Close Button */}
              <div className="relative">
                {/* Close Button - positioned on token page */}
                <button
                  onClick={() => setSelectedTokenAddress(null)}
                  className="absolute -top-2 -right-2 z-10 p-2 bg-black/80 hover:bg-red-600/20 border border-cyan-500/30 hover:border-red-500/60 rounded-lg text-gray-400 hover:text-red-400 transition-all duration-200 hover:shadow-[0_0_15px_rgba(239,68,68,0.3)]"
                  title="Close"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                
                <TokenPage address={selectedTokenAddress} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
