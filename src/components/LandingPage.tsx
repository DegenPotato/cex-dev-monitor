import { useState } from 'react';
import { BlackholeScene } from './landing/BlackholeScene';
import { SolarSystemScene } from './landing/SolarSystemScene';

export function LandingPage() {
  const [currentUniverse, setCurrentUniverse] = useState<'blackhole' | 'solar'>('blackhole');

  const handleEnterVortex = () => {
    // After quantum tunneling through wormhole, emerge in Solar System universe
    setCurrentUniverse('solar');
  };

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
            
            {/* Access CEX Dashboard */}
            <button
              onClick={() => window.location.href = '/dashboard'}
              className="block px-4 py-2 bg-green-600/20 hover:bg-green-600/40 
                         border border-green-500/30 rounded-lg text-green-300 font-bold 
                         transition-all duration-300 hover:scale-105"
            >
              📊 CEX Dashboard
            </button>
          </div>
        </>
      )}
    </main>
  );
}
