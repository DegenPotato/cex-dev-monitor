import { useState } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';
import { useAuth } from '../contexts/AuthContext';

export function LandingPage() {
  const { user, isAuthenticated } = useAuth();
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar'>('blackhole');

  const handleEnterVortex = () => {
    // After quantum tunneling through wormhole, emerge in Solar System universe
    setCurrentUniverse('solar');
  };

  // Check if user is super_admin
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <main className="w-screen h-screen bg-black relative">
      {/* Black Hole Universe - ENTRY PORTAL */}
      {currentUniverse === 'blackhole' && (
        <BlackholeScene onEnter={handleEnterVortex} />
      )}

      {/* Solar System Universe - DESTINATION after wormhole travel */}
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
          
          {/* User Info Display */}
          {isAuthenticated && user && (
            <div className="absolute top-8 right-8 bg-black/80 backdrop-blur-md border border-cyan-500/30 rounded-lg p-4 z-50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 flex items-center justify-center">
                  <span className="text-white font-bold">{user.username?.[0]?.toUpperCase() || '?'}</span>
                </div>
                <div>
                  <div className="text-white font-medium">{user.username}</div>
                  <div className="text-xs text-gray-400 capitalize">{user.role}</div>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </main>
  );
}
