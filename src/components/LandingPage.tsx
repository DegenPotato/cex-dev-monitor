import { useState, useEffect } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';
import { useAuth } from '../contexts/AuthContext';

// Lazy load Matrix scene to avoid import errors
import { MatrixSkynetScene } from './landing/MatrixSkynetScene';

export function LandingPage() {
  const { user } = useAuth();
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar' | 'matrix'>('blackhole');
  
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
