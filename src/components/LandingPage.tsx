import { useState, useEffect } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';
import { useAuth } from '../contexts/AuthContext';

// Lazy load Matrix scene to avoid import errors
import { MatrixSkynetScene } from './landing/MatrixSkynetScene';

export function LandingPage() {
  const { user, isAuthenticated, logout } = useAuth();
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar' | 'matrix'>('blackhole');
  const [isWalletPanelOpen, setIsWalletPanelOpen] = useState(false);
  
  // Debug logging for state changes
  useEffect(() => {
    console.log('🎭 LandingPage - Current Universe:', currentUniverse);
  }, [currentUniverse]);

  const handleEnterVortex = (selectedUniverse?: string) => {
    console.log('🌀 handleEnterVortex called with:', selectedUniverse);
    
    // If a universe was specifically selected, go there
    if (selectedUniverse === 'spaces-manager') {
      // Redirect to Spaces Manager (external app)
      console.log('🌌 Redirecting to Spaces Manager...');
      window.location.href = 'https://spaces-manager.example.com'; // Update with actual URL
      return;
    } else if (selectedUniverse === 'matrix') {
      console.log('🔮 Entering The Matrix...');
      setCurrentUniverse('matrix');
    } else if (selectedUniverse === 'cex-monitor') {
      console.log('🪐 Entering Solar System...');
      setCurrentUniverse('solar');
    } else {
      // Default behavior when no specific universe selected
      console.log('⚠️ No universe specified, defaulting to Solar System');
      setCurrentUniverse('solar');
    }
  };

  // Check if user is super_admin
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <main className="w-screen h-screen bg-black relative">
      {/* Persistent Wallet Indicator - Always visible when authenticated */}
      {isAuthenticated && user && (
        <div className="fixed top-8 right-8 z-[100]">
          {/* Minimized State */}
          {!isWalletPanelOpen ? (
            <button
              onClick={() => setIsWalletPanelOpen(true)}
              className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 
                         border-2 border-cyan-300 flex items-center justify-center
                         hover:scale-110 transition-transform duration-300
                         shadow-[0_0_20px_rgba(0,255,255,0.4)] hover:shadow-[0_0_30px_rgba(0,255,255,0.6)]"
              title="Wallet Connected"
            >
              <span className="text-white font-bold text-lg">
                {user.username?.[0]?.toUpperCase() || '?'}
              </span>
            </button>
          ) : (
            /* Expanded State */
            <div className="bg-black/90 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 min-w-[280px]
                           shadow-[0_0_30px_rgba(0,255,255,0.3)] animate-in fade-in slide-in-from-top-2 duration-200">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-cyan-400 font-bold text-sm">Connected Wallet</h3>
                <button
                  onClick={() => setIsWalletPanelOpen(false)}
                  className="text-gray-400 hover:text-white transition-colors"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              
              {/* User Info */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold text-lg">{user.username?.[0]?.toUpperCase() || '?'}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-white font-medium truncate">{user.username}</div>
                  <div className="text-xs text-gray-400 capitalize">{user.role}</div>
                </div>
              </div>
              
              {/* Disconnect Button */}
              <button
                onClick={async () => {
                  await logout();
                  setIsWalletPanelOpen(false);
                  setCurrentUniverse('blackhole');
                }}
                className="w-full px-4 py-2 bg-red-600/20 hover:bg-red-600/40 
                           border border-red-500/30 rounded-lg text-red-300 font-medium
                           transition-all duration-300 hover:scale-[1.02]
                           flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Disconnect Wallet
              </button>
            </div>
          )}
        </div>
      )}
      {/* Black Hole Universe - ENTRY PORTAL */}
      {currentUniverse === 'blackhole' && (
        <BlackholeScene onEnter={handleEnterVortex} />
      )}

      {/* Solar System Universe - Demo for friends */}
      {currentUniverse === 'solar' && (
        <>
          <SolarSystemScene />
          
          {/* Navigation Options */}
          <div className="absolute top-8 left-8 space-y-2 z-50">
            {/* Return through wormhole */}
            <button
              onClick={() => setCurrentUniverse('blackhole')}
              className="block px-4 py-2 bg-purple-600/20 hover:bg-purple-600/40 
                         border border-purple-500/30 rounded-lg text-purple-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              🌀 Return to Entry Portal
            </button>
            
            {/* Access CEX Dashboard - ONLY for super_admins */}
            {isSuperAdmin && (
              <button
                onClick={() => window.location.href = '/dashboard'}
                className="block px-4 py-2 bg-green-600/20 hover:bg-green-600/40 
                           border border-green-500/30 rounded-lg text-green-300 font-bold 
                           transition-all duration-300 hover:scale-105"
              >
                📊 CEX Dashboard
              </button>
            )}
          </div>
        </>
      )}
      
      {/* Matrix Skynet Universe - SUPER ADMIN DATA COMMAND CENTER */}
      {currentUniverse === 'matrix' && (
        <>
          <MatrixSkynetScene onBack={() => setCurrentUniverse('blackhole')} />
          {/* Debug indicator */}
          <div className="fixed bottom-4 left-4 bg-green-500/20 border border-green-500 px-4 py-2 rounded text-green-300 text-sm z-[9999]">
            🔮 Matrix Universe Active
          </div>
        </>
      )}
    </main>
  );
}
